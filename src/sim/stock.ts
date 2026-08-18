import { ALL_RESOURCES, type Resource, type Stock, emptyStock } from './resources'

/** Anything a hauler can load from or unload into. */
export interface StockHolder {
  readonly id: string
  readonly label: string
  /** World position where carts stop (metres). */
  readonly x: number
  readonly z: number
  readonly stock: Stock
  capacityFor(resource: Resource): number
}

export const take = (stock: Stock, resource: Resource, amount: number): number => {
  const taken = Math.min(stock[resource], amount)
  stock[resource] -= taken
  return taken
}

export const put = (holder: StockHolder, resource: Resource, amount: number): number => {
  const room = Math.max(0, holder.capacityFor(resource) - holder.stock[resource])
  const stored = Math.min(room, amount)
  holder.stock[resource] += stored
  return stored
}

export const totalUnits = (stock: Stock): number =>
  ALL_RESOURCES.reduce((sum, resource) => sum + stock[resource], 0)

export const cloneStock = (stock: Stock): Stock => {
  const copy = emptyStock()
  for (const resource of ALL_RESOURCES) copy[resource] = stock[resource]
  return copy
}
