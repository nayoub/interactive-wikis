<script setup lang="ts">
/**
 * The host: an article snapshot with article modules — a timeline, a map, a
 * visual from a table — in a VE-style editor. Generic over kinds: Insert lists one
 * entry per kind, Pick lights up that kind's mentions, the same Curator lists
 * the items, and each placed module is a block rendered by its kind's renderer.
 * When a timeline and a map share a page, an event and a place about the same
 * thing are linked: selecting one lights the other.
 */
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  shallowRef,
  watch,
} from 'vue'
import { CdxButton, CdxIcon, CdxMessage, CdxProgressBar, CdxToggleSwitch } from '@wikimedia/codex'
import { cdxIconArrowUp } from '@wikimedia/codex-icons'

import ArticleRenderer from '@/components/article/ArticleRenderer.vue'
import ArticleWrapper from '@/components/article/ArticleWrapper.vue'
import ChromeWrapper from '@/components/chrome/ChromeWrapper.vue'
import VeToolbar from '@/components/visual-editor/VeToolbar.vue'
import VisualEditorPageLayout from '@/components/visual-editor/VisualEditorPageLayout.vue'
import { globalSkin } from '@/theme'

// Pick
import { scrollToEl, showPassage } from '../pick/passage'
import { END_MATTER } from '../pick/textIndex'
import type { Mention } from '../pick/types'
import { useSelectMode } from '../pick/useSelectMode'
// Curate
import Curator from '../curate/Curator.vue'
import EventEditor from '../curate/EventEditor.vue'
import PlaceEditor from '../curate/PlaceEditor.vue'
import PlaceSearch from '../curate/PlaceSearch.vue'
import VisualCurate from '../curate/VisualCurate.vue'
import { applyTable, emptySpec, tableOf } from '../curate/visual'
// Render
import ElectionView from '../render/ElectionView.vue'
import MapView from '../render/MapView.vue'
import TimelineView from '../render/TimelineView.vue'
// Model
import { formatDate, setDayFirst } from '../model/dates'
import type {
  BaseItem,
  ModuleData,
  ModuleKind,
  PartialDate,
  Party,
  Place,
  Placement,
  TimelineEvent,
} from '../model/types'
// Host
import { KINDS } from './kinds'
import { GEHRY, loadArticle, type ArticleSource, type LoadedArticle } from './loadArticle'
import ModuleBlock from './ModuleBlock.vue'
import { DEFAULTS, type ModulesStore } from './store'

const props = defineProps<{
  /** Which modules this page offers, in Insert-menu order. */
  kinds: ModuleKind[]
  store: ModulesStore
  forceSkin?: 'desktop' | 'mobile'
  /** Which article (default: Frank Gehry). */
  source?: ArticleSource
}>()
const source = computed(() => props.source ?? GEHRY)

const state = props.store.state
const skin = computed(() => props.forceSkin ?? globalSkin.value)
const isMobile = computed(() => skin.value === 'mobile')
const editing = computed(() => state.mode === 'edit')
const panelOpen = computed(() => editing.value && state.panelOpen && !!state.draft)
const draftKind = computed<ModuleKind | null>(() => (panelOpen.value ? state.draft!.kind : null))
const draftSpec = computed(() => (draftKind.value ? KINDS[draftKind.value] : null))

// Viewport width: decides sidebar vs sheet, and whether floats make way.
const vw = ref(typeof window === 'undefined' ? 1280 : window.innerWidth)
const onResize = () => (vw.value = window.innerWidth)
onMounted(() => window.addEventListener('resize', onResize))
onBeforeUnmount(() => window.removeEventListener('resize', onResize))
/** Below this the sidebar would crush the article, so the panel becomes a sheet over it. */
const SIDE_PANEL_MIN = 1000
const panelMode = computed<'side' | 'sheet'>(() =>
  isMobile.value || vw.value < SIDE_PANEL_MIN ? 'sheet' : 'side',
)

// ── Article ────────────────────────────────────────────────────────────────
const article = shallowRef<LoadedArticle | null>(null)
const loadError = ref<string | null>(null)
loadArticle(source.value)
  .then((a) => {
    setDayFirst(a.dayFirst)
    article.value = a
  })
  .catch((e) => (loadError.value = String(e?.message ?? e)))

const mentionsById = computed(() => {
  const out = new Map<string, Mention<unknown>>()
  if (!article.value) return out
  for (const k of props.kinds) for (const m of KINDS[k].mentions(article.value)) out.set(m.id, m)
  return out
})
const draftLabels = computed(
  () => new Map([...mentionsById.value.values()].map((m) => [m.id, m.draftLabel])),
)
const sections = computed(() =>
  (article.value?.sections ?? []).filter((s) => !END_MATTER.has(s.id) && s.id !== 'Gallery'),
)

