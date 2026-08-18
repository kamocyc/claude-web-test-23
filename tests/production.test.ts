import { describe, expect, it } from 'vitest'
import { BuildingType } from '../src/sim/buildings'
import { Resource } from '../src/sim/resources'
import { World } from '../src/sim/world'
import { advanceGameHours } from './helpers'

const buildingOf = (world: World, type: BuildingType) => {
  const found = world.buildings.find((b) => b.type === type)
  if (!found) throw new Error(`no ${type}`)
  return found
}

// Production only: no haulers, so nothing can cross the valley.
const isolatedWorld = () => new World(undefined, { spawnAgents: false })

describe('isolated villages', () => {
  it('stalls the mine village because nothing feeds it', () => {
    const world = isolatedWorld()
    advanceGameHours(world, 24)

    const mine = world.settlement('mine')
    expect(mine.stock[Resource.Food]).toBeLessThan(0.5)

    const smithy = buildingOf(world, BuildingType.Smithy)
    expect(smithy.activity).toBeLessThan(0.05)
    expect(smithy.idleReason).toEqual({ kind: 'missingInput', resource: Resource.Food })

    // No tools are ever made, so the farm never gets its yield boost.
    expect(mine.stock[Resource.Tools]).toBeLessThan(1)
  })

  it('lets the farm village build a food surplus it cannot deliver', () => {
    const world = isolatedWorld()
    advanceGameHours(world, 24)

    const farm = world.settlement('farm')
    expect(farm.stock[Resource.Food]).toBeGreaterThan(farm.targetStock(Resource.Food))
    expect(farm.stock[Resource.Tools]).toBe(0)
  })

  it('shrinks a village that runs out of food', () => {
    const world = isolatedWorld()
    const before = world.settlement('mine').population
    advanceGameHours(world, 48)
    expect(world.settlement('mine').population).toBeLessThan(before)
  })
})
