import * as THREE from 'three'
import { gradeBand, type RoadPlan } from '../roads/buildability'
import { TILE_SIZE, tileToWorld } from '../world/heightfield'
import type { TilePos } from '../roads/tileLine'

const BAND_COLORS = {
  easy: new THREE.Color(0x62d16f),
  hard: new THREE.Color(0xe8c261),
  cartsBlocked: new THREE.Color(0xe07a72),
  blocked: new THREE.Color(0x9c2f2f),
}

const MAX_STAKES = 48

/**
 * Draws the surveyor's marks: stakes, the rope between them, and a ribbon along
 * the planned road coloured by whether a loaded cart could actually use it.
 */
export class Markers {
  readonly group = new THREE.Group()
  private readonly stakeMeshes: THREE.Mesh[] = []
  private readonly ribbon: THREE.Mesh
  private readonly aimRing: THREE.Mesh
  private signature = ''

  constructor() {
    const stakeGeometry = new THREE.CylinderGeometry(0.09, 0.09, 1.7, 6)
    const stakeMaterial = new THREE.MeshLambertMaterial({ color: 0xe8d9a8 })
    for (let i = 0; i < MAX_STAKES; i++) {
      const mesh = new THREE.Mesh(stakeGeometry, stakeMaterial)
      mesh.visible = false
      this.stakeMeshes.push(mesh)
      this.group.add(mesh)
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(0), 3))
    this.ribbon = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    )
    this.ribbon.renderOrder = 3
    this.group.add(this.ribbon)

    this.aimRing = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.75, 20),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }),
    )
    this.aimRing.rotation.x = -Math.PI / 2
    this.aimRing.renderOrder = 3
    this.aimRing.visible = false
    this.group.add(this.aimRing)
  }

  setAim(hit: { x: number; y: number; z: number } | null): void {
    this.aimRing.visible = hit !== null
    if (hit) this.aimRing.position.set(hit.x, hit.y + 0.12, hit.z)
  }

  update(plan: RoadPlan | null, stakes: readonly TilePos[], stakeHeight: (t: TilePos) => number): void {
    const signature = plan
      ? `${plan.spec.id}:${plan.tiles.length}:${plan.tiles[plan.tiles.length - 1]?.tx},${plan.tiles[plan.tiles.length - 1]?.tz}:${stakes.length}:${plan.buildable}`
      : `none:${stakes.length}`
    if (signature === this.signature) {
      this.updateStakes(stakes, stakeHeight)
      return
    }
    this.signature = signature
    this.updateStakes(stakes, stakeHeight)
    this.updateRibbon(plan)
  }

  private updateStakes(stakes: readonly TilePos[], stakeHeight: (t: TilePos) => number): void {
    for (let i = 0; i < this.stakeMeshes.length; i++) {
      const mesh = this.stakeMeshes[i]
      const stake = stakes[i]
      mesh.visible = stake !== undefined
      if (!stake) continue
      mesh.position.set(tileToWorld(stake.tx), stakeHeight(stake) + 0.85, tileToWorld(stake.tz))
    }
  }

  private updateRibbon(plan: RoadPlan | null): void {
    if (!plan || plan.tiles.length < 2) {
      this.ribbon.visible = false
      return
    }
    this.ribbon.visible = true

    const positions: number[] = []
    const colors: number[] = []
    const half = 1.1

    for (const segment of plan.segments) {
      const band = segment.problem
        ? BAND_COLORS.blocked
        : BAND_COLORS[gradeBand(Math.max(Math.abs(segment.grade), segment.worstLocalGrade))]
      for (let i = 1; i < segment.tiles.length; i++) {
        const a = segment.tiles[i - 1]
        const b = segment.tiles[i]
        const ax = tileToWorld(a.tx)
        const az = tileToWorld(a.tz)
        const bx = tileToWorld(b.tx)
        const bz = tileToWorld(b.tz)
        const dx = bx - ax
        const dz = bz - az
        const length = Math.hypot(dx, dz) || TILE_SIZE
        const px = (-dz / length) * half
        const pz = (dx / length) * half
        const ay = a.targetHeight + 0.18
        const by = b.targetHeight + 0.18

        positions.push(
          ax + px, ay, az + pz,
          bx + px, by, bz + pz,
          bx - px, by, bz - pz,
          ax + px, ay, az + pz,
          bx - px, by, bz - pz,
          ax - px, ay, az - pz,
        )
        for (let v = 0; v < 6; v++) colors.push(band.r, band.g, band.b)
      }
    }

    this.ribbon.geometry.dispose()
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    this.ribbon.geometry = geometry
  }
}
