import { clamp } from '../core/math'
import { Resource } from '../sim/resources'
import type { Heightfield } from '../world/heightfield'
import { TILE_SIZE, tileToWorld } from '../world/heightfield'
import { TerrainSurface, type TileGrid } from '../world/tileGrid'
import { BRIDGE_SPECS, type RoadSpec } from './roadSpec'
import { tileLine, type TilePos } from './tileLine'

/** Deepest cut or highest embankment a work crew can manage without a tunnel. */
export const MAX_EARTHWORK = 3
/** Person-hours per cubic metre of earth moved. */
export const LABOUR_PER_CUBIC_METRE = 0.15
/** Deck clearance above the water surface. */
export const BRIDGE_CLEARANCE = 1.4

const TILE_AREA = TILE_SIZE * TILE_SIZE

export type SegmentProblem =
  | null
  | { kind: 'earthworkTooDeep'; metres: number }
  | { kind: 'spanTooLong'; tiles: number }
  | { kind: 'tileOccupied' }

export interface PlannedTile {
  readonly tx: number
  readonly tz: number
  /** Finished road elevation at the tile centre. */
  readonly targetHeight: number
  readonly isBridge: boolean
  /** Cubic metres dug out (positive) or filled in (positive). */
  readonly cut: number
  readonly fill: number
  readonly labour: number
  readonly materials: Partial<Record<Resource, number>>
  /** Shoulders widen a cartway visually without charging for extra area. */
  readonly shoulders: TilePos[]
}

export interface PlannedSegment {
  readonly from: TilePos
  readonly to: TilePos
  readonly lengthM: number
  /** Design grade between the two stakes (signed). */
  readonly grade: number
  /** Steepest grade a vehicle will actually meet inside the segment. */
  readonly worstLocalGrade: number
  readonly problem: SegmentProblem
  readonly tiles: PlannedTile[]
}

export interface RoadPlan {
  readonly spec: RoadSpec
  readonly stakes: readonly TilePos[]
  readonly segments: readonly PlannedSegment[]
  readonly tiles: readonly PlannedTile[]
  readonly lengthM: number
  readonly labourHours: number
  readonly materials: Partial<Record<Resource, number>>
  readonly cutVolume: number
  readonly fillVolume: number
  readonly worstGrade: number
  readonly bridgeTiles: number
  /** False when any segment is physically impossible to build as staked. */
  readonly buildable: boolean
}

const addMaterials = (
  into: Partial<Record<Resource, number>>,
  from: Partial<Record<Resource, number>>,
  scale = 1,
): void => {
  for (const [key, amount] of Object.entries(from)) {
    const resource = Number(key) as Resource
    into[resource] = (into[resource] ?? 0) + (amount as number) * scale
  }
}

/** Perpendicular neighbour used to widen cartways for readability. */
const shoulderTiles = (tile: TilePos, previous: TilePos | null, next: TilePos | null): TilePos[] => {
  const reference = next ?? previous
  if (!reference) return []
  const dx = reference.tx - tile.tx
  const dz = reference.tz - tile.tz
  if (dx === 0 && dz === 0) return []
  // Rotate the direction of travel by 90 degrees.
  return [{ tx: tile.tx - dz, tz: tile.tz + dx }]
}

/**
 * Turns a chain of stakes into a buildable plan.
 *
 * The road runs at a constant grade between stakes - that is what surveying
 * buys you. Everything else (cut and fill volume, bridge spans, labour, whether
 * it is possible at all) falls out of comparing that line to the ground.
 */
