import type { BlockedReason } from '../roads/pathfinding'
import { AgentKind, AgentState, type Agent } from './agents'
import { ALL_RESOURCES, Resource, unitsThatFit } from './resources'
import type { StockHolder } from './stock'
import { VEHICLES, VehicleType } from './vehicles'
import type { World } from './world'

export interface HaulOrder {
  readonly id: number
  readonly resource: Resource
  readonly amount: number
  readonly fromId: string
  readonly toId: string
  readonly vehicleType: VehicleType
}

/** A need the network currently cannot satisfy, and why. */
export interface PendingHaul {
  readonly resource: Resource
  readonly fromLabel: string
  readonly toLabel: string
  readonly units: number
  readonly reason:
    | { kind: 'noRoute'; failure: BlockedReason }
    /** Something is moving, but only on somebody's back. */
    | { kind: 'downgraded'; failure: BlockedReason }
    | { kind: 'noHauler' }
    | { kind: 'noSupply' }
}

interface Demand {
  readonly holder: StockHolder
  readonly resource: Resource
  readonly units: number
  /** Lower sorts first. Construction and food beat everything else. */
  readonly priority: number
}

const DISPATCH_INTERVAL_HOURS = 0.5
const MIN_UNITS = 1

/**
 * Matches surpluses to shortfalls and turns them into journeys.
 *
 * Every unsatisfied need is kept with the reason it failed, so the moment a
 * bridge opens the HUD can show the backlog draining instead of silently
 * changing its mind.
 */
export class LogisticsSystem {
  pending: PendingHaul[] = []
  private nextOrderId = 1
  private timer = 0

  constructor(private readonly world: World) {}

  step(hours: number): void {
    this.timer += hours
    if (this.timer < DISPATCH_INTERVAL_HOURS) return
    this.timer = 0
    this.dispatch()
    this.assignBuilders()
  }

  private collectDemands(): Demand[] {
    const demands: Demand[] = []

    for (const site of [...this.world.sites, ...this.world.structureSites]) {
      for (const [key, amount] of Object.entries(site.outstandingMaterials())) {
        const units = Math.ceil(amount as number)
        if (units >= MIN_UNITS) {
          demands.push({ holder: site, resource: Number(key) as Resource, units, priority: 0 })
        }
      }
    }

    for (const settlement of this.world.settlements.values()) {
      for (const resource of ALL_RESOURCES) {
        const shortfall = settlement.targetStock(resource) - settlement.stock[resource]
        if (shortfall < MIN_UNITS) continue
        demands.push({
          holder: settlement,
          resource,
          units: Math.ceil(shortfall),
          // Food first, then whatever makes this village more productive.
          priority:
            resource === Resource.Food
              ? 1
              : resource === Resource.Tools && settlement.toolsUser
                ? 1.5
                : 2,
        })
      }
    }

    return demands.sort((a, b) => a.priority - b.priority || b.units - a.units)
  }

  private findSupplier(demand: Demand): { holder: StockHolder; available: number } | null {
    // A village will dip into its own stores for a road it wants built, but it
    // will not give away the food it is keeping back for itself.
    const reserveFactor = demand.priority === 0 ? 0.15 : 1
    let best: { holder: StockHolder; available: number } | null = null
    for (const settlement of this.world.settlements.values()) {
      if (settlement.id === demand.holder.id) continue
      const reserve = settlement.targetStock(demand.resource) * reserveFactor
      const spare = settlement.stock[demand.resource] - reserve
      if (spare < MIN_UNITS) continue
      if (!best || spare > best.available) best = { holder: settlement, available: spare }
    }
    return best
  }

  private dispatch(): void {
    this.pending = []
    const claimed = new Set<number>()

    for (const demand of this.collectDemands()) {
      const supplier = this.findSupplier(demand)
      if (!supplier) {
        this.pending.push({
          resource: demand.resource,
          fromLabel: '—',
          toLabel: demand.holder.label,
          units: demand.units,
          reason: { kind: 'noSupply' },
        })
        continue
      }

      const assigned = this.tryAssign(demand, supplier.holder, supplier.available, claimed)
      if (assigned) continue
    }
  }

