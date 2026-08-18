/**
 * Time model.
 *
 * Two clocks run side by side:
 *  - "sim seconds": the same scale as real seconds. Agent speeds and player
 *    movement are expressed in metres per sim second, so the world reads at a
 *    believable walking pace.
 *  - "game seconds": the calendar. It advances GAME_SECONDS_PER_SIM_SECOND times
 *    faster, so a full day passes in ~20 real minutes while a walk across the
 *    valley still feels like a journey. Production rates use game hours.
 *
 * The speed multiplier scales both, keeping them consistent.
 */
export const SIM_DT = 1 / 20
export const GAME_SECONDS_PER_SIM_SECOND = 72
export const GAME_SECONDS_PER_DAY = 24 * 3600
export const GAME_HOUR = 3600

export const SPEED_STEPS = [0, 1, 2, 4] as const
export type SpeedStep = (typeof SPEED_STEPS)[number]

export class Clock {
  /** Accumulated simulated seconds (excludes paused time). */
  simTime = 0
  /** Accumulated game seconds since the start of day 1. */
  gameTime = 8 * GAME_HOUR
  speed: SpeedStep = 1

  private accumulator = 0

  get paused(): boolean {
    return this.speed === 0
  }

  get day(): number {
    return Math.floor(this.gameTime / GAME_SECONDS_PER_DAY) + 1
  }

  /** 0..1 through the current day. */
  get dayFraction(): number {
    return (this.gameTime % GAME_SECONDS_PER_DAY) / GAME_SECONDS_PER_DAY
  }

  get hour(): number {
    return Math.floor((this.gameTime % GAME_SECONDS_PER_DAY) / GAME_HOUR)
  }

  get minute(): number {
    return Math.floor((this.gameTime % GAME_HOUR) / 60)
  }

  /** Night runs from 20:00 to 05:00. */
  get isNight(): boolean {
    const h = this.hour
    return h >= 20 || h < 5
  }

  /**
   * Feed real frame time, get back the number of fixed sim steps to run.
   * Steps are capped so a stalled tab cannot trigger a death spiral.
   */
  frame(realDelta: number): number {
    if (this.paused) return 0
    this.accumulator += Math.min(realDelta, 0.25) * this.speed
    let steps = 0
    while (this.accumulator >= SIM_DT && steps < 8) {
      this.accumulator -= SIM_DT
      steps++
    }
    return steps
  }

  /** Advance both clocks by one fixed step. */
  advance(dt: number = SIM_DT): void {
    this.simTime += dt
    this.gameTime += dt * GAME_SECONDS_PER_SIM_SECOND
  }

  formatTime(): string {
    return `${String(this.hour).padStart(2, '0')}:${String(this.minute).padStart(2, '0')}`
  }
}

/** Convert sim seconds into a human readable game duration ("約2時間30分"). */
export const simSecondsToGameSeconds = (simSeconds: number): number =>
  simSeconds * GAME_SECONDS_PER_SIM_SECOND
