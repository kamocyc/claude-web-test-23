import { describe, expect, it } from 'vitest'
import { MAX_EARTHWORK, planRoad } from '../src/roads/buildability'
import { ROAD_SPECS, RoadSpecId } from '../src/roads/roadSpec'
import { Resource } from '../src/sim/resources'
import { World } from '../src/sim/world'
import { worldToTile } from '../src/world/heightfield'
import { RoadSurface } from '../src/world/tileGrid'
import { advanceGameHours } from './helpers'

const tileAt = (x: number, z: number) => ({ tx: worldToTile(x), tz: worldToTile(z) })

describe('road planning', () => {
  it('costs a flat stretch by length and calls it buildable', () => {
    const world = new World()
    const plan = planRoad(
      world.field,
      world.grid,
      [tileAt(130, 250), tileAt(190, 250)],
      ROAD_SPECS[RoadSpecId.DirtCartway],
    )
    expect(plan.buildable).toBe(true)
    expect(plan.lengthM).toBeCloseTo(60, 0)
    expect(plan.tiles.length).toBeGreaterThan(25)
    expect(plan.worstGrade).toBeLessThan(0.08)
    expect(plan.bridgeTiles).toBe(0)
  })

  it('refuses a straight line up the escarpment', () => {
    const world = new World()
    const plan = planRoad(
      world.field,
      world.grid,
      [tileAt(288, 210), tileAt(348, 210)],
      ROAD_SPECS[RoadSpecId.DirtCartway],
    )
    expect(plan.buildable).toBe(false)
    const problems = plan.segments.map((segment) => segment.problem?.kind)
    expect(problems).toContain('earthworkTooDeep')
    expect(plan.worstGrade).toBeGreaterThan(0.25)
  })

  it('turns river tiles into a timber bridge that needs timber', () => {
    const world = new World()
    const z = world.layout.bridgeHint.z
    const plan = planRoad(
      world.field,
      world.grid,
      [tileAt(world.layout.bridgeHint.x - 26, z), tileAt(world.layout.bridgeHint.x + 26, z)],
      ROAD_SPECS[RoadSpecId.DirtCartway],
    )
    expect(plan.bridgeTiles).toBeGreaterThan(4)
    expect(plan.materials[Resource.Timber] ?? 0).toBeGreaterThan(5)
    expect(plan.buildable).toBe(true)
  })

  it('reports earthwork volume for a road cut into a slope', () => {
    const world = new World()
    const plan = planRoad(
      world.field,
      world.grid,
      [tileAt(300, 150), tileAt(330, 150)],
      ROAD_SPECS[RoadSpecId.DirtCartway],
    )
    expect(plan.cutVolume + plan.fillVolume).toBeGreaterThan(0)
    for (const segment of plan.segments) {
      if (segment.problem?.kind === 'earthworkTooDeep') {
        expect(segment.problem.metres).toBeGreaterThan(MAX_EARTHWORK)
      }
    }
  })
})

describe('construction', () => {
  it('builds tile by tile and opens the road to traffic', () => {
    const world = new World()
    const plan = planRoad(
      world.field,
      world.grid,
      [tileAt(130, 250), tileAt(170, 250)],
      ROAD_SPECS[RoadSpecId.DirtCartway],
    )
    const site = world.startConstruction(plan)
    site.stock[Resource.Timber] = 50

    advanceGameHours(world, 24)

    expect(site.done).toBe(true)
    const mid = tileAt(150, 250)
    expect(world.grid.roadSurface[world.grid.index(mid.tx, mid.tz)]).toBe(RoadSurface.Dirt)
    expect(world.roads.get(site.edgeId)?.complete).toBe(true)
  })

  it('stops at the work front when materials run out', () => {
    const world = new World()
    const plan = planRoad(
      world.field,
      world.grid,
      [tileAt(130, 250), tileAt(170, 250)],
      ROAD_SPECS[RoadSpecId.DirtCartway],
    )
    const site = world.startConstruction(plan)
    site.stock[Resource.Timber] = 0.5

    advanceGameHours(world, 24)

    expect(site.done).toBe(false)
    expect(site.blockReason).toEqual({ kind: 'awaitingMaterials', resource: Resource.Timber })
    expect(site.progress()).toBeGreaterThan(0)
  })
})