const bodyEl = ref<HTMLElement | null>(null)
function setBodyEl(el: unknown) {
  const next = (el as HTMLElement | null) ?? null
  if (next !== bodyEl.value) bodyEl.value = next
}

// ── Placement: a mount node per module inside the article HTML; its block teleports in ──
const mountEls = reactive<Partial<Record<ModuleKind, HTMLElement | null>>>({})
const DEFAULT_PLACEMENT: Placement = {
  kind: 'sectionTop',
  sectionId: source.value.defaultSection.id,
  sectionTitle: source.value.defaultSection.title,
}
const placementKey = (p: Placement) =>
  p.kind === 'after' ? `after:${p.anchorId}` : `top:${p.sectionId}`

function insertAt(
  body: HTMLElement,
  mount: HTMLElement,
  placement: Placement,
  after: HTMLElement | null,
) {
  // Two modules at the same spot: the later one goes right after the earlier one.
  if (after) {
    if (after.nextElementSibling !== mount) after.after(mount)
    return
  }
  if (placement.kind === 'after') {
    const anchor = body.querySelector(`#${CSS.escape(placement.anchorId)}`)
    if (anchor?.parentElement) {
      if (anchor.nextElementSibling !== mount) anchor.after(mount)
      return
    }
  }
  const heading =
    body.querySelector<HTMLElement>(`#${CSS.escape(placement.sectionId)}`) ??
    body.querySelector('h2')
  if (!heading) return body.prepend(mount)
  const holder = heading.closest('.mw-heading') ?? heading
  const next = holder.nextElementSibling
  if (next?.classList.contains('protowiki-mobile-section-body')) {
    if (next.firstElementChild !== mount) next.prepend(mount)
  } else if (next !== mount) holder.after(mount)
}

function ensureMounts() {
  const body = bodyEl.value
  const lastAt = new Map<string, HTMLElement>()
  for (const kind of props.kinds) {
    const placed = state.modules[kind]
    let mount = mountEls[kind] ?? null
    if (!body || !placed) {
      mount?.remove()
      mountEls[kind] = null
      continue
    }
    if (!mount || !body.contains(mount)) {
      mount = document.createElement('div')
      mount.className = 'tl-mount'
      mount.dataset.module = kind
      mount.setAttribute('contenteditable', 'false')
    }
    const key = placementKey(placed.placement)
    insertAt(body, mount, placed.placement, lastAt.get(key) ?? null)
    lastAt.set(key, mount)
    mountEls[kind] = mount
  }
}
watch([bodyEl, () => state.modules, skin], () => nextTick(ensureMounts), {
  deep: true,
  flush: 'post',
})
// Minerva's section accordion moves nodes after mount; re-seat once it settles.
watch(bodyEl, (el) => el && setTimeout(ensureMounts, 50))

// ── Cursor (where Insert puts things) ──────────────────────────────────────
const cursorPlacement = ref<Placement | null>(null)
let blockIds = 0
function onSelectionChange() {
  if (!editing.value || panelOpen.value) return
  const body = bodyEl.value
  const node = document.getSelection()?.anchorNode
  if (!body || !node || !body.contains(node)) return
  const el = (node.nodeType === 1 ? node : node.parentElement) as HTMLElement | null
  if (!el || el.closest('.tl-mount')) return
  const section = el.closest('section')
  const h = section?.querySelector<HTMLElement>(
    ':scope > h2, :scope > h3, :scope > .mw-heading > h2, :scope > .mw-heading > h3',
  )
  const sectionId = h?.id || 'Lead'
  const sectionTitle = h?.textContent?.trim() || 'Lead'
  if (el.closest('h2, h3, .mw-heading')) {
    cursorPlacement.value = { kind: 'sectionTop', sectionId, sectionTitle }
    return
  }
  let block: HTMLElement | null = el
  while (
    block &&
    block.parentElement &&
    !block.parentElement.matches('section, .protowiki-mobile-section-body')
  ) {
    block = block.parentElement
  }
  if (!block || !block.parentElement || block === body) return
  if (!block.id) block.id = `tl-blk-${++blockIds}`
  cursorPlacement.value = { kind: 'after', anchorId: block.id, sectionId, sectionTitle }
}
onMounted(() => document.addEventListener('selectionchange', onSelectionChange))
onBeforeUnmount(() => document.removeEventListener('selectionchange', onSelectionChange))

// ── Edit mode / insert / curate ────────────────────────────────────────────
const draftPlacement = ref<Placement>(DEFAULT_PLACEMENT)
const sheetExpanded = ref(false)
const insertItems = computed(() =>
  props.kinds.map((k) => ({ value: k, label: KINDS[k].title, icon: KINDS[k].icon })),
)

function enterEdit() {
  state.mode = 'edit'
}
function exitEdit() {
  state.panelOpen = false
  state.mode = 'read'
}

