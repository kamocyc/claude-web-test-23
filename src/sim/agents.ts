import { TILE_SIZE, tileToWorld } from '../world/heightfield'
import { tileSurfaceHeight } from '../world/surface'
import { RoadSurface } from '../world/tileGrid'
import { stepCost } from '../roads/pathfinding'
import type { TilePos } from '../roads/tileLine'
import { emptyExplain, type ExplainRecord } from './explain'
import type { HaulOrder } from './logistics'
import { RESOURCE_INFO, type Resource } from './resources'
import { VEHICLES, VehicleType, grossWeight, type VehicleDef } from './vehicles'
import type { World } from './world'

export enum AgentKind {
  Hauler = 'hauler',
  Builder = 'builder',
}

export enum AgentState {
  Idle = 'idle',
  ToPickup = 'toPickup',
  Loading = 'loading',
  ToDropoff = 'toDropoff',
  Unloading = 'unloading',
  ToSite = 'toSite',
  Working = 'working',
  Returning = 'returning',
}

const LOAD_SECONDS = 6

export class Agent {
  readonly id: number
  readonly kind: AgentKind
  readonly vehicleType: VehicleType
  readonly homeId: string
  x = 0
  z = 0
  y = 0
  heading = 0
  state: AgentState = AgentState.Idle
  path: TilePos[] = []
  pathIndex = 0
  tileProgress = 0
  cargoResource: Resource | null = null
  cargoAmount = 0
  order: HaulOrder | null = null
  siteId: string | null = null
  timer = 0
  explain: ExplainRecord = emptyExplain()

  constructor(id: number, kind: AgentKind, vehicleType: VehicleType, homeId: string) {
    this.id = id
    this.kind = kind
    this.vehicleType = vehicleType
    this.homeId = homeId
  }

  get vehicle(): VehicleDef {
    return VEHICLES[this.vehicleType]
  }

  get loadKg(): number {
    return this.cargoResource === null
      ? 0
      : RESOURCE_INFO[this.cargoResource].weight * this.cargoAmount
  }

  get idle(): boolean {
    return this.state === AgentState.Idle
  }

  get label(): string {
    return `${this.vehicle.label}#${this.id}`
  }
}

/**
 * Walks agents along their paths and runs their state machines.
 * Nothing teleports: goods only move because somebody carried them.
 */
export class AgentSystem {
  readonly agents: Agent[] = []
  private nextId = 1

  constructor(private readonly world: World) {}

  spawn(kind: AgentKind, vehicleType: VehicleType, homeId: string): Agent {
    const agent = new Agent(this.nextId++, kind, vehicleType, homeId)
    const home = this.world.settlements.get(homeId)
    if (home) {
      agent.x = home.x + ((agent.id % 5) - 2) * 2.5
      agent.z = home.z + ((agent.id % 3) - 1) * 2.5
      agent.y = this.world.field.sample(agent.x, agent.z)
    }
    this.agents.push(agent)
    return agent
  }

  idleHaulers(homeId: string, vehicleType: VehicleType): Agent[] {
    return this.agents.filter(
      (agent) =>
        agent.kind === AgentKind.Hauler &&
        agent.idle &&
        agent.homeId === homeId &&
        agent.vehicleType === vehicleType,
    )
  }

  /**
   * Park an idle vehicle on the nearest way it can actually use. A cart left
   * standing in the village yard has to be wheeled out to the road before it
   * can set off; this does that, and only ever for an idle agent at home.
   */
  moveToHomeStop(agent: Agent): boolean {
    if (!agent.idle) return false
    const target = this.world.stopTileFor(agent.homeId, agent.vehicleType)
    if (!target) return false
    agent.x = tileToWorld(target.tx)
    agent.z = tileToWorld(target.tz)
    agent.y = tileSurfaceHeight(this.world.field, this.world.grid, target.tx, target.tz)
    return true
  }

  idleBuilders(): Agent[] {
    return this.agents.filter((agent) => agent.kind === AgentKind.Builder && agent.idle)
  }

