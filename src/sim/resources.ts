/** The four core goods, plus the two building materials roads consume. */
export enum Resource {
  Wheat = 0,
  Food = 1,
  IronOre = 2,
  Tools = 3,
  Timber = 4,
  Stone = 5,
}

export const ALL_RESOURCES: readonly Resource[] = [
  Resource.Wheat,
  Resource.Food,
  Resource.IronOre,
  Resource.Tools,
  Resource.Timber,
  Resource.Stone,
]

export interface ResourceInfo {
  /** Display name; the game is played in Japanese. */
  readonly label: string
  /** Mass of one unit in kilograms - this is what limits what a vehicle can take. */
  readonly weight: number
  /** Counting word used in Japanese UI text ("小麦 12 袋"). */
  readonly unit: string
}

export const RESOURCE_INFO: Record<Resource, ResourceInfo> = {
  [Resource.Wheat]: { label: '小麦', weight: 12, unit: '袋' },
  [Resource.Food]: { label: '食料', weight: 10, unit: '箱' },
  [Resource.IronOre]: { label: '鉄鉱石', weight: 25, unit: '籠' },
  [Resource.Tools]: { label: '工具', weight: 8, unit: '組' },
  [Resource.Timber]: { label: '木材', weight: 30, unit: '本' },
  [Resource.Stone]: { label: '石材', weight: 45, unit: '個' },
}

export type Stock = Record<Resource, number>

export const emptyStock = (): Stock => ({
  [Resource.Wheat]: 0,
  [Resource.Food]: 0,
  [Resource.IronOre]: 0,
  [Resource.Tools]: 0,
  [Resource.Timber]: 0,
  [Resource.Stone]: 0,
})

export const cargoWeight = (resource: Resource, amount: number): number =>
  RESOURCE_INFO[resource].weight * amount

/** How many units of a resource fit in a given carrying capacity. */
export const unitsThatFit = (resource: Resource, capacityKg: number): number =>
  Math.floor(capacityKg / RESOURCE_INFO[resource].weight)
