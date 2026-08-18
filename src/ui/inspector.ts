import { simSecondsToGameSeconds } from '../core/clock'
import { round } from '../core/math'
import type { PickTarget } from '../player/picking'
import { surfaceProperties } from '../roads/roadSpec'
import { AgentState, type Agent } from '../sim/agents'
import { BUILDINGS } from '../sim/buildings'
import type { DelayCause, RouteNote, StuckReason } from '../sim/explain'
import { RESOURCE_INFO } from '../sim/resources'
import type { World } from '../sim/world'
import { RoadSurface } from '../world/tileGrid'
import { escapeHtml, formatDuration, formatGrade, formatIdleReason, resourceAmount } from './format'
import { ROAD_SURFACE_NAMES } from './locale/ja'

const STATE_LABELS: Record<AgentState, string> = {
  [AgentState.Idle]: '待機中',
  [AgentState.ToPickup]: '積み込みへ向かう',
  [AgentState.Loading]: '積み込み中',
  [AgentState.ToDropoff]: '輸送中',
  [AgentState.Unloading]: '荷降ろし中',
  [AgentState.ToSite]: '現場へ向かう',
  [AgentState.Working]: '施工中',
  [AgentState.Returning]: '帰路',
}

const formatRouteNote = (note: RouteNote): string => {
  if (!note) return ''
  if (note.kind === 'shortest') return '最短の経路'
  const slower = formatDuration(simSecondsToGameSeconds(note.slowerBySeconds))
  return `徒歩の最短路より ${slower} 遅いが、積荷を運べるのはこの道だけ`
}

const formatDelay = (delay: DelayCause): string => {
  if (!delay) return ''
  switch (delay.kind) {
    case 'mud':
      return `${delay.place}のぬかるみ`
    case 'climb':
      return '登り坂'
    case 'unpaved':
      return '未整備の地面'
    case 'loading':
      return '積み降ろし'
    case 'ford':
      return '渡渉（浅瀬）'
    default:
      return ''
  }
}

const formatStuck = (stuck: StuckReason): string => {
  if (!stuck) return ''
  switch (stuck.kind) {
    case 'noRoute':
      return stuck.failure === 'needsRoad'
        ? '荷車の通れる道がない'
        : stuck.failure === 'tooSteep'
          ? '坂が急すぎて登れない'
          : stuck.failure === 'water'
            ? '川を渡れない'
            : stuck.failure === 'overloaded'
              ? '路面が積荷の重さに耐えない'
              : '経路がない'
    case 'noCargo':
      return `${RESOURCE_INFO[stuck.resource].label}が積めなかった`
    case 'noWork':
      return '仕事がない'
    default:
      return ''
  }
}

/** Right-hand panel: the answer to "what is this and why is it doing that". */
export class Inspector {
  private readonly element: HTMLElement

  constructor(root: HTMLElement) {
    this.element = document.createElement('div')
    this.element.className = 'panel'
    this.element.id = 'inspector'
    this.element.style.display = 'none'
    root.appendChild(this.element)
  }

  update(world: World, target: PickTarget): void {
    const html = this.render(world, target)
    this.element.style.display = html ? 'block' : 'none'
    if (html) this.element.innerHTML = html
  }

