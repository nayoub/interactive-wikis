<script setup lang="ts">
/**
 * The general visual tool's page: an article in a VE-style editor where
 * Insert → Visual (or a suggested visual) opens one pick mode, one curate
 * panel and one frame for every form. Any number of visuals can be placed.
 * Built from the shared kit: loadArticle, useSelectMode, passage, the
 * curation panel shell, ModuleBlock, the prototype menu.
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
import { CdxButton, CdxIcon, CdxMessage, CdxProgressBar } from '@wikimedia/codex'
import { cdxIconArrowUp, cdxIconChart, cdxIconLightbulb } from '@wikimedia/codex-icons'

import ArticleRenderer from '@/components/article/ArticleRenderer.vue'
import ArticleWrapper from '@/components/article/ArticleWrapper.vue'
import ChromeWrapper from '@/components/chrome/ChromeWrapper.vue'
import VeToolbar from '@/components/visual-editor/VeToolbar.vue'
import VisualEditorPageLayout from '@/components/visual-editor/VisualEditorPageLayout.vue'
import { globalSkin } from '@/theme'

import { hub, type HubId } from '../host/hub'
import { loadArticle, type ArticleSource, type LoadedArticle } from '../host/loadArticle'
import ModuleBlock from '../host/ModuleBlock.vue'
import PrototypeMenu from '../host/PrototypeMenu.vue'
import type { ModulesStore, PlacedModule } from '../host/store'
import { setDayFirst } from '../model/dates'
import type { ModuleKind, Placement } from '../model/types'
import type { Item } from '../model/visual'
import { scrollToEl, showPassage } from '../pick/passage'
import { END_MATTER } from '../pick/textIndex'
import { useSelectMode } from '../pick/useSelectMode'
import {
  emptyDraft,
  itemsOf,
  pickImage,
  pickTable,
  toggleMention,
  type PickFilter,
  type PlacedVisual,
} from './draft'
import GeneralCurate from './GeneralCurate.vue'
import { suggestions } from './suggest'
import VisualFrame from './VisualFrame.vue'

const props = defineProps<{
  store: ModulesStore
  source: ArticleSource
  hubId: HubId
  example: () => Promise<Partial<Record<ModuleKind, PlacedModule>>>
  forceSkin?: 'desktop' | 'mobile'
}>()
const state = props.store.state
const skin = computed(() => props.forceSkin ?? globalSkin.value)
const isMobile = computed(() => skin.value === 'mobile')
const editing = computed(() => state.mode === 'edit')
const panelOpen = computed(() => editing.value && state.panelOpen && !!state.vdraft)

const vw = ref(typeof window === 'undefined' ? 1280 : window.innerWidth)
const onResize = () => (vw.value = window.innerWidth)
onMounted(() => window.addEventListener('resize', onResize))
onBeforeUnmount(() => window.removeEventListener('resize', onResize))
const panelMode = computed<'side' | 'sheet'>(() =>
  isMobile.value || vw.value < 1000 ? 'sheet' : 'side',
)

// ── Article ────────────────────────────────────────────────────────────────
const article = shallowRef<LoadedArticle | null>(null)
const loadError = ref<string | null>(null)
loadArticle(props.source)
  .then((a) => {
    setDayFirst(a.dayFirst)
    article.value = a
  })
  .catch((e) => (loadError.value = String(e?.message ?? e)))
const sections = computed(() =>
  (article.value?.sections ?? []).filter((s) => !END_MATTER.has(s.id)),
)
const bodyEl = ref<HTMLElement | null>(null)
function setBodyEl(el: unknown) {
  const next = (el as HTMLElement | null) ?? null
  if (next !== bodyEl.value) bodyEl.value = next
}
const counts = computed(() => {
  const a = article.value
  return {
    date: a?.mentions.length ?? 0,
    place: a?.places.length ?? 0,
    table: a?.tables.length ?? 0,
    image: a?.images.filter((i) => i.source === 'article').length ?? 0,
  }
})

// ── Placement: a mount per placed visual; its frame teleports in ───────────
const mountEls = reactive<Record<string, HTMLElement | null>>({})
const DEFAULT_PLACEMENT: Placement = {
  kind: 'sectionTop',
  sectionId: props.source.defaultSection.id,
  sectionTitle: props.source.defaultSection.title,
}
function insertAt(body: HTMLElement, mount: HTMLElement, p: Placement, after: HTMLElement | null) {
  if (after) {
    if (after.nextElementSibling !== mount) after.after(mount)
    return
  }
  if (p.kind === 'after') {
    const anchor = body.querySelector(`#${CSS.escape(p.anchorId)}`)
    if (anchor?.parentElement)
      return void (anchor.nextElementSibling !== mount && anchor.after(mount))
  }
  const heading =
    body.querySelector<HTMLElement>(`#${CSS.escape(p.sectionId)}`) ?? body.querySelector('h2')
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
  const live = new Set(state.visuals.map((v) => v.id))
  for (const id of Object.keys(mountEls)) {
    if (!live.has(id) || !body) {
      mountEls[id]?.remove()
      delete mountEls[id]
    }
  }
  if (!body) return
  for (const v of state.visuals) {
    let mount = mountEls[v.id] ?? null
    if (!mount || !body.contains(mount)) {
      mount = document.createElement('div')
      mount.className = 'tl-mount'
      mount.dataset.visual = v.id
      mount.setAttribute('contenteditable', 'false')
    }
    const key =
      v.placement.kind === 'after'
        ? `after:${v.placement.anchorId}`
        : `top:${v.placement.sectionId}`
    insertAt(body, mount, v.placement, lastAt.get(key) ?? null)
    lastAt.set(key, mount)
    mountEls[v.id] = mount
  }
}
watch([bodyEl, () => state.visuals, skin], () => nextTick(ensureMounts), {
  deep: true,
  flush: 'post',
})
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
  const h = el
    .closest('section')
    ?.querySelector<HTMLElement>(':scope > h2, :scope > h3, :scope > .mw-heading > :is(h2, h3)')
  const sectionId = h?.id || 'Lead'
  const sectionTitle = h?.textContent?.trim() || 'Lead'
  let block: HTMLElement | null = el
  while (
    block?.parentElement &&
    !block.parentElement.matches('section, .protowiki-mobile-section-body')
  )
    block = block.parentElement
  if (!block || block === body) return
  if (!block.id) block.id = `tl-blk-${++blockIds}`
  cursorPlacement.value = { kind: 'after', anchorId: block.id, sectionId, sectionTitle }
}
onMounted(() => document.addEventListener('selectionchange', onSelectionChange))
onBeforeUnmount(() => document.removeEventListener('selectionchange', onSelectionChange))

// ── Insert: Visual, or a suggestion ────────────────────────────────────────
const suggested = computed(() => (article.value ? suggestions(article.value) : []))
const insertItems = computed(() => [
  ...suggested.value.map((s) => ({
    value: `suggest:${s.id}`,
    label: s.label,
    icon: cdxIconLightbulb,
    group: 'Suggested visuals',
  })),
  { value: 'visual', label: 'Visual', icon: cdxIconChart, group: 'Insert' },
])
const draftPlacement = ref<Placement>(DEFAULT_PLACEMENT)
const sheetExpanded = ref(false)
function onInsert(value: string) {
  draftPlacement.value = cursorPlacement.value ?? DEFAULT_PLACEMENT
  const s = suggested.value.find((x) => `suggest:${x.id}` === value)
  state.vdraft = s ? s.build() : emptyDraft()
  // A suggestion opens ready to curate.
  sheetExpanded.value = !!s && panelMode.value === 'sheet'
  state.panelOpen = true
  ;(document.activeElement as HTMLElement | null)?.blur?.()
  document.getSelection()?.removeAllRanges()
}
function openReEdit(id: string) {
  const v = state.visuals.find((x) => x.id === id)
  if (!v) return
  state.mode = 'edit'
  state.vdraft = {
    ...emptyDraft('all'),
    visual: JSON.parse(JSON.stringify(v.visual)),
    editingId: id,
  }
  sheetExpanded.value = panelMode.value === 'sheet'
  state.panelOpen = true
}
let ids = 0
function commit() {
  const d = state.vdraft
  if (!d) return
  const visual = JSON.parse(JSON.stringify(d.visual))
  if (d.editingId) {
    state.visuals = state.visuals.map((v) => (v.id === d.editingId ? { ...v, visual } : v))
  } else {
    const id = `v${Date.now().toString(36)}${++ids}`
    state.visuals = [...state.visuals, { id, visual, placement: draftPlacement.value }]
    scrollTo(id)
  }
  state.fromExample = false
  state.vdraft = null
  state.panelOpen = false
}
function discard() {
  state.vdraft = null
  state.panelOpen = false
}
function removeVisual(id: string) {
  state.visuals = state.visuals.filter((v) => v.id !== id)
  state.fromExample = false
}
function moveVisual(id: string, sectionId: string) {
  const s = sections.value.find((x) => x.id === sectionId)
  if (!s) return
  state.visuals = state.visuals.map((v) =>
    v.id === id
      ? { ...v, placement: { kind: 'sectionTop', sectionId: s.id, sectionTitle: s.title } }
      : v,
  )
  state.fromExample = false
  scrollTo(id)
}
function scrollTo(id: string, offset = 72) {
  nextTick(() =>
    setTimeout(() => {
      ensureMounts()
      const m = mountEls[id]
      if (m) scrollToEl(m, 'start', offset)
    }, 80),
  )
}
const editingId = computed(() => (panelOpen.value ? state.vdraft?.editingId : null))
const shownVisual = (v: PlacedVisual) =>
  editingId.value === v.id && state.vdraft ? state.vdraft.visual : v.visual

// ── Pick mode: everything pickable lights up, narrowed by the filter ───────
const KINDS: Record<PickFilter, string[]> = {
  all: ['date', 'place', 'table', 'image'],
  date: ['date'],
  place: ['place'],
  table: ['table'],
  image: ['image'],
}
const litKinds = computed(() =>
  panelOpen.value && state.vdraft ? KINDS[state.vdraft.filter] : null,
)
const pickedIds = computed(() => {
  const d = state.vdraft
  if (!d) return new Set<string>()
  return new Set([...itemsOf(d).map((i) => i.id), d.tableId ?? '', d.imageId ?? ''].filter(Boolean))
})
function toggle(id: string) {
  const d = state.vdraft
  const a = article.value
  if (!d || !a) return
  if (a.tables.some((t) => t.id === id)) pickTable(d, a, id)
  else if (/^img\d+$/.test(id)) pickImage(d, a, id)
  else toggleMention(d, a, id)
}
useSelectMode({
  root: bodyEl,
  active: panelOpen,
  kind: litKinds,
  picked: pickedIds,
  toggle,
  describe: (id) =>
    pickedIds.value.has(id) ? 'Picked, tap to remove' : 'Tap to add to the visual',
  sentenceOf: (id) => {
    const m = [...(article.value?.mentions ?? []), ...(article.value?.places ?? [])].find(
      (x) => x.id === id,
    )
    return m ? { start: m.anchor.sentenceStart, end: m.anchor.sentenceEnd } : null
  },
})
// A table is picked by tapping anywhere on it (big targets on phones).
function onTableClick(e: MouseEvent) {
  if (!panelOpen.value || !litKinds.value?.includes('table')) return
  const t = (e.target as Element).closest<HTMLElement>('table[data-pick-table]')
  if (!t || (e.target as Element).closest('.tl-mention')) return
  e.preventDefault()
  toggle(t.dataset.pickTable!)
}
watch(bodyEl, (el, old) => {
  old?.removeEventListener('click', onTableClick)
  el?.addEventListener('click', onTableClick)
})

function showItemSource(item: Item) {
  if (panelMode.value === 'sheet') sheetExpanded.value = false
  if (bodyEl.value && item.source.anchor)
    showPassage(
      bodyEl.value,
      item.source.anchor,
      item.source.kind === 'sentence' ? item.source.text : undefined,
    )
}
function showTable() {
  const id = state.vdraft?.tableId
  const el = id ? bodyEl.value?.querySelector<HTMLElement>(`[data-pick-table="${id}"]`) : null
  if (!el) return
  if (panelMode.value === 'sheet') sheetExpanded.value = false
  scrollToEl(el, 'start', 96)
}

// ── Reader: jump to source and back ────────────────────────────────────────
const backTo = ref<string | null>(null)
let jumpedAt = 0
function jumpToSource(id: string, item: Item) {
  if (!bodyEl.value || !item.source.anchor) return
  if (
    showPassage(
      bodyEl.value,
      item.source.anchor,
      item.source.kind === 'sentence' ? item.source.text : undefined,
    )
  ) {
    backTo.value = id
    jumpedAt = Date.now()
  }
}
function backToVisual() {
  const id = backTo.value
  backTo.value = null
  const m = id ? mountEls[id] : null
  if (m) scrollToEl(m, 'start', 72)
}
function onScroll() {
  const m = backTo.value ? mountEls[backTo.value] : null
  if (!m || Date.now() - jumpedAt < 1500) return
  const r = m.getBoundingClientRect()
  if (r.bottom > 0 && r.top < window.innerHeight * 0.6) backTo.value = null
}
onMounted(() => window.addEventListener('scroll', onScroll, { passive: true }))
onBeforeUnmount(() => window.removeEventListener('scroll', onScroll))
watch(
  () => state.signal.n,
  () => {
    backTo.value = null
    if (state.signal.kind === 'top') window.scrollTo({ top: 0 })
    else if (state.visuals[0]) scrollTo(state.visuals[0].id, 56)
  },
)
const languages = computed(() =>
  article.value?.labelLanguages.length
    ? [{ value: 'en', label: 'English' }, ...article.value.labelLanguages]
    : [],
)
</script>

<template>
  <ChromeWrapper
    :skin="props.forceSkin"
    :show-footer="!(isMobile && editing)"
    :last-edited-notice="false"
    tag="Prototype"
  >
    <template v-if="isMobile && editing" #header><span /></template>
    <template #user-menu>
      <PrototypeMenu
        :current="hubId"
        :kinds="['timeline']"
        :store="store"
        :example="example"
        :skin="isMobile ? 'mobile' : 'desktop'"
        :languages="languages"
      />
    </template>

    <VisualEditorPageLayout :sidebar-open="false" :editing="editing" :skin="skin">
      <div
        class="tl-page gm"
        :class="{
          'tl-page--editing': editing,
          'tl-page--selecting': panelOpen,
          'tl-page--tables': panelOpen && litKinds?.includes('table'),
          'gm--images': panelOpen && litKinds?.includes('image'),
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
            @read-click="state.mode = 'read'"
            @edit-click="state.mode = 'edit'"
          >
            <VeToolbar
              v-if="editing"
              :skin="skin"
              :suggestions-on="false"
              :count="0"
              :show-suggestions-toggle="false"
              :can-undo="false"
              :can-redo="false"
              :can-publish="state.visuals.length > 0 && !panelOpen"
              :review="false"
              :insert-items="insertItems"
              @insert="onInsert"
              @close="state.mode = 'read'"
              @publish="state.mode = 'read'"
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

        <GeneralCurate
          v-if="panelOpen && article && state.vdraft"
          v-model:draft="state.vdraft"
          v-model:placement="draftPlacement"
          v-model:expanded="sheetExpanded"
          :article="article"
          :mode="panelMode"
          :sections="sections"
          :cursor-placement="cursorPlacement"
          :counts="counts"
          :lang="hub.lang"
          @close="state.panelOpen = false"
          @discard="discard"
          @commit="commit"
          @show-source="showItemSource"
          @show-table="showTable"
        />
      </div>
    </VisualEditorPageLayout>

    <template v-for="v in state.visuals" :key="v.id">
      <Teleport v-if="mountEls[v.id]" :to="mountEls[v.id]!">
        <ModuleBlock
          title="Visual"
          :editing="editing"
          :active="editingId === v.id"
          :sections="sections"
          @edit="openReEdit(v.id)"
          @remove="removeVisual(v.id)"
          @move="moveVisual(v.id, $event)"
        >
          <VisualFrame
            :visual="shownVisual(v)"
            :fallback="hub.fallback"
            :lang="hub.lang"
            :skin="skin"
            :spacing="state.spacing"
            @show="jumpToSource(v.id, $event)"
          />
        </ModuleBlock>
      </Teleport>
    </template>

    <div v-if="backTo && !editing" class="gm__back" :class="{ 'gm__back--mobile': isMobile }">
      <CdxButton action="progressive" @click="backToVisual"
        ><CdxIcon :icon="cdxIconArrowUp" /> Back to visual</CdxButton
      >
    </div>
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
.gm__back {
  position: fixed;
  left: 50%;
  bottom: var(--spacing-150);
  transform: translateX(-50%);
  z-index: 90;
}
.gm__back--mobile {
  bottom: 64px;
}
.gm__back :deep(.cdx-button) {
  background-color: var(--background-color-base);
}
</style>

<!-- Images as pick targets (the body is v-html, so unscoped). Chips, tables and passage marks: ArticleModules' global styles. -->
<style>
.gm.gm--images .mw-parser-output .tl-pick-image.tl-mention--candidate {
  opacity: 1;
  margin: 0;
  padding: 0;
  background: none;
  outline: var(--border-width-base, 1px) solid var(--border-color-progressive);
  outline-offset: 2px;
  cursor: pointer;
}
.gm.gm--images .mw-parser-output .tl-pick-image.tl-mention--candidate img {
  opacity: 1;
}
.gm.gm--images .mw-parser-output .tl-pick-image.tl-mention--picked {
  outline-width: var(--border-width-thick, 2px);
}
.gm.tl-page--selecting:not(.gm--images) .mw-parser-output .tl-pick-image {
  opacity: 0.35;
}
</style>
