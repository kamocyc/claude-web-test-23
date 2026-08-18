import { Resource } from '../sim/resources'
import { RoadClass, RoadSurface } from '../world/tileGrid'

/** The road standards the player can stake out. */
export enum RoadSpecId {
  DirtPath = 'dirtPath',
  DirtCartway = 'dirtCartway',
  GravelCartway = 'gravelCartway',
  StoneCartway = 'stoneCartway',
}

export interface RoadSpec {
  readonly id: RoadSpecId
  readonly label: string
  readonly surface: RoadSurface
  readonly roadClass: RoadClass
  /** Width in metres, shown to the player; tiles painted follow from it. */
  readonly width: number
  /** Multiplies vehicle speed on a dry, well kept surface. */
  readonly speedFactor: number
  /** Heaviest vehicle load the surface will bear, in kilograms. */
  readonly maxLoadKg: number
  /** 0 = turns to mud in the first shower, 1 = shrugs rain off. */
  readonly rainResistance: number
  /** Condition lost per tonne of traffic crossing one tile. */
  readonly wearPerTonne: number
  /** Extra grip: stone lets a cart hold a slightly steeper grade than mud. */
  readonly gradeAllowance: number
  readonly materialsPerTile: Partial<Record<Resource, number>>
  /** Person-hours of work per tile. */
  readonly labourPerTile: number
  /** Bridge standard used automatically where the route crosses water. */
  readonly bridge: BridgeSpecId
}

export enum BridgeSpecId {
  Timber = 'timberBridge',
  Stone = 'stoneBridge',
}

export interface BridgeSpec {
  readonly id: BridgeSpecId
  readonly label: string
  readonly surface: RoadSurface
  readonly maxLoadKg: number
  readonly materialsPerTile: Partial<Record<Resource, number>>
  readonly labourPerTile: number
  /** Longest span the standard can carry, in tiles. */
  readonly maxSpanTiles: number
}

export const BRIDGE_SPECS: Record<BridgeSpecId, BridgeSpec> = {
  [BridgeSpecId.Timber]: {
    id: BridgeSpecId.Timber,
    label: '木橋',
    surface: RoadSurface.TimberBridge,
    maxLoadKg: 260,
    materialsPerTile: { [Resource.Timber]: 1.5 },
    labourPerTile: 4,
    maxSpanTiles: 14,
  },
  [BridgeSpecId.Stone]: {
    id: BridgeSpecId.Stone,
    label: '石橋',
    surface: RoadSurface.StoneBridge,
    maxLoadKg: 900,
    materialsPerTile: { [Resource.Stone]: 2.2, [Resource.Timber]: 0.4 },
    labourPerTile: 7,
    maxSpanTiles: 22,
  },
}

export const ROAD_SPECS: Record<RoadSpecId, RoadSpec> = {
  [RoadSpecId.DirtPath]: {
    id: RoadSpecId.DirtPath,
    label: '土の小道',
    surface: RoadSurface.Dirt,
    roadClass: RoadClass.Footpath,
    width: 1.5,
    speedFactor: 1.05,
    maxLoadKg: 40,
    rainResistance: 0.05,
    wearPerTonne: 0.02,
    gradeAllowance: 1,
    materialsPerTile: {},
    labourPerTile: 0.7,
    bridge: BridgeSpecId.Timber,
  },
  [RoadSpecId.DirtCartway]: {
    id: RoadSpecId.DirtCartway,
    label: '土の荷車道',
    surface: RoadSurface.Dirt,
    roadClass: RoadClass.Cartway,
    width: 3,
    speedFactor: 1.1,
    maxLoadKg: 260,
    rainResistance: 0.12,
    wearPerTonne: 0.018,
    gradeAllowance: 1,
    materialsPerTile: { [Resource.Timber]: 0.1 },
    labourPerTile: 1,
    bridge: BridgeSpecId.Timber,
  },
  [RoadSpecId.GravelCartway]: {
    id: RoadSpecId.GravelCartway,
    label: '砂利の荷車道',
    surface: RoadSurface.Gravel,
    roadClass: RoadClass.Cartway,
    width: 3,
    speedFactor: 1.25,
    maxLoadKg: 420,
    rainResistance: 0.6,
    wearPerTonne: 0.009,
    gradeAllowance: 1.08,
    materialsPerTile: { [Resource.Stone]: 0.5 },
    labourPerTile: 2.2,
    bridge: BridgeSpecId.Timber,
  },
  [RoadSpecId.StoneCartway]: {
    id: RoadSpecId.StoneCartway,
    label: '石畳の街道',
    surface: RoadSurface.Stone,
    roadClass: RoadClass.Cartway,
    width: 4,
    speedFactor: 1.4,
    maxLoadKg: 900,
    rainResistance: 0.95,
    wearPerTonne: 0.004,
    gradeAllowance: 1.15,
    materialsPerTile: { [Resource.Stone]: 1.1, [Resource.Timber]: 0.1 },
    labourPerTile: 3.6,
    bridge: BridgeSpecId.Stone,
  },
}

export const ROAD_SPEC_ORDER: readonly RoadSpecId[] = [
  RoadSpecId.DirtPath,
  RoadSpecId.DirtCartway,
  RoadSpecId.GravelCartway,
  RoadSpecId.StoneCartway,
]

/** Surface properties looked up from what is actually on the ground. */
export interface SurfaceProperties {
  readonly speedFactor: number
  readonly maxLoadKg: number
  readonly rainResistance: number
  readonly gradeAllowance: number
  readonly wearPerTonne: number
}

const SURFACE_PROPERTIES: Record<RoadSurface, SurfaceProperties> = {
  [RoadSurface.None]: {
    speedFactor: 0.62,
    maxLoadKg: Number.POSITIVE_INFINITY,
    rainResistance: 0,
    gradeAllowance: 0.85,
    wearPerTonne: 0,
  },
  [RoadSurface.Dirt]: {
    speedFactor: 1.1,
    maxLoadKg: 260,
    rainResistance: 0.12,
    gradeAllowance: 1,
    wearPerTonne: 0.018,
  },
  [RoadSurface.Gravel]: {
    speedFactor: 1.25,
    maxLoadKg: 420,
    rainResistance: 0.6,
    gradeAllowance: 1.08,
    wearPerTonne: 0.009,
  },
  [RoadSurface.Stone]: {
    speedFactor: 1.4,
    maxLoadKg: 900,
    rainResistance: 0.95,
    gradeAllowance: 1.15,
    wearPerTonne: 0.004,
  },
  [RoadSurface.TimberBridge]: {
    speedFactor: 1.05,
    maxLoadKg: 260,
    rainResistance: 0.8,
    gradeAllowance: 1,
    wearPerTonne: 0.012,
  },
  [RoadSurface.StoneBridge]: {
    speedFactor: 1.2,
    maxLoadKg: 900,
    rainResistance: 1,
    gradeAllowance: 1.1,
    wearPerTonne: 0.003,
  },
}

export const surfaceProperties = (surface: RoadSurface): SurfaceProperties =>
  SURFACE_PROPERTIES[surface]
