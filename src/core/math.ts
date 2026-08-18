export const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value

export const clamp01 = (value: number): number => clamp(value, 0, 1)

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

export const inverseLerp = (a: number, b: number, value: number): number =>
  a === b ? 0 : clamp01((value - a) / (b - a))

export const smoothstep = (t: number): number => {
  const x = clamp01(t)
  return x * x * (3 - 2 * x)
}

export const distance2d = (ax: number, az: number, bx: number, bz: number): number =>
  Math.hypot(bx - ax, bz - az)

/** Round to a fixed number of decimals, for readable UI numbers. */
export const round = (value: number, decimals = 1): number => {
  const f = 10 ** decimals
  return Math.round(value * f) / f
}
