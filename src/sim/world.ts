import { Clock, GAME_HOUR, GAME_SECONDS_PER_SIM_SECOND } from '../core/clock'
import { EventLog, type EventSeverity } from '../core/events'
import { Rng } from '../core/rng'
import type { PlannedTile, RoadPlan } from '../roads/buildability'
import { ConstructionSite } from '../roads/construction'
import { RoadNetwork } from '../roads/roadNetwork'
import { BRIDGE_SPECS } from '../roads/roadSpec'
import { tileKey } from '../roads/tileLine'
import type { Heightfield } from '../world/heightfield'
import { generateWorld, type WorldLayout } from '../world/terrainGen'
import type { TileGrid } from '../world/tileGrid'
import { PathFinder } from '../roads/pathfinding'
import { applyTraffic, repairTiles, stepRoadWear } from '../roads/wear'
import { RoadClass } from '../world/tileGrid'
import { AgentKind, AgentState, AgentSystem, type Agent } from './agents'
import { LogisticsSystem, type HaulOrder } from './logistics'
import { findStopTile } from './navigation'
import { stepProduction } from './production'
import { RESOURCE_INFO, Resource } from './resources'
import { FARM_VILLAGE, MINE_VILLAGE, buildSettlement } from './scenario'
import type { Settlement } from './settlement'
import type { StockHolder } from './stock'
import { BanditSystem } from './bandits'
import { PLACEABLE, StructureSite } from './structureSite'
import { VEHICLES, VehicleType } from './vehicles'
import { WeatherSystem } from './weather'
import { BUILDINGS, BuildingType, type Building } from './buildings'
import type { TilePos } from '../roads/tileLine'

/** How many villagers the player is worth when they work a site themselves. */
export const PLAYER_LABOUR_RATE = 16

/**
 * The simulation world. Nothing in here (or anything it imports) may touch
 * three.js or the DOM, so the whole simulation can be stepped headlessly in tests.
 */
export class World {
  readonly seed: number
  readonly field: Heightfield
  readonly grid: TileGrid
  readonly layout: WorldLayout
  readonly clock = new Clock()
  readonly events = new EventLog()
  readonly rng: Rng

  readonly settlements = new Map<string, Settlement>()
  readonly buildings: Building[] = []
  readonly roads = new RoadNetwork()
  readonly weather = new WeatherSystem()
  readonly bandits: BanditSystem
  readonly finder: PathFinder
  readonly agents = new AgentSystem(this)
  readonly logistics = new LogisticsSystem(this)
  readonly sites: ConstructionSite[] = []
  readonly structureSites: StructureSite[] = []
  /** Tile indices carrying a built road, so wear only visits what exists. */
  readonly roadTiles: number[] = []
  /** Buildings finished this tick, for the renderer to pick up. */
  readonly newBuildings: Building[] = []
  /** One-off story beats already announced. */
  readonly milestones = new Set<string>()
  /** Tile keys still waiting to be built, for the construction overlay. */
  readonly plannedTileKeys = new Set<number>()
  /** Set by the player controller while they are working a site by hand. */
  playerWork: { x: number; z: number; active: boolean } = { x: 0, z: 0, active: false }
  private nextSiteId = 1

  /** Tiles changed this tick, so the renderer can repaint just those chunks. */
  private readonly dirtyTiles: Array<[number, number]> = []

  constructor(seed = 20260817, options: { spawnAgents?: boolean } = {}) {
    this.seed = seed
    const generated = generateWorld(seed)
    this.field = generated.field
    this.grid = generated.grid
    this.layout = generated.layout
    this.rng = new Rng(seed ^ 0x5f3a)

    const markFootprint = (tx: number, tz: number, buildingId: number): void => {
      if (!this.grid.inBounds(tx, tz)) return
      const i = this.grid.index(tx, tz)
      this.grid.blocked[i] = 1
      this.grid.structure[i] = buildingId
    }

    for (const [spec, centre] of [
      [FARM_VILLAGE, generated.layout.farmVillage],
      [MINE_VILLAGE, generated.layout.mineVillage],
    ] as const) {
      const built = buildSettlement(spec, centre, markFootprint)
      this.settlements.set(built.settlement.id, built.settlement)
      this.buildings.push(...built.buildings)
    }

    this.finder = new PathFinder(this)
    this.bandits = new BanditSystem(generated.layout.banditCamp)

    const agentCounts = options.spawnAgents === false ? [] : ([
      ['farm', 3, 2, 3],
      ['mine', 2, 1, 3],
    ] as const)
    for (const [id, porters, carts, builders] of agentCounts) {
      for (let i = 0; i < porters; i++) {
        this.agents.spawn(AgentKind.Hauler, VehicleType.Porter, id)
      }
      for (let i = 0; i < carts; i++) {
        this.agents.spawn(AgentKind.Hauler, VehicleType.Handcart, id)
      }
      for (let i = 0; i < builders; i++) {
        this.agents.spawn(AgentKind.Builder, VehicleType.Porter, id)
      }
    }
  }

