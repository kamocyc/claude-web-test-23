import { Clock, GAME_HOUR, GAME_SECONDS_PER_SIM_SECOND } from '../core/clock'
import { EventLog, type EventSeverity } from '../core/events'
import { Rng } from '../core/rng'
import type { PlannedTile, RoadPlan } from '../roads/buildability'
import { ConstructionSite } from '../roads/construction'
import { RoadNetwork } from '../roads/roadNetwork'
import { BRIDGE_SPECS } from '../roads/roadSpec'
import { tileKey } from '../roads/tileLine'
import type { Heightfield } from '../world/heightfield'
import { generateWorld, type WorldLayout } from '../world/terrainGen'
import { RoadClass, type TileGrid } from '../world/tileGrid'
import type { Building } from './buildings'
import { stepProduction } from './production'
import { FARM_VILLAGE, MINE_VILLAGE, buildSettlement } from './scenario'
import type { Settlement } from './settlement'

/** How many villagers the player is worth when they work a site themselves. */
export const PLAYER_LABOUR_RATE = 12

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
  readonly roads = new RoadNetwork()
  readonly sites: ConstructionSite[] = []
  /** Tile keys still waiting to be built, for the construction overlay. */
  readonly plannedTileKeys = new Set<number>()
  /** Set by the player controller while they are working a site by hand. */
  playerWork: { x: number; z: number; active: boolean } = { x: 0, z: 0, active: false }
  private nextSiteId = 1

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

  /** Stake out a road and open a construction site for it. */
  startConstruction(plan: RoadPlan): ConstructionSite {
    const edge = this.roads.create(
      plan.spec.id,
      `${plan.spec.label} #${this.nextSiteId}`,
      plan.tiles.map((tile) => ({ tx: tile.tx, tz: tile.tz })),
      this.clock.day,
    )
    const site = new ConstructionSite(`site${this.nextSiteId++}`, edge.label, plan, edge.id)
    for (const tile of plan.tiles) {
      this.plannedTileKeys.add(tileKey(tile.tx, tile.tz))
      this.markTileDirty(tile.tx, tile.tz)
    }
    // Until villagers are dispatched, a standing village crew keeps the work moving.
    site.workers = 4
    this.sites.push(site)
    this.log(
      'info',
      `${edge.label} の工事を始めた（${Math.round(plan.lengthM)}m・のべ${Math.round(plan.labourHours)}人時）`,
    )
    return site
  }

  /** The player working the site by hand, in person-hours. */
  applyPlayerLabour(x: number, z: number, personHours: number): ConstructionSite | null {
    for (const site of this.sites) {
      if (site.done) continue
      if (Math.hypot(site.x - x, site.z - z) > 9) continue
      this.completeTiles(site, site.applyLabour(personHours, true))
      return site
    }
    return null
  }

  /** Write one finished tile into the world: terraform, surface, open to traffic. */
  private openTile(site: ConstructionSite, tile: PlannedTile): void {
    const spec = site.plan.spec
    const index = this.grid.index(tile.tx, tile.tz)

    if (tile.isBridge) {
      this.grid.deckHeight[index] = tile.targetHeight
      const bridge = BRIDGE_SPECS[spec.bridge]
      this.grid.setRoad(tile.tx, tile.tz, bridge.surface, RoadClass.Cartway, site.edgeId)
    } else {
      this.field.setTileHeight(tile.tx, tile.tz, tile.targetHeight)
      this.grid.setRoad(tile.tx, tile.tz, spec.surface, spec.roadClass, site.edgeId)
      for (const shoulder of tile.shoulders) {
        if (!this.grid.inBounds(shoulder.tx, shoulder.tz)) continue
        const shoulderIndex = this.grid.index(shoulder.tx, shoulder.tz)
        if (this.grid.blocked[shoulderIndex] === 1) continue
        if (this.grid.isWater(shoulder.tx, shoulder.tz)) continue
        if (this.grid.hasRoad(shoulder.tx, shoulder.tz)) continue
        if (Math.abs(this.field.tileHeight(shoulder.tx, shoulder.tz) - tile.targetHeight) > 2) continue
        this.field.setTileHeight(shoulder.tx, shoulder.tz, tile.targetHeight)
        this.grid.setRoad(shoulder.tx, shoulder.tz, spec.surface, spec.roadClass, site.edgeId)
        this.markTileDirty(shoulder.tx, shoulder.tz)
      }
    }
    this.plannedTileKeys.delete(tileKey(tile.tx, tile.tz))
    this.markTileDirty(tile.tx, tile.tz)
  }

  private completeTiles(site: ConstructionSite, tiles: readonly PlannedTile[]): void {
    for (const tile of tiles) this.openTile(site, tile)
    if (site.done && !this.roads.get(site.edgeId)?.complete) {
      const edge = this.roads.get(site.edgeId)
      if (edge) edge.complete = true
      this.log('good', `${site.label} が開通した`)
      this.sites.splice(this.sites.indexOf(site), 1)
    }
  }

  /** One fixed simulation step. */
  step(dt: number): void {
    this.clock.advance(dt)
    const hours = (dt * GAME_SECONDS_PER_SIM_SECOND) / GAME_HOUR

    stepProduction(this.settlements, this.buildings, hours)
    for (const settlement of this.settlements.values()) settlement.consumeFood(hours)

    for (const site of this.sites.slice()) {
      if (site.done) continue
      this.completeTiles(site, site.applyLabour(site.workers * hours, false))
    }
    if (this.playerWork.active) {
      this.applyPlayerLabour(this.playerWork.x, this.playerWork.z, PLAYER_LABOUR_RATE * hours)
    }
  }
}