function onInsert(value: string) {
  const kind = value as ModuleKind
  if (!props.kinds.includes(kind)) return
  // One module of each kind per article in this prototype: Insert opens the existing one.
  if (state.modules[kind]) return openReEdit(kind)
  draftPlacement.value = cursorPlacement.value ?? DEFAULT_PLACEMENT
  if (!state.draft || state.draft.editingPlaced || state.draft.kind !== kind) {
    state.draft = {
      kind,
      title: KINDS[kind].title,
      items: [],
      options: { ...DEFAULTS[kind] },
      spec: kind === 'visual' ? emptySpec() : undefined,
      editingPlaced: false,
    }
  }
  sheetExpanded.value = false
  state.panelOpen = true
  ;(document.activeElement as HTMLElement | null)?.blur?.()
  document.getSelection()?.removeAllRanges()
}

function openReEdit(kind: ModuleKind) {
  const placed = state.modules[kind]
  if (!placed) return
  state.mode = 'edit'
  state.draft = {
    kind,
    title: placed.data.title,
    items: JSON.parse(JSON.stringify(placed.data.items)),
    options: { ...DEFAULTS[kind], ...placed.data.options },
    spec: placed.data.spec ? JSON.parse(JSON.stringify(placed.data.spec)) : undefined,
    editingPlaced: true,
  }
  sheetExpanded.value = panelMode.value === 'sheet'
  state.panelOpen = true
}

function commit() {
  const draft = state.draft
  if (!draft) return
  const data: ModuleData = {
    title: draft.title,
    items: draft.items,
    options: { ...draft.options },
    spec: draft.spec,
  }
  const placement = draft.editingPlaced
    ? state.modules[draft.kind]!.placement
    : draftPlacement.value
  state.modules = { ...state.modules, [draft.kind]: { data, placement } }
  const kind = draft.kind
  state.draft = null
  state.panelOpen = false
  scrollToModule(kind)
}
function discard() {
  state.draft = null
  state.panelOpen = false
}
function closePanel() {
  state.panelOpen = false
}
function removeModule(kind: ModuleKind) {
  const next = { ...state.modules }
  delete next[kind]
  state.modules = next
}
function moveModule(kind: ModuleKind, sectionId: string) {
  const s = sections.value.find((x) => x.id === sectionId)
  const placed = state.modules[kind]
  if (s && placed) {
    state.modules = {
      ...state.modules,
      [kind]: {
        ...placed,
        placement: { kind: 'sectionTop', sectionId: s.id, sectionTitle: s.title },
      },
    }
  }
  scrollToModule(kind)
}
function scrollToModule(kind: ModuleKind, offset = 72) {
  nextTick(() =>
    setTimeout(() => {
      ensureMounts()
      const m = mountEls[kind]
      if (m) scrollToEl(m, 'start', offset)
    }, 80),
  )
}

// ── Select mode (Pick) ─────────────────────────────────────────────────────
const draftItems = computed<BaseItem[]>(() => state.draft?.items ?? [])
const pickedIds = computed(() =>
  state.draft?.kind === 'visual'
    ? new Set(state.draft.spec?.tableId ? [state.draft.spec.tableId] : [])
    : new Set(draftItems.value.map((e) => e.id)),
)
const usedIds = computed(() => {
  const out = new Set<string>()
  const spec = draftSpec.value
  if (!spec || !article.value) return out
  for (const m of spec.mentions(article.value)) {
    if (!pickedIds.value.has(m.id) && spec.duplicateOf(m, draftItems.value)) out.add(m.id)
  }
  return out
})

/** A tap on a chip whose thing is already there asks first. */
const pendingDuplicate = ref<{ mention: Mention<unknown>; existing: BaseItem } | null>(null)
/** A Visual takes a whole table: tap a table to use it (again to let it go, another to switch). */
function pickTable(id: string) {
  const draft = state.draft
  const a = article.value
  if (!draft || !a) return
  const spec = draft.spec ?? emptySpec()
  if (spec.tableId === id) {
    draft.items = []
    draft.spec = emptySpec()
    return
  }
  const table = tableOf(a, id)
  if (!table) return
  const next = applyTable(a, table, null, null)
  draft.items = next.items
  draft.spec = next.spec
  if (!draft.title || draft.title === KINDS.visual.title)
    draft.title = a.infobox.name || table.sectionTitle
}
// Anywhere on a lit table picks it, not only its chip (big targets on phones).
function onTableClick(e: MouseEvent) {
  if (!panelOpen.value || draftSpec.value?.picks !== 'table') return
  const t = (e.target as Element).closest<HTMLElement>('table[data-pick-table]')
  if (!t || !bodyEl.value?.contains(t)) return
  e.preventDefault()
  pickTable(t.dataset.pickTable!)
}
watch(bodyEl, (el, old) => {
  old?.removeEventListener('click', onTableClick)
  el?.addEventListener('click', onTableClick)
})
onBeforeUnmount(() => bodyEl.value?.removeEventListener('click', onTableClick))

