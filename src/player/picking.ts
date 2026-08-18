import type { Agent } from '../sim/agents'
import type { Building } from '../sim/buildings'
import type { World } from '../sim/world'
import { worldToTile } from '../world/heightfield'
import { raycastTerrain } from '../world/raycast'
import type { ConstructionSite } from '../roads/construction'

export type PickTarget =
  | { kind: 'agent'; agent: Agent }
  | { kind: 'building'; building: Building }
  | { kind: 'site'; site: ConstructionSite }
  | { kind: 'road'; tx: number; tz: number }
  | { kind: 'ground'; tx: number; tz: number }
  | null

const MAX_RANGE = 70

/**
 * What is the player looking at? Agents win over scenery, because a cart on the
 * road is the thing you most often want to interrogate.
 */
export const pickTarget = (
  world: World,
  origin: { x: number; y: number; z: number },
  direction: { x: number; y: number; z: number },
): PickTarget => {
  let bestAgent: Agent | null = null
  let bestScore = Number.POSITIVE_INFINITY

  for (const agent of world.agents.agents) {
    const dx = agent.x - origin.x
    const dy = agent.y + 1 - origin.y
    const dz = agent.z - origin.z
    const along = dx * direction.x + dy * direction.y + dz * direction.z
    if (along < 0.5 || along > MAX_RANGE) continue
    const offset = Math.hypot(
      dx - direction.x * along,
      dy - direction.y * along,
      dz - direction.z * along,
    )
    // Allow a generous pick radius that grows slightly with distance.
    if (offset > 1.1 + along * 0.02) continue
    if (along < bestScore) {
      bestScore = along
      bestAgent = agent
    }
  }
  if (bestAgent) return { kind: 'agent', agent: bestAgent }

  const hit = raycastTerrain(world.field, origin, direction, MAX_RANGE)
  if (!hit) return null
  const tx = worldToTile(hit.x)
  const tz = worldToTile(hit.z)
  const index = world.grid.index(tx, tz)

  const buildingId = world.grid.structure[index]
  if (buildingId >= 0) {
    const building = world.buildings.find((candidate) => candidate.id === buildingId)
    if (building) return { kind: 'building', building }
  }

  for (const site of world.sites) {
    if (site.plan.tiles.some((tile) => tile.tx === tx && tile.tz === tz)) {
      return { kind: 'site', site }
    }
  }

  if (world.grid.hasRoad(tx, tz)) return { kind: 'road', tx, tz }
  return { kind: 'ground', tx, tz }
}
