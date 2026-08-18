import './ui/style.css'
import { Game } from './game'

const container = document.getElementById('app')
if (!container) throw new Error('missing #app container')

const overlay = document.createElement('div')
overlay.id = 'start-overlay'
overlay.innerHTML = `
  <div class="box">
    <h1>道が町を作る</h1>
    <p>谷には農村と鉱山村がある。川は荷車を通さない。</p>
    <p><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 移動 / <kbd>Shift</kbd> 走る / マウス 視点</p>
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

const game = new Game(container, uiRoot)
game.start()
// Exposed for debugging and for the headless screenshot harness.
;(window as unknown as { game: Game }).game = game

overlay.addEventListener('click', () => {
  overlay.style.display = 'none'
  game.player.requestLock()
})

document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement) overlay.style.display = 'grid'
})
