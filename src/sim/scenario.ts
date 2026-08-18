import { worldToTile } from '../world/heightfield'
import { BUILDINGS, BuildingType, type Building } from './buildings'
import { Resource } from './resources'
import { Settlement } from './settlement'

export interface SettlementSpec {
  readonly id: string
  readonly label: string
  readonly population: number
  readonly reserveDays: number
  readonly startingStock: Partial<Record<Resource, number>>
  readonly buildings: ReadonlyArray<{ type: BuildingType; angle: number; distance: number }>
}

/**
 * The prototype scenario: a farm village with food but no tools, and a mine
 * village with ore but nothing to eat. Neither can fix itself alone.
 */
export const FARM_VILLAGE: SettlementSpec = {
  id: 'farm',
  label: '麦谷の農村',
  population: 16,
  reserveDays: 1.5,
  startingStock: {
    [Resource.Wheat]: 20,
    [Resource.Food]: 26,
    [Resource.Timber]: 14,
    [Resource.Stone]: 4,
  },
  buildings: [
    { type: BuildingType.Warehouse, angle: 0.4, distance: 9 },
    { type: BuildingType.Farmhouse, angle: 2.0, distance: 17 },
    { type: BuildingType.Kitchen, angle: 3.3, distance: 12 },
    { type: BuildingType.Woodcutter, angle: 4.5, distance: 19 },
    { type: BuildingType.Cottage, angle: 5.4, distance: 13 },
    { type: BuildingType.Cottage, angle: 1.2, distance: 14 },
    { type: BuildingType.Cottage, angle: 2.7, distance: 20 },
  ],
}

export const MINE_VILLAGE: SettlementSpec = {
  id: 'mine',
  label: '鉄尾根の鉱山村',
  population: 10,
  reserveDays: 2,
  startingStock: {
    [Resource.Food]: 2,
    [Resource.IronOre]: 18,
    [Resource.Stone]: 10,
    [Resource.Timber]: 2,
  },
  buildings: [
    { type: BuildingType.Warehouse, angle: 3.6, distance: 9 },
    { type: BuildingType.Mine, angle: 0.6, distance: 18 },
    { type: BuildingType.Smithy, angle: 2.2, distance: 12 },
    { type: BuildingType.Quarry, angle: 4.9, distance: 19 },
    { type: BuildingType.Cottage, angle: 5.7, distance: 12 },
    { type: BuildingType.Cottage, angle: 1.6, distance: 11 },
  ],
}

export interface BuiltSettlement {
  readonly settlement: Settlement
  readonly buildings: Building[]
}

let nextBuildingId = 1

export const buildSettlement = (
  spec: SettlementSpec,
  centre: { x: number; z: number },
  markFootprint: (tx: number, tz: number, buildingId: number) => void,
): BuiltSettlement => {
  const settlement = new Settlement({
    id: spec.id,
    label: spec.label,
    x: centre.x,
    z: centre.z,
    population: spec.population,
    reserveDays: spec.reserveDays,
  })
  for (const [key, amount] of Object.entries(spec.startingStock)) {
    settlement.stock[Number(key) as Resource] = amount as number
  }

  const buildings: Building[] = []
  for (const placement of spec.buildings) {
    const def = BUILDINGS[placement.type]
    const x = centre.x + Math.cos(placement.angle) * placement.distance
    const z = centre.z + Math.sin(placement.angle) * placement.distance
    const building: Building = {
      id: nextBuildingId++,
      type: placement.type,
      settlementId: spec.id,
      x,
      z,
      activity: 0,
      idleReason: null,
    }
    buildings.push(building)
    settlement.buildings.push(building)

    if (def.recipe) {
      for (const key of Object.keys(def.recipe.outputs)) {
        settlement.producedResources.add(Number(key) as Resource)
      }
      if (def.recipe.boostedBy?.resource === Resource.Tools) settlement.toolsUser = true
    }

    const radius = def.radius
    const minTx = worldToTile(x - radius)
    const maxTx = worldToTile(x + radius)
    const minTz = worldToTile(z - radius)
    const maxTz = worldToTile(z + radius)
    for (let tz = minTz; tz <= maxTz; tz++) {
      for (let tx = minTx; tx <= maxTx; tx++) markFootprint(tx, tz, building.id)
    }
  }

  return { settlement, buildings }
}
