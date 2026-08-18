import { clamp01 } from '../core/math'
import type { Rng } from '../core/rng'
import { BuildingType, type Building } from './buildings'

/** Chance per simulation second of an ambush at full danger. */
const AMBUSH_RATE = 0.0009
/** How far the camp's reach extends, in metres. */
const CAMP_REACH = 120
/** Tonnes of traffic that make the road worth robbing. */
export const BANDIT_INTEREST_TONNES = 18

export interface Ambush {
  readonly x: number
  readonly z: number
}

/**
 * One bandit camp, watching the only road worth watching.
 *
 * Danger scales with how close the road runs to the camp, whether it is night,
 * and whether the player has put up a watchtower or staffed an inn nearby - so
 * defending a road is a building problem, not a combat one.
 */
export class BanditSystem {
  readonly camp: { x: number; z: number }
  active = false
  /** Total tonnage seen on the roads, which is what draws them out. */
  interest = 0

  constructor(camp: { x: number; z: number }) {
    this.camp = camp
  }

  /** 0 = safe, 1 = as dangerous as this valley gets. */
  dangerAt(x: number, z: number, isNight: boolean, watchers: readonly Building[]): number {
    if (!this.active) return 0
    const distance = Math.hypot(x - this.camp.x, z - this.camp.z)
    if (distance > CAMP_REACH) return 0
    const proximity = clamp01(1 - distance / CAMP_REACH)

    let cover = 0
    for (const watcher of watchers) {
      const range = watcher.type === BuildingType.Watchtower ? 75 : 45
      const strength = watcher.type === BuildingType.Watchtower ? 0.85 : 0.5
      const d = Math.hypot(x - watcher.x, z - watcher.z)
      if (d < range) cover = Math.max(cover, strength * (1 - d / range) + strength * 0.35)
    }

    return clamp01(proximity * (isNight ? 1 : 0.35) * (1 - clamp01(cover)))
  }

  /** Returns true when the carrier is robbed. */
  rolls(danger: number, dt: number, rng: Rng): boolean {
    if (danger <= 0) return false
    return rng.next() < AMBUSH_RATE * danger * dt
  }

  noteTraffic(tonnes: number): boolean {
    if (this.active) return false
    this.interest += tonnes
    if (this.interest >= BANDIT_INTEREST_TONNES) {
      this.active = true
      return true
    }
    return false
  }
}
