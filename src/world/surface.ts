import type { Heightfield } from './heightfield'
import { worldToTile } from './heightfield'
import type { TileGrid } from './tileGrid'

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
