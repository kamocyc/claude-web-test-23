import { Resource, type Stock, emptyStock } from '../sim/resources'
import type { StockHolder } from '../sim/stock'
import { tileToWorld } from '../world/heightfield'
import type { PlannedTile, RoadPlan } from './buildability'

export type SiteBlockReason =
  | null
  | { kind: 'awaitingMaterials'; resource: Resource }
  | { kind: 'noWorkers' }

/**
 * A staked-out road under construction.
 *
 * Materials must physically arrive at the work front - which is exactly why the
 * second road is easier than the first. Labour comes from village work crews and
 * from the player swinging a shovel at the site.
 */
export class ConstructionSite implements StockHolder {
  readonly id: string
  readonly label: string
  readonly plan: RoadPlan
  readonly edgeId: number
  readonly stock: Stock = emptyStock()
  /** Index of the tile currently being built. */
  tileIndex = 0
  /** Person-hours already put into the current tile. */
  labourIntoTile = 0
  /** Materials for the current tile have been consumed. */
  private tileStarted = false
  workers = 0
  blockReason: SiteBlockReason = null
  /** Person-hours contributed by the player, for the site readout. */
  playerHours = 0
  crewHours = 0

  constructor(id: string, label: string, plan: RoadPlan, edgeId: number) {
    this.id = id
    this.label = label
    this.plan = plan
    this.edgeId = edgeId
  }

  get done(): boolean {
    return this.tileIndex >= this.plan.tiles.length
  }

  get currentTile(): PlannedTile | null {
    return this.plan.tiles[this.tileIndex] ?? null
  }

  /** Work front: where materials are wanted and where the crew is standing. */
  get x(): number {
    const tile = this.currentTile ?? this.plan.tiles[this.plan.tiles.length - 1]
    return tile ? tileToWorld(tile.tx) : 0
  }

  get z(): number {
    const tile = this.currentTile ?? this.plan.tiles[this.plan.tiles.length - 1]
    return tile ? tileToWorld(tile.tz) : 0
  }

  capacityFor(_resource: Resource): number {
    void _resource
    return 60
  }

  /** Total materials still needed across every unbuilt tile. */
  outstandingMaterials(): Partial<Record<Resource, number>> {
    const need: Partial<Record<Resource, number>> = {}
    for (let i = this.tileIndex; i < this.plan.tiles.length; i++) {
      for (const [key, amount] of Object.entries(this.plan.tiles[i].materials)) {
        const resource = Number(key) as Resource
        need[resource] = (need[resource] ?? 0) + (amount as number)
      }
    }
    for (const [key, amount] of Object.entries(need)) {
      const resource = Number(key) as Resource
      need[resource] = Math.max(0, (amount as number) - this.stock[resource])
    }
    return need
  }

  remainingLabour(): number {
    let total = -this.labourIntoTile
    for (let i = this.tileIndex; i < this.plan.tiles.length; i++) total += this.plan.tiles[i].labour
    return Math.max(0, total)
  }

  progress(): number {
    if (this.plan.tiles.length === 0) return 1
    return this.tileIndex / this.plan.tiles.length
  }

  /**
   * Spend person-hours on the site. Returns the tiles finished this call so the
   * world can terraform them and open them to traffic.
   */
  applyLabour(personHours: number, fromPlayer: boolean): PlannedTile[] {
    const finished: PlannedTile[] = []
    let budget = personHours
    if (budget <= 0) {
      if (this.workers <= 0) this.blockReason = { kind: 'noWorkers' }
      return finished
    }
    if (fromPlayer) this.playerHours += personHours
    else this.crewHours += personHours

    while (budget > 0 && !this.done) {
      const tile = this.plan.tiles[this.tileIndex]

      if (!this.tileStarted) {
        let missing: Resource | null = null
        for (const [key, amount] of Object.entries(tile.materials)) {
          const resource = Number(key) as Resource
          if (this.stock[resource] < (amount as number) - 1e-6) missing = resource
        }
        if (missing !== null) {
          this.blockReason = { kind: 'awaitingMaterials', resource: missing }
          return finished
        }
        for (const [key, amount] of Object.entries(tile.materials)) {
          const resource = Number(key) as Resource
          this.stock[resource] -= amount as number
        }
        this.tileStarted = true
      }

      const needed = tile.labour - this.labourIntoTile
      const spent = Math.min(budget, needed)
      this.labourIntoTile += spent
      budget -= spent

      if (this.labourIntoTile >= tile.labour - 1e-6) {
        finished.push(tile)
        this.tileIndex++
        this.labourIntoTile = 0
        this.tileStarted = false
      }
    }

    this.blockReason = null
    return finished
  }
}
