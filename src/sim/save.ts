import { planRoad } from '../roads/buildability'
import { ROAD_SPECS, type RoadSpecId } from '../roads/roadSpec'
import type { TilePos } from '../roads/tileLine'
import { BuildingType } from './buildings'
import { ALL_RESOURCES, type Resource, type Stock, emptyStock } from './resources'
import { Weather } from './weather'
import { World } from './world'

export const SAVE_VERSION = 3
export const SAVE_KEY = 'roads-build-towns/save'

interface SavedRoadTile {
  i: number
  s: number
  c: number
  e: number
  cond: number
  wet: number
  deck: number
}

export interface SaveData {
  version: number
  seed: number
  gameTime: number
  simTime: number
  speed: number
  weather: { state: Weather; intensity: number }
  bandits: { active: boolean; interest: number }
  milestones: string[]
  /** Terraformed vertices, as [index, height] pairs. */
  vertices: number[]
  /** Explored tiles, run-length encoded, starting with a run of unexplored. */
  explored: number[]
  roadTiles: SavedRoadTile[]
  edges: Array<{
    id: number
    specId: RoadSpecId
    label: string
    traffic: number
    openedOnDay: number
    complete: boolean
    tiles: number[]
  }>
  settlements: Array<{ id: string; population: number; stock: number[]; hungerHours: number }>
  structures: Array<{ type: BuildingType; x: number; z: number }>
  sites: Array<{ stakes: number[]; specId: RoadSpecId; tileIndex: number; stock: number[] }>
  structureSites: Array<{
    type: BuildingType
    x: number
    z: number
    stock: number[]
    labourDone: number
  }>
}

/**
 * The explored mask is one bit per tile over a 256x256 grid, and it is almost
 * all long runs, so run lengths are far smaller than the raw array.
 */
const encodeExplored = (explored: Uint8Array): number[] => {
  const runs: number[] = []
  let value = 0
  let count = 0
  for (let i = 0; i < explored.length; i++) {
    const here = explored[i] === 1 ? 1 : 0
    if (here === value) {
      count++
      continue
    }
    runs.push(count)
    value = here
    count = 1
  }
  runs.push(count)
  return runs
}

const decodeExplored = (runs: readonly number[], into: Uint8Array): void => {
  let index = 0
  let value = 0
  for (const run of runs) {
    if (value === 1) into.fill(1, index, Math.min(index + run, into.length))
    index += run
    value = value === 1 ? 0 : 1
  }
}

const stockToArray = (stock: Stock): number[] => ALL_RESOURCES.map((resource) => stock[resource])

const stockFromArray = (values: readonly number[]): Stock => {
  const stock = emptyStock()
  ALL_RESOURCES.forEach((resource, index) => {
    stock[resource] = values[index] ?? 0
  })
  return stock
}

/**
 * Saves the difference from the generated world rather than the world itself.
 * The valley is a pure function of its seed, so only what the player changed -
 * earthworks, roads, stores, buildings, work in progress - has to be written.
 */
export const serialize = (world: World): SaveData => {
  const vertices: number[] = []
  for (let i = 0; i < world.field.heights.length; i++) {
    if (Math.abs(world.field.heights[i] - world.field.original[i]) > 1e-4) {
      vertices.push(i, world.field.heights[i])
    }
  }

  const roadTiles: SavedRoadTile[] = []
  for (const index of new Set(world.roadTiles)) {
    if (world.grid.roadSurface[index] === 0) continue
    roadTiles.push({
      i: index,
      s: world.grid.roadSurface[index],
      c: world.grid.roadClass[index],
      e: world.grid.roadEdge[index],
      cond: world.grid.condition[index],
      wet: world.grid.wetness[index],
      deck: world.grid.deckHeight[index],
    })
  }

  return {
    version: SAVE_VERSION,
    seed: world.seed,
    gameTime: world.clock.gameTime,
    simTime: world.clock.simTime,
    speed: world.clock.speed,
    weather: { state: world.weather.weather, intensity: world.weather.intensity },
    bandits: { active: world.bandits.active, interest: world.bandits.interest },
    milestones: [...world.milestones],
    vertices,
    explored: encodeExplored(world.explored),
    roadTiles,
    edges: [...world.roads.edges.values()].map((edge) => ({
      id: edge.id,
      specId: edge.specId,
      label: edge.label,
      traffic: edge.traffic,
      openedOnDay: edge.openedOnDay,
      complete: edge.complete,
      tiles: edge.tiles.flatMap((tile) => [tile.tx, tile.tz]),
    })),
    settlements: [...world.settlements.values()].map((settlement) => ({
      id: settlement.id,
      population: settlement.population,
      stock: stockToArray(settlement.stock),
      hungerHours: settlement.hungerHours,
    })),
    structures: world.buildings
      .filter((building) => building.id >= 10000)
      .map((building) => ({ type: building.type, x: building.x, z: building.z })),
    sites: world.sites.map((site) => ({
      stakes: site.plan.stakes.flatMap((stake) => [stake.tx, stake.tz]),
      specId: site.plan.spec.id,
      tileIndex: site.tileIndex,
      stock: stockToArray(site.stock),
    })),
    structureSites: world.structureSites.map((site) => ({
      type: site.type,
      x: site.x,
      z: site.z,
      stock: stockToArray(site.stock),
      labourDone: site.labourDone,
    })),
  }
}

