import './ui/style.css'
import { Game } from './game'
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
    <p><kbd>F5</kbd> 保存 / <kbd>F9</kbd> 読み込み</p>
    <p>クリックして開始</p>
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

overlay.addEventListener('click', () => {
  overlay.style.display = 'none'
  game.player.requestLock()
})

document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement) overlay.style.display = 'grid'
})