function toggleMention(id: string) {
  if (draftSpec.value?.picks === 'table') return pickTable(id)
  const draft = state.draft
  const spec = draftSpec.value
  const mention = mentionsById.value.get(id)
  if (!draft || !spec || !mention) return
  const i = draft.items.findIndex((e) => e.id === id)
  if (i !== -1) {
    draft.items.splice(i, 1)
    return
  }
  const existing = spec.duplicateOf(mention, draft.items)
  if (existing) {
    pendingDuplicate.value = { mention, existing }
    return
  }
  draft.items.push(spec.fromMention(mention))
}
function confirmDuplicate() {
  const p = pendingDuplicate.value
  if (p && state.draft && draftSpec.value)
    state.draft.items.push(draftSpec.value.fromMention(p.mention))
  pendingDuplicate.value = null
}
watch(panelOpen, (open) => !open && (pendingDuplicate.value = null))
const pendingWhat = computed(() => {
  const p = pendingDuplicate.value
  if (!p) return ''
  const v = p.mention.value as { name?: string; precision?: string }
  return draftSpec.value?.picks === 'date'
    ? formatDate(p.mention.value as never)
    : (v.name ?? p.mention.text)
})

useSelectMode({
  root: bodyEl,
  active: panelOpen,
  kind: computed(() => draftSpec.value?.picks ?? null),
  picked: pickedIds,
  used: usedIds,
  toggle: toggleMention,
  describe: (id) => {
    const m = mentionsById.value.get(id)
    const what = draftSpec.value?.title.toLowerCase() ?? 'module'
    if (!m) return id
    if (draftSpec.value?.picks === 'table')
      return pickedIds.value.has(id)
        ? `Table “${m.text}”: in use, tap to let it go`
        : `Table “${m.text}”: tap to use it`
    if (pickedIds.value.has(id)) return `${m.text}: on the ${what}, tap to remove`
    if (usedIds.value.has(id)) return `${m.text}: already on the ${what} from another sentence`
    return `${m.text}: tap to add to the ${what}`
  },
  sentenceOf: (id) => {
    const m = mentionsById.value.get(id)
    return m ? { start: m.anchor.sentenceStart, end: m.anchor.sentenceEnd } : null
  },
})

function addSearched(place: Place) {
  const draft = state.draft
  if (!draft) return
  if ((draft.items as Place[]).some((p) => p.wikidataId === place.wikidataId)) return
  draft.items.push(place)
}

function showTableFromPanel() {
  const id = state.draft?.spec?.tableId
  const el = id ? bodyEl.value?.querySelector<HTMLElement>(`[data-pick-table="${id}"]`) : null
  if (!el) return
  if (panelMode.value === 'sheet') sheetExpanded.value = false
  scrollToEl(el, 'start', 96)
}

function showSourceFromPanel(item: BaseItem) {
  if (panelMode.value === 'sheet') sheetExpanded.value = false
  if (bodyEl.value && item.sourceAnchor)
    showPassage(bodyEl.value, item.sourceAnchor, item.sourceText)
}

// ── Reader: jump to source and back ────────────────────────────────────────
const backTo = ref<{ kind: ModuleKind; id: string } | null>(null)
const selected = ref<{ kind: ModuleKind; id: string } | null>(null)
let jumpedAt = 0
const timelineRef = ref<InstanceType<typeof TimelineView> | null>(null)
const mapRef = ref<InstanceType<typeof MapView> | null>(null)
const electionRef = ref<InstanceType<typeof ElectionView> | null>(null)

function jumpToSource(kind: ModuleKind, item: BaseItem) {
  if (!bodyEl.value || !item.sourceAnchor) return
  selected.value = { kind, id: item.id }
  if (showPassage(bodyEl.value, item.sourceAnchor, item.sourceText)) {
    backTo.value = { kind, id: item.id }
    jumpedAt = Date.now()
  }
}
function backToModule() {
  const b = backTo.value
  backTo.value = null
  if (!b) return
  const mount = mountEls[b.kind]
  const target =
    mount?.querySelector(`[data-event-id="${b.id}"], [data-place-id="${b.id}"]`) ?? mount
  if (target) scrollToEl(target, 'center')
  setTimeout(() => {
    if (b.kind === 'timeline') timelineRef.value?.focusEvent(b.id)
    else if (b.kind === 'visual') electionRef.value?.focusParty(b.id)
    else mapRef.value?.focusPlace(b.id)
  }, 350)
}
function onScroll() {
  const b = backTo.value
  const mount = b ? mountEls[b.kind] : null
  if (!b || Date.now() - jumpedAt < 1500 || !mount) return
  const r = mount.getBoundingClientRect()
  if (r.bottom > 0 && r.top < window.innerHeight * 0.6) backTo.value = null
}
onMounted(() => window.addEventListener('scroll', onScroll, { passive: true }))
onBeforeUnmount(() => window.removeEventListener('scroll', onScroll))
watch([editing, () => state.signal.n], () => {
  backTo.value = null
  selected.value = null
})

