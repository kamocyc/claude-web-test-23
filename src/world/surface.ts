import type { Heightfield } from './heightfield'
import { worldToTile } from './heightfield'
import type { TileGrid } from './tileGrid'
import { waterDepthAt } from './terrainGen'

/** Deeper than this and a walker turns back: the reason fords and bridges matter. */
export const WADE_LIMIT = 1.3
/** How far up onto a bridge deck someone can climb from the water below. */
export const MAX_DECK_CLIMB = 2.4

/**
 * Height that people and carts actually stand on: the ground, or a bridge deck
 * where one has been built over the river.
 */
export const surfaceHeightAt = (
  field: Heightfield,
  grid: TileGrid,
  x: number,
  z: number,
): number => {
  const tx = worldToTile(x)
  const tz = worldToTile(z)
  if (grid.isBridge(tx, tz)) return grid.deckHeight[grid.index(tx, tz)]
  return field.sample(x, z)
}

export const tileSurfaceHeight = (
  field: Heightfield,
  grid: TileGrid,
  tx: number,
  tz: number,
): number => {
  if (grid.isBridge(tx, tz)) return grid.deckHeight[grid.index(tx, tz)]
  return field.tileHeight(tx, tz)
}

/**
 * Water a walker is actually standing in. A bridge deck keeps them out of the
 * river entirely, so the tile below being three metres deep costs them nothing.
 */
export const wadeDepthAt = (
  field: Heightfield,
  grid: TileGrid,
  tx: number,
  tz: number,
): number => {
  if (!grid.inBounds(tx, tz) || grid.isBridge(tx, tz)) return 0
  return waterDepthAt(field, grid, tx, tz)
}

/**
 * Can somebody on foot stand on this tile, coming from ground at `fromSurface`?
 * A deck is reached by its approaches, not scaled from the water beneath it.
 */
export const canStandOn = (
  field: Heightfield,
  grid: TileGrid,
  tx: number,
  tz: number,
  fromSurface: number,
): boolean => {
  if (!grid.inBounds(tx, tz)) return false
  const index = grid.index(tx, tz)
  if (grid.blocked[index] === 1) return false
  if (grid.isBridge(tx, tz)) return grid.deckHeight[index] - fromSurface <= MAX_DECK_CLIMB
  return waterDepthAt(field, grid, tx, tz) <= WADE_LIMIT
}
