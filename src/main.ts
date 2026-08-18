import './ui/style.css'
import { Game } from './game'
import type { SpeedStep } from './core/clock'
import { loadFromStorage, saveToStorage } from './sim/save'
import type { World } from './sim/world'

const container = document.getElementById('app')
if (!container) throw new Error('missing #app container')

const overlay = document.createElement('div')
overlay.id = 'start-overlay'
overlay.innerHTML = `
  <div class="box">
    <h1>道が町を作る</h1>
    <p>谷には農村と鉱山村がある。川は荷車を通さない。</p>
    <p><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 移動 / <kbd>Shift</kbd> 走る / マウス 視点</p>
    <p><kbd>F5</kbd> 保存 / <kbd>F9</kbd> 読み込み / <kbd>Esc</kbd> 中断</p>
    <p id="overlay-hint">クリックして開始</p>
  </div>
`
document.body.appendChild(overlay)

const uiRoot = document.createElement('div')
uiRoot.id = 'ui'
document.body.appendChild(uiRoot)

const crosshair = document.createElement('div')
crosshair.id = 'crosshair'
document.body.appendChild(crosshair)

let game = new Game(container, uiRoot)
game.start()

/**
 * Pointer lock is lost for two very different reasons: the player pressed
 * Escape, or the window simply lost focus. Only the first is a request to stop
 * playing, so only the first raises the overlay and stops the clock.
 */
let escapeRequested = false
let paused = true
let speedBeforePause: SpeedStep = 1

const hint = document.getElementById('overlay-hint')

const showOverlay = (): void => {
  if (hint) hint.textContent = paused && game.world.clock.simTime > 0 ? 'クリックして再開' : 'クリックして開始'
  overlay.style.display = 'grid'
}

const pauseGame = (): void => {
  if (!paused) {
    speedBeforePause = game.world.clock.speed || 1
    game.world.clock.speed = 0
    paused = true
  }
  showOverlay()
}

// Start on the overlay with the world held still.
game.world.clock.speed = 0

const flash = (text: string, tone: 'good' | 'bad' = 'good'): void => {
  game.world.log(tone === 'good' ? 'good' : 'bad', text)
}

document.addEventListener('keydown', (event) => {
  if (event.code === 'F5') {
    event.preventDefault()
    try {
      saveToStorage(game.world)
      flash('記録を保存した。')
    } catch (error) {
      flash(`保存できなかった：${String(error)}`, 'bad')
    }
    return
  }
  if (event.code === 'F9') {
    event.preventDefault()
    let restored: World | null = null
    try {
      restored = loadFromStorage()
    } catch (error) {
      flash(`読み込めなかった：${String(error)}`, 'bad')
      return
    }
    if (!restored) {
      flash('保存された記録がない。', 'bad')
      return
    }
    const wasLocked = document.pointerLockElement !== null
    game.dispose()
    uiRoot.replaceChildren()
    game = new Game(container, uiRoot, restored)
    game.start()
    ;(window as unknown as { game: Game }).game = game
    if (wasLocked) game.player.requestLock()
  }
})
// Exposed for debugging and for the headless screenshot harness.
;(window as unknown as { game: Game }).game = game

document.addEventListener(
  'keydown',
  (event) => {
    // Only count Escape while playing; the browser drops the lock for us.
    if (event.code === 'Escape' && document.pointerLockElement) escapeRequested = true
  },
  true,
)

document.addEventListener('mousedown', (event) => {
  if (document.pointerLockElement || event.button !== 0) return
  game.player.requestLock()
})

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement) {
    overlay.style.display = 'none'
    // A stale Escape must not pause the next time focus wanders.
    escapeRequested = false
    if (paused) {
      paused = false
      game.world.clock.speed = speedBeforePause
    }
    return
  }
  if (escapeRequested) {
    escapeRequested = false
    pauseGame()
  }
})

// Chrome refuses a fresh lock for about a second after Escape; say so rather
// than leaving the player with a hidden overlay and a dead mouse.
document.addEventListener('pointerlockerror', () => {
  showOverlay()
})

// The right mouse button removes a stake; the browser menu must never appear.
document.addEventListener('contextmenu', (event) => event.preventDefault())
