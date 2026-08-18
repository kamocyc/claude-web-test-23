import * as THREE from 'three'
import { AgentKind, AgentState, type Agent } from '../sim/agents'
import { RESOURCE_INFO, type Resource } from '../sim/resources'
import { VehicleType } from '../sim/vehicles'

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
  return { group, cargo }
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
  return { group, cargo }
}

/** Draws every hauler and builder, and shows what they are carrying. */
export class AgentView {
  readonly group = new THREE.Group()
  private readonly visuals = new Map<number, AgentVisual>()

  update(agents: readonly Agent[]): void {
    for (const agent of agents) {
      let visual = this.visuals.get(agent.id)
      if (!visual) {
        visual =
          agent.vehicleType === VehicleType.Handcart
            ? buildCart()
            : buildPorter(agent.kind === AgentKind.Builder ? 0x5b6d86 : 0x8a7a5c)
        this.visuals.set(agent.id, visual)
        this.group.add(visual.group)
      }

      visual.group.position.set(agent.x, agent.y, agent.z)
      visual.group.rotation.y = agent.heading
      visual.group.visible = agent.state !== AgentState.Idle || agent.kind === AgentKind.Hauler

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
}
