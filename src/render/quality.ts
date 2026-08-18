export type QualityLevel = 'low' | 'high'

/**
 * Ground cover is by far the heaviest thing on screen and the least important
 * to the game. `?quality=low` drops it, for weak machines and for headless runs
 * where the software renderer is the bottleneck.
 */
export const readQuality = (search = typeof location === 'undefined' ? '' : location.search): QualityLevel =>
  new URLSearchParams(search).get('quality') === 'low' ? 'low' : 'high'