// ── Timeline ↔ map: the same thing in both lights up in both ─────────────────
/** Event ↔ place when the place is named in the event's sentence (by its name, its link text, or one of the sentence's links). */
function sameThing(e: TimelineEvent, p: Place): boolean {
  if (e.sourceAnchor && p.sourceAnchor && e.sourceText === p.sourceText) return true
  const names = [p.name, p.label].filter((s) => s && s.length > 3)
  return names.some((n) => e.sourceText.includes(n) || (e.sourceLinks ?? []).includes(n))
}
const shown = (kind: ModuleKind) => {
  // While re-editing a placed module, its block previews the draft live.
  if (panelOpen.value && state.draft?.editingPlaced && state.draft.kind === kind) return state.draft
  return state.modules[kind]?.data ?? null
}
const linked = computed(() => {
  const events = (shown('timeline')?.items ?? []) as TimelineEvent[]
  const places = (shown('map')?.items ?? []) as Place[]
  const pairs: [string, string][] = []
  for (const e of events) for (const p of places) if (sameThing(e, p)) pairs.push([e.id, p.id])
  return pairs
})
const activeIds = (kind: ModuleKind) => {
  const s = selected.value
  if (!s) return []
  if (s.kind === kind) return [s.id]
  return linked.value
    .filter(([e, p]) => (s.kind === 'timeline' ? e === s.id : p === s.id))
    .map(([e, p]) => (kind === 'timeline' ? e : p))
}

// ── Prototype signals (Load example, Reset) ────────────────────────────────
watch(
  () => state.signal.n,
  () => {
    if (state.signal.kind === 'top') window.scrollTo({ top: 0 })
    else scrollToModule(state.signal.kind, 56)
  },
)

/** Birth date for ages: the infobox's, else a first event that says "born". */
const birth = computed<PartialDate | undefined>(() => {
  if (article.value?.subject.birth) return article.value.subject.birth
  const events = ((shown('timeline') ?? state.draft)?.items ?? []) as TimelineEvent[]
  const first = [...events].filter((e) => e.date).sort((a, b) => a.date.start.y - b.date.start.y)[0]
  return first && /\bborn\b/i.test(first.sourceText) ? first.date.start : undefined
})

const pickedSummary = computed(() => draftItems.value.map((e) => e.label).join(', '))
const backLabel = computed(() =>
  backTo.value ? `Back to ${KINDS[backTo.value.kind].title.toLowerCase()}` : '',
)
</script>

