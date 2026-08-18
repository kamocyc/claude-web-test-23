import { GAME_HOUR, GAME_SECONDS_PER_SIM_SECOND } from '../src/core/clock'
import type { World } from '../src/sim/world'

/** Step the simulation forward by a number of game hours, headless. */
export const advanceGameHours = (world: World, hours: number, stepSimSeconds = 5): void => {
  const totalSimSeconds = (hours * GAME_HOUR) / GAME_SECONDS_PER_SIM_SECOND
  const steps = Math.max(1, Math.round(totalSimSeconds / stepSimSeconds))
  for (let i = 0; i < steps; i++) world.step(stepSimSeconds)
}
