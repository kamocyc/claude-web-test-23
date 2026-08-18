import { describe, expect, it } from 'vitest'
import { planRoad } from '../src/roads/buildability'
import { ROAD_SPECS, RoadSpecId } from '../src/roads/roadSpec'
import { BuildingType } from '../src/sim/buildings'
import { Resource } from '../src/sim/resources'
import { deserialize, serialize } from '../src/sim/save'
import { World } from '../src/sim/world'
import { worldToTile } from '../src/world/heightfield'
import { RoadSurface } from '../src/world/tileGrid'
import { advanceGameHours } from './helpers'

const tileAt = (x: number, z: number) => ({ tx: worldToTile(x), tz: worldToTile(z) })

describe('saving and restoring the valley', () => {
  it('keeps the roads, earthworks, stores and buildings', () => {
    const world = new World(undefined, { spawnAgents: false })
    const plan = planRoad(
      world.field,
      world.grid,
      [tileAt(130, 250), tileAt(180, 250)],
      ROAD_SPECS[RoadSpecId.DirtCartway],
    )
    const site = world.startConstruction(plan)
    let guard = 0
    while (!site.done && guard++ < 200) {
      world.playerWork = { x: site.x, z: site.z, active: true }
      advanceGameHours(world, 0.5)
    }
    world.playerWork = { x: 0, z: 0, active: false }

    const tower = world.placeStructure(BuildingType.Watchtower, 200, 240)
    expect(tower).not.toBeNull()
    if (tower) {
      tower.stock[Resource.Timber] = 6
      tower.stock[Resource.Stone] = 2
      world.playerWork = { x: 200, z: 240, active: true }
      advanceGameHours(world, 3)
      world.playerWork = { x: 0, z: 0, active: false }
    }

    const mid = tileAt(155, 250)
    const midIndex = world.grid.index(mid.tx, mid.tz)
    const beforeHeight = world.field.tileHeight(mid.tx, mid.tz)
    const beforeFood = world.settlement('farm').stock[Resource.Food]

    const restored = deserialize(JSON.parse(JSON.stringify(serialize(world))))

    expect(restored.grid.roadSurface[midIndex]).toBe(RoadSurface.Dirt)
    expect(restored.field.tileHeight(mid.tx, mid.tz)).toBeCloseTo(beforeHeight, 3)
    expect(restored.settlement('farm').stock[Resource.Food]).toBeCloseTo(beforeFood, 3)
    expect(restored.buildings.some((b) => b.type === BuildingType.Watchtower)).toBe(true)
    expect(restored.clock.gameTime).toBeCloseTo(world.clock.gameTime, 3)
    expect(restored.roads.edges.size).toBe(world.roads.edges.size)
  })

  it('restores a half-built road so the work can carry on', () => {
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
    expect(site.done).toBe(false)
    const progressed = site.tileIndex
    expect(progressed).toBeGreaterThan(0)

    const restored = deserialize(JSON.parse(JSON.stringify(serialize(world))))
    expect(restored.sites).toHaveLength(1)
    expect(restored.sites[0].tileIndex).toBe(progressed)

    let guard = 0
    while (!restored.sites[0]?.done && guard++ < 200) {
      const active = restored.sites[0]
      if (!active) break
      restored.playerWork = { x: active.x, z: active.z, active: true }
      advanceGameHours(restored, 0.5)
    }
    expect(restored.sites).toHaveLength(0)
    const end = tileAt(185, 262)
    expect(restored.grid.roadSurface[restored.grid.index(end.tx, end.tz)]).toBe(RoadSurface.Dirt)
  })
})
