import * as THREE from 'three'

// Positions are cosmetic only, so plain Math.random is fine here; the
// simulation's determinism is unaffected by what the rain looks like.
const DROPS = 2600
const AREA = 46
const HEIGHT = 26

/**
 * Rain drawn as a block of falling points that follows the camera.
 * Cheap, and it makes the reason the road is turning to mud visible.
 */
export class WeatherView {
  readonly points: THREE.Points
  private readonly velocities: Float32Array

  constructor() {
    const positions = new Float32Array(DROPS * 3)
    this.velocities = new Float32Array(DROPS)
    for (let i = 0; i < DROPS; i++) {
      positions[i * 3] = (Math.random() - 0.5) * AREA
      positions[i * 3 + 1] = Math.random() * HEIGHT
      positions[i * 3 + 2] = (Math.random() - 0.5) * AREA
      this.velocities[i] = 14 + Math.random() * 10
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    this.points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: 0xc4d8e8,
        // Fixed pixel size: drops stay fine and even instead of ballooning close up.
        size: 2,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
      }),
    )
    this.points.frustumCulled = false
    this.points.visible = false
  }

  update(intensity: number, camera: THREE.Camera, dt: number): void {
    this.points.visible = intensity > 0.05
    if (!this.points.visible) return
    const material = this.points.material as THREE.PointsMaterial
    material.opacity = 0.15 + intensity * 0.3

    this.points.position.set(camera.position.x, camera.position.y - HEIGHT * 0.5, camera.position.z)
    const positions = this.points.geometry.getAttribute('position') as THREE.BufferAttribute
    const array = positions.array as Float32Array
    for (let i = 0; i < DROPS; i++) {
      array[i * 3 + 1] -= this.velocities[i] * dt
      if (array[i * 3 + 1] < 0) array[i * 3 + 1] = HEIGHT
    }
    positions.needsUpdate = true
  }
}
