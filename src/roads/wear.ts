import { clamp01 } from '../core/math'
import { RoadSurface, type TileGrid } from '../world/tileGrid'
import { surfaceProperties } from './roadSpec'

/** How fast a soaked surface dries out once the rain stops, per game hour. */
const DRY_RATE = 0.09
/** How fast rain soaks in, per game hour at full intensity. */
const SOAK_RATE = 0.28
/** Slow self-repair by the villages that use the road, per game hour. */
const UPKEEP_RATE = 0.004

/**
 * Rain and traffic acting on the surface.
 * Only built tiles are visited, so this stays cheap however big the map gets.
 */
export const stepRoadWear = (
  grid: TileGrid,
  roadTiles: readonly number[],
  hours: number,
  rainIntensity: number,
  onChanged: (tx: number, tz: number) => void,
): void => {
  for (const index of roadTiles) {
    const surface = grid.roadSurface[index] as RoadSurface
    if (surface === RoadSurface.None) continue
    const props = surfaceProperties(surface)

    const before = grid.wetness[index]
    if (rainIntensity > 0) {
      const soak = SOAK_RATE * rainIntensity * (1 - props.rainResistance) * hours
      grid.wetness[index] = clamp01(before + soak)
    } else {
      grid.wetness[index] = clamp01(before - DRY_RATE * hours)
    }

    // Wet surfaces degrade; dry ones are slowly patched up by the villages.
    const conditionBefore = grid.condition[index]
    const rot = grid.wetness[index] * 0.006 * hours
    grid.condition[index] = clamp01(conditionBefore - rot + UPKEEP_RATE * hours)

    if (Math.abs(grid.wetness[index] - before) > 0.05 || Math.abs(grid.condition[index] - conditionBefore) > 0.05) {
      onChanged(index % grid.size, Math.floor(index / grid.size))
    }
  }
}

/** Wear from one vehicle crossing one tile. */
export const applyTraffic = (grid: TileGrid, index: number, tonnes: number): void => {
  const surface = grid.roadSurface[index] as RoadSurface
  if (surface === RoadSurface.None) return
  const props = surfaceProperties(surface)
  // A wet road is far easier to rut than a dry one.
  const softness = 1 + grid.wetness[index] * 2.5
  grid.condition[index] = clamp01(grid.condition[index] - props.wearPerTonne * tonnes * softness)
}

/** Manual repair by the player, in person-hours. Returns tiles improved. */
export const repairTiles = (
  grid: TileGrid,
  indices: readonly number[],
  personHours: number,
  onChanged: (tx: number, tz: number) => void,
): number => {
  const damaged = indices.filter((index) => grid.condition[index] < 0.995)
  if (damaged.length === 0) return 0
  // One person-hour restores a full tile's worth of surface.
  const share = personHours / damaged.length
  for (const index of damaged) {
    const before = grid.condition[index]
    grid.condition[index] = clamp01(before + share)
    grid.wetness[index] = Math.max(0, grid.wetness[index] - share * 0.5)
    if (grid.condition[index] - before > 0.02) {
      onChanged(index % grid.size, Math.floor(index / grid.size))
    }
  }
  return damaged.length
}
