import { describe, expect, it } from 'vitest'
import { planRoad } from '../src/roads/buildability'
import { ROAD_SPECS, RoadSpecId } from '../src/roads/roadSpec'
import { ALL_RESOURCES } from '../src/sim/resources'
import { World } from '../src/sim/world'
import { tileToWorld, worldToTile } from '../src/world/heightfield'
import { waterDepthAt } from '../src/world/terrainGen'
import {
  MAX_DECK_CLIMB,
  WADE_LIMIT,
  canStandOn,
  surfaceHeightAt,
  tileSurfaceHeight,
  wadeDepthAt,
} from '../src/world/surface'
import { advanceGameHours } from './helpers'

const tileAt = (x: number, z: number) => ({ tx: worldToTile(x), tz: worldToTile(z) })

/** Build a cartway across the river and hand back a finished bridge tile. */
const bridgeWorld = () => {
  const world = new World(undefined, { spawnAgents: false })
  const z = world.layout.bridgeHint.z
  const plan = planRoad(
    world.field,
    world.grid,
    [tileAt(world.layout.bridgeHint.x - 26, z), tileAt(world.layout.bridgeHint.x + 26, z)],
    ROAD_SPECS[RoadSpecId.DirtCartway],
  )
  expect(plan.bridgeTiles).toBeGreaterThan(0)

  const site = world.startConstruction(plan)
  // The materials arriving is a separate story; this test is about the deck.
  for (const resource of ALL_RESOURCES) site.stock[resource] = 400
  let guard = 0
  while (!site.done && guard++ < 400) {
    for (const resource of ALL_RESOURCES) site.stock[resource] = 400
    world.playerWork = { x: site.x, z: site.z, active: true }
    advanceGameHours(world, 0.5)
  }
  world.playerWork = { x: 0, z: 0, active: false }
  expect(site.done).toBe(true)

  // Mid-channel, where the water is deepest: that is the tile a walker cannot
  // cross without the deck.
  const bridgeTiles = plan.tiles.filter((tile) => tile.isBridge)
  const deck = bridgeTiles.reduce((deepest, tile) =>
    waterDepthAt(world.field, world.grid, tile.tx, tile.tz) >
    waterDepthAt(world.field, world.grid, deepest.tx, deepest.tz)
      ? tile
      : deepest,
  )
  return { world, deck }
}

describe('walking a bridge the player built', () => {
  it('puts the player on the deck instead of the riverbed', () => {
    const { world, deck } = bridgeWorld()
    expect(world.grid.isBridge(deck.tx, deck.tz)).toBe(true)

    const index = world.grid.index(deck.tx, deck.tz)
    const deckHeight = world.grid.deckHeight[index]
    const riverbed = world.field.tileHeight(deck.tx, deck.tz)
    expect(deckHeight).toBeGreaterThan(world.grid.waterLevel[index])
    expect(deckHeight).toBeGreaterThan(riverbed)

    const x = tileToWorld(deck.tx)
    const z = tileToWorld(deck.tz)
    expect(surfaceHeightAt(world.field, world.grid, x, z)).toBeCloseTo(deckHeight, 5)
    expect(tileSurfaceHeight(world.field, world.grid, deck.tx, deck.tz)).toBeCloseTo(deckHeight, 5)
  })

  it('keeps the player out of the water while they are on it', () => {
    const { world, deck } = bridgeWorld()
    expect(waterDepthAt(world.field, world.grid, deck.tx, deck.tz)).toBeGreaterThan(WADE_LIMIT)
    expect(wadeDepthAt(world.field, world.grid, deck.tx, deck.tz)).toBe(0)
  })

  it('lets a walker on the deck cross water that would otherwise stop them', () => {
    const { world, deck } = bridgeWorld()
    const deckHeight = world.grid.deckHeight[world.grid.index(deck.tx, deck.tz)]

    // Standing on the deck, the next deck tile is a step away.
    expect(canStandOn(world.field, world.grid, deck.tx, deck.tz, deckHeight)).toBe(true)

    // The river beside the bridge is still a wall.
    const beside = { tx: deck.tx, tz: deck.tz + 1 }
    if (!world.grid.isBridge(beside.tx, beside.tz)) {
      const depth = waterDepthAt(world.field, world.grid, beside.tx, beside.tz)
      expect(canStandOn(world.field, world.grid, beside.tx, beside.tz, deckHeight)).toBe(
        depth <= WADE_LIMIT,
      )
    }

    // And the deck cannot be scaled from far below it.
    expect(
      canStandOn(world.field, world.grid, deck.tx, deck.tz, deckHeight - MAX_DECK_CLIMB - 1),
    ).toBe(false)
  })
})
