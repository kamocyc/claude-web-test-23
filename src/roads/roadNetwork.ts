import { TILE_SIZE } from '../world/heightfield'
import type { TilePos } from './tileLine'
import type { RoadSpecId } from './roadSpec'

export interface RoadEdge {
  readonly id: number
  readonly specId: RoadSpecId
  readonly label: string
  /** Centreline tiles, in build order. */
  readonly tiles: TilePos[]
  /** Tonnes hauled over this road so far - drives wear and bandit interest. */
  traffic: number
  /** Game day the road opened. */
  openedOnDay: number
  complete: boolean
}

/**
 * Graph of built roads. Pathfinding runs on the tile grid, so this exists to
 * name things, to accumulate traffic, and to let the inspector answer
 * "what road is this and when did it open".
 */
export class RoadNetwork {
  private nextId = 1
  readonly edges = new Map<number, RoadEdge>()

  create(specId: RoadSpecId, label: string, tiles: TilePos[], day: number): RoadEdge {
    const edge: RoadEdge = {
      id: this.nextId++,
      specId,
      label,
      tiles,
      traffic: 0,
      openedOnDay: day,
      complete: false,
    }
    this.edges.set(edge.id, edge)
    return edge
  }

  get(id: number): RoadEdge | undefined {
    return this.edges.get(id)
  }

  lengthM(edge: RoadEdge): number {
    return Math.max(0, edge.tiles.length - 1) * TILE_SIZE
  }
}
