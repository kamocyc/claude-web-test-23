import * as THREE from 'three'
import { BUILDINGS, BuildingType, type Building } from '../sim/buildings'
import type { Heightfield } from '../world/heightfield'

interface Style {
  readonly wall: number
  readonly roof: number
  /** Flat-roofed structures (mine head, quarry) skip the pitched roof. */
  readonly flatRoof?: boolean
  readonly chimney?: boolean
}

const STYLES: Record<BuildingType, Style> = {
  [BuildingType.Farmhouse]: { wall: 0xc8b888, roof: 0x6b4b2f },
  [BuildingType.Kitchen]: { wall: 0xd8c9a4, roof: 0x7a4f34, chimney: true },
  [BuildingType.Woodcutter]: { wall: 0x9a7c52, roof: 0x5c4630 },
  [BuildingType.Mine]: { wall: 0x6f6a63, roof: 0x4a453f, flatRoof: true },
  [BuildingType.Smithy]: { wall: 0x8b7a66, roof: 0x53483c, chimney: true },
  [BuildingType.Quarry]: { wall: 0x8d8880, roof: 0x6a655e, flatRoof: true },
  [BuildingType.Warehouse]: { wall: 0xbfae86, roof: 0x6d5738 },
  [BuildingType.Cottage]: { wall: 0xcbb994, roof: 0x74513a },
  [BuildingType.Inn]: { wall: 0xd2bd92, roof: 0x7d5236 },
  [BuildingType.Watchtower]: { wall: 0x9b8f78, roof: 0x5a4a36 },
}

/** Builds a simple house-shaped mesh for one building. */
const buildMesh = (building: Building, groundHeight: number): THREE.Group => {
  const def = BUILDINGS[building.type]
  const style = STYLES[building.type]
  const group = new THREE.Group()

  const bodyHeight = def.height * (style.flatRoof ? 0.8 : 0.6)
  const width = def.radius * 1.5
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(width, bodyHeight, width),
    new THREE.MeshLambertMaterial({ color: style.wall }),
  )
  body.position.y = bodyHeight / 2
  group.add(body)

  if (!style.flatRoof) {
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(def.radius * 1.15, def.height * 0.45, 4),
      new THREE.MeshLambertMaterial({ color: style.roof }),
    )
    roof.position.y = bodyHeight + def.height * 0.22
    roof.rotation.y = Math.PI / 4
    group.add(roof)
  }

  if (style.chimney) {
    const chimney = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, def.height * 0.7, 0.8),
      new THREE.MeshLambertMaterial({ color: 0x5c5148 }),
    )
    chimney.position.set(width * 0.3, bodyHeight + def.height * 0.25, width * 0.3)
    group.add(chimney)
  }

  group.position.set(building.x, groundHeight, building.z)
  return group
}

/** Floating village name, so the player can orient without a map. */
const buildLabel = (text: string, x: number, y: number, z: number): THREE.Sprite => {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = 'rgba(12, 15, 20, 0.72)'
    ctx.roundRect(6, 24, 500, 80, 16)
    ctx.fill()
    ctx.fillStyle = '#f2f5f8'
    ctx.font = '600 52px "Hiragino Sans", "Noto Sans JP", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 256, 66)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }))
  sprite.scale.set(15, 3.8, 1)
  sprite.position.set(x, y, z)
  sprite.renderOrder = 5
  return sprite
}

export class StructureView {
  readonly group = new THREE.Group()
  private readonly meshes = new Map<number, THREE.Group>()

  constructor(
    private readonly field: Heightfield,
    buildings: readonly Building[],
  ) {
    for (const building of buildings) this.addBuilding(building)
  }

  addBuilding(building: Building): void {
    const mesh = buildMesh(building, this.field.sample(building.x, building.z))
    this.meshes.set(building.id, mesh)
    this.group.add(mesh)
  }

  /** Take a demolished building off the scene and give its geometry back. */
  removeBuilding(building: Building): void {
    const mesh = this.meshes.get(building.id)
    if (!mesh) return
    this.meshes.delete(building.id)
    this.group.remove(mesh)
    mesh.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose()
    })
  }

  addLabel(text: string, x: number, z: number, height: number): void {
    this.group.add(buildLabel(text, x, height, z))
  }

  /** A few dark tents and a cold fire: something the player can stumble on. */
  addBanditCamp(x: number, z: number): void {
    const group = new THREE.Group()
    const canvas = BUILD_TENT_MATERIAL
    for (const [dx, dz] of [
      [0, 0],
      [3.5, 1.5],
      [-2.5, 2.8],
    ]) {
      const tent = new THREE.Mesh(new THREE.ConeGeometry(1.8, 2.2, 4), canvas)
      tent.position.set(x + dx, this.field.sample(x + dx, z + dz) + 1.1, z + dz)
      tent.rotation.y = Math.PI / 4
      group.add(tent)
    }
    const fire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.9, 0.3, 8),
      new THREE.MeshLambertMaterial({ color: 0x2b2320 }),
    )
    fire.position.set(x + 0.8, this.field.sample(x + 0.8, z + 1.6) + 0.15, z + 1.6)
    group.add(fire)
    this.group.add(group)
  }
}

const BUILD_TENT_MATERIAL = new THREE.MeshLambertMaterial({ color: 0x4a4438 })
