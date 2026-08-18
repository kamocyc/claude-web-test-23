import * as THREE from 'three'
import { planRoad, type RoadPlan } from '../roads/buildability'
import { ROAD_SPECS, ROAD_SPEC_ORDER, RoadSpecId } from '../roads/roadSpec'
import { BUILDINGS, type Building, type BuildingType } from '../sim/buildings'
import { PLACEABLE_ORDER, type StructureSite } from '../sim/structureSite'
import type { ConstructionSite } from '../roads/construction'
import { PLACED_BUILDING_ID_BASE } from '../sim/world'
import type { TilePos } from '../roads/tileLine'
import type { World } from '../sim/world'
import { worldToTile } from '../world/heightfield'
import { raycastTerrain, type RayHit } from '../world/raycast'
import type { PlayerController } from './controller'

export enum ToolId {
  Inspect = 'inspect',
  Survey = 'survey',
  Stake = 'stake',
  Work = 'work',
  Place = 'place',
  Demolish = 'demolish',
}

export const TOOL_ORDER: readonly ToolId[] = [
  ToolId.Inspect,
  ToolId.Survey,
  ToolId.Stake,
  ToolId.Work,
  ToolId.Place,
  ToolId.Demolish,
]

/** What the demolition tool would take away if the player clicked now. */
export type DemolishTarget =
  | { kind: 'building'; building: Building }
  | { kind: 'structureSite'; site: StructureSite }
  | { kind: 'site'; site: ConstructionSite }
  | { kind: 'road'; tx: number; tz: number; edgeId: number; label: string }
  | null

export interface SurveyReading {
  readonly x: number
  readonly z: number
  readonly height: number
  /** Grade from where the player stands to the aimed point. */
  readonly gradeFromPlayer: number
  readonly slope: number
  readonly waterDepth: number
  readonly distance: number
  readonly terrainLabel: string
  readonly roadLabel: string | null
}

const TERRAIN_LABELS = ['草地', '岩場', '水面', '河原', '畑'] as const

/**
 * The player's build tools. Pure state and intent - the tool decides what a
 * click means, the world decides what it costs, and the UI reads both.
 */
export class ToolBelt {
  tool: ToolId = ToolId.Survey
  specId: RoadSpecId = RoadSpecId.DirtCartway
  placementType: BuildingType = PLACEABLE_ORDER[0]
  readonly stakes: TilePos[] = []
  aim: RayHit | null = null
  /** Plan including the segment to the point currently under the crosshair. */
  preview: RoadPlan | null = null
  /** Committed plan (stakes only), which is what Enter would actually build. */
  committed: RoadPlan | null = null
  working = false
  lastMessage: string | null = null

  private readonly direction = new THREE.Vector3()

  constructor(
    private readonly world: World,
    private readonly player: PlayerController,
  ) {
    document.addEventListener('keydown', this.onKeyDown)
    document.addEventListener('mousedown', this.onMouseDown)
    document.addEventListener('mouseup', this.onMouseUp)
  }

  dispose(): void {
    document.removeEventListener('keydown', this.onKeyDown)
    document.removeEventListener('mousedown', this.onMouseDown)
    document.removeEventListener('mouseup', this.onMouseUp)
  }

  get spec() {
    return ROAD_SPECS[this.specId]
  }

  /** Recomputed every frame: cheap, and it keeps the preview honest. */
  update(): void {
    this.player.lookDirection(this.direction)
    this.aim = raycastTerrain(this.world.field, this.player.position, this.direction, 90)
    this.refreshPlans()
  }

  private refreshPlans(): void {
    if (this.tool !== ToolId.Stake || this.stakes.length === 0) {
      this.preview = null
      this.committed = null
      return
    }
    const spec = this.spec
    this.committed =
      this.stakes.length >= 2
        ? planRoad(this.world.field, this.world.grid, this.stakes, spec)
        : null
    const aimTile = this.aimTile()
    this.preview = aimTile
      ? planRoad(this.world.field, this.world.grid, [...this.stakes, aimTile], spec)
      : this.committed
  }

