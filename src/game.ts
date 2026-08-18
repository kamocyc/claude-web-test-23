import * as THREE from 'three'
import { SIM_DT } from './core/clock'
import { PlayerController } from './player/controller'
import { Viewport } from './render/renderer'
import { TerrainMesh } from './render/terrainMesh'
import { buildWaterMesh } from './render/water'
import { World } from './sim/world'

/** Wires the headless simulation to rendering, input and UI. */
export class Game {
  readonly world: World
  readonly viewport: Viewport
  readonly player: PlayerController
  readonly terrainMesh: TerrainMesh

  private lastFrame = performance.now()
  private readonly lookDirection = new THREE.Vector3()

  constructor(container: HTMLElement, seed?: number) {
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
    const spawn = this.world.layout.farmVillage
    this.player.spawnAt(spawn.x + 14, spawn.z + 6, -Math.PI * 0.5)
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
    const steps = this.world.clock.frame(realDelta)
    for (let i = 0; i < steps; i++) this.world.step(SIM_DT)

    this.player.update(realDelta)

    for (const [tx, tz] of this.world.consumeDirtyTiles()) {
      this.terrainMesh.markTileDirty(tx, tz)
    }
    this.terrainMesh.update()

    this.viewport.camera.position.copy(this.player.position)
    this.player.lookDirection(this.lookDirection)
    this.viewport.camera.lookAt(
      this.player.position.x + this.lookDirection.x,
      this.player.position.y + this.lookDirection.y,
      this.player.position.z + this.lookDirection.z,
    )
    this.viewport.updateDayCycle(this.world.clock.dayFraction)
    this.viewport.render()
  }
}