<template>
  <ChromeWrapper
    :skin="props.forceSkin"
    :show-footer="!(isMobile && editing)"
    :last-edited-notice="false"
  >
    <template v-if="isMobile && editing" #header><span /></template>

    <VisualEditorPageLayout :sidebar-open="false" :editing="editing" :skin="skin">
      <div
        class="tl-page"
        :class="{
          'tl-page--editing': editing,
          'tl-page--selecting': panelOpen,
          'tl-page--tables': panelOpen && draftSpec?.picks === 'table',
          'tl-page--sheet': panelOpen && panelMode === 'sheet',
          'tl-page--side': panelOpen && panelMode === 'side',
          'tl-page--make-way': panelOpen && panelMode === 'side' && vw < 1400,
        }"
        :data-skin="skin"
      >
        <div class="tl-page__main">
          <ArticleWrapper
            :title="source.title"
            :skin="props.forceSkin"
            :active-view="editing ? 'edit' : 'read'"
            @read-click="exitEdit"
            @edit-click="enterEdit"
          >
            <VeToolbar
              v-if="editing"
              :skin="skin"
              :suggestions-on="false"
              :count="0"
              :show-suggestions-toggle="false"
              :can-undo="false"
              :can-redo="false"
              :can-publish="Object.keys(state.modules).length > 0 && !panelOpen"
              :review="false"
              :insert-items="insertItems"
              @insert="onInsert"
              @close="exitEdit"
              @publish="exitEdit"
            />

            <CdxProgressBar v-if="!article && !loadError" inline aria-label="Loading article" />
            <CdxMessage v-if="loadError" type="error"
              >Could not load the article snapshot: {{ loadError }}</CdxMessage
            >

            <ArticleRenderer v-if="article" :skin="props.forceSkin">
              <!-- eslint-disable-next-line vue/no-v-html -->
              <div
                :ref="setBodyEl"
                class="tl-body"
                :contenteditable="editing && !panelOpen ? 'true' : 'false'"
                spellcheck="false"
                v-html="article.html"
              />
            </ArticleRenderer>
          </ArticleWrapper>
        </div>

        <Curator
          v-if="panelOpen && article && state.draft && draftSpec"
          :key="state.draft.kind"
          v-model:draft="state.draft"
          v-model:placement="draftPlacement"
          v-model:expanded="sheetExpanded"
          :mode="panelMode"
          :title="draftSpec.title"
          :noun="draftSpec.noun"
          :picks="draftSpec.picks"
          :order="draftSpec.sort"
          :images="article.images"
          :sections="sections"
          :subject="article.subject.name"
          :editing-placed="state.draft.editingPlaced"
          :cursor-placement="cursorPlacement"
          :empty-note="
            draftSpec.picks === 'table'
              ? 'Its columns, rows and colours come with it. Tap it again to let it go.'
              : undefined
          "
          @close="closePanel"
          @discard="discard"
          @commit="commit"
        >
          <template #notice>
            <div v-if="pendingDuplicate" class="tl-dup" role="alert">
              <p class="tl-dup__text">
                <b>{{ pendingWhat }}</b> is already on the {{ draftSpec.title.toLowerCase() }}: “{{
                  pendingDuplicate.existing.label
                }}”. Add it again from this sentence?
              </p>
              <div class="tl-dup__actions">
                <CdxButton size="small" weight="quiet" @click="pendingDuplicate = null"
                  >Keep one</CdxButton
                >
                <CdxButton size="small" @click="confirmDuplicate">Add anyway</CdxButton>
              </div>
            </div>
          </template>

          <template #add>
            <PlaceSearch v-if="state.draft.kind === 'map'" @add="addSearched" />
          </template>

          <template v-if="state.draft.kind === 'visual'" #list>
            <VisualCurate
              v-model:draft="state.draft"
              :article="article"
              @show-source="showSourceFromPanel"
              @show-table="showTableFromPanel"
            />
          </template>

          <template #item="{ item, remove, chooseImage }">
            <EventEditor
              v-if="state.draft.kind === 'timeline'"
              :model-value="item as TimelineEvent"
              :draft-label="draftLabels.get(item.id)"
              @remove="remove"
              @choose-image="chooseImage"
              @show-source="showSourceFromPanel(item)"
            />
            <PlaceEditor
              v-else
              :model-value="item as Place"
              :draft-label="draftLabels.get(item.id)"
              @remove="remove"
              @choose-image="chooseImage"
              @show-source="showSourceFromPanel(item)"
            />
          </template>

          <template #options>
            <template v-if="state.draft.kind === 'timeline'">
              <CdxToggleSwitch v-if="birth" v-model="state.draft.options.showAge" align-switch
                >Age at each event</CdxToggleSwitch
              >
              <CdxToggleSwitch v-model="state.draft.options.showGaps" align-switch
                >Time between events</CdxToggleSwitch
              >
            </template>
            <CdxToggleSwitch
              v-else-if="state.draft.kind === 'map'"
              v-model="state.draft.options.shadeByDate"
              align-switch
              >Shade by date</CdxToggleSwitch
            >
          </template>

          <template #preview="{ wide }">
            <TimelineView
              v-if="state.draft.kind === 'timeline'"
              :events="state.draft.items as TimelineEvent[]"
              :title="state.draft.title"
              :spacing="state.spacing"
              :options="state.draft.options as never"
              :birth="birth"
              :skin="wide ? 'desktop' : skin"
              :layout="wide ? 'horizontal' : 'vertical'"
            />
            <ElectionView
              v-else-if="state.draft.kind === 'visual' && state.draft.spec"
              :items="state.draft.items as Party[]"
              :spec="state.draft.spec"
              :title="state.draft.title"
              :monochrome="state.monochrome"
              :can-show-source="false"
            />
            <MapView
              v-else-if="state.draft.kind === 'map'"
              :places="state.draft.items as Place[]"
              :title="state.draft.title"
              :options="state.draft.options as never"
              :can-show-source="false"
            />
          </template>
        </Curator>
      </div>
    </VisualEditorPageLayout>

    <template v-for="kind in kinds" :key="kind">
      <Teleport v-if="mountEls[kind] && shown(kind)" :to="mountEls[kind]!">
        <ModuleBlock
          :title="KINDS[kind].title"
          :editing="editing"
          :active="panelOpen && !!state.draft?.editingPlaced && state.draft.kind === kind"
          :sections="sections"
          @edit="openReEdit(kind)"
          @remove="removeModule(kind)"
          @move="moveModule(kind, $event)"
        >
          <TimelineView
            v-if="kind === 'timeline'"
            :ref="(el: any) => (timelineRef = el)"
            :events="shown(kind)!.items as TimelineEvent[]"
            :title="shown(kind)!.title"
            :spacing="state.spacing"
            :fallback="state.fallback"
            :skin="skin"
            :options="shown(kind)!.options as never"
            :birth="birth"
            :active-ids="activeIds('timeline')"
            @select="jumpToSource('timeline', $event)"
          />
          <ElectionView
            v-else-if="kind === 'visual' && shown(kind)!.spec"
            :ref="(el: any) => (electionRef = el)"
            :items="shown(kind)!.items as Party[]"
            :spec="shown(kind)!.spec!"
            :title="shown(kind)!.title"
            :fallback="state.fallback"
            :monochrome="state.monochrome"
            @select="jumpToSource('visual', $event)"
          />
          <MapView
            v-else-if="kind === 'map'"
            :ref="(el: any) => (mapRef = el)"
            :places="shown(kind)!.items as Place[]"
            :title="shown(kind)!.title"
            :fallback="state.fallback"
            :options="shown(kind)!.options as never"
            :active-ids="activeIds('map')"
            @select="jumpToSource('map', $event)"
            @focus="
              selected = $event
                ? { kind: 'map', id: $event.id }
                : selected?.kind === 'map'
                  ? null
                  : selected
            "
          />
        </ModuleBlock>
      </Teleport>
    </template>

    <div v-if="backTo && !editing" class="tl-back" :class="{ 'tl-back--mobile': isMobile }">
      <CdxButton action="progressive" @click="backToModule">
        <CdxIcon :icon="cdxIconArrowUp" /> {{ backLabel }}
      </CdxButton>
    </div>
    <span class="tl-sr" aria-live="polite">{{
      panelOpen ? `Picked: ${pickedSummary || 'none'}` : ''
    }}</span>
  </ChromeWrapper>
