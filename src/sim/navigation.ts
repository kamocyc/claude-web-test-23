import type { TilePos } from '../roads/tileLine'
import { worldToTile } from '../world/heightfield'
import { RoadClass, type TileGrid } from '../world/tileGrid'

/**
 * Buildings block their own footprint, so a hauler stops on the nearest free
 * tile instead. Cart deliveries prefer a tile that is actually a cartway.
 */
export const findStopTile = (
  grid: TileGrid,
  x: number,
  z: number,
  options: { requireRoadClass?: RoadClass; maxRadius?: number } = {},
): TilePos | null => {
  const cx = worldToTile(x)
  const cz = worldToTile(z)
  const maxRadius = options.maxRadius ?? 6
  const required = options.requireRoadClass ?? RoadClass.None

  let fallback: TilePos | null = null
  for (let radius = 0; radius <= maxRadius; radius++) {
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue
        const tx = cx + dx
        const tz = cz + dz
        if (!grid.inBounds(tx, tz)) continue
        const index = grid.index(tx, tz)
        if (grid.blocked[index] === 1) continue
        if (grid.isWater(tx, tz) && !grid.isBridge(tx, tz)) continue
        if (required !== RoadClass.None) {
          if ((grid.roadClass[index] as RoadClass) >= required) return { tx, tz }
          if (!fallback) fallback = { tx, tz }
          continue
        }
        return { tx, tz }
      }
    }
  }
  return fallback
}
