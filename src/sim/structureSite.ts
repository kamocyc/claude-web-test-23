import { BUILDINGS, BuildingType } from './buildings'
import { Resource, type Stock, emptyStock } from './resources'
import type { StockHolder } from './stock'

export interface StructureCost {
  readonly materials: Partial<Record<Resource, number>>
  readonly labour: number
}

/** What the player may put up along a road, and what it takes. */
export const PLACEABLE: Partial<Record<BuildingType, StructureCost>> = {
  [BuildingType.Watchtower]: {
    materials: { [Resource.Timber]: 6, [Resource.Stone]: 2 },
    labour: 14,
  },
  [BuildingType.Inn]: {
    materials: { [Resource.Timber]: 10, [Resource.Stone]: 4 },
    labour: 22,
  },
  [BuildingType.Warehouse]: {
    materials: { [Resource.Timber]: 8 },
    labour: 12,
  },
}

export const PLACEABLE_ORDER: readonly BuildingType[] = [
  BuildingType.Watchtower,
  BuildingType.Inn,
  BuildingType.Warehouse,
]

/**
 * A public building the player has sited but not yet finished.
 * It behaves like a tiny construction site: materials are hauled to it, and
 * labour comes from the player and the village crews.
 */
export class StructureSite implements StockHolder {
  readonly id: string
  readonly label: string
  readonly type: BuildingType
  readonly x: number
  readonly z: number
  readonly cost: StructureCost
  readonly stock: Stock = emptyStock()
  labourDone = 0
  workers = 0
  playerHours = 0

  constructor(id: string, type: BuildingType, x: number, z: number) {
    this.id = id
    this.type = type
    this.x = x
    this.z = z
    this.label = BUILDINGS[type].label
    const cost = PLACEABLE[type]
    if (!cost) throw new Error(`${type} cannot be placed by the player`)
    this.cost = cost
  }

  capacityFor(_resource: Resource): number {
    void _resource
    return 40
  }

  get done(): boolean {
    return this.labourDone >= this.cost.labour
  }

  outstandingMaterials(): Partial<Record<Resource, number>> {
    const need: Partial<Record<Resource, number>> = {}
    for (const [key, amount] of Object.entries(this.cost.materials)) {
      const resource = Number(key) as Resource
      const missing = (amount as number) - this.stock[resource]
      if (missing > 0.01) need[resource] = missing
    }
    return need
  }

  progress(): number {
    return Math.min(1, this.labourDone / this.cost.labour)
  }

  /** True once the last of the work is done. */
  applyLabour(personHours: number, fromPlayer: boolean): boolean {
    if (this.done || personHours <= 0) return false
    if (Object.keys(this.outstandingMaterials()).length > 0) return false
    this.labourDone += personHours
    if (fromPlayer) this.playerHours += personHours
    return this.done
  }
}