</template>

<style scoped>
.tl-page {
  display: flex;
  align-items: flex-start;
}
.tl-page__main {
  flex: 1;
  min-width: 0;
}
.tl-page[data-skin='mobile'] {
  overflow-x: clip;
}
.tl-page--sheet {
  padding-bottom: 96px;
}
.tl-back {
  position: fixed;
  left: 50%;
  bottom: var(--spacing-150);
  transform: translateX(-50%);
  z-index: 90;
  animation: tl-rise 200ms ease-out;
}
.tl-back--mobile {
  bottom: 64px;
}
.tl-back :deep(.cdx-button) {
  background-color: var(--background-color-base);
}
.tl-dup {
  padding: var(--spacing-75);
  border-inline-start: var(--border-width-thick, 2px) solid var(--border-color-progressive);
  background: var(--background-color-progressive-subtle);
}
.tl-dup__text {
  margin: 0 0 var(--spacing-50);
  font-size: var(--font-size-small);
  line-height: var(--line-height-small);
}
.tl-dup__text b {
  font-weight: var(--font-weight-normal);
  color: var(--color-progressive);
}
.tl-dup__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-50);
}
.tl-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
@keyframes tl-rise {
  from {
    opacity: 0;
    transform: translate(-50%, 12px);
  }
}
</style>

<!-- Article-level styles for select mode and source highlights (the body is v-html, so unscoped). -->
<style>
.tl-body:focus {
  outline: none;
}
.tl-page--editing .tl-body[contenteditable='true'] {
  caret-color: var(--color-progressive);
}

