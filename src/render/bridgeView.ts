import * as THREE from 'three'
import { TILE_SIZE, tileToWorld } from '../world/heightfield'
import { RoadSurface, type TileGrid } from '../world/tileGrid'

/**
 * Bridge decks sit above the terrain mesh, so they get their own geometry.
 * Rebuilt only when a bridge tile is finished, which is a rare event.
 */
export class BridgeView {
  readonly group = new THREE.Group()
  private mesh: THREE.Mesh | null = null

  constructor(private readonly grid: TileGrid) {}

  rebuild(): void {
    if (this.mesh) {
      this.group.remove(this.mesh)
      this.mesh.geometry.dispose()
      this.mesh = null
    }

    const positions: number[] = []
    const colors: number[] = []
    const timber = new THREE.Color(0x6b4f34)
    const stone = new THREE.Color(0xa5a29a)

    const pushBox = (
      cx: number,
      cy: number,
      cz: number,
      sx: number,
      sy: number,
      sz: number,
      color: THREE.Color,
    ): void => {
      const hx = sx / 2
      const hy = sy / 2
      const hz = sz / 2
      const corners = [
        [cx - hx, cy - hy, cz - hz],
        [cx + hx, cy - hy, cz - hz],
        [cx + hx, cy + hy, cz - hz],
        [cx - hx, cy + hy, cz - hz],
        [cx - hx, cy - hy, cz + hz],
        [cx + hx, cy - hy, cz + hz],
        [cx + hx, cy + hy, cz + hz],
        [cx - hx, cy + hy, cz + hz],
      ]
      const faces = [
        [0, 2, 1], [0, 3, 2],
        [4, 5, 6], [4, 6, 7],
        [0, 1, 5], [0, 5, 4],
        [3, 7, 6], [3, 6, 2],
        [0, 4, 7], [0, 7, 3],
        [1, 2, 6], [1, 6, 5],
      ]
      for (const face of faces) {
        for (const index of face) {
          positions.push(corners[index][0], corners[index][1], corners[index][2])
          colors.push(color.r, color.g, color.b)
        }
      }
    }

    for (let tz = 0; tz < this.grid.size; tz++) {
      for (let tx = 0; tx < this.grid.size; tx++) {
        const surface = this.grid.roadSurface[this.grid.index(tx, tz)] as RoadSurface
        if (surface !== RoadSurface.TimberBridge && surface !== RoadSurface.StoneBridge) continue
        const color = surface === RoadSurface.StoneBridge ? stone : timber
        const y = this.grid.deckHeight[this.grid.index(tx, tz)]
        const x = tileToWorld(tx)
        const z = tileToWorld(tz)
        pushBox(x, y - 0.2, z, TILE_SIZE, 0.4, TILE_SIZE, color)
        // Railings on both sides of the deck.
        pushBox(x - TILE_SIZE / 2 + 0.12, y + 0.4, z, 0.16, 0.8, TILE_SIZE, color)
        pushBox(x + TILE_SIZE / 2 - 0.12, y + 0.4, z, 0.16, 0.8, TILE_SIZE, color)
      }
    }

    if (positions.length === 0) return
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geometry.computeVertexNormals()
    this.mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }))
    this.group.add(this.mesh)
  }
}
