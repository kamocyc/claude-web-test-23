import { describe, expect, it } from 'vitest'
import { PathFinder } from '../src/roads/pathfinding'
import { planRoad } from '../src/roads/buildability'
import { ROAD_SPECS, RoadSpecId } from '../src/roads/roadSpec'
import { findStopTile } from '../src/sim/navigation'
import { Resource } from '../src/sim/resources'
import { VEHICLES, VehicleType } from '../src/sim/vehicles'
import { World } from '../src/sim/world'
import { worldToTile } from '../src/world/heightfield'
import { RoadClass } from '../src/world/tileGrid'
import { advanceGameHours } from './helpers'

const stopTile = (world: World, id: string) => {
  const settlement = world.settlement(id)
  const tile = findStopTile(world.grid, settlement.x, settlement.z)
  if (!tile) throw new Error('no stop tile')
  return tile
}

describe('pathfinding', () => {
  it('lets a porter reach the mine village the hard way', () => {
    const world = new World()
    const finder = new PathFinder(world)
    const result = finder.find(
      stopTile(world, 'farm'),
      stopTile(world, 'mine'),
      VEHICLES[VehicleType.Porter],
      20,
    )
    expect(result.failure).toBeNull()
    expect(result.tiles.length).toBeGreaterThan(200)
    // On foot, through the ford and over the pass: the best part of a day.
    expect(result.seconds).toBeGreaterThan(300)
  })

  it('refuses to send a cart anywhere without a cartway', () => {
    const world = new World()
    const finder = new PathFinder(world)
    const result = finder.find(
      stopTile(world, 'farm'),
      stopTile(world, 'mine'),
      VEHICLES[VehicleType.Handcart],
      120,
    )
    expect(result.failure).toBe('needsRoad')
    expect(result.tiles).toHaveLength(0)
  })

  it('refuses a loaded cart on a 32 % road that a porter still walks', () => {
    const world = new World()
    // Following the natural slope needs almost no earthworks, so this line is
    // buildable - and still far too steep to haul anything up.
    const steep = planRoad(
      world.field,
      world.grid,
      [
        { tx: worldToTile(300), tz: worldToTile(150) },
        { tx: worldToTile(318), tz: worldToTile(150) },
      ],
      ROAD_SPECS[RoadSpecId.DirtCartway],
    )
    expect(steep.buildable).toBe(true)
    expect(steep.worstGrade).toBeGreaterThan(0.25)

    const site = world.startConstruction(steep)
    site.stock[Resource.Timber] = 40
    advanceGameHours(world, 20)
    expect(site.done).toBe(true)

    const finder = new PathFinder(world)
    const from = { tx: worldToTile(300), tz: worldToTile(150) }
    const to = { tx: worldToTile(318), tz: worldToTile(150) }

    expect(finder.find(from, to, VEHICLES[VehicleType.Handcart], 180).failure).toBe('tooSteep')
    expect(finder.find(from, to, VEHICLES[VehicleType.Porter], 20).failure).toBeNull()
  })

  it('carries a fully loaded cart over the natural pass once it is surfaced', () => {
    const world = new World()
    const gentle = planRoad(
      world.field,
      world.grid,
      [
        { tx: worldToTile(292), tz: worldToTile(190) },
        { tx: worldToTile(306), tz: worldToTile(132) },
      ],
      ROAD_SPECS[RoadSpecId.DirtCartway],
    )
    expect(gentle.worstGrade).toBeLessThan(0.1)
    const site = world.startConstruction(gentle)
    site.stock[Resource.Timber] = 40
    advanceGameHours(world, 40)
    expect(site.done).toBe(true)

    const finder = new PathFinder(world)
    const result = finder.find(
      { tx: worldToTile(292), tz: worldToTile(190) },
      { tx: worldToTile(306), tz: worldToTile(132) },
      VEHICLES[VehicleType.Handcart],
      180,
    )
    expect(result.failure).toBeNull()
    expect(result.tiles.length).toBeGreaterThan(20)
  })

  it('finds a cart-legal stop tile next to a village once a road reaches it', () => {
    const world = new World()
    const farm = world.settlement('farm')
    expect(findStopTile(world.grid, farm.x, farm.z, { requireRoadClass: RoadClass.Cartway })).not.toBeNull()
  })
})
