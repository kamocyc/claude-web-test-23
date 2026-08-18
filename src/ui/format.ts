import { round } from '../core/math'
import type { BlockedReason } from '../roads/pathfinding'
import type { IdleReason } from '../sim/buildings'
import { RESOURCE_INFO, type Resource } from '../sim/resources'
import { RESOURCE_NAMES } from './locale/ja'

export const resourceName = (resource: Resource): string => RESOURCE_NAMES[resource]

/** "小麦 12 袋" */
export const resourceAmount = (resource: Resource, amount: number): string =>
  `${RESOURCE_NAMES[resource]} ${Math.floor(amount)} ${RESOURCE_INFO[resource].unit}`

export const formatIdleReason = (reason: IdleReason): string => {
  if (!reason) return ''
  switch (reason.kind) {
    case 'noWorkers':
      return '働き手が足りない'
    case 'missingInput':
      return `${RESOURCE_NAMES[reason.resource]}切れ`
    case 'storageFull':
      return `${RESOURCE_NAMES[reason.resource]}の置き場が満杯`
    default:
      return ''
  }
}

/** Why a hauling order could not be routed. */
export const formatHaulFailure = (failure: BlockedReason): string => {
  switch (failure) {
    case 'needsRoad':
      return '荷車の通れる道がない'
    case 'tooSteep':
      return '坂が急すぎる'
    case 'water':
      return '川を渡れない'
    case 'overloaded':
      return '路面が積荷の重さに耐えない'
    default:
      return '経路がない'
  }
}

export const formatWeight = (kg: number): string => `${round(kg, 0)}kg`

/** Game seconds -> "2時間30分" */
export const formatDuration = (gameSeconds: number): string => {
  const totalMinutes = Math.max(0, Math.round(gameSeconds / 60))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours <= 0) return `${minutes}分`
  return minutes === 0 ? `${hours}時間` : `${hours}時間${minutes}分`
}

export const formatGrade = (grade: number): string => `${round(Math.abs(grade) * 100, 1)}%`

export const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  )
