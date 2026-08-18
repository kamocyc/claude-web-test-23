import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Rng } from '../core/rng'
import { tileKey } from '../roads/tileLine'
import type { Heightfield } from '../world/heightfield'
import { TILE_SIZE, tileToWorld } from '../world/heightfield'
import { fbm } from '../world/noise'
import { TerrainSurface, type TileGrid } from '../world/tileGrid'
import { readQuality, type QualityLevel } from './quality'

const CHUNK = 32

/** What grows where, and how far away it is still worth drawing. */
enum Growth {
  Tree = 0,
  Grass = 1,
  Crop = 2,
}

const VIEW_DISTANCE: Record<Growth, number> = {
  [Growth.Tree]: 430,
  [Growth.Grass]: 68,
  [Growth.Crop]: 130,
}

const paint = (geometry: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry => {
  const count = geometry.getAttribute('position').count
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}

/** Trunk and canopy merged: one tree is one instance. */
const buildTree = (): THREE.BufferGeometry => {
  const trunk = paint(new THREE.CylinderGeometry(0.11, 0.18, 1.9, 5), new THREE.Color(0x5a4530))
  trunk.translate(0, 0.95, 0)
  const lower = paint(new THREE.ConeGeometry(1.25, 2.5, 7), new THREE.Color(0x3f6136))
  lower.translate(0, 2.5, 0)
  const upper = paint(new THREE.ConeGeometry(0.8, 1.9, 7), new THREE.Color(0x4a7040))
  upper.translate(0, 3.9, 0)
  return mergeGeometries([trunk, lower, upper], false) as THREE.BufferGeometry
}

const buildTuft = (height: number, radius: number, blades: number): THREE.BufferGeometry => {
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < blades; i++) {
    const angle = (i / blades) * Math.PI * 2
    const blade = new THREE.ConeGeometry(radius, height, 3)
    blade.translate(0, height / 2, 0)
    blade.rotateZ(Math.cos(angle) * 0.3)
    blade.rotateX(Math.sin(angle) * 0.3)
    blade.translate(Math.cos(angle) * radius * 1.6, 0, Math.sin(angle) * radius * 1.6)
    parts.push(blade)
  }
  // White base: the per-instance colour supplies the green.
  return paint(mergeGeometries(parts, false) as THREE.BufferGeometry, new THREE.Color(0xffffff))
}

/** A little variety so a wood or a field does not look stamped out. */
const TINTS: Record<Growth, THREE.Color[]> = {
  [Growth.Tree]: [0xffffff, 0xe6f0d6, 0xd4e6c4, 0xf0e8d0, 0xd8e8dc].map((hex) => new THREE.Color(hex)),
  // Close to the ground colour: tufts should add texture, not a bright carpet
  // whose far edge announces where the drawing stops.
  [Growth.Grass]: [0x5f7f45, 0x688a4c, 0x718f52, 0x577640, 0x7a9a58].map((hex) => new THREE.Color(hex)),
  [Growth.Crop]: [0xc3b264, 0xd0be6e, 0xb5a559, 0xc9ba70].map((hex) => new THREE.Color(hex)),
}

interface Scatter {
  readonly x: number
  readonly z: number
  readonly scale: number
  readonly spin: number
  readonly tile: number
  readonly tint: number
}

interface Chunk {
  readonly meshes: Array<{ growth: Growth; mesh: THREE.InstancedMesh }>
  /** Instances standing on a tile, so building a road can clear them. */
  readonly byTile: Map<number, Array<{ mesh: THREE.InstancedMesh; index: number }>>
  readonly centreX: number
  readonly centreZ: number
}

/**
 * Trees, grass and crops, scattered from the same seed as the terrain so a
 * valley always grows the same wood. Everything is instanced and chunked: one
 * draw call per chunk and growth type, and distant grass is simply not drawn.
 */
export class Vegetation {
  readonly group = new THREE.Group()
  private readonly chunks: Chunk[] = []
  private readonly chunkOf = new Map<number, Chunk>()
  private readonly dummy = new THREE.Object3D()
  private readonly geometries: Record<Growth, THREE.BufferGeometry>
  private readonly materials: Record<Growth, THREE.Material>

  constructor(
    private readonly field: Heightfield,
    grid: TileGrid,
    seed: number,
    settlements: ReadonlyArray<{ x: number; z: number }>,
    private readonly quality: QualityLevel = readQuality(),
  ) {
    const foliage = new THREE.MeshLambertMaterial({ vertexColors: true })
    const tufts = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
    this.geometries = {
      [Growth.Tree]: buildTree(),
      [Growth.Grass]: buildTuft(0.24, 0.05, 4),
      [Growth.Crop]: buildTuft(0.62, 0.045, 4),
    }
    this.materials = {
      [Growth.Tree]: foliage,
      [Growth.Grass]: tufts,
      [Growth.Crop]: tufts,
    }

    const chunksPerSide = Math.ceil(grid.size / CHUNK)
    for (let cz = 0; cz < chunksPerSide; cz++) {
      for (let cx = 0; cx < chunksPerSide; cx++) {
        this.buildChunk(grid, seed, settlements, cx, cz)
      }
    }
  }