  aimTile(): TilePos | null {
    if (!this.aim) return null
    const tx = worldToTile(this.aim.x)
    const tz = worldToTile(this.aim.z)
    if (!this.world.grid.inBounds(tx, tz)) return null
    return { tx, tz }
  }

  survey(): SurveyReading | null {
    if (!this.aim) return null
    const tx = worldToTile(this.aim.x)
    const tz = worldToTile(this.aim.z)
    const grid = this.world.grid
    const index = grid.index(tx, tz)
    const height = this.world.field.tileHeight(tx, tz)
    const run = Math.hypot(this.aim.x - this.player.position.x, this.aim.z - this.player.position.z)
    const playerGround = this.world.field.sample(this.player.position.x, this.player.position.z)
    return {
      x: this.aim.x,
      z: this.aim.z,
      height,
      gradeFromPlayer: run > 1 ? (height - playerGround) / run : 0,
      slope: this.world.field.tileSlope(tx, tz),
      waterDepth: grid.isWater(tx, tz) ? Math.max(0, grid.waterLevel[index] - height) : 0,
      distance: this.aim.distance,
      terrainLabel: TERRAIN_LABELS[grid.terrain[index]] ?? '地面',
      roadLabel: grid.hasRoad(tx, tz) ? '既設の道' : null,
    }
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (!this.player.locked) return
    const digit = TOOL_ORDER.indexOf(this.tool)
    switch (event.code) {
      case 'Digit1':
        this.tool = ToolId.Inspect
        break
      case 'Digit2':
        this.tool = ToolId.Survey
        break
      case 'Digit3':
        this.tool = ToolId.Stake
        break
      case 'Digit4':
        this.tool = ToolId.Work
        break
      case 'Digit5':
        this.tool = ToolId.Place
        break
      case 'Digit6':
        this.tool = ToolId.Demolish
        break
      case 'KeyQ':
        this.cycleSpec(-1)
        break
      case 'KeyE':
        this.cycleSpec(1)
        break
      case 'Enter':
        this.commit()
        break
      case 'KeyX':
        this.stakes.length = 0
        break
      case 'Backspace':
        this.stakes.pop()
        break
      default:
        break
    }
    void digit
    if (this.tool !== ToolId.Stake) this.refreshPlans()
  }

  private cycleSpec(delta: number): void {
    if (this.tool === ToolId.Stake) {
      const index = ROAD_SPEC_ORDER.indexOf(this.specId)
      const next = (index + delta + ROAD_SPEC_ORDER.length) % ROAD_SPEC_ORDER.length
      this.specId = ROAD_SPEC_ORDER[next]
      return
    }
    if (this.tool === ToolId.Place) {
      const index = PLACEABLE_ORDER.indexOf(this.placementType)
      const next = (index + delta + PLACEABLE_ORDER.length) % PLACEABLE_ORDER.length
      this.placementType = PLACEABLE_ORDER[next]
    }
  }

  private onMouseDown = (event: MouseEvent): void => {
    if (!this.player.locked) return
    if (event.button === 0) {
      if (this.tool === ToolId.Stake) this.addStake()
      if (this.tool === ToolId.Work) this.working = true
      if (this.tool === ToolId.Place) this.placeStructure()
      if (this.tool === ToolId.Demolish) this.demolish(false)
    }
    if (event.button === 2 && this.tool === ToolId.Stake) this.stakes.pop()
    if (event.button === 2 && this.tool === ToolId.Demolish) this.demolish(true)
  }

  private onMouseUp = (event: MouseEvent): void => {
    if (event.button === 0) this.working = false
  }

  private addStake(): void {
    const tile = this.aimTile()
    if (!tile) return
    const grid = this.world.grid
    if (grid.blocked[grid.index(tile.tx, tile.tz)] === 1) {
      this.lastMessage = 'そこには建物がある'
      return
    }
    const last = this.stakes[this.stakes.length - 1]
    if (last && last.tx === tile.tx && last.tz === tile.tz) return
    this.stakes.push(tile)
    this.lastMessage = null
  }