  /** Settlements and every kind of work site accept and release goods. */
  holder(id: string): StockHolder | null {
    return (
      this.settlements.get(id) ??
      this.sites.find((site) => site.id === id) ??
      this.structureSites.find((site) => site.id === id) ??
      null
    )
  }

  /** Watchtowers and inns that make a stretch of road safer. */
  watchers(): Building[] {
    return this.buildings.filter(
      (building) =>
        building.type === BuildingType.Watchtower || building.type === BuildingType.Inn,
    )
  }

  unitWeight(resource: Resource): number {
    return RESOURCE_INFO[resource].weight
  }

  /** Where a given vehicle can actually stop at a settlement or work site. */
  stopTileFor(holderId: string, vehicleType: VehicleType): TilePos | null {
    const holder = this.holder(holderId)
    if (!holder) return null
    const required = VEHICLES[vehicleType].requiresRoad
    return findStopTile(this.grid, holder.x, holder.z, {
      requireRoadClass: required,
      maxRadius: required === RoadClass.None ? 6 : 10,
    })
  }

  /** Nearest named place to a tile, for delay messages. */
  placeName(tile: TilePos): string {
    let best = '街道'
    let bestDistance = Number.POSITIVE_INFINITY
    const x = tile.tx * 2
    const z = tile.tz * 2
    for (const settlement of this.settlements.values()) {
      const distance = Math.hypot(settlement.x - x, settlement.z - z)
      if (distance < bestDistance) {
        bestDistance = distance
        best = settlement.label
      }
    }
    return bestDistance < 90 ? `${best}付近` : '街道'
  }

  /**
   * Fills in why the hauler took this route: if a walker could get there much
   * faster, the cart is going the long way for a reason worth stating.
   */
  describeRoute(agent: Agent): void {
    const start = this.agents.currentTile(agent)
    const end = agent.path[agent.path.length - 1]
    if (!end) return
    const onFoot = this.finder.find(start, end, VEHICLES[VehicleType.Porter], 0)
    if (onFoot.failure === null && agent.explain.routeSeconds > onFoot.seconds * 1.08) {
      agent.explain.routeNote = {
        kind: 'onlyLegalRoute',
        slowerBySeconds: agent.explain.routeSeconds - onFoot.seconds,
      }
    } else {
      agent.explain.routeNote = { kind: 'shortest' }
    }
  }

  /** A hauler has been robbed: the cargo is gone and the journey is over. */
  onRobbed(agent: Agent): void {
    const resource = agent.cargoResource
    const amount = agent.cargoAmount
    agent.cargoResource = null
    agent.cargoAmount = 0
    agent.order = null
    agent.explain.stuck = { kind: 'robbed' }
    agent.explain.cargoResource = null
    agent.explain.cargoAmount = 0
    this.agents.sendHome(agent)
    if (resource === null) return
    const info = RESOURCE_INFO[resource]
    this.log(
      'bad',
      `${this.placeName({ tx: Math.floor(agent.x / 2), tz: Math.floor(agent.z / 2) })}で盗賊に襲われた。${info.label} ${Math.round(amount)}${info.unit} を奪われた。`,
    )
  }

  /** Called when cargo actually lands in a store - the moment worth noticing. */
  onDelivery(agent: Agent, order: HaulOrder, delivered: number): void {
    if (delivered <= 0) return
    const to = this.holder(order.toId)
    const from = this.holder(order.fromId)
    if (!to || !from) return
    const info = RESOURCE_INFO[order.resource]
    this.log(
      'info',
      `${agent.vehicle.label}が${from.label}から${to.label}へ ${info.label} ${Math.round(delivered)}${info.unit} を届けた`,
    )
    this.noteMilestone(agent, order)
  }

  /** The handful of deliveries that mean the valley has changed. */
  private noteMilestone(agent: Agent, order: HaulOrder): void {
    const reached = (key: string): boolean => {
      if (this.milestones.has(key)) return false
      this.milestones.add(key)
      return true
    }
    const betweenVillages =
      this.settlements.has(order.fromId) && this.settlements.has(order.toId) && order.fromId !== order.toId
    if (agent.vehicleType === VehicleType.Handcart && betweenVillages && reached('firstCartDelivery')) {
      this.log('good', '荷車が初めて村と村のあいだを往復した。')
    }
    if (order.toId === 'mine' && order.resource === Resource.Food && reached('foodToMine')) {
      this.log('good', '鉱山村に食料が届いた。止まっていた鍛冶場が動き出す。')
    }
    if (order.toId === 'farm' && order.resource === Resource.Tools && reached('toolsToFarm')) {
      this.log('good', '農村に鉄の農具が返ってきた。道がひとつの往復になった。')
    }
  }

