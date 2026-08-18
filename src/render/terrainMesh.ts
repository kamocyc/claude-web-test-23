import * as THREE from 'three'
import type { Heightfield } from '../world/heightfield'
import { TILE_SIZE } from '../world/heightfield'
import { RoadSurface, TerrainSurface, type TileGrid } from '../world/tileGrid'
import { fbm } from '../world/noise'
import { ROAD_COLORS, TERRAIN_COLORS, UNDER_CONSTRUCTION_COLOR, mix, scale, type Rgb } from './palette'

const CHUNK = 32

/** Cheap stable per-tile jitter so large fields do not look flat. */
const tileJitter = (tx: number, tz: number): number => {
  const h = Math.imul(tx * 73856093 ^ tz * 19349663, 0x9e3779b9) >>> 0
  return 0.94 + (h % 1000) / 1000 * 0.12
}

/** Broad patches of richer and poorer ground, so a hillside is not one colour. */
const groundPatch = (tx: number, tz: number): number => 1 + fbm(tx * 0.05, tz * 0.05, 991, 3) * 0.13

export type TileOverlay = (tx: number, tz: number) => Rgb | null

/**
 * Chunked terrain mesh. Roads are painted into the same mesh so that finishing a
 * road segment visibly changes the ground the moment it is built.
 */
export class TerrainMesh {
  readonly group = new THREE.Group()
  private readonly chunks: THREE.Mesh[] = []
  private readonly dirty = new Set<number>()
  private readonly chunksPerSide: number
  private overlay: TileOverlay | null = null

  constructor(
    private readonly field: Heightfield,
    private readonly grid: TileGrid,
  ) {
    this.chunksPerSide = Math.ceil(grid.size / CHUNK)
    const material = new THREE.MeshLambertMaterial({ vertexColors: true })
    for (let cz = 0; cz < this.chunksPerSide; cz++) {
      for (let cx = 0; cx < this.chunksPerSide; cx++) {
        const geometry = new THREE.BufferGeometry()
        const tiles = CHUNK * CHUNK
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tiles * 18), 3))
        geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(tiles * 18), 3))
        geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(tiles * 18), 3))
        const mesh = new THREE.Mesh(geometry, material)
        mesh.matrixAutoUpdate = false
        this.chunks.push(mesh)
        this.group.add(mesh)
        this.dirty.add(cz * this.chunksPerSide + cx)
      }
    }
  }

  setOverlay(overlay: TileOverlay | null): void {
    this.overlay = overlay
  }

  markTileDirty(tx: number, tz: number): void {
    const cx = Math.floor(tx / CHUNK)
    const cz = Math.floor(tz / CHUNK)
    for (let dz = -1; dz <= 0; dz++) {
      for (let dx = -1; dx <= 0; dx++) {
        const nx = cx + dx
        const nz = cz + dz
        if (nx >= 0 && nz >= 0 && nx < this.chunksPerSide && nz < this.chunksPerSide) {
          this.dirty.add(nz * this.chunksPerSide + nx)
        }
      }
    }
  }

  markAllDirty(): void {
    for (let i = 0; i < this.chunks.length; i++) this.dirty.add(i)
  }

  /** Rebuild a bounded number of dirty chunks per frame to avoid hitches. */
  update(maxChunks = 4): void {
    let built = 0
    for (const index of this.dirty) {
      this.rebuildChunk(index)
      this.dirty.delete(index)
      if (++built >= maxChunks) break
    }
  }

  private tileColor(tx: number, tz: number): Rgb {
    const i = this.grid.index(tx, tz)
    const overlayColor = this.overlay?.(tx, tz)
    if (overlayColor) return overlayColor

    const road = this.grid.roadSurface[i] as RoadSurface
    let color: Rgb
    if (road !== RoadSurface.None) {
      color = ROAD_COLORS[road]
      const condition = this.grid.condition[i]
      const wetness = this.grid.wetness[i]
      // Worn and waterlogged roads drift toward raw mud.
      color = mix(color, UNDER_CONSTRUCTION_COLOR, (1 - condition) * 0.45)
      color = scale(color, 1 - wetness * 0.3)
    } else {
      color = TERRAIN_COLORS[this.grid.terrain[i] as TerrainSurface]
    }

    const slope = this.field.tileSlope(tx, tz)
    const shade = 1 - Math.min(slope, 1) * 0.28
    return scale(color, shade * tileJitter(tx, tz) * groundPatch(tx, tz))
  }

  private rebuildChunk(index: number): void {
    const cx = index % this.chunksPerSide
    const cz = Math.floor(index / this.chunksPerSide)
    const mesh = this.chunks[index]
    const position = mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    const normal = mesh.geometry.getAttribute('normal') as THREE.BufferAttribute
    const color = mesh.geometry.getAttribute('color') as THREE.BufferAttribute
    const pos = position.array as Float32Array
    const nrm = normal.array as Float32Array
    const col = color.array as Float32Array

    let p = 0
    const ax = new THREE.Vector3()
    const bx = new THREE.Vector3()
    const n = new THREE.Vector3()

    for (let lz = 0; lz < CHUNK; lz++) {
      const tz = cz * CHUNK + lz
      for (let lx = 0; lx < CHUNK; lx++) {
        const tx = cx * CHUNK + lx
        if (tx >= this.grid.size || tz >= this.grid.size) {
          for (let k = 0; k < 18; k++) pos[p + k] = 0
          p += 18
          continue
        }
        const x0 = tx * TILE_SIZE
        const z0 = tz * TILE_SIZE
        const x1 = x0 + TILE_SIZE
        const z1 = z0 + TILE_SIZE
        const h00 = this.field.getVertex(tx, tz)
        const h10 = this.field.getVertex(tx + 1, tz)
        const h01 = this.field.getVertex(tx, tz + 1)
        const h11 = this.field.getVertex(tx + 1, tz + 1)
        const c = this.tileColor(tx, tz)

        // Counter-clockwise seen from above, so the faces point up.
        const verts = [
          x0, h00, z0, x1, h11, z1, x1, h10, z0,
          x0, h00, z0, x0, h01, z1, x1, h11, z1,
        ]
        for (let k = 0; k < 18; k++) pos[p + k] = verts[k]

        for (let tri = 0; tri < 2; tri++) {
          const o = p + tri * 9
          ax.set(pos[o + 3] - pos[o], pos[o + 4] - pos[o + 1], pos[o + 5] - pos[o + 2])
          bx.set(pos[o + 6] - pos[o], pos[o + 7] - pos[o + 1], pos[o + 8] - pos[o + 2])
          n.crossVectors(ax, bx).normalize()
          for (let v = 0; v < 3; v++) {
            nrm[o + v * 3] = n.x
            nrm[o + v * 3 + 1] = n.y
            nrm[o + v * 3 + 2] = n.z
          }
        }
        for (let v = 0; v < 6; v++) {
          col[p + v * 3] = c.r
          col[p + v * 3 + 1] = c.g
          col[p + v * 3 + 2] = c.b
        }
        p += 18
      }
    }

    position.needsUpdate = true
    normal.needsUpdate = true
    color.needsUpdate = true
    mesh.geometry.computeBoundingSphere()
  }
}
