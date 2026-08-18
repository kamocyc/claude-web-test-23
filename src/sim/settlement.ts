import { clamp } from '../core/math'
import type { Building } from './buildings'
import { ALL_RESOURCES, Resource, type Stock, emptyStock } from './resources'
import type { StockHolder } from './stock'

/** How much food one villager eats per game hour. */
export const FOOD_PER_PERSON_HOUR = 0.04

export interface SettlementNeed {
  readonly resource: Resource
  /** Positive = surplus available for export, negative = shortfall. */
  readonly balance: number
}

export class Settlement implements StockHolder {
  readonly id: string
  readonly label: string
  readonly x: number
  readonly z: number
  readonly stock: Stock = emptyStock()
  readonly buildings: Building[] = []
  population: number
  /** Days of food the settlement wants to hold before exporting any. */
  readonly reserveDays: number
  private readonly capacity: number
  /** Set while the settlement has no food at all; drives population decline. */
  hungerHours = 0

  constructor(options: {
    id: string
    label: string
    x: number
    z: number
    population: number
    capacity?: number
    reserveDays?: number
  }) {
    this.id = options.id
    this.label = options.label
    this.x = options.x
    this.z = options.z
    this.population = options.population
    this.capacity = options.capacity ?? 120
    this.reserveDays = options.reserveDays ?? 2
  }

  capacityFor(_resource: Resource): number {
    void _resource
    return this.capacity
  }

  foodPerHour(): number {
    return this.population * FOOD_PER_PERSON_HOUR
  }

  /** Days of food left at the current population. */
  foodDays(): number {
    const perDay = this.foodPerHour() * 24
    return perDay <= 0 ? 99 : this.stock[Resource.Food] / perDay
  }

  /**
   * How much of each resource this settlement wants to keep on hand.
   * Anything above the target is exportable; anything below is a shortfall the
   * logistics layer will try to fix with a hauling order.
   */
  targetStock(resource: Resource): number {
    switch (resource) {
      case Resource.Food:
        return this.foodPerHour() * 24 * this.reserveDays
      case Resource.Wheat:
        return this.hasProducerOf(Resource.Food) ? 24 : 6
      case Resource.IronOre:
        return this.hasProducerOf(Resource.Tools) ? 20 : 4
      case Resource.Tools:
        return this.needsTools() ? 6 : 2
      case Resource.Timber:
        return 12
      case Resource.Stone:
        return 12
      default:
        return 0
    }
  }

  balances(): SettlementNeed[] {
    return ALL_RESOURCES.map((resource) => ({
      resource,
      balance: this.stock[resource] - this.targetStock(resource),
    }))
  }

  consumeFood(hours: number): void {
    const wanted = this.foodPerHour() * hours
    const eaten = Math.min(this.stock[Resource.Food], wanted)
    this.stock[Resource.Food] -= eaten
    if (eaten < wanted - 1e-6) {
      this.hungerHours += hours
      // Hungry villages shrink; the road is what stops the decline.
      this.population = clamp(this.population - hours * 0.05, 3, 200)
    } else {
      this.hungerHours = Math.max(0, this.hungerHours - hours * 2)
      if (this.foodDays() > this.reserveDays) {
        this.population = clamp(this.population + hours * 0.012, 3, 200)
      }
    }
  }

  private hasProducerOf(resource: Resource): boolean {
    return this.producedResources.has(resource)
  }

  private needsTools(): boolean {
    return this.toolsUser
  }

  /** Filled in by the world builder once buildings exist. */
  readonly producedResources = new Set<Resource>()
  toolsUser = false
}