  private buildChunk(
    grid: TileGrid,
    seed: number,
    settlements: ReadonlyArray<{ x: number; z: number }>,
    cx: number,
    cz: number,
  ): void {
    const rng = new Rng((seed ^ (cx * 7919 + cz * 104729)) >>> 0)
    const scatters: Record<Growth, Scatter[]> = {
      [Growth.Tree]: [],
      [Growth.Grass]: [],
      [Growth.Crop]: [],
    }

    for (let lz = 0; lz < CHUNK; lz++) {
      const tz = cz * CHUNK + lz
      if (tz >= grid.size) continue
      for (let lx = 0; lx < CHUNK; lx++) {
        const tx = cx * CHUNK + lx
        if (tx >= grid.size) continue
        const index = grid.index(tx, tz)
        const terrain = grid.terrain[index] as TerrainSurface
        if (terrain === TerrainSurface.Water) continue
        if (grid.blocked[index] === 1 || grid.roadSurface[index] !== 0) continue

        const wx = tileToWorld(tx)
        const wz = tileToWorld(tz)
        const slope = this.field.tileSlope(tx, tz)
        const key = tileKey(tx, tz)

        if (terrain === TerrainSurface.Field) {
          // Crops stand in rows, which is what makes farmland read as farmland.
          if (this.quality === 'low') continue
          for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
              if (!rng.chance(0.62)) continue
              scatters[Growth.Crop].push({
                x: wx - 0.7 + col * 0.7 + rng.range(-0.08, 0.08),
                z: wz - 0.7 + row * 0.7 + rng.range(-0.08, 0.08),
                scale: rng.range(0.8, 1.15),
                spin: 0,
                tile: key,
                tint: rng.next(),
              })
            }
          }
          continue
        }

        let nearVillage = false
        for (const settlement of settlements) {
          if (Math.hypot(settlement.x - wx, settlement.z - wz) < 40) nearVillage = true
        }

        // Woods come in stands with open ground between them: the valley has to
        // stay readable, and clearing a line for a road has to mean something.
        const forest = fbm(wx * 0.009, wz * 0.009, seed + 31, 3)
        if (terrain === TerrainSurface.Grass && slope < 0.42 && !nearVillage && forest > 0.24) {
          if (rng.chance(0.04 + (forest - 0.24) * 0.5)) {
            scatters[Growth.Tree].push({
              x: wx + rng.range(-0.9, 0.9),
              z: wz + rng.range(-0.9, 0.9),
              scale: rng.range(0.7, 1.15),
              spin: rng.range(0, Math.PI * 2),
              tile: key,
              tint: rng.next(),
            })
            continue
          }
        }

        if (this.quality === 'low') continue
        if (terrain === TerrainSurface.Grass && slope < 0.6) {
          const tufts = rng.int(1, 2)
          for (let i = 0; i < tufts; i++) {
            scatters[Growth.Grass].push({
              x: wx + rng.range(-0.95, 0.95),
              z: wz + rng.range(-0.95, 0.95),
              scale: rng.range(0.7, 1.5),
              spin: rng.range(0, Math.PI * 2),
              tile: key,
              tint: rng.next(),
            })
          }
        }
      }
    }

    const chunk: Chunk = {
      meshes: [],
      byTile: new Map(),
      centreX: (cx + 0.5) * CHUNK * TILE_SIZE,
      centreZ: (cz + 0.5) * CHUNK * TILE_SIZE,
    }

    for (const growth of [Growth.Tree, Growth.Grass, Growth.Crop]) {
      const items = scatters[growth]
      if (items.length === 0) continue
      const mesh = new THREE.InstancedMesh(this.geometries[growth], this.materials[growth], items.length)
      const tints = TINTS[growth]
      items.forEach((item, index) => {
        this.dummy.position.set(item.x, this.field.sample(item.x, item.z) - 0.04, item.z)
        this.dummy.rotation.set(0, item.spin, 0)
        this.dummy.scale.setScalar(item.scale)
        this.dummy.updateMatrix()
        mesh.setMatrixAt(index, this.dummy.matrix)
        mesh.setColorAt(index, tints[Math.min(tints.length - 1, Math.floor(item.tint * tints.length))])
        const list = chunk.byTile.get(item.tile) ?? []
        list.push({ mesh, index })
        chunk.byTile.set(item.tile, list)
      })
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      chunk.meshes.push({ growth, mesh })
      this.group.add(mesh)
    }

    if (chunk.meshes.length === 0) return
    this.chunks.push(chunk)
    for (const key of chunk.byTile.keys()) this.chunkOf.set(key, chunk)
  }

  /** Clear whatever was growing on a tile - a road has been built over it. */
  clearTile(tx: number, tz: number): void {
    const key = tileKey(tx, tz)
    const chunk = this.chunkOf.get(key)
    const entries = chunk?.byTile.get(key)
    if (!chunk || !entries) return
    for (const entry of entries) {
      this.dummy.position.set(0, -1000, 0)
      this.dummy.rotation.set(0, 0, 0)
      this.dummy.scale.setScalar(0.0001)
      this.dummy.updateMatrix()
      entry.mesh.setMatrixAt(entry.index, this.dummy.matrix)
      entry.mesh.instanceMatrix.needsUpdate = true
    }
    chunk.byTile.delete(key)
  }

  /** Ground cover is only worth drawing close up. */
  update(camera: THREE.Vector3): void {
    for (const chunk of this.chunks) {
      const distance = Math.hypot(chunk.centreX - camera.x, chunk.centreZ - camera.z)
      for (const entry of chunk.meshes) entry.mesh.visible = distance < VIEW_DISTANCE[entry.growth]
    }
  }
}
