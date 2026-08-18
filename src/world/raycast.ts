import type { Heightfield } from './heightfield'
import { WORLD_SIZE } from './heightfield'

export interface RayHit {
  x: number
  y: number
  z: number
  distance: number
}

/**
 * March a ray against the height field. Used for aiming build tools at the
 * ground from a first-person camera. Coarse step then a binary refine: precise
 * enough for placing stakes, cheap enough to run every frame.
 */
export const raycastTerrain = (
  field: Heightfield,
  origin: { x: number; y: number; z: number },
  direction: { x: number; y: number; z: number },
  maxDistance = 120,
  step = 0.6,
): RayHit | null => {
  let previous = 0
  for (let t = step; t <= maxDistance; t += step) {
    const x = origin.x + direction.x * t
    const y = origin.y + direction.y * t
    const z = origin.z + direction.z * t
    if (x < 0 || z < 0 || x > WORLD_SIZE || z > WORLD_SIZE) return null
    const delta = y - field.sample(x, z)
    if (delta <= 0) {
      let lo = previous
      let hi = t
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) * 0.5
        const mx = origin.x + direction.x * mid
        const my = origin.y + direction.y * mid
        const mz = origin.z + direction.z * mid
        if (my - field.sample(mx, mz) <= 0) hi = mid
        else lo = mid
      }
      return {
        x: origin.x + direction.x * hi,
        y: origin.y + direction.y * hi,
        z: origin.z + direction.z * hi,
        distance: hi,
      }
    }
    previous = t
  }
  return null
}