  settlement(id: string): Settlement {
    const found = this.settlements.get(id)
    if (!found) throw new Error(`unknown settlement: ${id}`)
    return found
  }

  markTileDirty(tx: number, tz: number): void {
    this.dirtyTiles.push([tx, tz])
  }

  consumeDirtyTiles(): Array<[number, number]> {
    const list = this.dirtyTiles.slice()
    this.dirtyTiles.length = 0
    return list
  }

  log(severity: EventSeverity, text: string): void {
    this.events.push(this.clock.gameTime, severity, text)
  }

  /** Stake out a road and open a construction site for it. */
  startConstruction(plan: RoadPlan): ConstructionSite {
    const edge = this.roads.create(
      plan.spec.id,
      `${plan.spec.label} #${this.nextSiteId}`,
      plan.tiles.map((tile) => ({ tx: tile.tx, tz: tile.tz })),
      this.clock.day,
    )
    const site = new ConstructionSite(`site${this.nextSiteId++}`, edge.label, plan, edge.id)
    for (const tile of plan.tiles) {
      this.plannedTileKeys.add(tileKey(tile.tx, tile.tz))
      this.markTileDirty(tile.tx, tile.tz)
    }
    this.sites.push(site)
    this.log(
      'info',
      `${edge.label} の工事を始めた（${Math.round(plan.lengthM)}m・のべ${Math.round(plan.labourHours)}人時）`,
    )
    return site
  }

  /**
   * The player working by hand, in person-hours. Whatever is under their feet:
   * a road being built, a building going up, or a worn surface to patch.
   */
  applyPlayerLabour(x: number, z: number, personHours: number): void {
    for (const site of this.sites) {
      if (site.done) continue
      if (Math.hypot(site.x - x, site.z - z) > 9) continue
      this.completeTiles(site, site.applyLabour(personHours, true))
      return
    }
    for (const site of this.structureSites) {
      if (site.done) continue
      if (Math.hypot(site.x - x, site.z - z) > 9) continue
      if (site.applyLabour(personHours, true)) this.finishStructure(site)
      return
    }
    this.repairAround(x, z, personHours)
  }

