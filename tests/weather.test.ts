import { describe, expect, it } from 'vitest'
import { planRoad } from '../src/roads/buildability'
import { PathFinder, stepCost } from '../src/roads/pathfinding'
import { ROAD_SPECS, RoadSpecId } from '../src/roads/roadSpec'
import { Resource } from '../src/sim/resources'
import { VEHICLES, VehicleType } from '../src/sim/vehicles'
import { Weather } from '../src/sim/weather'
import { World } from '../src/sim/world'
import { worldToTile } from '../src/world/heightfield'
import { advanceGameHours } from './helpers'

const tileAt = (x: number, z: number) => ({ tx: worldToTile(x), tz: worldToTile(z) })

/** Build a road immediately by having the player do all of the work. */
const buildNow = (world: World, points: Array<[number, number]>, specId: RoadSpecId): void => {
  const plan = planRoad(
    world.field,
    world.grid,
    points.map(([x, z]) => tileAt(x, z)),
    ROAD_SPECS[specId],
  )
  const site = world.startConstruction(plan)
  site.stock[Resource.Stone] = 200
  site.stock[Resource.Timber] = 200
  let guard = 0
  while (!site.done && guard++ < 400) {
    world.playerWork = { x: site.x, z: site.z, active: true }
    advanceGameHours(world, 0.5)
  }
  world.playerWork = { x: 0, z: 0, active: false }
}

describe('rain, mud and upkeep', () => {
  it('soaks an earth road and leaves a paved one alone', () => {
    const world = new World(undefined, { spawnAgents: false })
    buildNow(world, [[130, 250], [190, 250]], RoadSpecId.DirtCartway)
    buildNow(world, [[130, 262], [190, 262]], RoadSpecId.StoneCartway)

    const dirt = world.grid.index(worldToTile(160), worldToTile(250))
    const stone = world.grid.index(worldToTile(160), worldToTile(262))

    // Force a downpour rather than waiting for the weather to turn.
    for (let i = 0; i < 40; i++) {
      world.weather.weather = Weather.Rain
      world.weather.intensity = 1
      advanceGameHours(world, 0.5)
    }
    expect(world.grid.wetness[dirt]).toBeGreaterThan(0.6)
    expect(world.grid.wetness[stone]).toBeLessThan(0.3)

    // What matters is the effect: the earth road slows a cart right down while
    // the paved one barely notices the rain.
    const cart = VEHICLES[VehicleType.Handcart]
    const dirtStep = stepCost(world, tileAt(158, 250), tileAt(160, 250), cart, 150)
    const stoneStep = stepCost(world, tileAt(158, 262), tileAt(160, 262), cart, 150)
    expect(dirtStep.seconds).toBeGreaterThan(stoneStep.seconds * 1.8)

    for (let i = 0; i < 40; i++) {
      world.weather.weather = Weather.Clear
      world.weather.intensity = 0
      advanceGameHours(world, 0.5)
    }
    expect(world.grid.wetness[dirt]).toBeLessThan(0.1)
  })

  it('sends a loaded cart the long paved way round once the mud sets in', () => {
    const world = new World(undefined, { spawnAgents: false })
    // A short earth road and a longer gravelled loop between the same points.
    buildNow(world, [[130, 250], [190, 250]], RoadSpecId.DirtCartway)
    buildNow(world, [[130, 250], [160, 222], [190, 250]], RoadSpecId.GravelCartway)

    const finder = new PathFinder(world)
    const from = tileAt(130, 250)
    const to = tileAt(190, 250)
    const cart = VEHICLES[VehicleType.Handcart]

    const dry = finder.find(from, to, cart, 150)
    const dryTouchesLoop = dry.tiles.some((tile) => tile.tz < worldToTile(240))
    expect(dryTouchesLoop).toBe(false)

    for (let i = 0; i < 60; i++) {
      world.weather.weather = Weather.Rain
      world.weather.intensity = 1
      advanceGameHours(world, 0.5)
    }

    const wet = finder.find(from, to, cart, 150)
    const wetTouchesLoop = wet.tiles.some((tile) => tile.tz < worldToTile(240))
    expect(wetTouchesLoop).toBe(true)
    expect(wet.seconds).toBeLessThan(dry.seconds * 3)
  })

  it('wears a road under traffic and lets the player patch it up', () => {
    const world = new World(undefined, { spawnAgents: false })
    buildNow(world, [[130, 250], [190, 250]], RoadSpecId.DirtCartway)
    const index = world.grid.index(worldToTile(160), worldToTile(250))

    for (let i = 0; i < 60; i++) world.noteTraffic(index, 0.24)
    expect(world.grid.condition[index]).toBeLessThan(0.8)

    const before = world.grid.condition[index]
    world.repairAround(160, 250, 6)
    expect(world.grid.condition[index]).toBeGreaterThan(before)
  })
})
