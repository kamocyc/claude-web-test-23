import { GRID_SIZE } from './heightfield'

/** Natural ground cover of a tile. */
export enum TerrainSurface {
  Grass = 0,
  Rock = 1,
  Water = 2,
  Bank = 3,
  Field = 4,
}

/** Built road surface sitting on top of the terrain. */
export enum RoadSurface {
  None = 0,
  Dirt = 1,
  Gravel = 2,
  Stone = 3,
  TimberBridge = 4,
  StoneBridge = 5,
}

/** How wide the built way is - decides which vehicles fit. */
export enum RoadClass {
  None = 0,
  /** 1.5 m footpath: porters only. */
  Footpath = 1,
  /** 3 m cartway: carts fit. */
  Cartway = 2,
}

/**
 * Per-tile world state. Plain typed arrays: cheap to iterate every tick and
 * trivial to serialise for save games. No rendering data lives here.
 */
export class TileGrid {
  readonly size: number
  readonly terrain: Uint8Array
  readonly roadSurface: Uint8Array
  readonly roadClass: Uint8Array
  readonly roadEdge: Int32Array
  /** 1 = pristine, 0 = ruined. Slows traffic as it drops. */
  readonly condition: Float32Array
  /** 0 = dry, 1 = saturated mud. Dirt roads suffer, stone barely cares. */
  readonly wetness: Float32Array
  /** Reserved: footfall on unbuilt ground, for future desire paths. */
  readonly trample: Float32Array
  /** Water surface elevation where the tile is water, else 0. */
  readonly waterLevel: Float32Array
  /** Bridge deck elevation where a bridge stands, else 0. */
  readonly deckHeight: Float32Array
  readonly structure: Int32Array
  /** 1 = impassable (building footprint, cliff face). */
  readonly blocked: Uint8Array

  constructor(size = GRID_SIZE) {
    this.size = size
    const n = size * size
    this.terrain = new Uint8Array(n)
    this.roadSurface = new Uint8Array(n)
    this.roadClass = new Uint8Array(n)
    this.roadEdge = new Int32Array(n).fill(-1)
    this.condition = new Float32Array(n).fill(1)
    this.wetness = new Float32Array(n)
    this.trample = new Float32Array(n)
    this.waterLevel = new Float32Array(n)
    this.deckHeight = new Float32Array(n)
    this.structure = new Int32Array(n).fill(-1)
    this.blocked = new Uint8Array(n)
  }

  index(tx: number, tz: number): number {
    return tz * this.size + tx
  }

  inBounds(tx: number, tz: number): boolean {
    return tx >= 0 && tz >= 0 && tx < this.size && tz < this.size
  }

  isWater(tx: number, tz: number): boolean {
    return this.terrain[this.index(tx, tz)] === TerrainSurface.Water
  }

  hasRoad(tx: number, tz: number): boolean {
    return this.roadSurface[this.index(tx, tz)] !== RoadSurface.None
  }

  /** A bridge deck carries traffic over water. */
  isBridge(tx: number, tz: number): boolean {
    const s = this.roadSurface[this.index(tx, tz)]
    return s === RoadSurface.TimberBridge || s === RoadSurface.StoneBridge
  }

  setRoad(tx: number, tz: number, surface: RoadSurface, roadClass: RoadClass, edgeId: number): void {
    const i = this.index(tx, tz)
    this.roadSurface[i] = surface
    this.roadClass[i] = roadClass
    this.roadEdge[i] = edgeId
    this.condition[i] = 1
    this.wetness[i] = 0
  }

  clearRoad(tx: number, tz: number): void {
    const i = this.index(tx, tz)
    this.roadSurface[i] = RoadSurface.None
    this.roadClass[i] = RoadClass.None
    this.roadEdge[i] = -1
  }
}
