import { clamp01 } from '../core/math'
import { BUILDINGS, type Building, type IdleReason } from './buildings'
import type { Resource } from './resources'
import type { Settlement } from './settlement'

/**
 * Runs every building for the given number of game hours.
 *
 * A building's activity is the minimum of three limits - workers, inputs and
 * storage space - and the limit that bit is recorded so the inspector can say
 * why the smithy is standing idle instead of just showing a zero.
 */
export const stepProduction = (
  settlements: Map<string, Settlement>,
  buildings: readonly Building[],
  hours: number,
): void => {
  const workerRatio = new Map<string, number>()
  for (const settlement of settlements.values()) {
    let needed = 0
    for (const building of settlement.buildings) needed += BUILDINGS[building.type].workers
    workerRatio.set(settlement.id, needed === 0 ? 1 : clamp01(settlement.population / needed))
  }

  for (const building of buildings) {
    const def = BUILDINGS[building.type]
    const recipe = def.recipe
    if (!recipe) {
      building.activity = 0
      building.idleReason = null
      continue
    }
    const settlement = settlements.get(building.settlementId)
    if (!settlement) continue

    // Tools (or any catalyst) speed the building up while they last.
    const catalyst = recipe.boostedBy
    const boost = catalyst && settlement.stock[catalyst.resource] > 0 ? catalyst.multiplier : 1

    // The binding constraint decides both the rate and the explanation.
    let factor = 1
    let reason: IdleReason = null
    const consider = (limit: number, why: IdleReason): void => {
      if (limit < factor) {
        factor = limit
        reason = why
      }
    }

    consider(workerRatio.get(settlement.id) ?? 1, { kind: 'noWorkers' })

    for (const [key, rate] of Object.entries(recipe.inputs)) {
      const resource = Number(key) as Resource
      const needed = (rate as number) * hours * boost
      if (needed <= 0) continue
      consider(clamp01(settlement.stock[resource] / needed), { kind: 'missingInput', resource })
    }

    for (const [key, rate] of Object.entries(recipe.outputs)) {
      const resource = Number(key) as Resource
      const produced = (rate as number) * hours * boost
      if (produced <= 0) continue
      const room = settlement.capacityFor(resource) - settlement.stock[resource]
      consider(clamp01(room / produced), { kind: 'storageFull', resource })
    }

    const activity = clamp01(factor)
    for (const [key, rate] of Object.entries(recipe.inputs)) {
      const resource = Number(key) as Resource
      settlement.stock[resource] = Math.max(
        0,
        settlement.stock[resource] - (rate as number) * hours * activity * boost,
      )
    }
    for (const [key, rate] of Object.entries(recipe.outputs)) {
      const resource = Number(key) as Resource
      settlement.stock[resource] += (rate as number) * hours * activity * boost
    }
    if (catalyst && boost > 1) {
      settlement.stock[catalyst.resource] = Math.max(
        0,
        settlement.stock[catalyst.resource] - catalyst.wearPerHour * hours * activity,
      )
    }

    building.activity = activity
    building.idleReason = activity > 0.995 ? null : reason
  }
}
