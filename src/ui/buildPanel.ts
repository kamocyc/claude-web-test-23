import { round } from '../core/math'
import { gradeBand, type RoadPlan } from '../roads/buildability'
import { ToolId, type ToolBelt } from '../player/tools'
import { BUILDINGS } from '../sim/buildings'
import { RESOURCE_INFO, type Resource } from '../sim/resources'
import { PLACEABLE } from '../sim/structureSite'
import type { World } from '../sim/world'
import { escapeHtml, formatGrade, resourceName } from './format'

const TOOL_LABELS: Record<ToolId, string> = {
  [ToolId.Inspect]: '調べる',
  [ToolId.Survey]: '測量',
  [ToolId.Stake]: '杭打ち',
  [ToolId.Work]: '施工',
  [ToolId.Place]: '建てる',
}

const BAND_CLASS = { easy: 'good', hard: 'warn', cartsBlocked: 'bad' } as const

const materialLine = (
  world: World,
  materials: Partial<Record<Resource, number>>,
): string => {
  const entries = Object.entries(materials)
  if (entries.length === 0) return '<span class="muted">資材なし</span>'
  return entries
    .map(([key, amount]) => {
      const resource = Number(key) as Resource
      const need = Math.ceil(amount as number)
      let best = 0
      for (const settlement of world.settlements.values()) {
        best = Math.max(best, Math.floor(settlement.stock[resource]))
      }
      const short = best < need
      return `<span class="${short ? 'bad' : ''}">${resourceName(resource)} ${need}${RESOURCE_INFO[resource].unit}<span class="muted">（村の在庫 ${best}）</span></span>`
    })
    .join('　')
}

const planSummary = (world: World, plan: RoadPlan): string => {
  const band = gradeBand(plan.worstGrade)
  const problems = plan.segments
    .map((segment) => segment.problem)
    .filter((problem): problem is NonNullable<typeof problem> => problem !== null)
  const problemText = problems.length
    ? problems
        .map((problem) =>
          problem.kind === 'earthworkTooDeep'
            ? `切土・盛土が深すぎる（${round(problem.metres, 1)}m）`
            : problem.kind === 'spanTooLong'
              ? `橋の支間が長すぎる（${problem.tiles}区画）`
              : '建物や地形に当たっている',
        )
        .join(' / ')
    : ''

  return `
    <div class="row"><span class="name">延長</span><span>${Math.round(plan.lengthM)} m</span>
      <span class="name">最急勾配</span><span class="${BAND_CLASS[band]}">${formatGrade(plan.worstGrade)}</span>
      <span class="name">工数</span><span>のべ ${Math.round(plan.labourHours)} 人時</span></div>
    <div class="row"><span class="name">土工</span><span>切土 ${Math.round(plan.cutVolume)} m³ / 盛土 ${Math.round(plan.fillVolume)} m³</span>
      ${plan.bridgeTiles > 0 ? `<span class="name">橋</span><span>${plan.bridgeTiles} 区画</span>` : ''}</div>
    <div class="row"><span class="name">資材</span><span>${materialLine(world, plan.materials)}</span></div>
    ${problemText ? `<div class="row bad">${problemText}</div>` : ''}
  `
}

/** Bottom-centre panel: what the current tool is about to do, and what it costs. */
export class BuildPanel {
  private readonly element: HTMLElement

  constructor(root: HTMLElement) {
    this.element = document.createElement('div')
    this.element.className = 'panel'
    this.element.id = 'build-panel'
    root.appendChild(this.element)
  }

  update(world: World, tools: ToolBelt): void {
    const header = `<div class="row title">${TOOL_LABELS[tools.tool]}<span class="muted">　1 調べる / 2 測量 / 3 杭打ち / 4 施工 / 5 建てる</span></div>`
    this.element.innerHTML = header + this.body(world, tools) + this.message(tools)
  }

  private message(tools: ToolBelt): string {
    return tools.lastMessage ? `<div class="row bad">${escapeHtml(tools.lastMessage)}</div>` : ''
  }