  private tryAssign(
    demand: Demand,
    supplier: StockHolder,
    available: number,
    claimed: Set<number>,
  ): boolean {
    const homeId = supplier.id
    let lastFailure: BlockedReason = null
    let sawHauler = false
    /** Set when a bigger vehicle was refused a route before a smaller one took the job. */
    let refusedBigger: BlockedReason = null

    // Try the cart first: fewer trips, but it needs a real road all the way.
    for (const vehicleType of [VehicleType.Handcart, VehicleType.Porter]) {
      const vehicle = VEHICLES[vehicleType]
      const units = Math.min(
        demand.units,
        Math.floor(available),
        unitsThatFit(demand.resource, vehicle.capacityKg),
      )
      if (units < MIN_UNITS) continue

      const from = this.world.stopTileFor(supplier.id, vehicleType)
      const to = this.world.stopTileFor(demand.holder.id, vehicleType)
      if (!from || !to) continue

      const loadKg = units * this.world.unitWeight(demand.resource)
      const route = this.world.finder.find(from, to, vehicle, loadKg)
      if (route.failure !== null) {
        lastFailure = route.failure
        if (vehicleType === VehicleType.Handcart) refusedBigger = route.failure
        continue
      }

      const candidates = this.world.agents
        .idleHaulers(homeId, vehicleType)
        .filter((agent) => !claimed.has(agent.id))
      if (candidates.length === 0) {
        sawHauler = true
        continue
      }

      const agent = candidates[0]
      claimed.add(agent.id)
      const order: HaulOrder = {
        id: this.nextOrderId++,
        resource: demand.resource,
        amount: units,
        fromId: supplier.id,
        toId: demand.holder.id,
        vehicleType,
      }
      if (!this.startOrder(agent, order, from)) {
        claimed.delete(agent.id)
        lastFailure = 'blocked'
        continue
      }
      if (refusedBigger !== null) {
        // Worth saying out loud: this only moves because someone is carrying it.
        this.pending.push({
          resource: demand.resource,
          fromLabel: supplier.label,
          toLabel: demand.holder.label,
          units: demand.units,
          reason: { kind: 'downgraded', failure: refusedBigger },
        })
      }
      return true
    }

    this.pending.push({
      resource: demand.resource,
      fromLabel: supplier.label,
      toLabel: demand.holder.label,
      units: demand.units,
      reason: sawHauler ? { kind: 'noHauler' } : { kind: 'noRoute', failure: lastFailure },
    })
    return false
  }

  private startOrder(agent: Agent, order: HaulOrder, pickup: { tx: number; tz: number }): boolean {
    if (!this.world.agents.routeTo(agent, pickup)) {
      // Parked off the road: wheel it out to the nearest usable way and retry.
      if (!this.world.agents.moveToHomeStop(agent)) return false
      if (!this.world.agents.routeTo(agent, pickup)) return false
    }
    agent.order = order
    agent.state = AgentState.ToPickup
    agent.explain.fromLabel = this.world.holder(order.fromId)?.label ?? ''
    agent.explain.toLabel = this.world.holder(order.toId)?.label ?? ''
    agent.explain.cargoResource = order.resource
    agent.explain.cargoAmount = order.amount
    agent.explain.stuck = null
    return true
  }

  /** Keep every construction site staffed by whoever is free. */
  assignBuilders(): void {
    const sites = [...this.world.sites, ...this.world.structureSites].filter((site) => !site.done)
    if (sites.length === 0) return
    const perSite = 6

    const counts = new Map<string, number>()
    for (const agent of this.world.agents.agents) {
      if (agent.kind !== AgentKind.Builder || !agent.siteId) continue
      counts.set(agent.siteId, (counts.get(agent.siteId) ?? 0) + 1)
    }

    for (const site of sites) {
      let staffed = counts.get(site.id) ?? 0
      if (staffed >= perSite) continue
      for (const builder of this.world.agents.idleBuilders()) {
        if (staffed >= perSite) break
        const target = this.world.stopTileFor(site.id, builder.vehicleType)
        if (!target || !this.world.agents.routeTo(builder, target)) continue
        builder.siteId = site.id
        builder.state = AgentState.ToSite
        builder.explain.fromLabel = this.world.settlements.get(builder.homeId)?.label ?? ''
        builder.explain.toLabel = site.label
        staffed++
      }
    }
  }
}
