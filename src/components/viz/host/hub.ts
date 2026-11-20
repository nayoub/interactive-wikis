/**
 * The prototype hub: one entry URL for the article-module prototypes, a
 * switcher between them, and the view settings that carry across a switch
 * (width, plain list). Module options stay with each prototype's own store.
 *
 *   /            → the most recently viewed prototype (the timeline the first time)
 *   /timeline, /map, /election
 *   /timeline-module, /map-module, /election-module → redirects (links already shared)
 *   /visual      → the general visual tool (general/)
 *
 * The route list is hub-routes.json, also read by vite.config.ts so every route
 * (and every old one) gets a real page on GitHub Pages.
 */
import { reactive, watch } from 'vue'
import type { RouteRecordRaw } from 'vue-router'

import routes from './hub-routes.json'

export type HubId = 'timeline' | 'map' | 'election' | 'visual'
export interface HubEntry {
  id: HubId
  path: string
  label: string
  /** An older route that redirects here, if any. */
  legacy?: string
}
export const HUB = routes as HubEntry[]

const LAST = 'protowiki-hub:last'
const KEY = 'protowiki-hub:v1'

export function lastPath(): string {
  try {
    const p = localStorage.getItem(LAST)
    if (p && HUB.some((h) => h.path === p)) return p
  } catch {
    /* private mode */
  }
  return HUB[0].path
}
export function rememberPath(path: string) {
  try {
    localStorage.setItem(LAST, path)
  } catch {
    /* ignore */
  }
}

/** Routes the router adds: the entry redirect and the old routes. Query and hash are kept. */
export const hubRedirects: RouteRecordRaw[] = [
  ...HUB.filter((h) => h.legacy).map((h) => ({
    path: h.legacy!,
    redirect: (to: { query: Record<string, unknown>; hash: string }) => ({
      path: h.path,
      query: to.query,
      hash: to.hash,
    }),
  })),
  {
    path: '/',
    redirect: (to: { query: Record<string, unknown>; hash: string }) => ({
      path: lastPath(),
      query: to.query,
      hash: to.hash,
    }),
  },
] as RouteRecordRaw[]

export type Width = 'desktop' | 'mobile'

/** View settings shared by every prototype (and by the phone-width iframe, via `storage`). */
export interface HubState {
  width: Width
  /** Plain list: the no-script fallback rendering. */
  fallback: boolean
  /** Item labels in another language, where items have them (general tool): "en", "eu", "fr". */
  lang: string
}

function read(): HubState {
  const init: HubState = { width: 'desktop', fallback: false, lang: 'en' }
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...init, ...JSON.parse(raw) }
  } catch {
    /* ignore */
  }
  return init
}

export const hub = reactive<HubState>(read())
let remote = false
watch(
  hub,
  () => {
    if (remote) return
    try {
      localStorage.setItem(KEY, JSON.stringify(hub))
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
      remote = true
      Object.assign(hub, JSON.parse(e.newValue))
    } catch {
      /* ignore */
    } finally {
      queueMicrotask(() => (remote = false))
    }
  })
}
