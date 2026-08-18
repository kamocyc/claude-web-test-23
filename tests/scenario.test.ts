import { describe, expect, it } from 'vitest'
import { planRoad } from '../src/roads/buildability'
import { ROAD_SPECS, RoadSpecId } from '../src/roads/roadSpec'
import { BuildingType } from '../src/sim/buildings'
import { Resource } from '../src/sim/resources'
import { VehicleType } from '../src/sim/vehicles'
import { World } from '../src/sim/world'
import { worldToTile } from '../src/world/heightfield'
import { advanceGameHours } from './helpers'

/**
 * The route a player finds by surveying: across the valley floor, over the
 * river where it is narrow, then north and up the natural pass. It is far
 * longer than the straight line, and it is the only line a cart can use.
 */
const SURVEYED_ROUTE: Array<[number, number]> = [
  [112, 252],
  [180, 246],
  [232, 238],
  [258, 228],
  [292, 228],
  [292, 206],
  [292, 190],
  [306, 132],
  [354, 106],
  [398, 154],
  [408, 192],
]

const stakeOut = (world: World, specId = RoadSpecId.DirtCartway) =>
  planRoad(
    world.field,
    world.grid,
    SURVEYED_ROUTE.map(([x, z]) => ({ tx: worldToTile(x), tz: worldToTile(z) })),
    ROAD_SPECS[specId],
  )

const smithyActivity = (world: World): number =>
  world.buildings.find((building) => building.type === BuildingType.Smithy)?.activity ?? 0

describe('the road changes the valley', () => {
  it('is a cart-legal route the player can actually stake out', () => {
    const world = new World()
    const plan = stakeOut(world)
    expect(plan.buildable).toBe(true)
    expect(plan.worstGrade).toBeLessThan(0.1)
    expect(plan.bridgeTiles).toBeGreaterThan(4)
    // The timber for the bridge is within reach of the farm village's stores.
    expect(plan.materials[Resource.Timber] ?? 0).toBeLessThan(20)
  })

  it('gets tools back to the farm once the road opens', () => {
    const world = new World()
    const plan = stakeOut(world)
    const site = world.startConstruction(plan)
    // The player works the site alongside the village crew.
    world.playerWork = { x: 0, z: 0, active: false }

    // Timber for the bridge is hauled in by the villages themselves; give the
    // site a head start on labour so the test covers days rather than weeks.
    let hours = 0
    while (!site.done && hours < 200) {
      world.playerWork = { x: site.x, z: site.z, active: true }
      advanceGameHours(world, 1)
      hours += 1
    }
    expect(site.done).toBe(true)
    world.playerWork = { x: 0, z: 0, active: false }

    advanceGameHours(world, 72)

    const mine = world.settlement('mine')
    const farm = world.settlement('farm')

    // Carts run, the mine eats, the smithy works, and tools come back.
    expect(world.milestones.has('firstCartDelivery')).toBe(true)
    expect(mine.stock[Resource.Food]).toBeGreaterThan(5)
    expect(smithyActivity(world)).toBeGreaterThan(0.3)
    expect(farm.stock[Resource.Tools]).toBeGreaterThan(1)
    expect(world.milestones.has('toolsToFarm')).toBe(true)

    const carts = world.agents.agents.filter((a) => a.vehicleType === VehicleType.Handcart)
    expect(carts.some((cart) => cart.state !== 'idle')).toBe(true)
  })

  it('leaves the farm without tools when the road is never built', () => {
    const world = new World()
    advanceGameHours(world, 48)
    expect(world.settlement('farm').stock[Resource.Tools]).toBeLessThan(1)
    expect(world.milestones.has('toolsToFarm')).toBe(false)
  })
})
