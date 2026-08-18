/**
 * Small deterministic value-noise used for terrain texture.
 * Hash based, so it needs no allocation and is stable across runs for a seed.
 */
const hash2 = (x: number, y: number, seed: number): number => {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 2246822519)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const fade = (t: number): number => t * t * (3 - 2 * t)

export const valueNoise2d = (x: number, y: number, seed: number): number => {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = fade(x - ix)
  const fy = fade(y - iy)
  const a = hash2(ix, iy, seed)
  const b = hash2(ix + 1, iy, seed)
  const c = hash2(ix, iy + 1, seed)
  const d = hash2(ix + 1, iy + 1, seed)
  const top = a + (b - a) * fx
  const bottom = c + (d - c) * fx
  return (top + (bottom - top) * fy) * 2 - 1
}

/** Fractal sum of value noise, returns roughly [-1, 1]. */
export const fbm = (x: number, y: number, seed: number, octaves = 4, lacunarity = 2, gain = 0.5): number => {
  let sum = 0
  let amplitude = 1
  let frequency = 1
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise2d(x * frequency, y * frequency, seed + i * 101) * amplitude
    norm += amplitude
    amplitude *= gain
    frequency *= lacunarity
  }
  return sum / norm
}
