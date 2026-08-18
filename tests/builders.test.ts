import { describe, expect, it } from 'vitest'
import { MAX_STEPS_PER_FRAME, SIM_DT, SPEED_STEPS, Clock } from '../src/core/clock'
import { planRoad } from '../src/roads/buildability'
import { ROAD_SPECS, RoadSpecId } from '../src/roads/roadSpec'
import { AgentKind } from '../src/sim/agents'
import { World, builderCountFor } from '../src/sim/world'
import { worldToTile } from '../src/world/heightfield'
import { advanceGameHours } from './helpers'

const tileAt = (x: number, z: number) => ({ tx: worldToTile(x), tz: worldToTile(z) })

describe('work crews', () => {
  it('turns out villagers in proportion to the village', () => {
    expect(builderCountFor(16)).toBeGreaterThan(builderCountFor(10))
    expect(builderCountFor(2)).toBeGreaterThanOrEqual(2)

    const world = new World()
    const builders = world.agents.agents.filter((agent) => agent.kind === AgentKind.Builder)
    expect(builders.length).toBe(builderCountFor(16) + builderCountFor(10))
  })

  it('builds a road with nobody but the village crew on it', () => {
    const world = new World()
    const plan = planRoad(
      world.field,
      world.grid,
      [tileAt(130, 250), tileAt(180, 250)],
      ROAD_SPECS[RoadSpecId.DirtCartway],
    )
    const site = world.startConstruction(plan)

    advanceGameHours(world, 24)

    expect(site.done).toBe(true)
    expect(site.crewHours).toBeGreaterThan(0)
    expect(site.playerHours).toBe(0)
  })

  it('keeps a village crew on its own side of the valley', () => {
    const world = new World()
    const plan = planRoad(
      world.field,
      world.grid,
      [tileAt(130, 250), tileAt(180, 250)],
      ROAD_SPECS[RoadSpecId.DirtCartway],
    )
    const site = world.startConstruction(plan)
    advanceGameHours(world, 2)

    const assigned = world.agents.agents.filter(
      (agent) => agent.kind === AgentKind.Builder && agent.siteId === site.id,
    )
    expect(assigned.length).toBeGreaterThan(0)
    // The mine village is the far side of the river; its crew stays home.
    expect(assigned.every((agent) => agent.homeId === 'farm')).toBe(true)
  })
})

describe('speed settings', () => {
  it('offers faster settings than before and still caps work per frame', () => {
    expect(SPEED_STEPS).toContain(8)
    expect(SPEED_STEPS).toContain(16)

    const clock = new Clock()
    clock.speed = 16
    // A very slow frame cannot be allowed to run an unbounded amount of world.
    const steps = clock.frame(1)
    expect(steps).toBe(MAX_STEPS_PER_FRAME)
    expect(steps * SIM_DT).toBeLessThanOrEqual(4)
  })

  it('keeps up with the highest speed at a playable frame rate', () => {
    const clock = new Clock()
    clock.speed = 16
    // 30 fps: sixteen simulated seconds must fit into one real second.
    let simulated = 0
    for (let frame = 0; frame < 30; frame++) {
      const steps = clock.frame(1 / 30)
      simulated += steps * SIM_DT
    }
    expect(simulated).toBeGreaterThanOrEqual(15.5)
  })
})
