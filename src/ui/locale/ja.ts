import { Resource } from '../../sim/resources'
import { RoadSurface } from '../../world/tileGrid'

export const RESOURCE_NAMES: Record<Resource, string> = {
  [Resource.Wheat]: '小麦',
  [Resource.Food]: '食料',
  [Resource.IronOre]: '鉄鉱石',
  [Resource.Tools]: '工具',
  [Resource.Timber]: '木材',
  [Resource.Stone]: '石材',
}

export const ROAD_SURFACE_NAMES: Record<RoadSurface, string> = {
  [RoadSurface.None]: 'なし',
  [RoadSurface.Dirt]: '土道',
  [RoadSurface.Gravel]: '砂利道',
  [RoadSurface.Stone]: '石畳',
  [RoadSurface.TimberBridge]: '木橋',
  [RoadSurface.StoneBridge]: '石橋',
}

export const UI = {
  day: '日目',
  paused: '一時停止',
  speed: '速度',
  stock: '在庫',
  population: '人口',
  idle: '停止中',
  working: '稼働',
  noWorkers: '働き手がいない',
  outOfInput: '材料切れ',
  storageFull: '倉庫が満杯',
  starving: '食料が尽きた',
} as const
