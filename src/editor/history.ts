import type { SceneFile } from './sceneFile'

/** Where the selection was. Each path is child indexes from the scene root. The last path is the active node. */
export interface SelectionBookmark {
  paths: number[][]
  componentIndex: number | null
}

/** One path in a file-system step. `text` null means the path is absent. */
export interface FileSnap {
  path: string
  text: string | null
  /** Empty directory. `text` stays null. */
  directory?: boolean
  /** `text` is base64 file bytes. */
  binary?: boolean
}

export interface HistoryEntry {
  label: string
  before: SceneFile
  after: SceneFile
  beforeSelection: SelectionBookmark
  afterSelection: SelectionBookmark
  /** Present when the step created, changed, or removed project files. */
  filesBefore?: FileSnap[]
  filesAfter?: FileSnap[]
  at: number
}

export interface HistoryRow {
  label: string
  applied: boolean
}

const MERGE_MS = 1000
const LIMIT = 60

/**
 * Undo stack for scene edits. Continuous edits with the same label
 * (a scrub, a color drag) collapse into one step.
 */
export class EditorHistory {
  private past: HistoryEntry[] = []
  private future: HistoryEntry[] = []

  get canUndo(): boolean {
    return this.past.length > 0
  }

  get canRedo(): boolean {
    return this.future.length > 0
  }

  get undoLabel(): string {
    return this.past.at(-1)?.label ?? ''
  }

  get redoLabel(): string {
    return this.future.at(-1)?.label ?? ''
  }

  /** How many actions are currently applied. Zero is the scene before any of them. */
  get appliedCount(): number {
    return this.past.length
  }

  entries(): HistoryRow[] {
    return [
      ...this.past.map((entry) => ({ label: entry.label, applied: true })),
      ...[...this.future].reverse().map((entry) => ({ label: entry.label, applied: false })),
    ]
  }

  push(entry: HistoryEntry, merge: boolean): void {
    const last = this.past.at(-1)
    if (
      merge
      && last
      && last.label === entry.label
      && entry.at - last.at < MERGE_MS
    ) {
      last.after = entry.after
      last.afterSelection = entry.afterSelection
      last.filesAfter = entry.filesAfter
      last.at = entry.at
      this.future = []
      return
    }
    this.past.push(entry)
    if (this.past.length > LIMIT) this.past.shift()
    this.future = []
  }

  undo(): HistoryEntry | null {
    const entry = this.past.pop()
    if (!entry) return null
    this.future.push(entry)
    return entry
  }

  redo(): HistoryEntry | null {
    const entry = this.future.pop()
    if (!entry) return null
    this.past.push(entry)
    return entry
  }

  clear(): void {
    this.past = []
    this.future = []
  }
}

/** Stable text for equality. Sub-pixel float noise does not count as an edit. */
export function fingerprint(file: SceneFile): string {
  return JSON.stringify(file, (_key, value: unknown) => {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value * 1e5) / 1e5
    return value
  })
}

export function sameScene(a: SceneFile, b: SceneFile): boolean {
  return fingerprint(a) === fingerprint(b)
}
