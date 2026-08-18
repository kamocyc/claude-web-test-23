import { TILE_SIZE } from '../world/heightfield'
import { tileSurfaceHeight } from '../world/surface'
import type { Heightfield } from '../world/heightfield'
import { RoadClass, RoadSurface, TerrainSurface, type TileGrid } from '../world/tileGrid'
import { grossWeight, maxGradeFor, type VehicleDef } from '../sim/vehicles'
import { surfaceProperties } from './roadSpec'
import type { TilePos } from './tileLine'

export type BlockedReason =
  | 'tooSteep'
  | 'needsRoad'
  | 'water'
  | 'overloaded'
  | 'blocked'
  | null

export interface StepCost {
  /** Seconds to move from one tile to the next, or Infinity when impassable. */
  readonly seconds: number
  readonly blocked: BlockedReason
}

const IMPASSABLE: StepCost = { seconds: Number.POSITIVE_INFINITY, blocked: 'blocked' }

export interface TravelContext {
  readonly field: Heightfield
  readonly grid: TileGrid
}

/**
 * Time to cross one tile. This single function decides everything interesting
 * about a road: a shortcut up a 20 % slope is simply not traversable by a loaded
 * cart, while a longer paved route is fast and reliable in the rain.
 */
export const stepCost = (
  ctx: TravelContext,
  from: TilePos,
  to: TilePos,
  vehicle: VehicleDef,
  loadKg: number,
): StepCost => {
  const { field, grid } = ctx
  if (!grid.inBounds(to.tx, to.tz)) return IMPASSABLE
  const index = grid.index(to.tx, to.tz)
  if (grid.blocked[index] === 1) return IMPASSABLE

  const surface = grid.roadSurface[index] as RoadSurface
  const onRoad = surface !== RoadSurface.None
  const roadClass = grid.roadClass[index] as RoadClass

  if (vehicle.requiresRoad !== RoadClass.None && roadClass < vehicle.requiresRoad) {
    return { seconds: Number.POSITIVE_INFINITY, blocked: 'needsRoad' }
  }

  const props = surfaceProperties(surface)
  if (onRoad && grossWeight(vehicle, loadKg) > props.maxLoadKg) {
    return { seconds: Number.POSITIVE_INFINITY, blocked: 'overloaded' }
  }

  let waterPenalty = 1
  if (!grid.isBridge(to.tx, to.tz) && grid.terrain[index] === TerrainSurface.Water) {
    const depth = Math.max(0, grid.waterLevel[index] - field.tileHeight(to.tx, to.tz))
    if (depth > vehicle.maxFordDepth) return { seconds: Number.POSITIVE_INFINITY, blocked: 'water' }
    waterPenalty = 1 / (1 + depth * 2.2)
  }

  const fromHeight = tileSurfaceHeight(field, grid, from.tx, from.tz)
  const toHeight = tileSurfaceHeight(field, grid, to.tx, to.tz)
  const grade = (toHeight - fromHeight) / TILE_SIZE
  const limit = maxGradeFor(vehicle, loadKg) * props.gradeAllowance
  if (Math.abs(grade) > limit) return { seconds: Number.POSITIVE_INFINITY, blocked: 'tooSteep' }

  // Uphill costs time, downhill helps a little but never as much as it hurts.
  const gradeFactor = grade >= 0 ? 1 / (1 + grade * 6.5) : 1 + Math.min(0.18, -grade * 0.5)
  const condition = onRoad ? grid.condition[index] : 1
  const conditionFactor = onRoad ? 0.55 + 0.45 * condition : 1
  const wetness = grid.wetness[index]
  const wetFactor = 1 - wetness * (1 - props.rainResistance) * 0.65

  // Carrying more than the comfortable load slows the carrier proportionally.
  const overload = loadKg > vehicle.capacityKg ? vehicle.capacityKg / loadKg : 1
  const speed =
    vehicle.baseSpeed *
    props.speedFactor *
    gradeFactor *
    conditionFactor *
    wetFactor *
    waterPenalty *
    overload
  if (speed <= 0.01) return IMPASSABLE
  return { seconds: TILE_SIZE / speed, blocked: null }
}

export interface PathResult {
  readonly tiles: TilePos[]
  readonly seconds: number
  /** Reason the search failed, taken from the least-bad blocking step. */
  readonly failure: BlockedReason
}

const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const

/** Simple binary heap keyed on f-score. */
class Heap {
  private readonly nodes: number[] = []
  private readonly scores: number[] = []

  get size(): number {
    return this.nodes.length
  }

  clear(): void {
    this.nodes.length = 0
    this.scores.length = 0
  }

