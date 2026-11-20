<script setup lang="ts">
/**
 * A prototype page for article modules: the article, or, at "Phone (390px)",
 * the same route in a real 390px iframe with `?embed=1` (the two documents
 * share state through localStorage, so fixed toolbars, bottom sheets and
 * Minerva behave as on a phone). Controls live in the header's user menu
 * (PrototypeMenu); there is nothing above the header.
 *
 * The URL reflects the controls, so a link opens a prototype in an exact state:
 *   example=1|0  the example modules / none   width=phone   plain=1
 *   lang=eu|fr   item labels (general tool)
 *   mono=1       spacing=even                 shade=1       mode=edit
 * Esc returns from the phone frame to Desktop.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter, type LocationQuery } from 'vue-router'

import type { ModuleKind } from '../model/types'
import GeneralModules from '../general/GeneralModules.vue'
import ArticleModules from './ArticleModules.vue'
import { HUB, hub, rememberPath, type HubId } from './hub'
import { GEHRY, loadArticle, type ArticleSource, type LoadedArticle } from './loadArticle'
import { loadExample } from './prototypeActions'
import type { ModulesStore, PlacedModule } from './store'

const props = defineProps<{
  kinds: ModuleKind[]
  store: ModulesStore
  example: (article: LoadedArticle) => Partial<Record<ModuleKind, PlacedModule>>
  /** Which article (default: Frank Gehry). */
  source?: ArticleSource
  /** The page: per-kind modules (timeline, map, election), or the general visual tool. */
  host?: 'modules' | 'general'
}>()

const route = useRoute()
const router = useRouter()
const embedded = route.query.embed === '1'
const state = props.store.state

const hubEntry = computed(() => HUB.find((h) => h.path === route.path.replace(/\/$/, '')) ?? HUB[0])
const hubId = computed<HubId>(() => hubEntry.value.id)

const narrow = ref(false)
let mql: MediaQueryList | null = null
const onChange = () => (narrow.value = !!mql?.matches)
onMounted(() => {
  mql = window.matchMedia('(max-width: 639px)')
  onChange()
  mql.addEventListener('change', onChange)
})
onBeforeUnmount(() => mql?.removeEventListener('change', onChange))

const showFrame = computed(() => !embedded && !narrow.value && hub.width === 'mobile')
// Through the router, so the app's base path (e.g. /interactive-wikis/ on Pages) is included.
const frameSrc = computed(() => router.resolve({ path: route.path, query: { embed: '1' } }).href)
const buildExample = async () => props.example(await loadArticle(props.source ?? GEHRY))

// ── Esc leaves the phone frame (here and inside the frame, when nothing else is open) ──
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape' || e.defaultPrevented || hub.width !== 'mobile') return
  if (document.querySelector('.cdx-popover, .cdx-dialog, .cdx-menu--visible')) return
  if (embedded && state.panelOpen) return
  hub.width = 'desktop'
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

// ── URL ⇄ state (top document only) ────────────────────────────────────────
const KEYS = ['example', 'width', 'plain', 'mono', 'spacing', 'shade', 'mode', 'lang'] as const
const one = (q: LocationQuery, k: string) => {
  const v = q[k]
  return (Array.isArray(v) ? v[0] : v) ?? null
}
function setShade(on: boolean) {
  const placed = state.modules.map
  if (!placed) return
  state.modules = {
    ...state.modules,
    map: {
      ...placed,
      data: { ...placed.data, options: { ...placed.data.options, shadeByDate: on } },
    },
  }
}
async function applyQuery(q: LocationQuery) {
  const example = one(q, 'example')
  if (example === '1') await loadExample(props.store, buildExample)
  else if (example === '0') {
    state.modules = {}
    state.visuals = []
    state.vdraft = null
    state.draft = null
    state.panelOpen = false
    state.fromExample = false
  }
  const width = one(q, 'width')
  if (width) hub.width = width === 'phone' ? 'mobile' : 'desktop'
  const plain = one(q, 'plain')
  if (plain) hub.fallback = plain === '1'
  const mono = one(q, 'mono')
  if (mono) state.monochrome = mono === '1'
  const spacing = one(q, 'spacing')
  if (spacing) state.spacing = spacing === 'even' ? 'even' : 'proportional'
  const shade = one(q, 'shade')
  if (shade) setShade(shade === '1')
  const lang = one(q, 'lang')
  if (lang) hub.lang = lang
  const mode = one(q, 'mode')
  if (mode) state.mode = mode === 'edit' ? 'edit' : 'read'
}

/** The controls as query parameters (defaults left out). */
const wanted = computed(() => {
  const q: Record<string, string> = {}
  if (state.fromExample) q.example = '1'
  else if (!Object.keys(state.modules).length && !state.visuals.length) q.example = '0'
  if (hub.width === 'mobile') q.width = 'phone'
  if (hub.fallback) q.plain = '1'
  if (props.kinds.includes('visual') && state.monochrome) q.mono = '1'
  if (props.kinds.includes('timeline') && state.spacing === 'even') q.spacing = 'even'
  if (props.kinds.includes('map') && state.modules.map?.data.options.shadeByDate) q.shade = '1'
  if (state.mode === 'edit') q.mode = 'edit'
  if (props.host === 'general' && hub.lang !== 'en') q.lang = hub.lang
  return q
})

let ready = false
onMounted(async () => {
  if (embedded) return
  rememberPath(hubEntry.value.path)
  await applyQuery(route.query)
  ready = true
  syncUrl()
})
function syncUrl() {
  if (embedded || !ready) return
  const rest = Object.fromEntries(
    Object.entries(route.query).filter(([k]) => !(KEYS as readonly string[]).includes(k)),
  )
  const next = { ...rest, ...wanted.value }
  const same =
    Object.keys(next).length === Object.keys(route.query).length &&
    Object.entries(next).every(([k, v]) => one(route.query, k) === v)
  if (!same) void router.replace({ query: next, hash: route.hash })
}
watch(wanted, syncUrl, { deep: true })
</script>

<template>
  <div class="tm" :class="{ 'tm--framed': showFrame }">
    <div v-if="showFrame" class="tm__stage">
      <iframe
        class="tm__device"
        :src="frameSrc"
        title="Phone-width preview (390px). Press Escape to return to desktop width."
      />
    </div>
    <GeneralModules
      v-else-if="host === 'general'"
      :store="store"
      :hub-id="hubId"
      :example="buildExample"
      :force-skin="embedded ? 'mobile' : undefined"
      :source="source ?? GEHRY"
    />
    <ArticleModules
      v-else
      :kinds="kinds"
      :store="store"
      :hub-id="hubId"
      :example="buildExample"
      :force-skin="embedded ? 'mobile' : undefined"
      :source="source"
    />
  </div>
</template>

<style scoped>
.tm--framed {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}
.tm__stage {
  flex: 1;
  min-height: 0;
  display: flex;
  justify-content: center;
  padding: var(--spacing-150) var(--spacing-100);
  background: var(--background-color-neutral);
}
.tm__device {
  width: 390px;
  height: min(844px, 100%);
  border: 0;
  border-radius: 24px;
  background: var(--background-color-base);
  box-shadow:
    0 0 0 10px var(--color-base),
    0 12px 40px rgba(0, 0, 0, 0.3);
}
</style>
