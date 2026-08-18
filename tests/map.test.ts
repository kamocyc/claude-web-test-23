import { describe, expect, it } from 'vitest'
import { deserialize, serialize } from '../src/sim/save'
import { REVEAL_RADIUS, World } from '../src/sim/world'
import { TILE_SIZE, worldToTile } from '../src/world/heightfield'

describe('the map the player draws by walking', () => {
  it('starts blank: a valley nobody has crossed has no map', () => {
    const world = new World(undefined, { spawnAgents: false })
    expect(world.explored.some((value) => value === 1)).toBe(false)
    expect(world.isExplored(worldToTile(world.layout.farmVillage.x), worldToTile(world.layout.farmVillage.z))).toBe(
      false,
    )
  })

  it('reveals what is within sight and nothing beyond it', () => {
    const world = new World(undefined, { spawnAgents: false })
    const x = world.layout.farmVillage.x
    const z = world.layout.farmVillage.z
    expect(world.reveal(x, z)).toBe(true)

    expect(world.isExplored(worldToTile(x), worldToTile(z))).toBe(true)
    // Just inside the horizon.
    expect(world.isExplored(worldToTile(x + REVEAL_RADIUS - TILE_SIZE * 2), worldToTile(z))).toBe(true)
    // Well beyond it: still unknown ground.
    expect(world.isExplored(worldToTile(x + REVEAL_RADIUS * 2), worldToTile(z))).toBe(false)

    // Standing still adds nothing.
    expect(world.reveal(x, z)).toBe(false)
  })

  it('remembers the journey across a save', () => {
    const world = new World(undefined, { spawnAgents: false })
    world.reveal(world.layout.farmVillage.x, world.layout.farmVillage.z)
    world.reveal(world.layout.bridgeHint.x, world.layout.bridgeHint.z)
    const walked = world.explored.reduce((total, value) => total + value, 0)
    expect(walked).toBeGreaterThan(100)

    const restored = deserialize(JSON.parse(JSON.stringify(serialize(world))))
    expect(restored.explored.reduce((total, value) => total + value, 0)).toBe(walked)
    for (let i = 0; i < world.explored.length; i++) {
      if (world.explored[i] !== restored.explored[i]) {
        throw new Error(`tile ${i} came back different`)
      }
    }
  })
})
