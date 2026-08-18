export interface TilePos {
  readonly tx: number
  readonly tz: number
}

/**
 * Four-connected line between two tiles. Roads must never step diagonally:
 * a diagonal gap would let carts squeeze between two tile corners.
 */
export const tileLine = (from: TilePos, to: TilePos): TilePos[] => {
  const tiles: TilePos[] = [{ tx: from.tx, tz: from.tz }]
  let x = from.tx
  let z = from.tz
  const dx = Math.abs(to.tx - x)
  const dz = Math.abs(to.tz - z)
  const sx = Math.sign(to.tx - x)
  const sz = Math.sign(to.tz - z)
  let error = dx - dz

  let guard = dx + dz + 2
  while ((x !== to.tx || z !== to.tz) && guard-- > 0) {
    const doubled = error * 2
    if (doubled > -dz && x !== to.tx) {
      error -= dz
      x += sx
    } else if (z !== to.tz) {
      error += dx
      z += sz
    } else if (x !== to.tx) {
      x += sx
    }
    tiles.push({ tx: x, tz: z })
  }
  return tiles
}

export const tileKey = (tx: number, tz: number): number => tz * 4096 + tx
