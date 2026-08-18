import * as THREE from 'three'
import { clamp01, lerp } from '../core/math'
import { WORLD_SIZE } from '../world/heightfield'

const DAY_SKY = new THREE.Color(0x8fb6d6)
const NIGHT_SKY = new THREE.Color(0x0d1524)
const DUSK_SKY = new THREE.Color(0xd2895a)

/** Scene, camera, lights and the day/night cycle that drives them. */
export class Viewport {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  private readonly sun: THREE.DirectionalLight
  private readonly ambient: THREE.HemisphereLight
  private readonly skyColor = new THREE.Color()

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.shadowMap.enabled = false
    container.appendChild(this.renderer.domElement)

    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 900)
    this.scene.fog = new THREE.Fog(DAY_SKY.getHex(), 140, 620)

    this.ambient = new THREE.HemisphereLight(0xcfe4ff, 0x6a5c48, 0.9)
    this.scene.add(this.ambient)

    this.sun = new THREE.DirectionalLight(0xfff2d8, 1.5)
    this.sun.position.set(120, 200, 60)
    this.scene.add(this.sun)

    window.addEventListener('resize', this.handleResize)
  }

  private handleResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(window.innerWidth, window.innerHeight)
  }

  /** dayFraction: 0 = midnight, 0.5 = noon. */
  updateDayCycle(dayFraction: number): void {
    const sunAngle = (dayFraction - 0.25) * Math.PI * 2
    const height = Math.sin(sunAngle)
    const daylight = clamp01(height * 1.6 + 0.18)
    const duskness = clamp01(1 - Math.abs(height) * 4.5) * clamp01(0.5 + height * 3)

    this.sun.position.set(
      Math.cos(sunAngle) * 300 + WORLD_SIZE * 0.5,
      Math.max(height, -0.2) * 320,
      120,
    )
    this.sun.intensity = lerp(0.05, 1.55, daylight)
    this.ambient.intensity = lerp(0.28, 0.95, daylight)

    this.skyColor.copy(NIGHT_SKY).lerp(DAY_SKY, daylight)
    this.skyColor.lerp(DUSK_SKY, duskness * 0.6)
    this.scene.background = this.skyColor
    if (this.scene.fog) (this.scene.fog as THREE.Fog).color.copy(this.skyColor)
  }

  render(): void {
    this.renderer.render(this.scene, this.camera)
  }
}