  /** Point the agent at a tile; false if no legal route exists. */
  routeTo(agent: Agent, target: TilePos): boolean {
    const start = this.currentTile(agent)
    const result = this.world.finder.find(start, target, agent.vehicle, agent.loadKg)
    if (result.failure !== null || result.tiles.length === 0) {
      agent.path = []
      return false
    }
    agent.path = result.tiles
    agent.pathIndex = 0
    agent.tileProgress = 0
    agent.explain.routeSeconds = result.seconds
    return true
  }

  currentTile(agent: Agent): TilePos {
    return {
      tx: Math.min(this.world.grid.size - 1, Math.max(0, Math.floor(agent.x / TILE_SIZE))),
      tz: Math.min(this.world.grid.size - 1, Math.max(0, Math.floor(agent.z / TILE_SIZE))),
    }
  }

  step(dt: number): void {
    for (const agent of this.agents) this.stepAgent(agent, dt)
  }

  private stepAgent(agent: Agent, dt: number): void {
    switch (agent.state) {
      case AgentState.ToPickup:
      case AgentState.ToDropoff:
      case AgentState.ToSite:
      case AgentState.Returning:
        if (this.advance(agent, dt)) this.onArrival(agent)
        break
      case AgentState.Loading:
      case AgentState.Unloading:
        agent.timer -= dt
        agent.explain.delay = { kind: 'loading' }
        if (agent.timer <= 0) this.finishTransfer(agent)
        break
      case AgentState.Working:
        this.workSite(agent)
        break
      case AgentState.Idle:
      default:
        break
    }
  }

  /** Move along the path; returns true on arrival at the last tile. */
  private advance(agent: Agent, dt: number): boolean {
    if (agent.path.length === 0) return true
    let remaining = dt
    let guard = 64

    while (remaining > 0 && guard-- > 0) {
      if (agent.pathIndex >= agent.path.length - 1) {
        const last = agent.path[agent.path.length - 1]
        agent.x = tileToWorld(last.tx)
        agent.z = tileToWorld(last.tz)
        agent.y = tileSurfaceHeight(this.world.field, this.world.grid, last.tx, last.tz)
        return true
      }
      const from = agent.path[agent.pathIndex]
      const to = agent.path[agent.pathIndex + 1]
      const cost = stepCost(this.world, from, to, agent.vehicle, agent.loadKg)

      if (!Number.isFinite(cost.seconds)) {
        // The world changed under the agent: try once to find a new way round.
        const target = agent.path[agent.path.length - 1]
        if (!this.routeTo(agent, target)) {
          agent.path = []
          this.sendHome(agent)
          return false
        }
        continue
      }

      const used = Math.min(remaining, (1 - agent.tileProgress) * cost.seconds)
      agent.tileProgress += used / cost.seconds
      remaining -= used

      if (agent.tileProgress >= 1 - 1e-6) {
        agent.pathIndex++
        agent.tileProgress = 0
        this.onEnterTile(agent, to)
      }
      this.updatePosition(agent)
      this.noteDelay(agent, to, cost.seconds)
    }
    return agent.pathIndex >= agent.path.length - 1
  }

  private updatePosition(agent: Agent): void {
    const from = agent.path[agent.pathIndex]
    const to = agent.path[Math.min(agent.pathIndex + 1, agent.path.length - 1)]
    const ax = tileToWorld(from.tx)
    const az = tileToWorld(from.tz)
    const bx = tileToWorld(to.tx)
    const bz = tileToWorld(to.tz)
    agent.x = ax + (bx - ax) * agent.tileProgress
    agent.z = az + (bz - az) * agent.tileProgress
    const ay = tileSurfaceHeight(this.world.field, this.world.grid, from.tx, from.tz)
    const by = tileSurfaceHeight(this.world.field, this.world.grid, to.tx, to.tz)
    agent.y = ay + (by - ay) * agent.tileProgress
    if (bx !== ax || bz !== az) agent.heading = Math.atan2(bx - ax, bz - az)
  }

  /** Traffic wears the road and makes it worth robbing. */
  private onEnterTile(agent: Agent, tile: TilePos): void {
    const index = this.world.grid.index(tile.tx, tile.tz)
    const edgeId = this.world.grid.roadEdge[index]
    if (edgeId < 0) return
    const edge = this.world.roads.get(edgeId)
    if (!edge) return
    edge.traffic += grossWeight(agent.vehicle, agent.loadKg) / 1000
  }