  private body(world: World, tools: ToolBelt): string {
    switch (tools.tool) {
      case ToolId.Survey:
        return this.survey(tools)
      case ToolId.Stake:
        return this.stake(world, tools)
      case ToolId.Work:
        return this.work(world)
      case ToolId.Place:
        return this.place(world, tools)
      case ToolId.Inspect:
      default:
        return '<div class="row muted">見たいものに照準を合わせてクリック</div>'
    }
  }

  private survey(tools: ToolBelt): string {
    const reading = tools.survey()
    if (!reading) return '<div class="row muted">地面に照準を合わせる</div>'
    const band = gradeBand(reading.gradeFromPlayer)
    return `
      <div class="row"><span class="name">距離</span><span>${Math.round(reading.distance)} m</span>
        <span class="name">標高</span><span>${round(reading.height, 1)} m</span>
        <span class="name">足元からの勾配</span><span class="${BAND_CLASS[band]}">${formatGrade(reading.gradeFromPlayer)}</span></div>
      <div class="row"><span class="name">地面</span><span>${reading.terrainLabel}</span>
        ${reading.waterDepth > 0 ? `<span class="name">水深</span><span>${round(reading.waterDepth, 1)} m</span>` : ''}
        <span class="name">傾斜</span><span>${formatGrade(reading.slope)}</span>
        ${reading.roadLabel ? `<span class="good">${reading.roadLabel}</span>` : ''}</div>
    `
  }

  private stake(world: World, tools: ToolBelt): string {
    const spec = tools.spec
    const specLine = `
      <div class="row"><span class="name">規格</span><span>${spec.label}</span>
        <span class="muted">幅 ${spec.width}m ・ 積載 ${spec.maxLoadKg}kg ・ 雨耐性 ${Math.round(spec.rainResistance * 100)}%</span>
        <span class="muted">Q / E で変更</span></div>`

    if (tools.stakes.length === 0) {
      return `${specLine}<div class="row muted">左クリックで杭を打つ。2本目からは線形と勾配が出る。</div>`
    }
    const plan = tools.preview
    const summary = plan && plan.segments.length > 0 ? planSummary(world, plan) : ''
    const commit = tools.committed
      ? `<div class="row ${tools.committed.buildable ? 'good' : 'bad'}">Enter で着工（杭 ${tools.stakes.length} 本）　<span class="muted">右クリック/Backspace で1本戻す・X で破棄</span></div>`
      : '<div class="row muted">もう1本打つと着工できる</div>'
    return specLine + summary + commit
  }

  private place(world: World, tools: ToolBelt): string {
    const cost = PLACEABLE[tools.placementType]
    const def = BUILDINGS[tools.placementType]
    if (!cost) return ''
    const pending = world.structureSites
      .map(
        (site) =>
          `<div class="row"><span class="name">${escapeHtml(site.label)}</span><span>${Math.round(site.progress() * 100)}%</span>${
            Object.keys(site.outstandingMaterials()).length > 0
              ? '<span class="warn">資材待ち</span>'
              : '<span class="good">施工待ち</span>'
          }</div>`,
      )
      .join('')
    return `
      <div class="row"><span class="name">建物</span><span>${def.label}</span>
        <span class="name">資材</span><span>${materialLine(world, cost.materials)}</span>
        <span class="name">工数</span><span>のべ ${cost.labour} 人時</span>
        <span class="muted">Q / E で変更</span></div>
      ${pending}
      <div class="row muted">左クリックで建設地を決める。資材が届いたら 4 施工 で建てる。</div>
    `
  }

  private work(world: World): string {
    const sites = [...world.sites, ...world.structureSites]
    if (sites.length === 0) {
      return '<div class="row muted">工事現場がない。傷んだ道の上で長押しすると補修できる。</div>'
    }
    const rows = sites
      .map((site) => {
        const missing = Object.keys(site.outstandingMaterials())
        const blocked = missing.length
          ? `<span class="warn">${resourceName(Number(missing[0]) as Resource)}待ち</span>`
          : site.workers === 0
            ? '<span class="warn">人手待ち</span>'
            : '<span class="good">施工中</span>'
        return `<div class="row"><span class="name">${escapeHtml(site.label)}</span>
          <span>${Math.round(site.progress() * 100)}%</span>${blocked}</div>`
      })
      .join('')
    return `${rows}<div class="row muted">現場の先端に近づいて左クリック長押しで自分も働く</div>`
  }
}