  /** Site a watchtower, inn or store beside the road the player is standing on. */
  private placeStructure(): void {
    const tile = this.aimTile()
    if (!tile || !this.aim) return
    const grid = this.world.grid
    const index = grid.index(tile.tx, tile.tz)
    if (grid.blocked[index] === 1 || grid.hasRoad(tile.tx, tile.tz)) {
      this.lastMessage = '道や建物の上には建てられない'
      return
    }
    if (grid.isWater(tile.tx, tile.tz)) {
      this.lastMessage = '水の上には建てられない'
      return
    }
    if (this.world.field.tileSlope(tile.tx, tile.tz) > 0.35) {
      this.lastMessage = '地面が急すぎる'
      return
    }
    const label = BUILDINGS[this.placementType].label
    if (this.world.placeStructure(this.placementType, this.aim.x, this.aim.z)) {
      this.lastMessage = `${label}の建設地を決めた。資材が届いたら施工できる。`
    }
  }

  /**
   * What the crosshair is over, in the order the player means it: a finished
   * building first, then work in progress, then the road surface itself.
   */
  demolishTarget(): DemolishTarget {
    const tile = this.aimTile()
    if (!tile || !this.aim) return null
    const world = this.world
    const grid = world.grid
    const index = grid.index(tile.tx, tile.tz)

    const buildingId = grid.structure[index]
    if (buildingId >= 0) {
      const building = world.buildings.find((candidate) => candidate.id === buildingId)
      if (building) return { kind: 'building', building }
    }

    const structureSite = world.structureSiteAt(this.aim.x, this.aim.z)
    if (structureSite) return { kind: 'structureSite', site: structureSite }

    const site = world.siteAtTile(tile.tx, tile.tz)
    if (site) return { kind: 'site', site }

    if (grid.hasRoad(tile.tx, tile.tz)) {
      const edgeId = grid.roadEdge[index]
      return {
        kind: 'road',
        tx: tile.tx,
        tz: tile.tz,
        edgeId,
        label: world.roads.get(edgeId)?.label ?? '道',
      }
    }
    return null
  }

  /** Left click takes the one thing aimed at; right click takes the whole road. */
  private demolish(wholeRoad: boolean): void {
    const target = this.demolishTarget()
    if (!target) {
      this.lastMessage = '撤去できるものがない'
      return
    }
    switch (target.kind) {
      case 'building': {
        if (target.building.id < PLACED_BUILDING_ID_BASE) {
          this.lastMessage = '村の建物は壊せない'
          return
        }
        this.world.demolishBuilding(target.building)
        this.lastMessage = null
        return
      }
      case 'structureSite': {
        this.world.cancelStructureSite(target.site)
        this.lastMessage = null
        return
      }
      case 'site': {
        this.world.cancelSite(target.site)
        this.lastMessage = null
        return
      }
      case 'road': {
        const here = this.playerTile()
        if (!wholeRoad && here.tx === target.tx && here.tz === target.tz) {
          this.lastMessage = '足元の道は撤去できない'
          return
        }
        if (wholeRoad) {
          if (this.world.grid.roadEdge[this.world.grid.index(here.tx, here.tz)] === target.edgeId) {
            this.lastMessage = '自分が乗っている道は一括撤去できない'
            return
          }
          this.world.removeRoad(target.edgeId)
        } else {
          this.world.removeRoadTile(target.tx, target.tz)
        }
        this.lastMessage = null
        return
      }
      default:
        return
    }
  }

  private playerTile(): TilePos {
    return {
      tx: worldToTile(this.player.position.x),
      tz: worldToTile(this.player.position.z),
    }
  }

  /** Enter: turn the staked line into a construction site. */
  commit(): void {
    if (this.tool !== ToolId.Stake) return
    const plan = this.committed
    if (!plan) {
      this.lastMessage = '杭が2本必要だ'
      return
    }
    if (!plan.buildable) {
      this.lastMessage = 'この線形では工事できない（切土・盛土が深すぎる）'
      return
    }
    this.world.startConstruction(plan)
    this.stakes.length = 0
    this.preview = null
    this.committed = null
    this.lastMessage = null
  }
}
