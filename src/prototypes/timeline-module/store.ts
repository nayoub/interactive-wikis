/**
 * Prototype state, persisted to localStorage so a reload keeps your timeline,
 * and synced across documents via the `storage` event so the control strip
 * (top window) can drive the phone-width preview (an iframe of this route).
 */
import { reactive, watch } from 'vue'

import type { Placement, Timeline, TimelineEvent } from './timeline/types'

export type Mode = 'read' | 'edit'
export type Spacing = 'proportional' | 'even'
export type Width = 'desktop' | 'mobile'

export interface Draft {
  title: string
  events: TimelineEvent[]
  /** True when re-editing the placed timeline rather than inserting a new one. */
  editingPlaced: boolean
}

export interface TimelineState {
  mode: Mode
  spacing: Spacing
  fallback: boolean
  width: Width
  timeline: Timeline | null
  placement: Placement | null
  /** Editor panel open (select mode on). */
  panelOpen: boolean
  draft: Draft | null
  /** Bumped to ask every document to scroll somewhere. */
  signal: { n: number; kind: 'top' | 'timeline' }
}

const KEY = 'protowiki-timeline-module:v1'

function initial(): TimelineState {
  return {
    mode: 'read',
    spacing: 'proportional',
    fallback: false,
    width: 'desktop',
    timeline: null,
    placement: null,
    panelOpen: false,
    draft: null,
    signal: { n: 0, kind: 'top' },
  }
}

function read(): TimelineState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...initial(), ...JSON.parse(raw) }
  } catch {
    /* private mode or bad JSON */
  }
  return initial()
}

export const state = reactive<TimelineState>(read())

let applyingRemote = false

watch(
  state,
  () => {
    if (applyingRemote) return
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      /* ignore */
    }
  },
  { deep: true },
)

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY || !e.newValue) return
    try {
      applyingRemote = true
      Object.assign(state, initial(), JSON.parse(e.newValue))
    } catch {
      /* ignore */
    } finally {
      // Let the deep watcher see the change and skip writing it back.
      queueMicrotask(() => (applyingRemote = false))
    }
  })
}

export function signal(kind: TimelineState['signal']['kind']) {
  state.signal = { n: state.signal.n + 1, kind }
}

export function resetState() {
  const width = state.width
  Object.assign(state, initial(), { width, signal: { n: state.signal.n + 1, kind: 'top' } })
}
