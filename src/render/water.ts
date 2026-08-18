import * as THREE from 'three'
import type { Heightfield } from '../world/heightfield'
import { TILE_SIZE } from '../world/heightfield'
import { TerrainSurface, type TileGrid } from '../world/tileGrid'

/** One static translucent surface built from the tiles the river covers. */
export const buildWaterMesh = (field: Heightfield, grid: TileGrid): THREE.Mesh => {
  const positions: number[] = []
  for (let tz = 0; tz < grid.size; tz++) {
    for (let tx = 0; tx < grid.size; tx++) {
      const i = grid.index(tx, tz)
      if (grid.terrain[i] !== TerrainSurface.Water) continue
      const y = grid.waterLevel[i]
      const x0 = tx * TILE_SIZE
      const z0 = tz * TILE_SIZE
      const x1 = x0 + TILE_SIZE
      const z1 = z0 + TILE_SIZE
      positions.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z0, x1, y, z1, x0, y, z1)
    }
  }
  void field
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  const material = new THREE.MeshLambertMaterial({
    color: 0x3d6b86,
    transparent: true,
    opacity: 0.78,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.renderOrder = 1
  return mesh
}
