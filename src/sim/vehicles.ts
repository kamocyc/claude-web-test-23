import { RoadClass } from '../world/tileGrid'

export enum VehicleType {
  Porter = 'porter',
  Handcart = 'handcart',
}

export interface VehicleDef {
  readonly label: string
  /** Cargo the vehicle can carry, in kilograms. */
  readonly capacityKg: number
  /** Dead weight of the vehicle itself - it counts against bridge limits. */
  readonly tareKg: number
  /** Steepest grade it can hold when empty. */
  readonly maxGradeEmpty: number
  /** Steepest grade it can hold fully loaded. */
  readonly maxGradeLoaded: number
  /** Metres per second on level, well kept ground. */
  readonly baseSpeed: number
  /** Minimum road standard it needs; Footpath means "any built way". */
  readonly requiresRoad: RoadClass
  /** Deepest water it can wade or ford. */
  readonly maxFordDepth: number
}

export const VEHICLES: Record<VehicleType, VehicleDef> = {
  [VehicleType.Porter]: {
    label: '背負い運搬',
    capacityKg: 25,
    tareKg: 0,
    maxGradeEmpty: 0.42,
    maxGradeLoaded: 0.32,
    baseSpeed: 2.6,
    requiresRoad: RoadClass.None,
    maxFordDepth: 0.8,
  },
  [VehicleType.Handcart]: {
    label: '荷車',
    capacityKg: 180,
    tareKg: 60,
    maxGradeEmpty: 0.16,
    maxGradeLoaded: 0.1,
    baseSpeed: 2.2,
    requiresRoad: RoadClass.Cartway,
    maxFordDepth: 0.2,
  },
}

/** Grade limit falls off as the vehicle fills up. */
export const maxGradeFor = (vehicle: VehicleDef, loadKg: number): number => {
  const fraction = vehicle.capacityKg <= 0 ? 0 : Math.min(1, loadKg / vehicle.capacityKg)
  return vehicle.maxGradeEmpty + (vehicle.maxGradeLoaded - vehicle.maxGradeEmpty) * fraction
}

export const grossWeight = (vehicle: VehicleDef, loadKg: number): number => vehicle.tareKg + loadKg
