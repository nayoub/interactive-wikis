<script setup lang="ts">
/**
 * The Frank Gehry article with the timeline tool: read view, a VE-style edit
 * mode (shared VeToolbar with a working Insert menu), select mode, the
 * curation panel, and the placed timeline block.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { CdxButton, CdxIcon, CdxMessage, CdxProgressBar } from '@wikimedia/codex'
import { cdxIconArrowUp } from '@wikimedia/codex-icons'

import ArticleRenderer from '@/components/article/ArticleRenderer.vue'
import ArticleWrapper from '@/components/article/ArticleWrapper.vue'
import ChromeWrapper from '@/components/chrome/ChromeWrapper.vue'
import VeToolbar from '@/components/visual-editor/VeToolbar.vue'
import VisualEditorPageLayout from '@/components/visual-editor/VisualEditorPageLayout.vue'
import { globalSkin } from '@/theme'

import { loadArticle, type LoadedArticle } from './loadArticle'
import TimelineBlock from './TimelineBlock.vue'
import { timelineIcon } from './timelineIcon'
// Pick
import { findDuplicate } from '../pick/duplicates'
import { scrollToEl, showPassage } from '../pick/passage'
import { END_MATTER } from '../pick/textIndex'
import type { DateMention } from '../pick/types'
import { useSelectMode } from '../pick/useSelectMode'
// Curate
import TimelineCurator from '../curate/TimelineCurator.vue'
import { eventFromMention } from '../curate/fromMention'
// Render
import TimelineView from '../render/TimelineView.vue'
// Model
import { formatDate, sameDate } from '../model/dates'
import {
  DEFAULT_OPTIONS,
  type PartialDate,
  type Placement,
  type TimelineEvent,
} from '../model/types'
import { state } from '../store'

const props = defineProps<{ forceSkin?: 'desktop' | 'mobile' }>()

const skin = computed(() => props.forceSkin ?? globalSkin.value)
const isMobile = computed(() => skin.value === 'mobile')
const editing = computed(() => state.mode === 'edit')
const panelOpen = computed(() => editing.value && state.panelOpen && !!state.draft)

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
loadArticle()
  .then((a) => (article.value = a))
  .catch((e) => (loadError.value = String(e?.message ?? e)))

const mentionsById = computed(() => new Map((article.value?.mentions ?? []).map((m) => [m.id, m])))
const draftLabels = computed(
  () => new Map((article.value?.mentions ?? []).map((m) => [m.id, m.draftLabel])),
)
const sections = computed(() =>
  (article.value?.sections ?? []).filter((s) => !END_MATTER.has(s.id) && s.id !== 'Gallery'),
)

const bodyEl = ref<HTMLElement | null>(null)
function setBodyEl(el: unknown) {
  const next = (el as HTMLElement | null) ?? null
  if (next !== bodyEl.value) bodyEl.value = next
}

// ── Placement: a mount node inside the article HTML, the block teleports into it ──
const mountEl = ref<HTMLElement | null>(null)
const DEFAULT_PLACEMENT: Placement = {
  kind: 'sectionTop',
  sectionId: 'Career',
  sectionTitle: 'Career',
}

function insertMount(body: HTMLElement, mount: HTMLElement, placement: Placement) {
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

const showBlock = computed(() => !!state.timeline && !!state.placement)
function ensureMount() {
  const body = bodyEl.value
  if (!body || !showBlock.value) {
    mountEl.value?.remove()
    mountEl.value = null
    return
  }
  let mount = mountEl.value
  if (!mount || !body.contains(mount)) {
    mount = document.createElement('div')
    mount.className = 'tl-mount'
    mount.setAttribute('contenteditable', 'false')
  }
  insertMount(body, mount, state.placement!)
  mountEl.value = mount
}
watch([bodyEl, () => state.placement, showBlock, skin], () => nextTick(ensureMount), {
  deep: true,
  flush: 'post',
})

// Minerva's section accordion moves nodes after mount; re-seat once it settles.
watch(bodyEl, (el) => el && setTimeout(ensureMount, 50))

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

const insertItems = [{ value: 'timeline', label: 'Timeline', icon: timelineIcon }]

function enterEdit() {
  state.mode = 'edit'
}
function exitEdit() {
  state.panelOpen = false
  state.mode = 'read'
}

function onInsert(value: string) {
  if (value !== 'timeline') return
  // One timeline per article in this prototype: Insert opens the existing one.
  if (state.timeline) return openReEdit()
  draftPlacement.value = cursorPlacement.value ?? DEFAULT_PLACEMENT
  if (!state.draft || state.draft.editingPlaced) {
    state.draft = {
      title: 'Timeline',
      events: [],
      options: { ...DEFAULT_OPTIONS },
      editingPlaced: false,
    }
  }
  sheetExpanded.value = false
  state.panelOpen = true
  ;(document.activeElement as HTMLElement | null)?.blur?.()
  document.getSelection()?.removeAllRanges()
}

function openReEdit() {
  if (!state.timeline) return
  state.mode = 'edit'
  state.draft = {
    title: state.timeline.title,
    events: JSON.parse(JSON.stringify(state.timeline.events)),
    options: { ...DEFAULT_OPTIONS, ...state.timeline.options },
    editingPlaced: true,
  }
  sheetExpanded.value = panelMode.value === 'sheet'
  state.panelOpen = true
}

function commit() {
  const draft = state.draft
  if (!draft) return
  state.timeline = { title: draft.title, events: draft.events, options: { ...draft.options } }
  if (!draft.editingPlaced) state.placement = draftPlacement.value
  state.draft = null
  state.panelOpen = false
  nextTick(() =>
    setTimeout(() => {
      if (mountEl.value) scrollToEl(mountEl.value, 'start', 72)
    }, 80),
  )
}

function discard() {
  state.draft = null
  state.panelOpen = false
}

function closePanel() {
  state.panelOpen = false
}

function removeTimeline() {
  state.timeline = null
  state.placement = null
}

function moveTimeline(sectionId: string) {
  const s = sections.value.find((x) => x.id === sectionId)
  if (s) state.placement = { kind: 'sectionTop', sectionId: s.id, sectionTitle: s.title }
  nextTick(() =>
    setTimeout(() => {
      if (mountEl.value) scrollToEl(mountEl.value, 'start', 72)
    }, 80),
  )
}

// Select mode
const pickedIds = computed(() => new Set((state.draft?.events ?? []).map((e) => e.id)))

/** The picked event a mention would duplicate: same date, and either a full date or largely the same sentence. */
function duplicateOf(m: DateMention): TimelineEvent | null {
  const events = state.draft?.events ?? []
  return findDuplicate(
    { id: m.id, sentence: m.sentence },
    events.map((e) => ({ ...e, sentence: e.sourceText })),
    (e) => sameDate(e.date, m.value),
    m.value.precision === 'day',
  )
}
const usedIds = computed(() => {
  const out = new Set<string>()
  if (!panelOpen.value) return out
  for (const m of article.value?.mentions ?? []) {
    if (!pickedIds.value.has(m.id) && duplicateOf(m)) out.add(m.id)
  }
  return out
})