  private render(world: World, target: PickTarget): string {
    if (!target) return ''
    switch (target.kind) {
      case 'agent':
        return this.agent(target.agent)
      case 'building': {
        const building = target.building
        const def = BUILDINGS[building.type]
        const settlement = world.settlements.get(building.settlementId)
        // Show the inputs this building is waiting on, with the village's stock.
        const stockRows = settlement
          ? Object.keys(def.recipe?.inputs ?? {})
              .map((key) => {
                const resource = Number(key) as keyof typeof RESOURCE_INFO
                return `<div class="row"><span class="name">${RESOURCE_INFO[resource].label}</span><span>${Math.floor(settlement.stock[resource])}</span></div>`
              })
              .join('')
          : ''
        return `
          <div class="row title">${def.label}<span class="muted">　${escapeHtml(settlement?.label ?? '')}</span></div>
          <div class="row"><span class="name">稼働</span><span>${Math.round(building.activity * 100)}%</span>
            ${building.idleReason ? `<span class="warn">${formatIdleReason(building.idleReason)}</span>` : ''}</div>
          ${stockRows}
        `
      }
      case 'site': {
        const site = target.site
        const missing = Object.entries(site.outstandingMaterials())
          .filter(([, amount]) => (amount as number) > 0.01)
          .map(([key, amount]) => {
            const resource = Number(key) as keyof typeof RESOURCE_INFO
            return `${RESOURCE_INFO[resource].label} あと ${Math.ceil(amount as number)}${RESOURCE_INFO[resource].unit}`
          })
          .join('　')
        return `
          <div class="row title">${escapeHtml(site.label)}<span class="muted">　工事中</span></div>
          <div class="row"><span class="name">進捗</span><span>${Math.round(site.progress() * 100)}%</span>
            <span class="name">残り</span><span>${Math.round(site.remainingLabour())} 人時</span>
            <span class="name">作業員</span><span>${site.workers} 人</span></div>
          ${missing ? `<div class="row warn">${missing}</div>` : '<div class="row good">資材は足りている</div>'}
          <div class="row muted">あなたの施工分 ${Math.round(site.playerHours)} 人時 / 村の作業 ${Math.round(site.crewHours)} 人時</div>
        `
      }
      case 'road': {
        const index = world.grid.index(target.tx, target.tz)
        const surface = world.grid.roadSurface[index] as RoadSurface
        const props = surfaceProperties(surface)
        const edge = world.roads.get(world.grid.roadEdge[index])
        const grade = world.field.tileSlope(target.tx, target.tz)
        return `
          <div class="row title">${escapeHtml(edge?.label ?? ROAD_SURFACE_NAMES[surface])}</div>
          <div class="row"><span class="name">路面</span><span>${ROAD_SURFACE_NAMES[surface]}</span>
            <span class="name">状態</span><span>${Math.round(world.grid.condition[index] * 100)}%</span>
            <span class="name">濡れ</span><span>${Math.round(world.grid.wetness[index] * 100)}%</span></div>
          <div class="row"><span class="name">勾配</span><span>${formatGrade(grade)}</span>
            <span class="name">積載上限</span><span>${props.maxLoadKg === Infinity ? '—' : `${props.maxLoadKg}kg`}</span>
            <span class="name">通行量</span><span>${round(edge?.traffic ?? 0, 1)} t</span></div>
        `
      }
      case 'ground':
      default:
        return ''
    }
  }

  private agent(agent: Agent): string {
    const explain = agent.explain
    const cargo =
      explain.cargoResource !== null && explain.cargoAmount > 0
        ? resourceAmount(explain.cargoResource, explain.cargoAmount)
        : '空荷'
    const route = formatRouteNote(explain.routeNote)
    const delay = formatDelay(explain.delay)
    const stuck = formatStuck(explain.stuck)
    const eta =
      explain.routeSeconds > 0
        ? formatDuration(simSecondsToGameSeconds(explain.routeSeconds))
        : null

    return `
      <div class="row title">${agent.vehicle.label}<span class="muted">　${STATE_LABELS[agent.state]}</span></div>
      ${
        explain.fromLabel
          ? `<div class="row"><span>${escapeHtml(explain.fromLabel)}</span><span class="muted">→</span><span>${escapeHtml(explain.toLabel)}</span></div>`
          : ''
      }
      <div class="row"><span class="name">積荷</span><span>${cargo}</span>
        <span class="muted">${Math.round(agent.loadKg)} / ${agent.vehicle.capacityKg} kg</span></div>
      ${eta ? `<div class="row"><span class="name">所要</span><span>約 ${eta}</span></div>` : ''}
      ${route ? `<div class="row muted">経路：${route}</div>` : ''}
      ${delay ? `<div class="row warn">遅延要因：${delay}</div>` : ''}
      ${stuck ? `<div class="row bad">出発できない：${stuck}</div>` : ''}
    `
  }
}
