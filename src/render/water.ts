import * as THREE from 'three'
import type { Heightfield } from '../world/heightfield'
import { TILE_SIZE } from '../world/heightfield'
import { TerrainSurface, type TileGrid } from '../world/tileGrid'

const vertexShader = /* glsl */ `
  uniform float uTime;
  attribute float depth;
  varying float vDepth;
  varying vec3 vWorld;
  #include <fog_pars_vertex>

  void main() {
    vDepth = depth;
    vec3 transformed = position;
    // Two crossing swells plus a fine chop; deep water moves more than the shallows.
    float wave =
      sin(transformed.x * 0.55 + uTime * 1.3) * 0.055 +
      sin(transformed.z * 0.41 - uTime * 1.0) * 0.045 +
      sin((transformed.x + transformed.z) * 1.1 + uTime * 2.1) * 0.018;
    transformed.y += wave * clamp(depth * 0.6, 0.12, 1.0);
    vWorld = transformed;

    vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform float uTime;
  uniform float uLight;
  varying float vDepth;
  varying vec3 vWorld;
  #include <common>
  #include <fog_pars_fragment>

  void main() {
    float t = clamp(vDepth / 3.0, 0.0, 1.0);
    vec3 color = mix(uShallow, uDeep, t);

    // Glints where the two wave trains meet.
    float ripple = sin(vWorld.x * 2.2 + uTime * 1.9) * sin(vWorld.z * 1.7 - uTime * 1.5);
    color += vec3(0.07, 0.08, 0.09) * smoothstep(0.5, 1.0, ripple);

    gl_FragColor = vec4(color * uLight, mix(0.42, 0.88, t));
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`

export interface WaterSurface {
  readonly mesh: THREE.Mesh
  /** Advance the swell, and match the water's brightness to the sky. */
  update(elapsed: number, daylight: number): void
}

/**
 * The river: one mesh built from the tiles it covers, with the depth of each
 * corner baked in so the shallows read as shallow - which is the whole point of
 * a ford you can walk and a channel you cannot.
 */
export const buildWaterSurface = (field: Heightfield, grid: TileGrid): WaterSurface => {
  const positions: number[] = []
  const depths: number[] = []

  const corner = (tx: number, tz: number, level: number, x: number, z: number): void => {
    positions.push(x, level, z)
    depths.push(Math.max(0, level - field.sample(x, z)))
    void tx
    void tz
  }

  for (let tz = 0; tz < grid.size; tz++) {
    for (let tx = 0; tx < grid.size; tx++) {
      const i = grid.index(tx, tz)
      if (grid.terrain[i] !== TerrainSurface.Water) continue
      const y = grid.waterLevel[i]
      const x0 = tx * TILE_SIZE
      const z0 = tz * TILE_SIZE
      const x1 = x0 + TILE_SIZE
      const z1 = z0 + TILE_SIZE
      corner(tx, tz, y, x0, z0)
      corner(tx, tz, y, x1, z0)
      corner(tx, tz, y, x1, z1)
      corner(tx, tz, y, x0, z0)
      corner(tx, tz, y, x1, z1)
      corner(tx, tz, y, x0, z1)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('depth', new THREE.Float32BufferAttribute(depths, 1))

  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color(0x6f9bb0) },
      uDeep: { value: new THREE.Color(0x27455c) },
      uLight: { value: 1 },
    },
  ])

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    fog: true,
    side: THREE.DoubleSide,
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.renderOrder = 2
  mesh.frustumCulled = false

  return {
    mesh,
    update(elapsed: number, daylight: number): void {
      material.uniforms.uTime.value = elapsed
      material.uniforms.uLight.value = 0.28 + daylight * 0.72
    },
  }
}