/** A tap on a chip whose event is already there asks first. */
const pendingDuplicate = ref<{ mention: DateMention; existing: TimelineEvent } | null>(null)
function toggleMention(id: string) {
  const draft = state.draft
  const mention = mentionsById.value.get(id)
  if (!draft || !mention) return
  const i = draft.events.findIndex((e) => e.id === id)
  if (i !== -1) {
    draft.events.splice(i, 1)
    return
  }
  const existing = duplicateOf(mention)
  if (existing) {
    pendingDuplicate.value = { mention, existing }
    return
  }
  draft.events.push(eventFromMention(mention))
}
function confirmDuplicate() {
  const p = pendingDuplicate.value
  if (p && state.draft) state.draft.events.push(eventFromMention(p.mention))
  pendingDuplicate.value = null
}
watch(panelOpen, (open) => !open && (pendingDuplicate.value = null))
useSelectMode({
  root: bodyEl,
  active: panelOpen,
  picked: pickedIds,
  used: usedIds,
  toggle: toggleMention,
  describe: (id) => {
    const m: DateMention | undefined = mentionsById.value.get(id)
    if (!m) return id
    if (pickedIds.value.has(id)) return `${m.text}: on the timeline, tap to remove`
    if (usedIds.value.has(id)) return `${m.text}: already on the timeline from another sentence`
    return `${m.text}: tap to add to the timeline`
  },
  sentenceOf: (id) => {
    const m = mentionsById.value.get(id)
    return m ? { start: m.anchor.sentenceStart, end: m.anchor.sentenceEnd } : null
  },
})

function showSourceFromPanel(event: TimelineEvent) {
  if (panelMode.value === 'sheet') sheetExpanded.value = false
  if (bodyEl.value) showPassage(bodyEl.value, event.sourceAnchor, event.sourceText)
}

// ── Reader: jump to source and back ────────────────────────────────────────
const blockRef = ref<InstanceType<typeof TimelineBlock> | null>(null)
const backTo = ref<string | null>(null)
const activeEventId = ref<string | null>(null)
let jumpedAt = 0

function onSelectEvent(event: TimelineEvent) {
  if (!bodyEl.value) return
  activeEventId.value = event.id
  if (showPassage(bodyEl.value, event.sourceAnchor, event.sourceText)) {
    backTo.value = event.id
    jumpedAt = Date.now()
  }
}
function backToTimeline() {
  const id = backTo.value
  backTo.value = null
  const target = mountEl.value?.querySelector(`[data-event-id="${id}"]`) ?? mountEl.value
  if (target) scrollToEl(target, 'center')
  if (id) setTimeout(() => blockRef.value?.focusEvent(id), 350)
}
function onScroll() {
  if (!backTo.value || Date.now() - jumpedAt < 1500 || !mountEl.value) return
  const r = mountEl.value.getBoundingClientRect()
  if (r.bottom > 0 && r.top < window.innerHeight * 0.6) backTo.value = null
}
onMounted(() => window.addEventListener('scroll', onScroll, { passive: true }))
onBeforeUnmount(() => window.removeEventListener('scroll', onScroll))
watch([editing, () => state.signal.n], () => {
  backTo.value = null
  activeEventId.value = null
})

