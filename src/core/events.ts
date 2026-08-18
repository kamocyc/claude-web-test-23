export type EventSeverity = 'info' | 'good' | 'warn' | 'bad'

export interface GameEvent {
  readonly id: number
  /** Game time (in game seconds) at which the event happened. */
  readonly at: number
  readonly severity: EventSeverity
  readonly text: string
}

type Listener = (event: GameEvent) => void

/**
 * Minimal event log + bus. The simulation pushes here; UI reads.
 * Kept free of rendering concerns so it can run headless.
 */
export class EventLog {
  private nextId = 1
  private readonly entries: GameEvent[] = []
  private readonly listeners = new Set<Listener>()
  private readonly limit: number

  constructor(limit = 200) {
    this.limit = limit
  }

  push(at: number, severity: EventSeverity, text: string): GameEvent {
    const event: GameEvent = { id: this.nextId++, at, severity, text }
    this.entries.push(event)
    if (this.entries.length > this.limit) this.entries.shift()
    for (const listener of this.listeners) listener(event)
    return event
  }

  recent(count = 8): readonly GameEvent[] {
    return this.entries.slice(-count)
  }

  all(): readonly GameEvent[] {
    return this.entries
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}
