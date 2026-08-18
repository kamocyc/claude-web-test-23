import { clamp } from '../core/math'
import { ROAD_COLORS, TERRAIN_COLORS, UNDER_CONSTRUCTION_COLOR, type Rgb } from '../render/palette'
import { tileKey } from '../roads/tileLine'
import { PLACED_BUILDING_ID_BASE, type World } from '../sim/world'
import { GRID_SIZE, WORLD_SIZE } from '../world/heightfield'
import { RoadSurface, TerrainSurface } from '../world/tileGrid'

/** Ground the player has never been near: on the map it is simply not there. */
const FOG: Rgb = { r: 0.043, g: 0.055, b: 0.07 }
const BUILDING_COLOR: Rgb = { r: 0.78, g: 0.71, b: 0.53 }

/** Seconds between redraws while the map is open. The DOM is not the frame budget. */
const REDRAW_INTERVAL = 0.2

const byte = (value: number): number => Math.round(clamp(value, 0, 1) * 255)

/**
 * The map the player draws for themselves.
 *
 * It is not a satellite view: a tile appears only once the player has walked
 * close enough to see it, so the map is a record of where they have been and
 * of the roads they left behind.
 */
export class MapView {
  visible = false

  private readonly overlay: HTMLElement
  private readonly canvas: HTMLCanvasElement
  private readonly caption: HTMLElement
  private readonly tiles: HTMLCanvasElement
  private readonly tileImage: ImageData
  private accumulator = REDRAW_INTERVAL

  constructor(root: HTMLElement) {
    this.overlay = document.createElement('div')
    this.overlay.id = 'map-overlay'
    this.overlay.style.display = 'none'

    this.canvas = document.createElement('canvas')
    this.canvas.id = 'map-canvas'

    this.caption = document.createElement('div')
    this.caption.id = 'map-caption'

    const box = document.createElement('div')
    box.id = 'map-box'
    box.append(this.canvas, this.caption)
    this.overlay.appendChild(box)
    root.appendChild(this.overlay)

    this.tiles = document.createElement('canvas')
    this.tiles.width = GRID_SIZE
    this.tiles.height = GRID_SIZE
    const context = this.tiles.getContext('2d')
    if (!context) throw new Error('map needs a 2d canvas')
    this.tileImage = context.createImageData(GRID_SIZE, GRID_SIZE)
  }

  toggle(): void {
    this.visible = !this.visible
    this.overlay.style.display = this.visible ? 'grid' : 'none'
    // The crosshair aims at the world, not at the map.
    const crosshair = document.getElementById('crosshair')
    if (crosshair) crosshair.style.display = this.visible ? 'none' : 'block'
    this.accumulator = REDRAW_INTERVAL
  }

  update(world: World, player: { x: number; z: number; yaw: number }, realDelta: number): void {
    if (!this.visible) return
    this.accumulator += realDelta
    if (this.accumulator < REDRAW_INTERVAL) return
    this.accumulator = 0
    this.draw(world, player)
  }

  private draw(world: World, player: { x: number; z: number; yaw: number }): void {
    const side = Math.round(Math.min(window.innerWidth, window.innerHeight) * 0.78)
    if (this.canvas.width !== side) {
      this.canvas.width = side
      this.canvas.height = side
    }
    const ctx = this.canvas.getContext('2d')
    if (!ctx) return

    this.paintTiles(world)
    const tileContext = this.tiles.getContext('2d')
    if (tileContext) tileContext.putImageData(this.tileImage, 0, 0)

    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, side, side)
    ctx.drawImage(this.tiles, 0, 0, side, side)

    const toPixel = (value: number): number => (value / WORLD_SIZE) * side
    this.paintMarkers(ctx, world, toPixel)
    this.paintPlayer(ctx, player, toPixel)
    this.paintScale(ctx, side)

