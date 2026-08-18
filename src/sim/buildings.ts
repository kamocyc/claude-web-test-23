import { Resource } from './resources'

/** Why a building is not running at full rate. Formatted for display in the UI layer. */
export type IdleReason =
  | null
  | { kind: 'noWorkers' }
  | { kind: 'missingInput'; resource: Resource }
  | { kind: 'storageFull'; resource: Resource }

export enum BuildingType {
  Farmhouse = 'farmhouse',
  Kitchen = 'kitchen',
  Woodcutter = 'woodcutter',
  Mine = 'mine',
  Smithy = 'smithy',
  Quarry = 'quarry',
  Warehouse = 'warehouse',
  Cottage = 'cottage',
  Inn = 'inn',
  Watchtower = 'watchtower',
}

export interface Recipe {
  /** Units consumed per game hour at full activity. */
  readonly inputs: Partial<Record<Resource, number>>
  /** Units produced per game hour at full activity. */
  readonly outputs: Partial<Record<Resource, number>>
  /** Optional catalyst: present in stock -> faster, and slowly worn out. */
  readonly boostedBy?: { resource: Resource; multiplier: number; wearPerHour: number }
}

export interface BuildingDef {
  readonly label: string
  /** Footprint radius in metres, used for blocking tiles and for the mesh. */
  readonly radius: number
  readonly height: number
  readonly recipe?: Recipe
  /** Villagers needed to run it at full activity. */
  readonly workers: number
}

/**
 * Production rates are per game hour. The prototype is tuned so that the mine
 * village cannot feed itself: its smithy needs rations, which only the farm
 * village can supply, and the farm's yield only recovers once tools come back.
 */
export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  [BuildingType.Farmhouse]: {
    label: '農地',
    radius: 4.5,
    height: 5,
    workers: 6,
    recipe: {
      inputs: {},
      outputs: { [Resource.Wheat]: 0.9 },
      boostedBy: { resource: Resource.Tools, multiplier: 1.7, wearPerHour: 0.02 },
    },
  },
  [BuildingType.Kitchen]: {
    label: '厨房',
    radius: 3.5,
    height: 4.5,
    workers: 3,
    recipe: { inputs: { [Resource.Wheat]: 0.7 }, outputs: { [Resource.Food]: 0.9 } },
  },
  [BuildingType.Woodcutter]: {
    label: '木こり小屋',
    radius: 3.5,
    height: 4,
    workers: 2,
    recipe: { inputs: {}, outputs: { [Resource.Timber]: 0.35 } },
  },
  [BuildingType.Mine]: {
    label: '鉱山',
    radius: 5,
    height: 6,
    workers: 4,
    recipe: { inputs: { [Resource.Food]: 0.12 }, outputs: { [Resource.IronOre]: 0.6 } },
  },
  [BuildingType.Smithy]: {
    label: '鍛冶場',
    radius: 4,
    height: 5,
    workers: 3,
    recipe: {
      inputs: { [Resource.IronOre]: 0.5, [Resource.Food]: 0.15 },
      outputs: { [Resource.Tools]: 0.22 },
    },
  },
  [BuildingType.Quarry]: {
    label: '石切場',
    radius: 5,
    height: 3,
    workers: 2,
    recipe: { inputs: { [Resource.Food]: 0.08 }, outputs: { [Resource.Stone]: 0.3 } },
  },
  [BuildingType.Warehouse]: { label: '倉庫', radius: 4, height: 5.5, workers: 0 },
  [BuildingType.Cottage]: { label: '家', radius: 3, height: 4.5, workers: 0 },
  [BuildingType.Inn]: { label: '宿場', radius: 4.5, height: 6, workers: 2 },
  [BuildingType.Watchtower]: { label: '見張り台', radius: 2.5, height: 11, workers: 2 },
}

export interface Building {
  readonly id: number
  readonly type: BuildingType
  readonly settlementId: string
  readonly x: number
  readonly z: number
  /** 0..1, how much of the last hour this building actually ran. */
  activity: number
  /** Structured reason for low activity; the UI turns it into Japanese. */
  idleReason: IdleReason
}
