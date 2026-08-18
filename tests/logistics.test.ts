import { describe, expect, it } from 'vitest'
import { AgentState } from '../src/sim/agents'
import { Resource } from '../src/sim/resources'
import { VehicleType } from '../src/sim/vehicles'
import { World } from '../src/sim/world'
import { advanceGameHours } from './helpers'

describe('logistics without a road', () => {
  it('sends porters over the ford, because that is all that fits', () => {
    const world = new World()
    advanceGameHours(world, 8)

    const working = world.agents.agents.filter((agent) => agent.order !== null)
    expect(working.length).toBeGreaterThan(0)
    expect(working.every((agent) => agent.vehicleType === VehicleType.Porter)).toBe(true)
  })

  it('trickles food to the mine village but never enough', () => {
    const world = new World()
    advanceGameHours(world, 48)

    const mine = world.settlement('mine')
    // Something arrives on foot, yet the village stays below its reserve.
    expect(mine.stock[Resource.Food]).toBeLessThan(mine.targetStock(Resource.Food))
    expect(world.settlement('farm').stock[Resource.Food]).toBeGreaterThan(10)
  })

  it('keeps carts parked at home while there is no cartway', () => {
    const world = new World()
    advanceGameHours(world, 12)

    const carts = world.agents.agents.filter((agent) => agent.vehicleType === VehicleType.Handcart)
    expect(carts.length).toBeGreaterThan(0)
    expect(carts.every((cart) => cart.state === AgentState.Idle)).toBe(true)
  })
})
