import { Clock } from '../core/clock'
import { EventLog } from '../core/events'
import { Rng } from '../core/rng'
import type { Heightfield } from '../world/heightfield'
import { generateWorld, type WorldLayout } from '../world/terrainGen'
import type { TileGrid } from '../world/tileGrid'

/**
 * The simulation world. Nothing in here (or anything it imports) may touch
 * three.js or the DOM, so the whole simulation can be stepped headlessly in tests.
 */
export class World {
  readonly seed: number
  readonly field: Heightfield
  readonly grid: TileGrid
  readonly layout: WorldLayout
  readonly clock = new Clock()
  readonly events = new EventLog()
  readonly rng: Rng

  /** Tiles changed this tick, so the renderer can repaint just those chunks. */
  readonly dirtyTiles: Array<[number, number]> = []

  constructor(seed = 20260817) {
    this.seed = seed
    const generated = generateWorld(seed)
    this.field = generated.field
    this.grid = generated.grid
    this.layout = generated.layout
    this.rng = new Rng(seed ^ 0x5f3a)
  }

  markTileDirty(tx: number, tz: number): void {
    this.dirtyTiles.push([tx, tz])
  }

  consumeDirtyTiles(): Array<[number, number]> {
    const list = this.dirtyTiles.slice()
    this.dirtyTiles.length = 0
    return list
  }

  log(severity: 'info' | 'good' | 'warn' | 'bad', text: string): void {
    this.events.push(this.clock.gameTime, severity, text)
  }

  /** One fixed simulation step. Subsystems are added in later phases. */
  step(dt: number): void {
    this.clock.advance(dt)
  }
}
