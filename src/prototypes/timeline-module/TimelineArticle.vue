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

import { loadArticle, type DateMention, type LoadedArticle } from './article/loadArticle'
import TimelineBlock from './editor/TimelineBlock.vue'
import TimelineEditorPanel from './editor/TimelineEditorPanel.vue'
import { scrollToEl, showPassage } from './selection/passage'
import { END_MATTER } from './selection/textIndex'
import { useSelectMode } from './selection/useSelectMode'
import { formatDate } from './timeline/format'
import { eventFromMention } from './timeline/fromMention'
import type { Placement, TimelineEvent } from './timeline/types'
import { state } from './store'
import { timelineIcon } from './timelineIcon'

const props = defineProps<{ forceSkin?: 'desktop' | 'mobile' }>()

const skin = computed(() => props.forceSkin ?? globalSkin.value)
const isMobile = computed(() => skin.value === 'mobile')
const editing = computed(() => state.mode === 'edit')
const panelOpen = computed(() => editing.value && state.panelOpen && !!state.draft)

// ── Article ────────────────────────────────────────────────────────────────
const article = shallowRef<LoadedArticle | null>(null)
const loadError = ref<string | null>(null)
loadArticle()
  .then((a) => (article.value = a))
  .catch((e) => (loadError.value = String(e?.message ?? e)))

const mentionsById = computed(() => new Map((article.value?.mentions ?? []).map((m) => [m.id, m])))
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
    state.draft = { title: 'Timeline', events: [], editingPlaced: false }
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
    editingPlaced: true,
  }
  sheetExpanded.value = isMobile.value
  state.panelOpen = true
}

function commit() {
  const draft = state.draft
  if (!draft) return
  state.timeline = { title: draft.title, events: draft.events }
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
function toggleMention(id: string) {
  const draft = state.draft
  const mention = mentionsById.value.get(id)
  if (!draft || !mention) return
  const i = draft.events.findIndex((e) => e.id === id)
  if (i === -1) draft.events.push(eventFromMention(mention))
  else draft.events.splice(i, 1)
}
useSelectMode({
  root: bodyEl,
  active: panelOpen,
  picked: pickedIds,
  toggle: toggleMention,
  describe: (id) => {
    const m: DateMention | undefined = mentionsById.value.get(id)
    return m
      ? `${m.text}: ${pickedIds.value.has(id) ? 'on the timeline, tap to remove' : 'tap to add to the timeline'}`
      : id
  },
  sentenceOf: (id) => {
    const m = mentionsById.value.get(id)
    return m ? { start: m.anchor.sentenceStart, end: m.anchor.sentenceEnd } : null
  },
})

function showSourceFromPanel(event: TimelineEvent) {
  if (isMobile.value) sheetExpanded.value = false
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

const blockTimeline = computed(() => {
  // While re-editing, the placed block previews the draft live.
  if (panelOpen.value && state.draft?.editingPlaced)
    return { title: state.draft.title, events: state.draft.events }
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
          'tl-page--sheet': panelOpen && isMobile,
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

        <TimelineEditorPanel
          v-if="panelOpen && article && state.draft"
          v-model:draft="state.draft"
          v-model:placement="draftPlacement"
          v-model:expanded="sheetExpanded"
          :skin="skin"
          :images="article.images"
          :sections="sections"
          :mentions="mentionsById"
          :spacing="state.spacing"
          :cursor-placement="cursorPlacement"
          @close="closePanel"
          @discard="discard"
          @commit="commit"
          @show-source="showSourceFromPanel"
        />
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
        :active-event-id="activeEventId"
        @edit="openReEdit"
        @remove="removeTimeline"
        @move="moveTimeline"
        @select="onSelectEvent"
      />
    </Teleport>

    <div v-if="backTo && !editing" class="tl-back" :class="{ 'tl-back--mobile': isMobile }">
      <CdxButton weight="primary" action="progressive" @click="backToTimeline">
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
  box-shadow: var(--box-shadow-large, 0 4px 16px rgba(0, 0, 0, 0.25));
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
.tl-page--selecting .mw-parser-output a:not(.tl-card__link) {
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
::highlight(tl-source) {
  background-color: var(--background-color-warning-subtle, #fef6e7);
  color: var(--color-base);
}
.tl-hl--tl-source,
.tl-hl--tl-hover {
  background-color: var(--background-color-warning-subtle, #fef6e7);
}
.mw-parser-output .tl-flash {
  animation: tl-flash 3.2s ease-out;
  border-radius: var(--border-radius-base, 2px);
}
@keyframes tl-flash {
  0%,
  70% {
    box-shadow: -8px 0 0 -4px var(--border-color-warning, #ab7f2a);
  }
  100% {
    box-shadow: -8px 0 0 -4px transparent;
  }
}
</style>