// ── Prototype signals (Load example, Reset) ────────────────────────────────
watch(
  () => state.signal.n,
  () => {
    if (state.signal.kind === 'top') window.scrollTo({ top: 0 })
    else
      nextTick(() =>
        setTimeout(() => {
          ensureMount()
          if (mountEl.value) scrollToEl(mountEl.value, 'start', 56)
        }, 120),
      )
  },
)

/** Birth date for ages: the infobox's, else a first event that says "born". */
const birth = computed<PartialDate | undefined>(() => {
  if (article.value?.subject.birth) return article.value.subject.birth
  const events = state.draft?.events ?? state.timeline?.events ?? []
  const first = [...events].sort((a, b) => a.date.start.y - b.date.start.y)[0]
  return first && /\bborn\b/i.test(first.sourceText) ? first.date.start : undefined
})

const blockTimeline = computed(() => {
  // While re-editing, the placed block previews the draft live.
  if (panelOpen.value && state.draft?.editingPlaced)
    return { title: state.draft.title, events: state.draft.events, options: state.draft.options }
  return state.timeline
})

const pickedSummary = computed(() =>
  (state.draft?.events ?? []).map((e) => formatDate(e.date)).join(', '),
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
          'tl-page--sheet': panelOpen && panelMode === 'sheet',
          'tl-page--side': panelOpen && panelMode === 'side',
          'tl-page--make-way': panelOpen && panelMode === 'side' && vw < 1400,
        }"
        :data-skin="skin"
      >
        <div class="tl-page__main">
          <ArticleWrapper
            title="Frank Gehry"
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
              :can-publish="!!state.timeline && !panelOpen"
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

        <TimelineCurator
          v-if="panelOpen && article && state.draft"
          v-model:draft="state.draft"
          v-model:placement="draftPlacement"
          v-model:expanded="sheetExpanded"
          :mode="panelMode"
          :images="article.images"
          :sections="sections"
          :draft-labels="draftLabels"
          :subject="article.subject.name"
          :can-show-age="!!birth"
          :cursor-placement="cursorPlacement"
          @close="closePanel"
          @discard="discard"
          @commit="commit"
          @show-source="showSourceFromPanel"
        >
          <template #notice>
            <div v-if="pendingDuplicate" class="tl-dup" role="alert">
              <p class="tl-dup__text">
                <b>{{ formatDate(pendingDuplicate.mention.value) }}</b> is already on the timeline:
                “{{ pendingDuplicate.existing.label }}”. Add it again from this sentence?
              </p>
              <div class="tl-dup__actions">
                <CdxButton size="small" weight="quiet" @click="pendingDuplicate = null"
                  >Keep one</CdxButton
                >
                <CdxButton size="small" @click="confirmDuplicate">Add anyway</CdxButton>
              </div>
            </div>
          </template>
          <template #preview="{ wide }">
            <TimelineView
              :events="state.draft.events"
              :title="state.draft.title"
              :spacing="state.spacing"
              :options="state.draft.options"
              :birth="birth"
              :skin="wide ? 'desktop' : skin"
              :layout="wide ? 'horizontal' : 'vertical'"
            />
          </template>
        </TimelineCurator>
      </div>
    </VisualEditorPageLayout>

    <Teleport v-if="mountEl && blockTimeline" :to="mountEl">
      <TimelineBlock
        ref="blockRef"
        :timeline="blockTimeline"
        :editing="editing"
        :active="panelOpen && !!state.draft?.editingPlaced"
        :skin="skin"
        :spacing="state.spacing"
        :fallback="state.fallback"
        :sections="sections"
        :birth="birth"
        :active-event-id="activeEventId"
        @edit="openReEdit"
        @remove="removeTimeline"
        @move="moveTimeline"
        @select="onSelectEvent"
      />
    </Teleport>

    <div v-if="backTo && !editing" class="tl-back" :class="{ 'tl-back--mobile': isMobile }">
      <CdxButton action="progressive" @click="backToTimeline">
        <CdxIcon :icon="cdxIconArrowUp" /> Back to timeline
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
.tl-page--selecting .mw-parser-output a:not(.tl-ev__link) {
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
.tl-page--selecting .tl-mention {
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
.tl-page--selecting .tl-mention:hover {
  background-color: var(--background-color-progressive-subtle--hover);
}
.tl-page--selecting .tl-mention:focus-visible {
  outline: 2px solid var(--outline-color-progressive--focus, #36c);
  outline-offset: 1px;
}
.tl-page--selecting .tl-mention--picked {
  background-color: var(--background-color-progressive);
  color: var(--color-inverted-fixed, #fff);
}
.tl-page--selecting .tl-mention--picked:hover {
  background-color: var(--background-color-progressive--hover);
}
/* A ring that ripples out on tap: feedback without moving any text. */
.tl-page--selecting .tl-mention--pop {
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
.tl-page--selecting .tl-mention--used {
  background-color: transparent;
  color: var(--color-progressive);
  box-shadow: inset 0 -1px 0 var(--border-color-progressive);
  border-radius: 0;
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
