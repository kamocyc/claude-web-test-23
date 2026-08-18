import { describe, expect, it } from 'vitest'
import { planRoad } from '../src/roads/buildability'
import { ROAD_SPECS, RoadSpecId } from '../src/roads/roadSpec'
import { tileKey } from '../src/roads/tileLine'
import { BuildingType } from '../src/sim/buildings'
import { Resource } from '../src/sim/resources'
import { World } from '../src/sim/world'
import { worldToTile } from '../src/world/heightfield'
import { RoadSurface } from '../src/world/tileGrid'
import { advanceGameHours } from './helpers'

const tileAt = (x: number, z: number) => ({ tx: worldToTile(x), tz: worldToTile(z) })

const buildRoad = (world: World, fromX: number, toX: number, z: number) => {
  const plan = planRoad(
    world.field,
    world.grid,
    [tileAt(fromX, z), tileAt(toX, z)],
    ROAD_SPECS[RoadSpecId.DirtCartway],
  )
  const site = world.startConstruction(plan)
  let guard = 0
  while (!site.done && guard++ < 300) {
    world.playerWork = { x: site.x, z: site.z, active: true }
    advanceGameHours(world, 0.5)
  }
  world.playerWork = { x: 0, z: 0, active: false }
  return { plan, site }
}

describe('taking things down again', () => {
  it('lifts the surface off a single tile and leaves the rest of the road', () => {
    const world = new World(undefined, { spawnAgents: false })
    const { plan } = buildRoad(world, 130, 180, 250)
    const target = plan.tiles[5]
    const keep = plan.tiles[6]

    expect(world.removeRoadTile(target.tx, target.tz)).toBe(true)
    expect(world.grid.roadSurface[world.grid.index(target.tx, target.tz)]).toBe(RoadSurface.None)
    expect(world.grid.hasRoad(keep.tx, keep.tz)).toBe(true)
    // Nothing is left behind for road wear to keep visiting.
    expect(world.roadTiles).not.toContain(world.grid.index(target.tx, target.tz))
    expect(world.removeRoadTile(target.tx, target.tz)).toBe(false)
  })

  it('removes a whole road and forgets it ever existed', () => {
    const world = new World(undefined, { spawnAgents: false })
    const { plan } = buildRoad(world, 130, 180, 250)
    const edgeId = world.grid.roadEdge[world.grid.index(plan.tiles[3].tx, plan.tiles[3].tz)]
    expect(edgeId).toBeGreaterThan(0)

    const removed = world.removeRoad(edgeId)
    expect(removed).toBeGreaterThan(10)
    expect(world.roads.get(edgeId)).toBeUndefined()
    for (const tile of plan.tiles) {
      expect(world.grid.hasRoad(tile.tx, tile.tz)).toBe(false)
    }
  })

  it('cancels a road under construction, keeping what is already open', () => {
    const world = new World(undefined, { spawnAgents: false })
    const plan = planRoad(
      world.field,
      world.grid,
      [tileAt(130, 262), tileAt(190, 262)],
      ROAD_SPECS[RoadSpecId.DirtCartway],
    )
    const site = world.startConstruction(plan)
    world.playerWork = { x: site.x, z: site.z, active: true }
    advanceGameHours(world, 1)
    world.playerWork = { x: 0, z: 0, active: false }
    const built = site.tileIndex
    expect(built).toBeGreaterThan(0)
    expect(site.done).toBe(false)

    site.stock[Resource.Timber] = 5
    const before = world.settlement('farm').stock[Resource.Timber]

    expect(world.cancelSite(site)).toBe(true)
    expect(world.sites).toHaveLength(0)
    // What was opened is still road; what was only staked is gone from the plan.
    expect(world.grid.hasRoad(plan.tiles[0].tx, plan.tiles[0].tz)).toBe(true)
    const unbuilt = plan.tiles[plan.tiles.length - 1]
    expect(world.grid.hasRoad(unbuilt.tx, unbuilt.tz)).toBe(false)
    expect(world.plannedTileKeys.has(tileKey(unbuilt.tx, unbuilt.tz))).toBe(false)
    // Materials already delivered are carried back to the village.
    expect(world.settlement('farm').stock[Resource.Timber]).toBeGreaterThan(before)
    expect(world.roads.get(site.edgeId)?.tiles.length).toBe(built)
  })

  it('drops a road that was cancelled before a single tile opened', () => {
    const world = new World(undefined, { spawnAgents: false })
    const plan = planRoad(
      world.field,
      world.grid,
      [tileAt(130, 268), tileAt(170, 268)],
      ROAD_SPECS[RoadSpecId.DirtCartway],
    )
    const site = world.startConstruction(plan)
    expect(world.roads.get(site.edgeId)).toBeDefined()

    expect(world.cancelSite(site)).toBe(true)
    expect(world.roads.get(site.edgeId)).toBeUndefined()
    expect(world.plannedTileKeys.size).toBe(0)
  })

  it('pulls down a watchtower the player put up and unblocks its ground', () => {
    const world = new World(undefined, { spawnAgents: false })
    const site = world.placeStructure(BuildingType.Watchtower, 200, 240)
    expect(site).not.toBeNull()
    if (!site) return
    site.stock[Resource.Timber] = 6
    site.stock[Resource.Stone] = 2
    world.playerWork = { x: 200, z: 240, active: true }
    advanceGameHours(world, 3)
    world.playerWork = { x: 0, z: 0, active: false }

    const tower = world.buildings.find((building) => building.type === BuildingType.Watchtower)
    expect(tower).toBeDefined()
    if (!tower) return
    const footprint = world.grid.index(worldToTile(tower.x), worldToTile(tower.z))
    expect(world.grid.blocked[footprint]).toBe(1)

    const timberBefore = world.settlement('farm').stock[Resource.Timber]
    expect(world.demolishBuilding(tower)).toBe(true)
    expect(world.buildings).not.toContain(tower)
    expect(world.grid.blocked[footprint]).toBe(0)
    expect(world.grid.structure[footprint]).toBe(-1)
    expect(world.consumeRemovedBuildings()).toContain(tower)
    // Half the timber is salvaged.
    expect(world.settlement('farm').stock[Resource.Timber]).toBeCloseTo(timberBefore + 3, 3)
  })

  it('refuses to demolish the village the scenario starts with', () => {
    const world = new World(undefined, { spawnAgents: false })
    const farmhouse = world.buildings.find((building) => building.type === BuildingType.Farmhouse)
    expect(farmhouse).toBeDefined()
    if (!farmhouse) return
    expect(world.demolishBuilding(farmhouse)).toBe(false)
    expect(world.buildings).toContain(farmhouse)
  })

  it('takes back a building site the player changed their mind about', () => {
    const world = new World(undefined, { spawnAgents: false })
    const site = world.placeStructure(BuildingType.Inn, 200, 246)
    expect(site).not.toBeNull()
    if (!site) return
    site.stock[Resource.Timber] = 4
    const before = world.settlement('farm').stock[Resource.Timber]

    expect(world.cancelStructureSite(site)).toBe(true)
    expect(world.structureSites).toHaveLength(0)
    expect(world.settlement('farm').stock[Resource.Timber]).toBeCloseTo(before + 4, 3)
  })
})
