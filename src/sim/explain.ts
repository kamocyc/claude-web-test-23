import type { BlockedReason } from '../roads/pathfinding'
import type { Resource } from './resources'

/** Why this route and not a shorter one. */
export type RouteNote =
  | null
  | { kind: 'shortest' }
  /** The direct line exists but no legal vehicle route follows it. */
  | { kind: 'onlyLegalRoute'; slowerBySeconds: number }

/** What is slowing the journey down right now. */
export type DelayCause =
  | null
  | { kind: 'mud'; place: string }
  | { kind: 'climb'; grade: number }
  | { kind: 'unpaved' }
  | { kind: 'loading' }
  | { kind: 'ford' }

/** Why the vehicle has not set off. */
export type StuckReason =
  | null
  | { kind: 'noRoute'; failure: BlockedReason; resource: Resource }
  | { kind: 'noCargo'; resource: Resource }
  | { kind: 'noWork' }
  | { kind: 'robbed' }

/**
 * Everything the inspector needs to answer the five questions the design asks
 * of every cart: where from, where to, carrying what, why this route, and what
 * is holding it up.
 */
export interface ExplainRecord {
  fromLabel: string
  toLabel: string
  cargoResource: Resource | null
  cargoAmount: number
  /** Estimated travel time of the chosen route, in simulation seconds. */
  routeSeconds: number
  routeNote: RouteNote
  delay: DelayCause
  stuck: StuckReason
}

export const emptyExplain = (): ExplainRecord => ({
  fromLabel: '',
  toLabel: '',
  cargoResource: null,
  cargoAmount: 0,
  routeSeconds: 0,
  routeNote: null,
  delay: null,
  stuck: null,
})