export const planRoad = (
  field: Heightfield,
  grid: TileGrid,
  stakes: readonly TilePos[],
  spec: RoadSpec,
): RoadPlan => {
  const bridgeSpec = BRIDGE_SPECS[spec.bridge]
  const segments: PlannedSegment[] = []
  const allTiles: PlannedTile[] = []
  const seen = new Set<number>()
  const totalMaterials: Partial<Record<Resource, number>> = {}
  let labourHours = 0
  let cutVolume = 0
  let fillVolume = 0
  let lengthM = 0
  let worstGrade = 0
  let bridgeTiles = 0
  let buildable = stakes.length >= 2

  for (let s = 1; s < stakes.length; s++) {
    const from = stakes[s - 1]
    const to = stakes[s]
    const startHeight = field.tileHeight(from.tx, from.tz)
    const endHeight = field.tileHeight(to.tx, to.tz)
    const line = tileLine(from, to)
    const runM = Math.hypot(to.tx - from.tx, to.tz - from.tz) * TILE_SIZE
    const grade = runM > 0 ? (endHeight - startHeight) / runM : 0

    const tiles: PlannedTile[] = []
    let problem: SegmentProblem = null
    let span = 0
    let deepest = 0
    let previousHeight: number | null = null
    let worstLocalGrade = 0

    for (let i = 0; i < line.length; i++) {
      const tile = line[i]
      if (!grid.inBounds(tile.tx, tile.tz)) {
        problem = { kind: 'tileOccupied' }
        break
      }
      const index = grid.index(tile.tx, tile.tz)
      if (grid.blocked[index] === 1) {
        problem = { kind: 'tileOccupied' }
      }
      const t = line.length === 1 ? 0 : i / (line.length - 1)
      const design = startHeight + (endHeight - startHeight) * t
      const ground = field.tileHeight(tile.tx, tile.tz)
      const isWater = grid.terrain[index] === TerrainSurface.Water

      let targetHeight = design
      let labour: number
      const materials: Partial<Record<Resource, number>> = {}
      let cut = 0
      let fill = 0

      if (isWater) {
        span++
        bridgeTiles++
        targetHeight = Math.max(design, grid.waterLevel[index] + BRIDGE_CLEARANCE)
        labour = bridgeSpec.labourPerTile
        addMaterials(materials, bridgeSpec.materialsPerTile)
        if (span > bridgeSpec.maxSpanTiles) problem = { kind: 'spanTooLong', tiles: span }
      } else {
        span = 0
        const delta = targetHeight - ground
        deepest = Math.max(deepest, Math.abs(delta))
        if (delta < 0) cut = -delta * TILE_AREA
        else fill = delta * TILE_AREA
        labour = spec.labourPerTile + (cut + fill) * LABOUR_PER_CUBIC_METRE
        addMaterials(materials, spec.materialsPerTile)
      }

      if (previousHeight !== null) {
        worstLocalGrade = Math.max(worstLocalGrade, Math.abs(targetHeight - previousHeight) / TILE_SIZE)
      }
      previousHeight = targetHeight

      const planned: PlannedTile = {
        tx: tile.tx,
        tz: tile.tz,
        targetHeight,
        isBridge: isWater,
        cut,
        fill,
        labour,
        materials,
        shoulders:
          spec.width >= 3 ? shoulderTiles(tile, line[i - 1] ?? null, line[i + 1] ?? null) : [],
      }
      tiles.push(planned)

      const key = tile.tz * 4096 + tile.tx
      if (!seen.has(key)) {
        seen.add(key)
        allTiles.push(planned)
        labourHours += labour
        cutVolume += cut
        fillVolume += fill
        addMaterials(totalMaterials, materials)
      }
    }

    if (deepest > MAX_EARTHWORK) problem = { kind: 'earthworkTooDeep', metres: deepest }
    if (problem) buildable = false

    lengthM += runM
    worstGrade = Math.max(worstGrade, Math.abs(grade), worstLocalGrade)
    segments.push({ from, to, lengthM: runM, grade, worstLocalGrade, problem, tiles })
  }

  return {
    spec,
    stakes,
    segments,
    tiles: allTiles,
    lengthM,
    labourHours,
    materials: totalMaterials,
    cutVolume,
    fillVolume,
    worstGrade,
    bridgeTiles,
    buildable,
  }
}

/** World-space centre of a tile, at the planned road height. */
export const plannedTileWorld = (tile: PlannedTile): { x: number; y: number; z: number } => ({
  x: tileToWorld(tile.tx),
  y: tile.targetHeight,
  z: tileToWorld(tile.tz),
})

/** Grade bands used by the staking preview and the build panel. */
export type GradeBand = 'easy' | 'hard' | 'cartsBlocked'

export const gradeBand = (grade: number): GradeBand => {
  const g = Math.abs(grade)
  if (g <= 0.08) return 'easy'
  if (g <= 0.12) return 'hard'
  return 'cartsBlocked'
}

export const clampGrade = (grade: number): number => clamp(grade, -1, 1)
