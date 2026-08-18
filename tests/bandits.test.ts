import { describe, expect, it } from 'vitest'
import { BANDIT_INTEREST_TONNES } from '../src/sim/bandits'
import { BuildingType } from '../src/sim/buildings'
import { Resource } from '../src/sim/resources'
import { World } from '../src/sim/world'
import { advanceGameHours } from './helpers'

const activate = (world: World): void => {
  const index = world.grid.index(140, 130)
  world.noteTraffic(index, BANDIT_INTEREST_TONNES + 1)
}

describe('bandits and the buildings that answer them', () => {
  it('ignores the valley until the road is worth robbing', () => {
    const world = new World(undefined, { spawnAgents: false })
    const camp = world.layout.banditCamp
    expect(world.bandits.dangerAt(camp.x + 10, camp.z, true, [])).toBe(0)

    activate(world)
    expect(world.bandits.active).toBe(true)
    expect(world.bandits.dangerAt(camp.x + 10, camp.z, true, [])).toBeGreaterThan(0.5)
  })

  it('is far less dangerous by day and far away', () => {
    const world = new World(undefined, { spawnAgents: false })
    activate(world)
    const camp = world.layout.banditCamp
    const night = world.bandits.dangerAt(camp.x + 20, camp.z, true, [])
    const day = world.bandits.dangerAt(camp.x + 20, camp.z, false, [])
    expect(day).toBeLessThan(night)
    expect(world.bandits.dangerAt(camp.x + 400, camp.z, true, [])).toBe(0)
  })

  it('lets the player build a watchtower that makes the road safe', () => {
    const world = new World(undefined, { spawnAgents: false })
    activate(world)
    const camp = world.layout.banditCamp
    const spot = { x: camp.x + 30, z: camp.z - 20 }
    const exposed = world.bandits.dangerAt(spot.x, spot.z, true, [])
    expect(exposed).toBeGreaterThan(0)

    const site = world.placeStructure(BuildingType.Watchtower, spot.x, spot.z)
    expect(site).not.toBeNull()
    if (!site) return

    // Materials have to arrive before a single hour of work counts.
    expect(site.applyLabour(50, true)).toBe(false)
    expect(site.progress()).toBe(0)

    site.stock[Resource.Timber] = 6
    site.stock[Resource.Stone] = 2
    world.playerWork = { x: spot.x, z: spot.z, active: true }
    advanceGameHours(world, 4)

    const tower = world.buildings.find((building) => building.type === BuildingType.Watchtower)
    expect(tower).toBeDefined()
    expect(world.bandits.dangerAt(spot.x, spot.z, true, world.watchers())).toBeLessThan(exposed * 0.5)
  })
})