  private noteDelay(agent: Agent, tile: TilePos, seconds: number): void {
    const grid = this.world.grid
    const index = grid.index(tile.tx, tile.tz)
    const onRoad = grid.roadSurface[index] !== RoadSurface.None
    if (onRoad && grid.wetness[index] > 0.35) {
      agent.explain.delay = { kind: 'mud', place: this.world.placeName(tile) }
      return
    }
    if (!onRoad) {
      agent.explain.delay = grid.isWater(tile.tx, tile.tz) ? { kind: 'ford' } : { kind: 'unpaved' }
      return
    }
    const nominal = TILE_SIZE / (agent.vehicle.baseSpeed * 1.1)
    agent.explain.delay = seconds > nominal * 1.6 ? { kind: 'climb', grade: 0 } : null
  }

  private onArrival(agent: Agent): void {
    switch (agent.state) {
      case AgentState.ToPickup:
        agent.state = AgentState.Loading
        agent.timer = LOAD_SECONDS
        break
      case AgentState.ToDropoff:
        agent.state = AgentState.Unloading
        agent.timer = LOAD_SECONDS
        break
      case AgentState.ToSite:
        agent.state = AgentState.Working
        break
      case AgentState.Returning:
        agent.state = AgentState.Idle
        agent.path = []
        agent.explain = emptyExplain()
        break
      default:
        break
    }
  }

  private finishTransfer(agent: Agent): void {
    const order = agent.order
    if (!order) {
      agent.state = AgentState.Idle
      return
    }

    if (agent.state === AgentState.Loading) {
      const source = this.world.holder(order.fromId)
      if (!source) {
        this.abandon(agent)
        return
      }
      const units = Math.min(order.amount, Math.floor(source.stock[order.resource]))
      if (units <= 0) {
        agent.explain.stuck = { kind: 'noCargo', resource: order.resource }
        this.abandon(agent)
        return
      }
      source.stock[order.resource] -= units
      agent.cargoResource = order.resource
      agent.cargoAmount = units
      agent.explain.cargoResource = order.resource
      agent.explain.cargoAmount = units

      const target = this.world.stopTileFor(order.toId, agent.vehicleType)
      if (!target || !this.routeTo(agent, target)) {
        // Loaded and nowhere to go: put it back and report why.
        source.stock[order.resource] += units
        agent.cargoResource = null
        agent.cargoAmount = 0
        agent.explain.stuck = { kind: 'noRoute', failure: 'needsRoad', resource: order.resource }
        this.abandon(agent)
        return
      }
      this.world.describeRoute(agent)
      agent.state = AgentState.ToDropoff
      return
    }

    const destination = this.world.holder(order.toId)
    if (destination && agent.cargoResource !== null) {
      const room = Math.max(
        0,
        destination.capacityFor(agent.cargoResource) - destination.stock[agent.cargoResource],
      )
      const delivered = Math.min(room, agent.cargoAmount)
      destination.stock[agent.cargoResource] += delivered
      this.world.onDelivery(agent, order, delivered)
    }
    agent.cargoResource = null
    agent.cargoAmount = 0
    agent.order = null
    agent.explain = emptyExplain()
    this.sendHome(agent)
  }

  private abandon(agent: Agent): void {
    agent.order = null
    this.sendHome(agent)
  }

  sendHome(agent: Agent): void {
    const home = this.world.settlements.get(agent.homeId)
    const target = home ? this.world.stopTileFor(home.id, agent.vehicleType) : null
    if (target && this.routeTo(agent, target)) {
      agent.state = AgentState.Returning
      return
    }
    agent.state = AgentState.Idle
    agent.path = []
  }

  private workSite(agent: Agent): void {
    const site = this.world.sites.find((candidate) => candidate.id === agent.siteId)
    if (!site || site.done) {
      agent.siteId = null
      this.sendHome(agent)
      return
    }
    // Follow the work front as it advances along the alignment.
    if (Math.hypot(site.x - agent.x, site.z - agent.z) > 14) {
      const target = this.world.stopTileFor(site.id, agent.vehicleType)
      if (target && this.routeTo(agent, target)) agent.state = AgentState.ToSite
    }
  }
}
