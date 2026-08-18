import { Clock, GAME_HOUR, GAME_SECONDS_PER_SIM_SECOND } from '../core/clock'
import { EventLog, type EventSeverity } from '../core/events'
import { Rng } from '../core/rng'
import type { Heightfield } from '../world/heightfield'
import { generateWorld, type WorldLayout } from '../world/terrainGen'
import type { TileGrid } from '../world/tileGrid'
import type { Building } from './buildings'
import { stepProduction } from './production'
import { FARM_VILLAGE, MINE_VILLAGE, buildSettlement } from './scenario'
import type { Settlement } from './settlement'

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

  readonly settlements = new Map<string, Settlement>()
  readonly buildings: Building[] = []

  /** Tiles changed this tick, so the renderer can repaint just those chunks. */
  private readonly dirtyTiles: Array<[number, number]> = []

  constructor(seed = 20260817) {
    this.seed = seed
    const generated = generateWorld(seed)
    this.field = generated.field
    this.grid = generated.grid
    this.layout = generated.layout
    this.rng = new Rng(seed ^ 0x5f3a)

    const markFootprint = (tx: number, tz: number, buildingId: number): void => {
      if (!this.grid.inBounds(tx, tz)) return
      const i = this.grid.index(tx, tz)
      this.grid.blocked[i] = 1
      this.grid.structure[i] = buildingId
    }

    for (const [spec, centre] of [
      [FARM_VILLAGE, generated.layout.farmVillage],
      [MINE_VILLAGE, generated.layout.mineVillage],
    ] as const) {
      const built = buildSettlement(spec, centre, markFootprint)
      this.settlements.set(built.settlement.id, built.settlement)
      this.buildings.push(...built.buildings)
    }
  }

  settlement(id: string): Settlement {
    const found = this.settlements.get(id)
    if (!found) throw new Error(`unknown settlement: ${id}`)
    return found
  }

  markTileDirty(tx: number, tz: number): void {
    this.dirtyTiles.push([tx, tz])
  }

  consumeDirtyTiles(): Array<[number, number]> {
    const list = this.dirtyTiles.slice()
    this.dirtyTiles.length = 0
    return list
  }

  log(severity: EventSeverity, text: string): void {
    this.events.push(this.clock.gameTime, severity, text)
  }

  /** One fixed simulation step. */
  step(dt: number): void {
    this.clock.advance(dt)
    const hours = (dt * GAME_SECONDS_PER_SIM_SECOND) / GAME_HOUR

    stepProduction(this.settlements, this.buildings, hours)
    for (const settlement of this.settlements.values()) settlement.consumeFood(hours)
  }
}
