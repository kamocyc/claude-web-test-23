import { RoadSurface, TerrainSurface } from '../world/tileGrid'

export interface Rgb {
  r: number
  g: number
  b: number
}

const rgb = (hex: number): Rgb => ({
  r: ((hex >> 16) & 255) / 255,
  g: ((hex >> 8) & 255) / 255,
  b: (hex & 255) / 255,
})

export const TERRAIN_COLORS: Record<TerrainSurface, Rgb> = {
  [TerrainSurface.Grass]: rgb(0x5f7f45),
  [TerrainSurface.Rock]: rgb(0x7a736a),
  [TerrainSurface.Water]: rgb(0x35485a),
  [TerrainSurface.Bank]: rgb(0x9c9070),
  [TerrainSurface.Field]: rgb(0x9aa04f),
}

export const ROAD_COLORS: Record<RoadSurface, Rgb> = {
  [RoadSurface.None]: rgb(0x000000),
  [RoadSurface.Dirt]: rgb(0x7d6244),
  [RoadSurface.Gravel]: rgb(0x8d8478),
  [RoadSurface.Stone]: rgb(0x9d9a93),
  [RoadSurface.TimberBridge]: rgb(0x6b4f34),
  [RoadSurface.StoneBridge]: rgb(0xa5a29a),
}

export const UNDER_CONSTRUCTION_COLOR = rgb(0xb08a4e)

export const mix = (a: Rgb, b: Rgb, t: number): Rgb => ({
  r: a.r + (b.r - a.r) * t,
  g: a.g + (b.g - a.g) * t,
  b: a.b + (b.b - a.b) * t,
})

export const scale = (c: Rgb, k: number): Rgb => ({ r: c.r * k, g: c.g * k, b: c.b * k })