/* Select mode: the article recedes, every date becomes a chip. */
.tl-page--selecting .mw-parser-output {
  color: var(--color-placeholder);
}
.tl-mount {
  display: flow-root;
}
.tl-page--selecting .mw-parser-output a:not(.tl-ev__link):not(.tl-mention--candidate) {
  color: inherit;
}
.tl-page--selecting
  .mw-parser-output
  :is(figure, .infobox, table, .gallery, img, .hatnote, .side-box, .navbox) {
  opacity: 0.35;
  transition: opacity 200ms;
}
.tl-page--selecting .mw-parser-output .tl-mount {
  opacity: 0.6;
}
/* Chips: same metrics as the text (no bold, zero net padding), so picking never reflows. */
.tl-page.tl-page--selecting .mw-parser-output .tl-mention--candidate {
  padding: 1px 3px;
  margin: -1px -3px;
  border-radius: var(--border-radius-base, 2px);
  background-color: var(--background-color-progressive-subtle);
  color: var(--color-progressive);
  cursor: pointer;
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
  transition:
    background-color 120ms,
    color 120ms,
    box-shadow 240ms;
}
.tl-page.tl-page--selecting .mw-parser-output .tl-mention--candidate:hover {
  background-color: var(--background-color-progressive-subtle--hover);
}
.tl-page.tl-page--selecting .mw-parser-output .tl-mention--candidate:focus-visible {
  outline: 2px solid var(--outline-color-progressive--focus, #36c);
  outline-offset: 1px;
}
.tl-page.tl-page--selecting .mw-parser-output .tl-mention--candidate.tl-mention--picked,
.tl-page.tl-page--selecting .mw-parser-output a.tl-mention--candidate.tl-mention--picked:visited {
  background-color: var(--background-color-progressive);
  color: var(--color-inverted-fixed, #fff);
}
.tl-page.tl-page--selecting .mw-parser-output .tl-mention--picked:hover {
  background-color: var(--background-color-progressive--hover);
}
/* A ring that ripples out on tap: feedback without moving any text. */
.tl-page.tl-page--selecting .mw-parser-output .tl-mention--pop {
  animation: tl-ring 420ms ease-out;
}
@keyframes tl-ring {
  from {
    box-shadow: 0 0 0 0 var(--border-color-progressive);
  }
  to {
    box-shadow: 0 0 0 6px transparent;
  }
}

::highlight(tl-hover) {
  background-color: var(--background-color-interactive-subtle--hover, #eaecf0);
  color: var(--color-base);
}
.tl-hl--tl-hover {
  background-color: var(--background-color-interactive-subtle--hover, #eaecf0);
}

/* Already on the timeline via another sentence: still tappable, visibly spent. */
.tl-page.tl-page--selecting .mw-parser-output .tl-mention--used {
  background-color: transparent;
  color: var(--color-progressive);
  box-shadow: inset 0 -1px 0 var(--border-color-progressive);
  border-radius: 0;
}

/* Tables (a Visual): every data table is lit, with a chip before it. Hidden otherwise. */
.tl-table-pick {
  display: none;
}
.tl-page--tables .tl-table-pick {
  display: block;
  margin: var(--spacing-75) 0 var(--spacing-25);
}
.tl-page.tl-page--tables .mw-parser-output table[data-pick-table] {
  opacity: 1;
  color: var(--color-base);
  outline: var(--border-width-base, 1px) solid var(--border-color-progressive);
  outline-offset: 2px;
  cursor: pointer;
}
.tl-page.tl-page--tables .mw-parser-output .tl-table-pick:has(.tl-mention--picked) + table {
  outline-width: var(--border-width-thick, 2px);
}
.tl-page.tl-page--tables .mw-parser-output button.tl-table-chip.tl-mention--candidate {
  margin: 0;
  padding: var(--spacing-25) var(--spacing-75);
  border: 0;
  border-radius: var(--border-radius-base, 2px);
  font-family: var(--font-family-base);
  font-size: var(--font-size-small);
  line-height: var(--line-height-small);
}
.tl-table-chip__using,
.tl-mention--picked .tl-table-chip__use {
  display: none;
}
.tl-mention--picked .tl-table-chip__using {
  display: inline;
}

/* Jump-to-source mark (pick/passage.ts): held, then a slow fade. Uses the viz tokens. */
.tl-passage-mark {
  position: absolute;
  inset: 0 auto auto 0;
  pointer-events: none;
  z-index: 5;
  mix-blend-mode: multiply;
  animation: tl-mark-fade var(--viz-highlight-fade) ease-in var(--viz-highlight-hold) forwards;
}
[data-theme='dark'] .tl-passage-mark {
  mix-blend-mode: screen;
}
.tl-passage-mark__line {
  position: absolute;
  background: var(--viz-accent-wash-strong);
  box-shadow: inset 0 -2px 0 var(--viz-accent);
}
@keyframes tl-mark-fade {
  to {
    opacity: 0;
  }
}

/*
 * Never scroll sideways. The skin makes desktop .mw-parser-output a horizontal
 * scroll container; anything a few px too wide (the article's packed gallery
 * keeps its list indent) then lets the caret scroll it, clipping the first
 * characters of every line. Clip instead, and let wide data tables scroll on
 * their own.
 */
.tl-page .article .mw-parser-output.mw-parser-output {
  overflow-x: clip;
}
/* Screen-reader-only rows (the election infobox) are clipped but 100% wide: keep them from widening the page. */
.tl-page .mw-parser-output .sr-only {
  width: 1px;
  max-width: 1px;
  overflow: hidden;
}
.tl-page .mw-parser-output ul.gallery {
  margin-inline: 0;
  max-width: 100%;
}
.tl-page .mw-parser-output table.wikitable {
  display: block;
  max-width: 100%;
  overflow-x: auto;
}

/* With the sidebar open on a mid-size screen, floats step aside so the text stays a comfortable width. */
.tl-page--make-way
  .mw-parser-output
  :is(.infobox, figure[typeof~='mw:File/Thumb'], .thumb, .side-box, .sidebar) {
  display: none;
}
</style>
