import { clamp01 } from '../core/math'
import type { Rng } from '../core/rng'

export enum Weather {
  Clear = 'clear',
  Overcast = 'overcast',
  Rain = 'rain',
}

export const WEATHER_LABELS: Record<Weather, string> = {
  [Weather.Clear]: '晴れ',
  [Weather.Overcast]: '曇り',
  [Weather.Rain]: '雨',
}

/** Chance per game hour of moving to another state. */
const TRANSITIONS: Record<Weather, Array<{ to: Weather; chance: number }>> = {
  [Weather.Clear]: [{ to: Weather.Overcast, chance: 0.06 }],
  [Weather.Overcast]: [
    { to: Weather.Rain, chance: 0.18 },
    { to: Weather.Clear, chance: 0.12 },
  ],
  [Weather.Rain]: [{ to: Weather.Overcast, chance: 0.22 }],
}

/**
 * Weather exists for one reason: it changes which road is the good road.
 * An earth track that is quickest in the dry becomes a bog after a day of rain,
 * and the longer gravelled line starts winning.
 */
export class WeatherSystem {
  weather: Weather = Weather.Clear
  /** 0..1, how hard it is raining right now. */
  intensity = 0
  /** Game hours the current state has lasted. */
  private held = 0

  step(hours: number, rng: Rng): boolean {
    this.held += hours
    let changed = false
    for (const transition of TRANSITIONS[this.weather]) {
      if (rng.next() < transition.chance * hours) {
        this.weather = transition.to
        this.held = 0
        changed = true
        break
      }
    }
    const target = this.weather === Weather.Rain ? 1 : this.weather === Weather.Overcast ? 0.12 : 0
    this.intensity += (target - this.intensity) * clamp01(hours * 0.8)
    return changed
  }

  get raining(): boolean {
    return this.weather === Weather.Rain
  }

  get label(): string {
    return WEATHER_LABELS[this.weather]
  }
}
