/**
 * Prototype state, persisted to localStorage so a reload keeps your modules,
 * and synced across documents via the `storage` event so the control strip
 * (top window) can drive the phone-width preview (an iframe of the route).
 * One store per route (its own storage key).
 */
import { reactive, watch } from 'vue'

import {
  DEFAULT_MAP_OPTIONS,
  DEFAULT_OPTIONS,
  type Draft,
  type ModuleData,
  type ModuleKind,
  type Placement,
} from '../model/types'

export type Mode = 'read' | 'edit'
export type Spacing = 'proportional' | 'even'
export type Width = 'desktop' | 'mobile'
export type { Draft }

export interface PlacedModule {
  // Any kind's data: a Timeline, a MapData…
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: ModuleData<any, any>
  placement: Placement
}

export interface ModulesState {
  mode: Mode
  spacing: Spacing
  fallback: boolean
  width: Width
  /** Placed modules, at most one per kind. */
  modules: Partial<Record<ModuleKind, PlacedModule>>
  /** Editor panel open (select mode on). */
  panelOpen: boolean
  draft: Draft | null
  /** Bumped to ask every document to scroll somewhere. */
  signal: { n: number; kind: 'top' | ModuleKind }
}

export const DEFAULTS: Record<ModuleKind, Record<string, boolean>> = {
  timeline: { ...DEFAULT_OPTIONS },
  map: { ...DEFAULT_MAP_OPTIONS },
}

function initial(): ModulesState {
  return {
    mode: 'read',
    spacing: 'proportional',
    fallback: false,
    width: 'desktop',
    modules: {},
    panelOpen: false,
    draft: null,
    signal: { n: 0, kind: 'top' },
  }
}

/** Older saves (round 1–2 timeline): `timeline` + `placement`, `events` instead of `items`. */
function migrate(raw: any): ModulesState {
  const s = { ...initial(), ...raw }
  if (raw?.timeline && raw?.placement && !raw.modules) {
    s.modules = { timeline: { data: raw.timeline, placement: raw.placement } }
  }
  delete (s as any).timeline
  delete (s as any).placement
  const fix = (d: any, kind: ModuleKind) => {
    if (!d) return
    if (d.events && !d.items) d.items = d.events
    delete d.events
    d.options = { ...DEFAULTS[kind], ...d.options }
  }
  for (const [kind, m] of Object.entries(s.modules))
    fix((m as PlacedModule | undefined)?.data, kind as ModuleKind)
  if (s.draft) {
    s.draft.kind ??= 'timeline'
    fix(s.draft, s.draft.kind)
  }
  return s
}

export function createStore(key: string) {
  const read = (): ModulesState => {
    try {
      const raw = localStorage.getItem(key)
      if (raw) return migrate(JSON.parse(raw))
    } catch {
      /* private mode or bad JSON */
    }
    return initial()
  }

  const state = reactive<ModulesState>(read())
  let applyingRemote = false

  watch(
    state,
    () => {
      if (applyingRemote) return
      try {
        localStorage.setItem(key, JSON.stringify(state))
      } catch {
        /* ignore */
      }
    },
    { deep: true },
  )

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key !== key || !e.newValue) return
      try {
        applyingRemote = true
        const next = migrate(JSON.parse(e.newValue))
        for (const k of Object.keys(state) as (keyof ModulesState)[]) (state as any)[k] = next[k]
      } catch {
        /* ignore */
      } finally {
        // Let the deep watcher see the change and skip writing it back.
        queueMicrotask(() => (applyingRemote = false))
      }
    })
  }

  function signal(kind: ModulesState['signal']['kind']) {
    state.signal = { n: state.signal.n + 1, kind }
  }

  function reset() {
    const width = state.width
    const next = initial()
    for (const k of Object.keys(state) as (keyof ModulesState)[]) (state as any)[k] = next[k]
    state.width = width
    state.signal = { n: Date.now(), kind: 'top' }
  }

  return { state, signal, reset }
}

export type ModulesStore = ReturnType<typeof createStore>
