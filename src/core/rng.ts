/**
 * Deterministic pseudo random number generator (mulberry32).
 * The whole simulation must use this instead of Math.random so that a given
 * seed always produces the same world and the same headless test results.
 */
export class Rng {
  private state: number

  constructor(seed: number) {
    this.state = seed >>> 0
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min)
  }

  /** Uniform integer in [min, max]. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1))
  }

  /** True with the given probability. */
  chance(probability: number): boolean {
    return this.next() < probability
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.min(items.length - 1, Math.floor(this.next() * items.length))]
  }

  /** Derive an independent stream, so adding a consumer cannot shift other streams. */
  fork(salt: number): Rng {
    return new Rng((this.state ^ Math.imul(salt + 1, 0x9e3779b9)) >>> 0)
  }

  snapshot(): number {
    return this.state
  }

  restore(state: number): void {
    this.state = state >>> 0
  }
}
