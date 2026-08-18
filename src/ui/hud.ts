import type { GameEvent } from '../core/events'
import { BUILDINGS } from '../sim/buildings'
import { ALL_RESOURCES, Resource } from '../sim/resources'
import type { Settlement } from '../sim/settlement'
import type { World } from '../sim/world'
import { escapeHtml, formatHaulFailure, formatIdleReason } from './format'
import { RESOURCE_NAMES } from './locale/ja'

const SEVERITY_COLOR: Record<GameEvent['severity'], string> = {
  info: 'var(--muted)',
  good: 'var(--good)',
  warn: 'var(--warn)',
  bad: 'var(--bad)',
}

/** Resources worth showing per village: the ones it makes or waits for. */
const shownResources = (settlement: Settlement): Resource[] =>
  ALL_RESOURCES.filter(
    (resource) => settlement.stock[resource] > 0.5 || settlement.targetStock(resource) > 0.5,
  )

export class Hud {
  private readonly clockEl: HTMLElement
  private readonly villagesEl: HTMLElement
  private readonly eventsEl: HTMLElement
  private accumulator = 0

  constructor(root: HTMLElement) {
    this.clockEl = document.createElement('div')
    this.clockEl.className = 'panel'
    this.clockEl.id = 'hud-clock'

    this.villagesEl = document.createElement('div')
    this.villagesEl.className = 'panel'
    this.villagesEl.id = 'hud-villages'

    this.eventsEl = document.createElement('div')
    this.eventsEl.className = 'panel'
    this.eventsEl.id = 'hud-events'

    root.append(this.clockEl, this.villagesEl, this.eventsEl)
  }

  /** Refreshed a few times a second: the DOM is not on the frame budget. */
  update(world: World, realDelta: number): void {
    this.accumulator += realDelta
    if (this.accumulator < 0.2) return
    this.accumulator = 0

    const clock = world.clock
    const speed = clock.paused ? '一時停止' : `${clock.speed}倍`
    const danger = world.bandits.active
      ? '<span class="bad">盗賊の噂</span>'
      : ''
    this.clockEl.innerHTML = `
      <div class="row big">${clock.day} 日目 ${clock.formatTime()}</div>
      <div class="row"><span>${world.weather.label}</span>${
        world.weather.intensity > 0.3 ? '<span class="warn">土道がぬかるむ</span>' : ''
      }${danger}</div>
      <div class="row muted">${speed}　<span class="key">Space</span> 停止 / <span class="key">[</span><span class="key">]</span> 速度</div>
    `

    this.villagesEl.innerHTML =
      [...world.settlements.values()].map((settlement) => this.renderSettlement(settlement)).join('') +
      this.renderPending(world)

    this.eventsEl.innerHTML = world.events
      .recent(6)
      .map(
        (event) =>
          `<div class="row" style="color:${SEVERITY_COLOR[event.severity]}">${escapeHtml(event.text)}</div>`,
      )
      .reverse()
      .join('')
  }

  /** Needs the network cannot meet, with the reason. This is the to-do list. */
  private renderPending(world: World): string {
    const stuck = world.logistics.pending
      .filter((entry) => entry.reason.kind === 'noRoute' || entry.reason.kind === 'downgraded')
      .slice(0, 3)
    if (stuck.length === 0) return ''
    const rows = stuck
      .map((entry) => {
        if (entry.reason.kind === 'noRoute') {
          return `<div class="row"><span class="name">${RESOURCE_NAMES[entry.resource]} ${entry.units}</span>
            <span class="muted">→ ${escapeHtml(entry.toLabel)}</span></div>
            <div class="row bad">${formatHaulFailure(entry.reason.failure)}</div>`
        }
        if (entry.reason.kind !== 'downgraded') return ''
        return `<div class="row"><span class="name">${RESOURCE_NAMES[entry.resource]} ${entry.units}</span>
          <span class="muted">→ ${escapeHtml(entry.toLabel)}</span></div>
          <div class="row warn">${formatHaulFailure(entry.reason.failure)}ので、背負いで少しずつしか運べない</div>`
      })
      .join('')
    return `<div class="card"><div class="row title">輸送の隘路</div>${rows}</div>`
  }

  private renderSettlement(settlement: Settlement): string {
    const rows = shownResources(settlement)
      .map((resource) => {
        const amount = settlement.stock[resource]
        const target = settlement.targetStock(resource)
        const short = target > 0 && amount < target * 0.5
        const surplus = amount > target * 1.2 && target > 0
        const mark = short ? '<span class="bad">不足</span>' : surplus ? '<span class="good">余剰</span>' : ''
        return `<div class="row"><span class="name">${RESOURCE_NAMES[resource]}</span><span class="value">${Math.floor(amount)}</span>${mark}</div>`
      })
      .join('')

    const idle = settlement.buildings
      .filter((building) => building.idleReason !== null && BUILDINGS[building.type].recipe)
      .map(
        (building) =>
          `<div class="row warn">${BUILDINGS[building.type].label}：停止 <span class="muted">${formatIdleReason(building.idleReason)}</span></div>`,
      )
      .join('')

    return `
      <div class="card">
        <div class="row title">${escapeHtml(settlement.label)}<span class="muted">　人口 ${Math.round(settlement.population)}</span></div>
        ${rows}
        ${idle}
      </div>
    `
  }
}
