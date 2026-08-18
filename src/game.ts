import * as THREE from 'three'
import { SIM_DT, SPEED_STEPS, type SpeedStep } from './core/clock'
import { PlayerController } from './player/controller'
import { ToolBelt, ToolId } from './player/tools'
import { BridgeView } from './render/bridgeView'
import { Markers } from './render/markers'
import { UNDER_CONSTRUCTION_COLOR } from './render/palette'
import { Viewport } from './render/renderer'
import { StructureView } from './render/structureView'
import { TerrainMesh } from './render/terrainMesh'
import { buildWaterMesh } from './render/water'
import { World } from './sim/world'
import { BuildPanel } from './ui/buildPanel'
import { Hud } from './ui/hud'
import { tileKey } from './roads/tileLine'
import { tileSurfaceHeight } from './world/surface'

/** Wires the headless simulation to rendering, input and UI. */
export class Game {
  readonly world: World
  readonly viewport: Viewport
  readonly player: PlayerController
  readonly terrainMesh: TerrainMesh
  readonly hud: Hud
  readonly tools: ToolBelt
  readonly markers: Markers
  readonly bridges: BridgeView
  readonly buildPanel: BuildPanel

  private lastFrame = performance.now()
  private previousSpeed: SpeedStep = 1
  private readonly lookDirection = new THREE.Vector3()

  constructor(container: HTMLElement, uiRoot: HTMLElement, seed?: number) {
    this.world = new World(seed)
    this.viewport = new Viewport(container)
    this.terrainMesh = new TerrainMesh(this.world.field, this.world.grid)
    this.viewport.scene.add(this.terrainMesh.group)
    this.viewport.scene.add(buildWaterMesh(this.world.field, this.world.grid))

    this.player = new PlayerController(
      this.world.field,
      this.world.grid,
      this.viewport.renderer.domElement,
    )
    const structures = new StructureView(this.world.field, this.world.buildings)
    for (const settlement of this.world.settlements.values()) {
      structures.addLabel(
        settlement.label,
        settlement.x,
        settlement.z,
        this.world.field.sample(settlement.x, settlement.z) + 13,
      )
    }
    this.viewport.scene.add(structures.group)

    this.bridges = new BridgeView(this.world.grid)
    this.viewport.scene.add(this.bridges.group)

    this.markers = new Markers()
    this.viewport.scene.add(this.markers.group)

    this.tools = new ToolBelt(this.world, this.player)
    this.hud = new Hud(uiRoot)
    this.buildPanel = new BuildPanel(uiRoot)

    // Tiles that are staked but not yet built are tinted in the terrain itself.
    this.terrainMesh.setOverlay((tx, tz) =>
      this.world.plannedTileKeys.has(tileKey(tx, tz)) ? UNDER_CONSTRUCTION_COLOR : null,
    )

    const spawn = this.world.layout.farmVillage
    this.player.spawnLookingAt(spawn.x + 34, spawn.z + 26, spawn.x, spawn.z)
    document.addEventListener('keydown', this.onKeyDown)
    this.world.log('info', '谷に着いた。鉱山村は食料が尽きかけている。')
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    const clock = this.world.clock
    if (event.code === 'Space') {
      event.preventDefault()
      if (clock.paused) clock.speed = this.previousSpeed
      else {
        this.previousSpeed = clock.speed
        clock.speed = 0
      }
      return
    }
    const index = SPEED_STEPS.indexOf(clock.speed)
    if (event.code === 'BracketRight' && index < SPEED_STEPS.length - 1) {
      clock.speed = SPEED_STEPS[index + 1]
      this.previousSpeed = clock.speed
    }
    if (event.code === 'BracketLeft' && index > 1) {
      clock.speed = SPEED_STEPS[index - 1]
      this.previousSpeed = clock.speed
    }
  }

  start(): void {
    const loop = (now: number): void => {
      requestAnimationFrame(loop)
      const realDelta = Math.min((now - this.lastFrame) / 1000, 0.1)
      this.lastFrame = now
      this.frame(realDelta)
    }
    requestAnimationFrame(loop)
  }

  private frame(realDelta: number): void {
    this.world.playerWork = {
      x: this.player.position.x,
      z: this.player.position.z,
      active: this.tools.tool === ToolId.Work && this.tools.working,
    }

    const steps = this.world.clock.frame(realDelta)
    for (let i = 0; i < steps; i++) this.world.step(SIM_DT)

    this.player.update(realDelta)
    this.tools.update()

    let bridgeChanged = false
    for (const [tx, tz] of this.world.consumeDirtyTiles()) {
      this.terrainMesh.markTileDirty(tx, tz)
      if (this.world.grid.isBridge(tx, tz)) bridgeChanged = true
    }
    if (bridgeChanged) this.bridges.rebuild()
    this.terrainMesh.update()

    this.markers.setAim(this.tools.tool === ToolId.Stake ? this.tools.aim : null)
    this.markers.update(this.tools.preview, this.tools.stakes, (tile) =>
      tileSurfaceHeight(this.world.field, this.world.grid, tile.tx, tile.tz),
    )

    this.viewport.camera.position.copy(this.player.position)
    this.player.lookDirection(this.lookDirection)
    this.viewport.camera.lookAt(
      this.player.position.x + this.lookDirection.x,
      this.player.position.y + this.lookDirection.y,
      this.player.position.z + this.lookDirection.z,
    )
    this.viewport.updateDayCycle(this.world.clock.dayFraction)
    this.viewport.render()
    this.hud.update(this.world, realDelta)
    this.buildPanel.update(this.world, this.tools)
  }
}
