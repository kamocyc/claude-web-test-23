import { clamp, clamp01, lerp, smoothstep } from '../core/math'
import { Heightfield, TILE_SIZE, WORLD_SIZE, tileToWorld } from './heightfield'
import { fbm } from './noise'
import { TerrainSurface, TileGrid } from './tileGrid'

export interface Vec2 {
  x: number
  z: number
}

/** Named places the scenario needs to reference. */
export interface WorldLayout {
  readonly farmVillage: Vec2
  readonly mineVillage: Vec2
  /** Shallow crossing: walkable on foot, never usable by a cart. */
  readonly ford: Vec2
  /** Handy narrow spot for the first bridge, on the direct line. */
  readonly bridgeHint: Vec2
  /** Gentle natural ramp up to the mine plateau, for players who survey. */
  readonly passRoute: readonly Vec2[]
}

const FARM: Vec2 = { x: 95, z: 250 }
const MINE: Vec2 = { x: 415, z: 205 }

/** Meandering river centreline (metres) as a function of z. */
export const riverCentreX = (z: number): number =>
  250 + 22 * Math.sin(z * 0.011) + 9 * Math.sin(z * 0.027 + 1.3)

/** Water surface elevation: the river drains from north to south. */
export const riverWaterLevel = (z: number): number => lerp(9.4, 7.4, clamp01(z / WORLD_SIZE))

const FORD_Z = 312
const FORD_HALF = 14

/** Channel depth below the water surface; the ford is a shallow gravel bar. */
const channelDepth = (z: number): number => {
  const fordness = clamp01(1 - Math.abs(z - FORD_Z) / FORD_HALF)
  return lerp(3.4, 0.55, smoothstep(fordness))
}

const channelHalfWidth = (z: number): number => 5.5 + 2 * Math.sin(z * 0.02 + 0.7)

/** Valley floor before the river is carved into it. */
const valleyFloor = (x: number, z: number, seed: number): number => {
  const drift = 11 - 2 * (z / WORLD_SIZE)
  const rolling = fbm(x * 0.006, z * 0.006, seed, 4) * 1.4
  const eastward = smoothstep((x - 120) / 400) * 1.5
  return drift + rolling + eastward
}

/** Height of the rim that separates the valley from the mine plateau. */
const rimTop = (z: number, seed: number): number => {
  const col = Math.exp(-(((z - 150) / 55) ** 2))
  return lerp(33, 26.5, col) + fbm(z * 0.02, 4.2, seed, 2) * 1.2
}

const PLATEAU_HEIGHT = 24.5
const RIM_X = 344
/** Western flank of the rim: narrow (steep) in the south, wider near the col. */
const flankWidth = (z: number): number => 42 + 26 * Math.exp(-(((z - 150) / 70) ** 2))

const eastTerrain = (x: number, z: number, seed: number): number => {
  const floor = valleyFloor(x, z, seed)
  const rim = rimTop(z, seed)
  const width = flankWidth(z)
  const flankStart = RIM_X - width
  if (x <= flankStart) return floor
  if (x <= RIM_X) {
    const t = smoothstep((x - flankStart) / width)
    return lerp(floor, rim, t)
  }
  const backslope = smoothstep((x - RIM_X) / 34)
  const plateau = PLATEAU_HEIGHT + fbm(x * 0.01, z * 0.01, seed + 7, 3) * 1.6
  return lerp(rim, plateau, backslope)
}

/** Border rims keep the player inside the prototype valley. */
const borderRise = (x: number, z: number): number => {
  const margin = 34
  const dx = Math.min(x, WORLD_SIZE - x)
  const dz = Math.min(z, WORLD_SIZE - z)
  const d = Math.min(dx, dz)
  if (d >= margin) return 0
  const t = 1 - d / margin
  return t * t * 46
}

/**
 * The natural pass: a side valley that climbs to the plateau at a gentle grade.
 * Terrain inside the corridor is blended toward a linear elevation profile, so
 * a player who surveys the ground finds a cart-friendly route without earthworks.
 */
const PASS_ROUTE: Vec2[] = [
  { x: 292, z: 190 },
  { x: 306, z: 132 },
  { x: 354, z: 106 },
  { x: 398, z: 154 },
]
const PASS_CORRIDOR = 19

interface PassSample {
  weight: number
  height: number
}

const buildPassProfile = (startHeight: number, endHeight: number) => {
  const lengths: number[] = []
  let total = 0
  for (let i = 1; i < PASS_ROUTE.length; i++) {
    const seg = Math.hypot(
      PASS_ROUTE[i].x - PASS_ROUTE[i - 1].x,
      PASS_ROUTE[i].z - PASS_ROUTE[i - 1].z,
    )
    lengths.push(seg)
    total += seg
  }
  return (x: number, z: number): PassSample | null => {
    let best: PassSample | null = null
    let travelled = 0
    for (let i = 1; i < PASS_ROUTE.length; i++) {
      const a = PASS_ROUTE[i - 1]
      const b = PASS_ROUTE[i]
      const dx = b.x - a.x
      const dz = b.z - a.z
      const lenSq = dx * dx + dz * dz
      const t = clamp01(((x - a.x) * dx + (z - a.z) * dz) / lenSq)
      const px = a.x + dx * t
      const pz = a.z + dz * t
      const dist = Math.hypot(x - px, z - pz)
      if (dist < PASS_CORRIDOR) {
        const along = (travelled + lengths[i - 1] * t) / total
        const weight = smoothstep(1 - dist / PASS_CORRIDOR)
        const height = lerp(startHeight, endHeight, along)
        if (!best || weight > best.weight) best = { weight, height }
      }
      travelled += lengths[i - 1]
    }
    return best
  }
}

