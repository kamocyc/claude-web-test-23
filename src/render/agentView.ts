import * as THREE from 'three'
import { AgentKind, AgentState, type Agent } from '../sim/agents'
import { RESOURCE_INFO, type Resource } from '../sim/resources'
import { VehicleType } from '../sim/vehicles'

/** How far away a villager's business is still legible. */
const LABEL_DISTANCE = 62

const STATE_LABELS: Partial<Record<AgentState, string>> = {
  [AgentState.ToPickup]: '積みに行く',
  [AgentState.Loading]: '積み込み',
  [AgentState.Unloading]: '荷降ろし',
  [AgentState.ToSite]: '現場へ',
  [AgentState.Working]: '施工中',
  [AgentState.Returning]: '帰り道',
}

/** What this person is doing, in as few characters as possible. */
const activityText = (agent: Agent): string | null => {
  if (agent.cargoResource !== null && agent.cargoAmount > 0) {
    const info = RESOURCE_INFO[agent.cargoResource]
    return `${info.label} ${Math.round(agent.cargoAmount)}${info.unit}`
  }
  if (agent.state === AgentState.ToDropoff) return '輸送中'
  if (agent.explain.stuck) return '足止め'
  return STATE_LABELS[agent.state] ?? null
}

const labelTextures = new Map<string, THREE.Texture>()

/** One texture per distinct caption, shared by everyone showing it. */
const labelTexture = (text: string): THREE.Texture => {
  const cached = labelTextures.get(text)
  if (cached) return cached
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = 'rgba(14, 17, 22, 0.66)'
    ctx.beginPath()
    ctx.roundRect(4, 10, 248, 44, 10)
    ctx.fill()
    ctx.fillStyle = '#eef2f6'
    ctx.font = '600 30px "Hiragino Sans", "Noto Sans JP", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 128, 33)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  labelTextures.set(text, texture)
  return texture
}

const CARGO_COLORS: Record<Resource, number> = {
  0: 0xd8c86a, // wheat
  1: 0xd98f5a, // food
  2: 0x8a8f96, // iron ore
  3: 0xb9c4cf, // tools
  4: 0x8a6a42, // timber
  5: 0x9b9890, // stone
}

interface AgentVisual {
  readonly group: THREE.Group
  readonly cargo: THREE.Mesh
  readonly label: THREE.Sprite
  /** Caption currently on the sprite, so the texture is only swapped on change. */
  text: string | null
}

const buildPorter = (color: number): AgentVisual => {
  const group = new THREE.Group()
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 1.1, 0.35),
    new THREE.MeshLambertMaterial({ color }),
  )
  body.position.y = 0.85
  group.add(body)
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.3, 0.3),
    new THREE.MeshLambertMaterial({ color: 0xd8b48c }),
  )
  head.position.y = 1.55
  group.add(head)
  const cargo = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 0.4, 0.3),
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
  )
  cargo.position.set(0, 1.15, -0.3)
  cargo.visible = false
  group.add(cargo)
  return { group, cargo, label: buildLabel(2.5), text: null }
}

const buildLabel = (height: number): THREE.Sprite => {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ transparent: true, depthTest: true, depthWrite: false }),
  )
  sprite.scale.set(3.6, 0.9, 1)
  sprite.position.y = height
  sprite.visible = false
  sprite.renderOrder = 4
  return sprite
}

const buildCart = (): AgentVisual => {
  const group = new THREE.Group()
  const puller = buildPorter(0x6f7f5a)
  group.add(puller.group)

  const bed = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 0.35, 1.9),
    new THREE.MeshLambertMaterial({ color: 0x7a5a38 }),
  )
  bed.position.set(0, 0.75, -1.5)
  group.add(bed)

  const wheelGeometry = new THREE.CylinderGeometry(0.45, 0.45, 0.14, 10)
  const wheelMaterial = new THREE.MeshLambertMaterial({ color: 0x4b3826 })
  for (const side of [-0.72, 0.72]) {
    const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial)
    wheel.rotation.z = Math.PI / 2
    wheel.position.set(side, 0.45, -1.6)
    group.add(wheel)
  }

  const cargo = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.6, 1.5),
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
  )
  cargo.position.set(0, 1.2, -1.5)
  cargo.visible = false
  group.add(cargo)
  return { group, cargo, label: buildLabel(2.7), text: null }
}

/** Draws every hauler and builder, and shows what they are carrying. */
export class AgentView {
  readonly group = new THREE.Group()
  private readonly visuals = new Map<number, AgentVisual>()

  update(agents: readonly Agent[], camera: THREE.Vector3): void {
    for (const agent of agents) {
      let visual = this.visuals.get(agent.id)
      if (!visual) {
        visual =
          agent.vehicleType === VehicleType.Handcart
            ? buildCart()
            : buildPorter(agent.kind === AgentKind.Builder ? 0x5b6d86 : 0x8a7a5c)
        visual.group.add(visual.label)
        this.visuals.set(agent.id, visual)
        this.group.add(visual.group)
      }

      visual.group.position.set(agent.x, agent.y, agent.z)
      visual.group.rotation.y = agent.heading
      visual.group.visible = agent.state !== AgentState.Idle || agent.kind === AgentKind.Hauler

      this.updateLabel(visual, agent, camera)

      const carrying = agent.cargoResource !== null && agent.cargoAmount > 0
      visual.cargo.visible = carrying
      if (carrying && agent.cargoResource !== null) {
        const material = visual.cargo.material as THREE.MeshLambertMaterial
        material.color.setHex(CARGO_COLORS[agent.cargoResource])
        const fill = Math.min(
          1,
          (agent.cargoAmount * RESOURCE_INFO[agent.cargoResource].weight) /
            Math.max(1, agent.vehicle.capacityKg),
        )
        visual.cargo.scale.set(1, 0.35 + fill * 0.65, 1)
      }
    }
  }

  /** Show what this person is up to, but only when close enough to read. */
  private updateLabel(visual: AgentVisual, agent: Agent, camera: THREE.Vector3): void {
    const near = Math.hypot(agent.x - camera.x, agent.z - camera.z) < LABEL_DISTANCE
    const text = near && visual.group.visible ? activityText(agent) : null
    if (text !== visual.text) {
      visual.text = text
      const material = visual.label.material as THREE.SpriteMaterial
      if (text) {
        material.map = labelTexture(text)
        material.needsUpdate = true
      }
    }
    visual.label.visible = text !== null
  }
}