const pairsToTiles = (flat: readonly number[]): TilePos[] => {
  const tiles: TilePos[] = []
  for (let i = 0; i + 1 < flat.length; i += 2) tiles.push({ tx: flat[i], tz: flat[i + 1] })
  return tiles
}

/** Rebuilds a world from a save. Agents restart idle at home. */
export const deserialize = (data: SaveData): World => {
  if (data.version !== SAVE_VERSION) {
    throw new Error(`save version ${data.version} cannot be loaded`)
  }
  const world = new World(data.seed)
  world.restoring = true

  for (let i = 0; i + 1 < data.vertices.length; i += 2) {
    world.field.heights[data.vertices[i]] = data.vertices[i + 1]
  }

  decodeExplored(data.explored ?? [], world.explored)

  for (const edge of data.edges) {
    const restored = world.roads.create(
      edge.specId,
      edge.label,
      pairsToTiles(edge.tiles),
      edge.openedOnDay,
    )
    restored.traffic = edge.traffic
    restored.complete = edge.complete
    // Keep the original identifiers so tiles still point at the right road.
    if (restored.id !== edge.id) {
      world.roads.edges.delete(restored.id)
      world.roads.edges.set(edge.id, { ...restored, id: edge.id })
    }
  }

  for (const tile of data.roadTiles) {
    world.grid.roadSurface[tile.i] = tile.s
    world.grid.roadClass[tile.i] = tile.c
    world.grid.roadEdge[tile.i] = tile.e
    world.grid.condition[tile.i] = tile.cond
    world.grid.wetness[tile.i] = tile.wet
    world.grid.deckHeight[tile.i] = tile.deck
    world.roadTiles.push(tile.i)
  }

  for (const saved of data.settlements) {
    const settlement = world.settlements.get(saved.id)
    if (!settlement) continue
    settlement.population = saved.population
    settlement.hungerHours = saved.hungerHours
    const stock = stockFromArray(saved.stock)
    for (const resource of ALL_RESOURCES) settlement.stock[resource] = stock[resource]
  }

  for (const structure of data.structures) {
    const site = world.placeStructure(structure.type, structure.x, structure.z)
    if (!site) continue
    for (const [key, amount] of Object.entries(site.cost.materials)) {
      site.stock[Number(key) as Resource] = amount as number
    }
    site.applyLabour(site.cost.labour, false)
    world.finishStructureNow(site)
  }

  for (const saved of data.sites) {
    const plan = planRoad(
      world.field,
      world.grid,
      pairsToTiles(saved.stakes),
      ROAD_SPECS[saved.specId],
    )
    const site = world.startConstruction(plan)
    site.tileIndex = Math.min(saved.tileIndex, plan.tiles.length)
    const stock = stockFromArray(saved.stock)
    for (const resource of ALL_RESOURCES) site.stock[resource] = stock[resource]
  }

  for (const saved of data.structureSites) {
    const site = world.placeStructure(saved.type, saved.x, saved.z)
    if (!site) continue
    const stock = stockFromArray(saved.stock)
    for (const resource of ALL_RESOURCES) site.stock[resource] = stock[resource]
    site.labourDone = saved.labourDone
  }

  world.restoring = false
  world.clock.gameTime = data.gameTime
  world.clock.simTime = data.simTime
  world.clock.speed = data.speed as World['clock']['speed']
  world.weather.weather = data.weather.state
  world.weather.intensity = data.weather.intensity
  world.bandits.active = data.bandits.active
  world.bandits.interest = data.bandits.interest
  for (const milestone of data.milestones) world.milestones.add(milestone)
  world.events.push(world.clock.gameTime, 'info', '記録を読み込んだ。')

  return world
}

export const saveToStorage = (world: World): void => {
  localStorage.setItem(SAVE_KEY, JSON.stringify(serialize(world)))
}

export const loadFromStorage = (): World | null => {
  const raw = localStorage.getItem(SAVE_KEY)
  if (!raw) return null
  return deserialize(JSON.parse(raw) as SaveData)
}

export const hasSave = (): boolean => localStorage.getItem(SAVE_KEY) !== null