/** Flatten a disc so a settlement has buildable ground. */
const terraceDisc = (field: Heightfield, centre: Vec2, radius: number, height: number): void => {
  const minX = Math.max(0, Math.floor((centre.x - radius) / TILE_SIZE))
  const maxX = Math.min(field.vertexSize - 1, Math.ceil((centre.x + radius) / TILE_SIZE))
  const minZ = Math.max(0, Math.floor((centre.z - radius) / TILE_SIZE))
  const maxZ = Math.min(field.vertexSize - 1, Math.ceil((centre.z + radius) / TILE_SIZE))
  for (let iz = minZ; iz <= maxZ; iz++) {
    for (let ix = minX; ix <= maxX; ix++) {
      const wx = ix * TILE_SIZE
      const wz = iz * TILE_SIZE
      const d = Math.hypot(wx - centre.x, wz - centre.z)
      if (d > radius) continue
      const blend = smoothstep(1 - d / radius)
      const current = field.getVertex(ix, iz)
      field.setVertex(ix, iz, lerp(current, height, blend))
    }
  }
}

export interface GeneratedWorld {
  readonly field: Heightfield
  readonly grid: TileGrid
  readonly layout: WorldLayout
}

export const generateWorld = (seed: number): GeneratedWorld => {
  const field = new Heightfield()
  const grid = new TileGrid()
  const passProfile = buildPassProfile(12, PLATEAU_HEIGHT)

  // 1. Base relief: valley floor, rim, plateau, border walls.
  for (let iz = 0; iz < field.vertexSize; iz++) {
    const wz = iz * TILE_SIZE
    for (let ix = 0; ix < field.vertexSize; ix++) {
      const wx = ix * TILE_SIZE
      let h = eastTerrain(wx, wz, seed)

      const pass = passProfile(wx, wz)
      if (pass) h = lerp(h, pass.height, pass.weight * 0.96)

      h += borderRise(wx, wz)

      // 2. Carve the river channel.
      const centre = riverCentreX(wz)
      const half = channelHalfWidth(wz)
      const d = Math.abs(wx - centre)
      if (d < half + 10) {
        const inner = d <= half ? 1 : smoothstep(1 - (d - half) / 10)
        const bed = riverWaterLevel(wz) - channelDepth(wz)
        h = lerp(h, Math.min(h, bed), inner)
      }

      field.setVertex(ix, iz, h)
    }
  }

  // 3. Settlement terraces.
  terraceDisc(field, FARM, 30, field.sample(FARM.x, FARM.z))
  terraceDisc(field, MINE, 26, field.sample(MINE.x, MINE.z))
  field.commitOriginal()

  // 4. Classify tiles.
  for (let tz = 0; tz < grid.size; tz++) {
    const wz = tileToWorld(tz)
    const water = riverWaterLevel(wz)
    for (let tx = 0; tx < grid.size; tx++) {
      const wx = tileToWorld(tx)
      const i = grid.index(tx, tz)
      const h = field.tileHeight(tx, tz)
      const slope = field.tileSlope(tx, tz)
      const nearRiver = Math.abs(wx - riverCentreX(wz)) < channelHalfWidth(wz) + 18

      if (nearRiver && h < water - 0.12) {
        grid.terrain[i] = TerrainSurface.Water
        grid.waterLevel[i] = water
      } else if (nearRiver && h < water + 1.1) {
        grid.terrain[i] = TerrainSurface.Bank
      } else if (slope > 0.62) {
        grid.terrain[i] = TerrainSurface.Rock
      } else if (Math.hypot(wx - FARM.x, wz - FARM.z) < 62 && slope < 0.12) {
        grid.terrain[i] = TerrainSurface.Field
      } else {
        grid.terrain[i] = TerrainSurface.Grass
      }
    }
  }

  const layout: WorldLayout = {
    farmVillage: FARM,
    mineVillage: MINE,
    ford: { x: riverCentreX(FORD_Z), z: FORD_Z },
    bridgeHint: { x: riverCentreX(228), z: 228 },
    passRoute: PASS_ROUTE,
  }

  return { field, grid, layout }
}

/** Water depth at a tile, 0 when dry. Used for fording rules. */
export const waterDepthAt = (field: Heightfield, grid: TileGrid, tx: number, tz: number): number => {
  const i = grid.index(tx, tz)
  if (grid.terrain[i] !== TerrainSurface.Water) return 0
  return clamp(grid.waterLevel[i] - field.tileHeight(tx, tz), 0, 20)
}