    const explored = world.explored.reduce((total, value) => total + value, 0)
    this.caption.innerHTML = `<span class="key">M</span> 閉じる　踏破 ${Math.round(
      (explored / (GRID_SIZE * GRID_SIZE)) * 100,
    )}%　<span class="muted">歩いたところだけが地図になる</span>`
  }

  /** One pixel per tile: terrain, water, road, and work still to do. */
  private paintTiles(world: World): void {
    const grid = world.grid
    const data = this.tileImage.data
    for (let tz = 0; tz < GRID_SIZE; tz++) {
      for (let tx = 0; tx < GRID_SIZE; tx++) {
        const index = grid.index(tx, tz)
        const pixel = index * 4
        if (world.explored[index] !== 1) {
          data[pixel] = byte(FOG.r)
          data[pixel + 1] = byte(FOG.g)
          data[pixel + 2] = byte(FOG.b)
          data[pixel + 3] = 255
          continue
        }

        const surface = grid.roadSurface[index] as RoadSurface
        let color: Rgb
        if (surface !== RoadSurface.None) color = ROAD_COLORS[surface]
        else if (world.plannedTileKeys.has(tileKey(tx, tz))) color = UNDER_CONSTRUCTION_COLOR
        else if (grid.structure[index] >= 0) color = BUILDING_COLOR
        else color = TERRAIN_COLORS[grid.terrain[index] as TerrainSurface] ?? TERRAIN_COLORS[0]

        // A cheap hillshade so the valley, the ridge and the gorge read at a glance.
        const here = world.field.tileHeight(tx, tz)
        const behind = world.field.tileHeight(Math.max(0, tx - 1), Math.max(0, tz - 1))
        const light = clamp(1 + (here - behind) * 0.16, 0.55, 1.45)
        data[pixel] = byte(color.r * light)
        data[pixel + 1] = byte(color.g * light)
        data[pixel + 2] = byte(color.b * light)
        data[pixel + 3] = 255
      }
    }
  }

  private paintMarkers(
    ctx: CanvasRenderingContext2D,
    world: World,
    toPixel: (value: number) => number,
  ): void {
    const seen = (x: number, z: number): boolean =>
      world.isExplored(Math.floor(x / 2), Math.floor(z / 2))

    ctx.font = '600 13px "Hiragino Sans", "Noto Sans JP", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'

    for (const site of world.sites) {
      if (!seen(site.x, site.z)) continue
      this.dot(ctx, toPixel(site.x), toPixel(site.z), 4, '#e8c261')
    }
    for (const site of world.structureSites) {
      if (!seen(site.x, site.z)) continue
      this.dot(ctx, toPixel(site.x), toPixel(site.z), 4, '#e8c261')
    }
    for (const building of world.buildings) {
      if (building.id < PLACED_BUILDING_ID_BASE || !seen(building.x, building.z)) continue
      this.dot(ctx, toPixel(building.x), toPixel(building.z), 3.5, '#d8c9a4')
    }
    if (world.bandits.active && seen(world.layout.banditCamp.x, world.layout.banditCamp.z)) {
      this.dot(ctx, toPixel(world.layout.banditCamp.x), toPixel(world.layout.banditCamp.z), 4.5, '#e8807a')
    }

    for (const settlement of world.settlements.values()) {
      if (!seen(settlement.x, settlement.z)) continue
      const px = toPixel(settlement.x)
      const pz = toPixel(settlement.z)
      this.dot(ctx, px, pz, 5.5, '#f2f5f8')
      ctx.fillStyle = 'rgba(10, 13, 18, 0.75)'
      const width = ctx.measureText(settlement.label).width + 10
      ctx.fillRect(px - width / 2, pz - 24, width, 17)
      ctx.fillStyle = '#f2f5f8'
      ctx.fillText(settlement.label, px, pz - 10)
    }
  }

  private paintPlayer(
    ctx: CanvasRenderingContext2D,
    player: { x: number; z: number; yaw: number },
    toPixel: (value: number) => number,
  ): void {
    const px = toPixel(player.x)
    const pz = toPixel(player.z)
    // Map x runs east and map y runs south, which is exactly how the world is laid out.
    const dirX = -Math.sin(player.yaw)
    const dirZ = -Math.cos(player.yaw)
    ctx.beginPath()
    ctx.moveTo(px + dirX * 9, pz + dirZ * 9)
    ctx.lineTo(px - dirZ * 5 - dirX * 5, pz + dirX * 5 - dirZ * 5)
    ctx.lineTo(px + dirZ * 5 - dirX * 5, pz - dirX * 5 - dirZ * 5)
    ctx.closePath()
    ctx.fillStyle = '#7fd18a'
    ctx.fill()
    ctx.strokeStyle = 'rgba(10, 13, 18, 0.8)'
    ctx.lineWidth = 1.5
    ctx.stroke()
  }

  private paintScale(ctx: CanvasRenderingContext2D, side: number): void {
    const metres = 100
    const length = (metres / WORLD_SIZE) * side
    const x = side - length - 18
    const y = side - 20
    ctx.strokeStyle = '#eef1f5'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + length, y)
    ctx.stroke()
    ctx.fillStyle = '#eef1f5'
    ctx.font = '12px "Hiragino Sans", "Noto Sans JP", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`${metres} m`, x + length / 2, y - 4)
    ctx.textAlign = 'left'
    ctx.fillText('N ↑', 14, 22)
  }

  private dot(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    color: string,
  ): void {
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.strokeStyle = 'rgba(10, 13, 18, 0.8)'
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
}
