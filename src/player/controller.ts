import * as THREE from 'three'
import { clamp } from '../core/math'
import type { Heightfield } from '../world/heightfield'
import { WORLD_SIZE, worldToTile } from '../world/heightfield'
import { RoadSurface, type TileGrid } from '../world/tileGrid'
import { canStandOn, surfaceHeightAt, wadeDepthAt } from '../world/surface'

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

  /** Detach global listeners so a replaced controller cannot double-handle input. */
  dispose(): void {
    document.removeEventListener('keydown', this.onKeyDown)
    document.removeEventListener('keyup', this.onKeyUp)
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
    document.removeEventListener('mousemove', this.onMouseMove)
  }

  requestLock(): void {
    this.domElement.requestPointerLock()
  }

  spawnAt(x: number, z: number, facing = 0): void {
    this.position.set(x, this.surfaceAt(x, z) + EYE_HEIGHT, z)
    this.yaw = facing
  }

  /** What the player is standing on here: the ground, or a bridge deck over it. */
  private surfaceAt(x: number, z: number): number {
    return surfaceHeightAt(this.field, this.grid, x, z)
  }

  /** Drop the player at (x, z) already looking at a point of interest. */
  spawnLookingAt(x: number, z: number, targetX: number, targetZ: number): void {
    this.spawnAt(x, z, Math.atan2(-(targetX - x), -(targetZ - z)))
  }

  /** Position and facing, as the map wants them. */
  mapPose(): { x: number; z: number; yaw: number } {
    return { x: this.position.x, z: this.position.z, yaw: this.yaw }
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

    const surface = this.surfaceAt(this.position.x, this.position.z)
    const depth = this.waterDepthHere()
    this.wadeDepth = depth
    this.position.y = surface + EYE_HEIGHT - Math.min(depth, 1.1) * 0.5
  }

  /** Zero on a bridge: the whole point of the deck is to stay out of the river. */
  private waterDepthHere(): number {
    return wadeDepthAt(
      this.field,
      this.grid,
      worldToTile(this.position.x),
      worldToTile(this.position.z),
    )
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
    // Deep water is a real barrier - unless a deck has been built over it.
    return canStandOn(
      this.field,
      this.grid,
      worldToTile(x),
      worldToTile(z),
      this.surfaceAt(this.position.x, this.position.z),
    )
  }
}
