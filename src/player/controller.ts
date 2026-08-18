import * as THREE from 'three'
import { clamp } from '../core/math'
import type { Heightfield } from '../world/heightfield'
import { WORLD_SIZE, worldToTile } from '../world/heightfield'
import { RoadSurface, type TileGrid } from '../world/tileGrid'
import { waterDepthAt } from '../world/terrainGen'

const EYE_HEIGHT = 1.7
const WALK_SPEED = 4.6
const SPRINT_MULTIPLIER = 1.9
const MOUSE_SENSITIVITY = 0.0022

/** First-person walker. Follows the ground, wades shallow water, refuses deep water. */
export class PlayerController {
  readonly position = new THREE.Vector3()
  yaw = 0
  pitch = 0
  /** Metres of water the player is standing in. */
  wadeDepth = 0
  locked = false

  private readonly keys = new Set<string>()
  private readonly forward = new THREE.Vector3()
  private readonly right = new THREE.Vector3()

  constructor(
    private readonly field: Heightfield,
    private readonly grid: TileGrid,
    private readonly domElement: HTMLElement,
  ) {
    document.addEventListener('keydown', this.onKeyDown)
    document.addEventListener('keyup', this.onKeyUp)
    document.addEventListener('pointerlockchange', this.onPointerLockChange)
    document.addEventListener('mousemove', this.onMouseMove)
  }

  requestLock(): void {
    this.domElement.requestPointerLock()
  }

  spawnAt(x: number, z: number, facing = 0): void {
    this.position.set(x, this.field.sample(x, z) + EYE_HEIGHT, z)
    this.yaw = facing
  }

  /** Drop the player at (x, z) already looking at a point of interest. */
  spawnLookingAt(x: number, z: number, targetX: number, targetZ: number): void {
    this.spawnAt(x, z, Math.atan2(-(targetX - x), -(targetZ - z)))
  }

  isDown(code: string): boolean {
    return this.keys.has(code)
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    this.keys.add(event.code)
  }

  private onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code)
  }

  private onPointerLockChange = (): void => {
    this.locked = document.pointerLockElement === this.domElement
    if (!this.locked) this.keys.clear()
  }

  private onMouseMove = (event: MouseEvent): void => {
    if (!this.locked) return
    this.yaw -= event.movementX * MOUSE_SENSITIVITY
    this.pitch = clamp(this.pitch - event.movementY * MOUSE_SENSITIVITY, -1.45, 1.45)
  }

  /** Unit vector the player is looking along. */
  lookDirection(target = new THREE.Vector3()): THREE.Vector3 {
    const cosPitch = Math.cos(this.pitch)
    return target.set(-Math.sin(this.yaw) * cosPitch, Math.sin(this.pitch), -Math.cos(this.yaw) * cosPitch)
  }

  update(dt: number): void {
    let moveX = 0
    let moveZ = 0
    if (this.isDown('KeyW')) moveZ += 1
    if (this.isDown('KeyS')) moveZ -= 1
    if (this.isDown('KeyA')) moveX -= 1
    if (this.isDown('KeyD')) moveX += 1

    if (moveX !== 0 || moveZ !== 0) {
      const length = Math.hypot(moveX, moveZ)
      moveX /= length
      moveZ /= length

      this.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
      this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw))

      const tx = worldToTile(this.position.x)
      const tz = worldToTile(this.position.z)
      const onRoad = this.grid.roadSurface[this.grid.index(tx, tz)] !== RoadSurface.None
      let speed = WALK_SPEED * (onRoad ? 1.25 : 1)
      if (this.isDown('ShiftLeft') || this.isDown('ShiftRight')) speed *= SPRINT_MULTIPLIER
      speed /= 1 + this.wadeDepth * 1.6

      const stepX = (this.forward.x * moveZ + this.right.x * moveX) * speed * dt
      const stepZ = (this.forward.z * moveZ + this.right.z * moveX) * speed * dt
      this.tryMove(stepX, stepZ)
    }

    const ground = this.field.sample(this.position.x, this.position.z)
    const depth = this.waterDepthHere()
    this.wadeDepth = depth
    this.position.y = ground + EYE_HEIGHT - Math.min(depth, 1.1) * 0.5
  }

  private waterDepthHere(): number {
    const tx = worldToTile(this.position.x)
    const tz = worldToTile(this.position.z)
    return waterDepthAt(this.field, this.grid, tx, tz)
  }

  /** Slide along blockers instead of sticking to them. */
  private tryMove(stepX: number, stepZ: number): void {
    if (this.canStand(this.position.x + stepX, this.position.z)) this.position.x += stepX
    if (this.canStand(this.position.x, this.position.z + stepZ)) this.position.z += stepZ
    this.position.x = clamp(this.position.x, 1, WORLD_SIZE - 1)
    this.position.z = clamp(this.position.z, 1, WORLD_SIZE - 1)
  }

  private canStand(x: number, z: number): boolean {
    if (x < 1 || z < 1 || x > WORLD_SIZE - 1 || z > WORLD_SIZE - 1) return false
    const tx = worldToTile(x)
    const tz = worldToTile(z)
    if (this.grid.blocked[this.grid.index(tx, tz)] === 1) return false
    // Deep water is a real barrier: this is why the ford and the bridge matter.
    if (!this.grid.isBridge(tx, tz) && waterDepthAt(this.field, this.grid, tx, tz) > 1.3) return false
    return true
  }
}
