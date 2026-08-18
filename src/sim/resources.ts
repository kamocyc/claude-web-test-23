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
  /** Mass of one unit in kilograms - this is what limits what a vehicle can take. */
  readonly weight: number
  /** Counting word used in Japanese UI text ("小麦 12 袋"). */
  readonly unit: string
}

export const RESOURCE_INFO: Record<Resource, ResourceInfo> = {
  [Resource.Wheat]: { weight: 12, unit: '袋' },
  [Resource.Food]: { weight: 10, unit: '箱' },
  [Resource.IronOre]: { weight: 25, unit: '籠' },
  [Resource.Tools]: { weight: 8, unit: '組' },
  [Resource.Timber]: { weight: 30, unit: '本' },
  [Resource.Stone]: { weight: 45, unit: '個' },
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
