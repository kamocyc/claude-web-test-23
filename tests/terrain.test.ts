import { describe, expect, it } from 'vitest'
import { worldToTile } from '../src/world/heightfield'
import { generateWorld, waterDepthAt } from '../src/world/terrainGen'

const SEED = 20260817

describe('valley generation', () => {
  const { field, grid, layout } = generateWorld(SEED)

  it('is deterministic for a seed', () => {
    const again = generateWorld(SEED)
    expect(again.field.sample(200, 200)).toBeCloseTo(field.sample(200, 200), 6)
  })

  it('puts the mine village well above the farm village', () => {
    const farm = field.sample(layout.farmVillage.x, layout.farmVillage.z)
    const mine = field.sample(layout.mineVillage.x, layout.mineVillage.z)
    expect(mine - farm).toBeGreaterThan(12)
  })

  it('keeps settlement ground flat enough to build on', () => {
    for (const site of [layout.farmVillage, layout.mineVillage]) {
      const tx = worldToTile(site.x)
      const tz = worldToTile(site.z)
      expect(field.tileSlope(tx, tz)).toBeLessThan(0.06)
    }
  })

  it('makes the ford shallow and the main channel deep', () => {
    const fordDepth = waterDepthAt(field, grid, worldToTile(layout.ford.x), worldToTile(layout.ford.z))
    expect(fordDepth).toBeGreaterThan(0.2)
    expect(fordDepth).toBeLessThan(1.0)

    const mainDepth = waterDepthAt(
      field,
      grid,
      worldToTile(layout.bridgeHint.x),
      worldToTile(layout.bridgeHint.z),
    )
    expect(mainDepth).toBeGreaterThan(2.5)
  })

  it('offers a gentle natural pass and a punishing direct climb', () => {
    const route = layout.passRoute
    for (let i = 1; i < route.length; i++) {
      const run = Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z)
      const rise = field.sample(route[i].x, route[i].z) - field.sample(route[i - 1].x, route[i - 1].z)
      expect(Math.abs(rise / run)).toBeLessThan(0.09)
    }

    // Straight east from the bridge the rim is a wall, not a road.
    const directRise = field.sample(340, 210) - field.sample(290, 210)
    expect(directRise / 50).toBeGreaterThan(0.25)
  })
})