  /** Patch up worn road within a few metres of the player. */
  repairAround(x: number, z: number, personHours: number): number {
    const cx = Math.floor(x / 2)
    const cz = Math.floor(z / 2)
    const indices: number[] = []
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        const tx = cx + dx
        const tz = cz + dz
        if (!this.grid.inBounds(tx, tz) || !this.grid.hasRoad(tx, tz)) continue
        indices.push(this.grid.index(tx, tz))
      }
    }
    return repairTiles(this.grid, indices, personHours, (tx, tz) => this.markTileDirty(tx, tz))
  }

  /** Site a public building along the road. */
  placeStructure(type: BuildingType, x: number, z: number): StructureSite | null {
    if (!PLACEABLE[type]) return null
    const site = new StructureSite(`structure${this.nextSiteId++}`, type, x, z)
    this.structureSites.push(site)
    this.log('info', `${site.label} の建設地を決めた`)
    return site
  }

  private finishStructure(site: StructureSite): void {
    const def = BUILDINGS[site.type]
    const building: Building = {
      id: 10000 + this.structureSites.length + this.buildings.length,
      type: site.type,
      settlementId: this.nearestSettlementId(site.x, site.z),
      x: site.x,
      z: site.z,
      activity: 0,
      idleReason: null,
    }
    this.buildings.push(building)
    this.newBuildings.push(building)

    const radius = def.radius
    for (let tz = Math.floor((site.z - radius) / 2); tz <= Math.floor((site.z + radius) / 2); tz++) {
      for (let tx = Math.floor((site.x - radius) / 2); tx <= Math.floor((site.x + radius) / 2); tx++) {
        if (!this.grid.inBounds(tx, tz)) continue
        if (this.grid.hasRoad(tx, tz)) continue
        const index = this.grid.index(tx, tz)
        this.grid.blocked[index] = 1
        this.grid.structure[index] = building.id
      }
    }

    this.structureSites.splice(this.structureSites.indexOf(site), 1)
    this.log('good', `${site.label} が完成した`)
  }

  nearestSettlementId(x: number, z: number): string {
    let best = 'farm'
    let bestDistance = Number.POSITIVE_INFINITY
    for (const settlement of this.settlements.values()) {
      const distance = Math.hypot(settlement.x - x, settlement.z - z)
      if (distance < bestDistance) {
        bestDistance = distance
        best = settlement.id
      }
    }
    return best
  }

  consumeNewBuildings(): Building[] {
    const list = this.newBuildings.slice()
    this.newBuildings.length = 0
    return list
  }

  /** Traffic crossing a tile: wear, and the tonnage that attracts bandits. */
  noteTraffic(index: number, tonnes: number): void {
    applyTraffic(this.grid, index, tonnes)
    if (this.bandits.noteTraffic(tonnes)) {
      this.log('warn', '街道の荷が増えた。谷に盗賊が目をつけたらしい。')
    }
  }

  /** Write one finished tile into the world: terraform, surface, open to traffic. */
  private openTile(site: ConstructionSite, tile: PlannedTile): void {
    const spec = site.plan.spec
    const index = this.grid.index(tile.tx, tile.tz)

    if (tile.isBridge) {
      this.grid.deckHeight[index] = tile.targetHeight
      const bridge = BRIDGE_SPECS[spec.bridge]
      this.grid.setRoad(tile.tx, tile.tz, bridge.surface, RoadClass.Cartway, site.edgeId)
    } else {
      this.field.setTileHeight(tile.tx, tile.tz, tile.targetHeight)
      this.grid.setRoad(tile.tx, tile.tz, spec.surface, spec.roadClass, site.edgeId)
      for (const shoulder of tile.shoulders) {
        if (!this.grid.inBounds(shoulder.tx, shoulder.tz)) continue
        const shoulderIndex = this.grid.index(shoulder.tx, shoulder.tz)
        if (this.grid.blocked[shoulderIndex] === 1) continue
        if (this.grid.isWater(shoulder.tx, shoulder.tz)) continue
        if (this.grid.hasRoad(shoulder.tx, shoulder.tz)) continue
        if (Math.abs(this.field.tileHeight(shoulder.tx, shoulder.tz) - tile.targetHeight) > 2) continue
        this.field.setTileHeight(shoulder.tx, shoulder.tz, tile.targetHeight)
        this.grid.setRoad(shoulder.tx, shoulder.tz, spec.surface, spec.roadClass, site.edgeId)
        this.roadTiles.push(shoulderIndex)
        this.markTileDirty(shoulder.tx, shoulder.tz)
      }
    }
    this.roadTiles.push(index)
    this.plannedTileKeys.delete(tileKey(tile.tx, tile.tz))
    this.markTileDirty(tile.tx, tile.tz)
  }

  private completeTiles(site: ConstructionSite, tiles: readonly PlannedTile[]): void {
    for (const tile of tiles) this.openTile(site, tile)
    if (site.done && !this.roads.get(site.edgeId)?.complete) {
      const edge = this.roads.get(site.edgeId)
      if (edge) edge.complete = true
      this.log('good', `${site.label} が開通した`)
      this.sites.splice(this.sites.indexOf(site), 1)
    }
  }

  /** One fixed simulation step. */
  step(dt: number): void {
    this.clock.advance(dt)
    const hours = (dt * GAME_SECONDS_PER_SIM_SECOND) / GAME_HOUR

    if (this.weather.step(hours, this.rng)) {
      this.log('info', `天気が${this.weather.label}になった`)
    }
    stepRoadWear(this.grid, this.roadTiles, hours, this.weather.intensity, (tx, tz) =>
      this.markTileDirty(tx, tz),
    )

    stepProduction(this.settlements, this.buildings, hours)
    for (const settlement of this.settlements.values()) settlement.consumeFood(hours)

    this.agents.step(dt)
    this.logistics.step(hours)

    // A site only advances while builders are actually standing on it.
    for (const site of this.sites) site.workers = 0
    for (const site of this.structureSites) site.workers = 0
    for (const agent of this.agents.agents) {
      if (agent.state !== AgentState.Working || !agent.siteId) continue
      const road = this.sites.find((candidate) => candidate.id === agent.siteId)
      if (road) {
        road.workers++
        continue
      }
      const structure = this.structureSites.find((candidate) => candidate.id === agent.siteId)
      if (structure) structure.workers++
    }

    for (const site of this.sites.slice()) {
      if (site.done) continue
      this.completeTiles(site, site.applyLabour(site.workers * hours, false))
    }
    for (const site of this.structureSites.slice()) {
      if (site.done) continue
      if (site.applyLabour(site.workers * hours, false)) this.finishStructure(site)
    }
    if (this.playerWork.active) {
      this.applyPlayerLabour(this.playerWork.x, this.playerWork.z, PLAYER_LABOUR_RATE * hours)
    }
  }
}
