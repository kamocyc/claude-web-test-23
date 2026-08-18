import { clamp } from '../core/math'

/** Tiles per side of the world grid. */
export const GRID_SIZE = 256
/** Metres per tile. */
export const TILE_SIZE = 2
/** World extent in metres. */
export const WORLD_SIZE = GRID_SIZE * TILE_SIZE

/**
 * Height field stored per grid vertex ((GRID_SIZE + 1)^2 samples).
 * Tiles sit between vertices; a tile's reference height is its centre, which is
 * the average of its four corners. Roads terraform vertices (cut and fill), so
 * every derived value - grade, mesh, water depth - follows automatically.
 */
export class Heightfield {
  readonly size: number
  readonly vertexSize: number
  readonly heights: Float32Array
  /** Untouched terrain height, kept so cut/fill volume can be reported. */
  readonly original: Float32Array

  constructor(size = GRID_SIZE) {
    this.size = size
    this.vertexSize = size + 1
    this.heights = new Float32Array(this.vertexSize * this.vertexSize)
    this.original = new Float32Array(this.vertexSize * this.vertexSize)
  }

  vertexIndex(ix: number, iz: number): number {
    const x = clamp(ix, 0, this.vertexSize - 1)
    const z = clamp(iz, 0, this.vertexSize - 1)
    return z * this.vertexSize + x
  }

  getVertex(ix: number, iz: number): number {
    return this.heights[this.vertexIndex(ix, iz)]
  }

  setVertex(ix: number, iz: number, value: number): void {
    this.heights[this.vertexIndex(ix, iz)] = value
  }

  /** Freeze the current field as the pristine terrain reference. */
  commitOriginal(): void {
    this.original.set(this.heights)
  }

  /** Bilinear height sample at world coordinates (metres). */
  sample(x: number, z: number): number {
    const fx = clamp(x / TILE_SIZE, 0, this.size)
    const fz = clamp(z / TILE_SIZE, 0, this.size)
    const ix = Math.min(Math.floor(fx), this.size - 1)
    const iz = Math.min(Math.floor(fz), this.size - 1)
    const tx = fx - ix
    const tz = fz - iz
    const h00 = this.getVertex(ix, iz)
    const h10 = this.getVertex(ix + 1, iz)
    const h01 = this.getVertex(ix, iz + 1)
    const h11 = this.getVertex(ix + 1, iz + 1)
    const top = h00 + (h10 - h00) * tx
    const bottom = h01 + (h11 - h01) * tx
    return top + (bottom - top) * tz
  }

  /** Height at the centre of a tile. */
  tileHeight(tx: number, tz: number): number {
    const x = clamp(tx, 0, this.size - 1)
    const z = clamp(tz, 0, this.size - 1)
    return (
      (this.getVertex(x, z) +
        this.getVertex(x + 1, z) +
        this.getVertex(x, z + 1) +
        this.getVertex(x + 1, z + 1)) *
      0.25
    )
  }

  /** Set all four corners of a tile to the given height. */
  setTileHeight(tx: number, tz: number, height: number): void {
    this.setVertex(tx, tz, height)
    this.setVertex(tx + 1, tz, height)
    this.setVertex(tx, tz + 1, height)
    this.setVertex(tx + 1, tz + 1, height)
  }

  /** Steepest local slope of a tile, as a ratio (0.1 = 10 %). */
  tileSlope(tx: number, tz: number): number {
    const a = this.getVertex(tx, tz)
    const b = this.getVertex(tx + 1, tz)
    const c = this.getVertex(tx, tz + 1)
    const d = this.getVertex(tx + 1, tz + 1)
    const dx = Math.max(Math.abs(b - a), Math.abs(d - c)) / TILE_SIZE
    const dz = Math.max(Math.abs(c - a), Math.abs(d - b)) / TILE_SIZE
    return Math.hypot(dx, dz)
  }

  /** Grade between two tile centres, as a signed ratio (positive = uphill). */
  gradeBetween(ax: number, az: number, bx: number, bz: number): number {
    const run = Math.hypot(bx - ax, bz - az) * TILE_SIZE
    if (run <= 0) return 0
    return (this.tileHeight(bx, bz) - this.tileHeight(ax, az)) / run
  }

  /** Surface normal at world coordinates, for lighting and slope readouts. */
  normalAt(x: number, z: number): [number, number, number] {
    const e = TILE_SIZE
    const hl = this.sample(x - e, z)
    const hr = this.sample(x + e, z)
    const hd = this.sample(x, z - e)
    const hu = this.sample(x, z + e)
    const nx = hl - hr
    const nz = hd - hu
    const ny = 2 * e
    const len = Math.hypot(nx, ny, nz) || 1
    return [nx / len, ny / len, nz / len]
  }

  inBounds(tx: number, tz: number): boolean {
    return tx >= 0 && tz >= 0 && tx < this.size && tz < this.size
  }
}

export const tileToWorld = (tile: number): number => (tile + 0.5) * TILE_SIZE
export const worldToTile = (world: number): number =>
  clamp(Math.floor(world / TILE_SIZE), 0, GRID_SIZE - 1)