  push(node: number, score: number): void {
    this.nodes.push(node)
    this.scores.push(score)
    let i = this.nodes.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.scores[parent] <= this.scores[i]) break
      this.swap(parent, i)
      i = parent
    }
  }

  pop(): number {
    const top = this.nodes[0]
    const lastNode = this.nodes.pop() as number
    const lastScore = this.scores.pop() as number
    if (this.nodes.length > 0) {
      this.nodes[0] = lastNode
      this.scores[0] = lastScore
      let i = 0
      for (;;) {
        const left = i * 2 + 1
        const right = left + 1
        let smallest = i
        if (left < this.scores.length && this.scores[left] < this.scores[smallest]) smallest = left
        if (right < this.scores.length && this.scores[right] < this.scores[smallest]) smallest = right
        if (smallest === i) break
        this.swap(smallest, i)
        i = smallest
      }
    }
    return top
  }

  private swap(a: number, b: number): void {
    const node = this.nodes[a]
    this.nodes[a] = this.nodes[b]
    this.nodes[b] = node
    const score = this.scores[a]
    this.scores[a] = this.scores[b]
    this.scores[b] = score
  }
}

/**
 * A* over the tile grid, minimising travel time rather than distance.
 * Scratch arrays are reused between queries and validated with a stamp, so a
 * search costs no allocation.
 */
export class PathFinder {
  private readonly gScore: Float64Array
  private readonly cameFrom: Int32Array
  private readonly stamp: Int32Array
  private readonly closed: Uint8Array
  private readonly heap = new Heap()
  private currentStamp = 0

  constructor(private readonly ctx: TravelContext) {
    const n = ctx.grid.size * ctx.grid.size
    this.gScore = new Float64Array(n)
    this.cameFrom = new Int32Array(n)
    this.stamp = new Int32Array(n).fill(-1)
    this.closed = new Uint8Array(n)
  }

  find(from: TilePos, to: TilePos, vehicle: VehicleDef, loadKg: number): PathResult {
    const { grid } = this.ctx
    const size = grid.size
    if (!grid.inBounds(from.tx, from.tz) || !grid.inBounds(to.tx, to.tz)) {
      return { tiles: [], seconds: Number.POSITIVE_INFINITY, failure: 'blocked' }
    }

    const stamp = ++this.currentStamp
    this.heap.clear()
    const startIndex = from.tz * size + from.tx
    const goalIndex = to.tz * size + to.tx
    // A cart cannot even stand on the goal tile if it is not a cartway; the
    // caller is expected to pick a reachable stop, so treat this as a failure.
    const bestSpeed = vehicle.baseSpeed * 1.4
    const heuristic = (index: number): number => {
      const tx = index % size
      const tz = (index / size) | 0
      return (Math.abs(tx - to.tx) + Math.abs(tz - to.tz)) * (TILE_SIZE / bestSpeed)
    }

    this.stamp[startIndex] = stamp
    this.gScore[startIndex] = 0
    this.cameFrom[startIndex] = -1
    this.closed[startIndex] = 0
    this.heap.push(startIndex, heuristic(startIndex))

    let failure: BlockedReason = null
    let expansions = 0
    const limit = size * size

    while (this.heap.size > 0 && expansions++ < limit) {
      const current = this.heap.pop()
      if (this.closed[current] === 1 && this.stamp[current] === stamp) continue
      this.closed[current] = 1
      if (current === goalIndex) return this.reconstruct(current, stamp)

      const cx = current % size
      const cz = (current / size) | 0
      const currentTile = { tx: cx, tz: cz }
      const currentG = this.gScore[current]

      for (const [dx, dz] of NEIGHBOURS) {
        const nx = cx + dx
        const nz = cz + dz
        if (nx < 0 || nz < 0 || nx >= size || nz >= size) continue
        const neighbour = nz * size + nx
        if (this.stamp[neighbour] === stamp && this.closed[neighbour] === 1) continue

        const cost = stepCost(this.ctx, currentTile, { tx: nx, tz: nz }, vehicle, loadKg)
        if (!Number.isFinite(cost.seconds)) {
          if (cost.blocked && failure === null) failure = cost.blocked
          continue
        }
        const tentative = currentG + cost.seconds
        if (this.stamp[neighbour] !== stamp) {
          this.stamp[neighbour] = stamp
          this.gScore[neighbour] = Number.POSITIVE_INFINITY
          this.closed[neighbour] = 0
        }
        if (tentative < this.gScore[neighbour]) {
          this.gScore[neighbour] = tentative
          this.cameFrom[neighbour] = current
          this.heap.push(neighbour, tentative + heuristic(neighbour))
        }
      }
    }

    return { tiles: [], seconds: Number.POSITIVE_INFINITY, failure: failure ?? 'blocked' }
  }

  private reconstruct(goalIndex: number, stamp: number): PathResult {
    const size = this.ctx.grid.size
    const tiles: TilePos[] = []
    let index = goalIndex
    while (index !== -1 && this.stamp[index] === stamp) {
      tiles.push({ tx: index % size, tz: (index / size) | 0 })
      index = this.cameFrom[index]
    }
    tiles.reverse()
    return { tiles, seconds: this.gScore[goalIndex], failure: null }
  }
}
