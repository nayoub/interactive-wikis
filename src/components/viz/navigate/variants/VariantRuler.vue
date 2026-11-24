<script setup lang="ts">
/**
 * B · Time ruler: the article's authored timeline (ruler/authoring.ts),
 * read and edited in the same place.
 *
 * Reading. One persistent timeline in three presentations:
 *   overview   below the introduction, open: the even timeline (dates, short
 *              labels, occasional images on stems around one line)
 *   compact    docked under the wiki header: the same line and dots drawn up,
 *              the reading caret, "2003 · Walt Disney Concert Hall" and one
 *              chevron to open it again
 *   explore    the same object open where it is, plus one region: the
 *              selected event's sentence and Read passage
 * The timeline itself is the control: scroll it sideways (a native
 * scrollbar, arrow keys), select an event to see its sentence, Read passage
 * to go there, Return to reading after a jump. Docking, anchoring (the
 * article follows the panel's lower edge; ruler/useDock.ts), the reading
 * anchor, preview-before-navigation and return are unchanged.
 *
 * Editing (Edit timeline, or the article editor's Insert → Timeline): the
 * dates in the article become chips; selecting one adds it to the live
 * timeline (in date order, whatever order they are picked in) or removes it.
 * Selecting an event shows only its own actions: trim its label in the text
 * (the underlined span), add, change or remove its image (article images or
 * Wikimedia Commons), remove it. Undo, Cancel and Done are in one bar; Done
 * saves to the prototype store and returns to reading.
 */
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import { CdxButton, CdxIcon } from '@wikimedia/codex'
import { cdxIconArrowPrevious, cdxIconClose, cdxIconCollapse, cdxIconExpand } from '@wikimedia/codex-icons'

import ImagePicker from '../../curate/ImagePicker.vue'
import { useSpanEditor } from '../../general/useSpanEditor'
import { useSelectMode } from '../../pick/useSelectMode'
import { NAV, type NavContext } from '../context'
import type { NavEvent } from '../events'
import { msg } from '../messages'
import { formatWhen } from '../time'
import AuthorBar from '../ruler/AuthorBar.vue'
import EvenMini from '../ruler/EvenMini.vue'
import EvenTrack from '../ruler/EvenTrack.vue'
import { blockFor, COMPACT, linesNeeded, MINI_H, MOTION_MS, richLayout, slotFor } from '../ruler/layout'
import RulerRegion from '../ruler/RulerRegion.vue'
import { useDock } from '../ruler/useDock'
import { useReading } from '../ruler/useReading'

const ctx = inject(NAV) as NavContext & { leadMount: Ref<HTMLElement | null> }
const nav = ctx.nav
const era = ctx.era
const authoring = ctx.authoring
const editing = computed(() => authoring.editing.value)
/** The authored events, in date order (the saved timeline, or the draft being edited). */
const events = computed<NavEvent[]>(() => authoring.events.value)
const narrow = computed(() => ctx.width.value === 'narrow')

const reduced = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.tnMotion === 'reduce'
const frame = () =>
  new Promise<void>((r) => {
    let done = false
    const go = () => !done && ((done = true), r())
    requestAnimationFrame(go)
    setTimeout(go, 50)
  })
/** The panel's rendered height has reached its target (reading it starts any pending transition). */
const settledNow = () => !root.value || Math.abs(root.value.getBoundingClientRect().height - panelH.value) < 0.5
/** Wait until the panel has actually reached its new geometry (however slowly frames arrive). */
async function settle() {
  const t0 = performance.now()
  while (!settledNow() && performance.now() - t0 < 4000) await frame()
  await frame()
}

// ── Docking and reading ──────────────────────────────────────────────────
const dock = useDock(ctx.leadMount)
const bodyEl = ref<HTMLElement | null>(null)
const body = () => document.querySelector<HTMLElement>('.tn-body')
const { reading, update: updateReading, set: setReading } = useReading({ body, events: () => events.value, resolve: nav.resolve })

// ── Presentation (docking ≠ expansion; editing keeps it open) ────────────
const exploring = ref(false)
const previewId = ref<string | null>(null)
const presentation = computed<'overview' | 'compact' | 'explore'>(() =>
  exploring.value || editing.value ? 'explore' : dock.contracted.value ? 'compact' : 'overview',
)
const compact = computed(() => presentation.value === 'compact')

// ── Measurements ─────────────────────────────────────────────────────────
const root = ref<HTMLElement | null>(null)
const topEl = ref<HTMLElement | null>(null)
const track = ref<InstanceType<typeof EvenTrack> | null>(null)
const width = ref(0)
const topH = ref(30)
let ro: ResizeObserver | null = null
watch([root, topEl], () => {
  ro?.disconnect()
  ro = new ResizeObserver(() => {
    if (root.value) width.value = root.value.clientWidth
    if (topEl.value) topH.value = topEl.value.offsetHeight
  })
  for (const el of [root.value, topEl.value]) if (el) ro.observe(el)
})
onBeforeUnmount(() => ro?.disconnect())

// ── Geometry ─────────────────────────────────────────────────────────────
const PADY = 2
const minRegion = computed(() => (editing.value ? 120 : 84))
const slot = computed(() => slotFor(width.value, narrow.value))
const blockW = computed(() => blockFor(slot.value, narrow.value))
const sb = computed(() => track.value?.sb ?? 0)
const avail = computed(() => dock.viewH.value - dock.header.value)
/** The cap: the whole open panel stays within about 44% of the visible height below the header. */
const cap = computed(() => Math.round(avail.value * 0.44))
const miniH = computed(() => (narrow.value ? MINI_H : 0))
const head = computed(() => 2 * PADY + topH.value)
/** The overview is in flow, not docked: it may be as rich as the reference figure. */
const maxLines = computed(() => linesNeeded(events.value, blockW.value))
const richOverview = computed(() =>
  richLayout(events.value, Math.max(cap.value, avail.value * 0.55) - head.value - miniH.value - sb.value, maxLines.value),
)
const richExplore = computed(() =>
  richLayout(events.value, cap.value - head.value - miniH.value - sb.value - minRegion.value, maxLines.value),
)
const rich = computed(() => (presentation.value === 'explore' ? richExplore.value : richOverview.value))
const trackMode = computed<'rich' | 'compact' | 'hidden'>(() => (compact.value ? (narrow.value ? 'hidden' : 'compact') : 'rich'))
const trackH = computed(() =>
  trackMode.value === 'rich' ? rich.value.height + sb.value : trackMode.value === 'compact' ? COMPACT.height + sb.value : 0,
)
const compactH = computed(() => 2 * PADY + topH.value + (narrow.value ? MINI_H : COMPACT.height + sb.value))
const baseH = computed(() => (compact.value ? compactH.value : head.value + trackH.value + miniH.value))
const panelH = computed(() => (presentation.value === 'explore' ? Math.max(cap.value, baseH.value + 80) : baseH.value))
const regionH = computed(() => (presentation.value === 'explore' ? panelH.value - baseH.value : 0))

// Every presentation change is a panel transition: hold native anchoring off until it lands.
const motion = ref<'expand' | 'collapse'>('expand')
watch(panelH, (h, old) => {
  motion.value = h >= (old ?? 0) ? 'expand' : 'collapse'
  dock.holdAnchoring(settledNow)
})

// ── Selecting an event: a reader preview, or the event being edited ──────
const selectedId = computed(() => (editing.value ? authoring.currentId.value : nav.selectedId.value))
const preview = computed(() => (previewId.value ? (events.value.find((e) => e.id === previewId.value) ?? null) : null))
const editEvent = computed(() => (authoring.currentId.value ? (events.value.find((e) => e.id === authoring.currentId.value) ?? null) : null))
const regionEvent = computed(() => (editing.value ? editEvent.value : preview.value))
const previewMissing = computed(() => !editing.value && !!preview.value && !nav.resolve(preview.value))
function pick(id: string) {
  const e = events.value.find((v) => v.id === id)
  if (!e) return
  track.value?.reveal(id, { smooth: !reduced() })
  if (editing.value) {
    authoring.currentId.value = authoring.currentId.value === id ? null : id
    return
  }
  nav.selectedId.value = id
  previewId.value = id
  exploring.value = true
  nav.announce(`${formatWhen(e.date, era)}: ${e.label}.`)
}
// An event that leaves the timeline (removed while editing) leaves the preview too.
watch(events, (list) => {
  if (previewId.value && !list.some((e) => e.id === previewId.value)) previewId.value = null
})

// ── Open, close, read, return ────────────────────────────────────────────
const modeBtn = ref<InstanceType<typeof CdxButton> | null>(null)
const focusModeButton = () => ((modeBtn.value?.$el as HTMLElement | undefined) ?? null)?.focus({ preventScroll: true })
/** If closing would hide the focused control, focus moves to the chevron (without scrolling). */
watch(
  presentation,
  (p) => {
    const a = document.activeElement as HTMLElement | null
    if (!a || !root.value?.contains(a)) return
    const hidden = (p === 'compact' && !a.closest('.tr__keep')) || (p !== 'explore' && !!a.closest('.tr__region'))
    if (hidden) nextTick(focusModeButton)
  },
  { flush: 'pre' },
)
function explore() {
  exploring.value = true
}
function resume() {
  exploring.value = false
  previewId.value = null
}
/** The one chevron, once the timeline has docked (or is open beyond the overview). */
const showToggle = computed(() => !editing.value && presentation.value !== 'overview')
const toggle = computed(() =>
  presentation.value === 'explore'
    ? { label: msg.trCloseTimeline, icon: cdxIconCollapse, run: resume, expanded: true }
    : { label: msg.trOpenTimeline, icon: cdxIconExpand, run: explore, expanded: false },
)

let jumpTarget: string | null = null
/** Read passage: resolve first, settle the compact geometry, then place the passage below it. */
async function read(e: NavEvent) {
  const el = nav.resolve(e)
  if (!el) {
    nav.unresolved.value = e.id
    return
  }
  const below = el.getBoundingClientRect().top > dock.sentinel.getBoundingClientRect().top
  const was = panelH.value
  resume()
  if (below) dock.contracted.value = true
  await nextTick()
  if (panelH.value !== was) await settle()
  jumpTarget = e.id
  await nav.jump(e, { travel: 'nearby' })
}
async function back() {
  const was = panelH.value
  resume()
  await nextTick()
  if (panelH.value !== was) await settle()
  jumpTarget = null
  await nav.returnToOrigin({ travel: 'nearby' })
}

// ── Keyboard inside the ruler (no global handlers) ───────────────────────
function onKeydown(ev: KeyboardEvent) {
  if (ev.key !== 'Escape') return
  if (editing.value) {
    if (authoring.currentId.value) {
      ev.preventDefault()
      authoring.currentId.value = null
    }
    return
  }
  if (previewId.value) {
    ev.preventDefault()
    const id = previewId.value
    previewId.value = null
    nextTick(() => track.value?.focusBlock(id))
  } else if (exploring.value) {
    ev.preventDefault()
    resume()
  }
}

// ── Editing: dates in the article, the label span, images ────────────────
const picked = computed(() => new Set(authoring.items.value.map((i) => i.id)))
useSelectMode({
  root: bodyEl,
  active: editing,
  kind: ref('date'),
  picked: picked as unknown as Ref<Set<string>>,
  describe: (id) => {
    const m = ctx.article.mentions.find((x) => x.id === id)
    return picked.value.has(id) ? `${m?.text ?? id}: on the timeline; select to remove` : `${m?.text ?? id}: add to the timeline`
  },
  toggle: (id) => {
    if (authoring.toggle(id) === 'added') nextTick(() => track.value?.reveal(id, { smooth: !reduced() }))
  },
  sentenceOf: (id) => {
    const m = ctx.article.mentions.find((x) => x.id === id)
    return m ? { start: m.anchor.sentenceStart, end: m.anchor.sentenceEnd } : null
  },
})
useSpanEditor({
  root: bodyEl,
  item: authoring.current,
  active: computed(() => editing.value && !!authoring.currentId.value),
  begin: authoring.begin,
  change: (span) => authoring.currentId.value && authoring.setLabelSpan(authoring.currentId.value, span),
})
function showInText() {
  const e = editEvent.value
  const el = e ? nav.resolve(e) : null
  el?.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' })
}
const pickerOpen = ref(false)
function chooseImage(img: Parameters<typeof authoring.setImage>[1]) {
  const id = authoring.currentId.value
  if (id && img) authoring.setImage(id, img)
}
function startEdit() {
  previewId.value = null
  authoring.startEdit()
}
watch(editing, (on) => {
  if (!on) {
    exploring.value = false
    previewId.value = null
    pickerOpen.value = false
  }
})

// ── The timeline's sideways window ───────────────────────────────────────
const win = ref<[number, number] | null>(null)
const onTrackScroll = () => (win.value = track.value?.windowIndexes() ?? null)
function onTrackTap() {
  if (compact.value) explore()
}
function onMiniGo(i: number) {
  if (compact.value) explore()
  nextTick(() => track.value?.scrollToIndex(i, !reduced()))
}
// While reading (not exploring or editing), the timeline keeps the passage being read in view.
watch(
  () => reading.value.id,
  (id) => {
    if (id && !exploring.value && !editing.value) track.value?.reveal(id, { smooth: !reduced() })
  },
)

// ── Scroll: docking and the reading anchor (genuine scrolling only) ──────
const readingLine = () => {
  const top = dock.header.value + compactH.value
  const k = (dock.viewH.value - top) / 3
  // Docked, the line rides with the panel's lower edge, like the article does.
  if (dock.stuck.value && root.value) return root.value.getBoundingClientRect().bottom + k
  return top + k
}
let pending = false
function onScroll() {
  if (pending) return
  pending = true
  const run = () => {
    if (!pending) return
    pending = false
    dock.check()
    // A jump's own travel is not reading; the reading anchor is set when it lands.
    if (!nav.jumping.value) updateReading(readingLine())
  }
  requestAnimationFrame(run)
  setTimeout(run, 60)
}
watch(
  () => nav.jumping.value,
  (j) => {
    if (j) return
    if (jumpTarget) setReading(jumpTarget)
    else updateReading(readingLine())
    jumpTarget = null
  },
)
// The timeline changed (an edit): the reading anchor is recomputed against it.
watch(events, () => nextTick(() => updateReading(readingLine())))
const onResize = () => dock.check()
onMounted(() => {
  bodyEl.value = body()
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onResize)
  const first = () => {
    bodyEl.value = body()
    dock.check()
    updateReading(readingLine())
    if (reading.value.id) track.value?.reveal(reading.value.id, { center: true })
    onTrackScroll()
  }
  nextTick(first)
  // The mount is placed after the skin settles.
  setTimeout(first, 200)
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', onResize)
})

// ── The header ───────────────────────────────────────────────────────────
/** Docked, the header follows reading ("2003 · Walt Disney Concert Hall"); open, it is the title. */
const headerText = computed(() => {
  if (editing.value) return msg.trEditingTitle
  if (!compact.value) return msg.trTitle
  const r = reading.value
  const e = r.id ? events.value.find((v) => v.id === r.id) : null
  if (e && r.state === 'at') return msg.trReadingAt(formatWhen(e.date, era), e.label)
  if (e && r.state === 'after') return msg.trReadingAfterShort(formatWhen(e.date, era))
  return msg.trTitle
})
const shown = computed(() => events.value.length > 0 || editing.value)
const px = (n: number) => `${Math.round(n)}px`
</script>

<template>
  <Teleport
    v-if="ctx.leadMount.value && shown"
    :to="ctx.leadMount.value"
  >
    <section
      ref="root"
      class="tr"
      :class="[`tr--${presentation}`, `tr--${motion}`, { 'tr--stuck': dock.stuck.value, 'tr--narrow': narrow, 'tr--editing': editing }]"
      :style="{ height: px(panelH), '--tr-motion': `${MOTION_MS}ms` }"
      aria-labelledby="tr-title"
      @keydown="onKeydown"
    >
      <!-- Header: the title (or, docked, the passage being read), Edit timeline, Return, the chevron. -->
      <div
        ref="topEl"
        class="tr__top"
      >
        <h2
          id="tr-title"
          class="tr__title tr__keep"
          :class="{ 'tr__title--reading': compact }"
        >
          <svg
            v-if="compact && reading.state !== 'before'"
            class="tr__caret"
            :class="{ 'tr__caret--after': reading.state === 'after' }"
            width="12"
            height="10"
            viewBox="0 0 12 10"
            aria-hidden="true"
          ><path d="M6 1.2 L11 9 L1 9 Z" /></svg>
          <span class="tr__title-text">{{ headerText }}</span>
        </h2>
        <button
          v-if="!compact && !editing"
          type="button"
          class="tr__edit"
          @click="startEdit"
        >
          {{ msg.trEditTimeline }}
        </button>
        <span class="tr__spacer" />
        <template v-if="nav.origin.value && !editing">
          <CdxButton
            size="small"
            class="tr__return tr__keep"
            :title="msg.returnFrom(nav.origin.value.section)"
            @click="back"
          >
            <CdxIcon
              :icon="cdxIconArrowPrevious"
              size="small"
            />
            <span class="tr__btn-text">{{ msg.returnToReading }}</span>
          </CdxButton>
          <CdxButton
            size="small"
            weight="quiet"
            class="tr__keep"
            :aria-label="msg.keepReadingHere"
            :title="msg.keepReadingHereHint"
            @click="nav.endExploration()"
          >
            <CdxIcon
              :icon="cdxIconClose"
              size="small"
            />
          </CdxButton>
        </template>
        <CdxButton
          v-if="showToggle"
          ref="modeBtn"
          size="small"
          weight="quiet"
          class="tr__mode tr__keep"
          :aria-label="toggle.label"
          :title="toggle.label"
          :aria-expanded="toggle.expanded ? 'true' : 'false'"
          @click="toggle.run"
        >
          <CdxIcon :icon="toggle.icon" />
        </CdxButton>
      </div>

      <!-- The timeline: the one persistent object on desktop; the nearby-period view on phones. -->
      <EvenTrack
        ref="track"
        class="tr__track"
        :events="events"
        :slot-w="slot"
        :block-w="blockW"
        :mode="trackMode"
        :geom="rich"
        :era="era"
        :selected-id="selectedId"
        :reading-id="reading.id"
        :reading-state="reading.state"
        :description="msg.trFigure"
        @pick="pick"
        @tap="onTrackTap"
        @scrolled="onTrackScroll"
      />

      <!-- Phones: every event, always visible (the compact overview). -->
      <EvenMini
        v-if="narrow && width"
        class="tr__mini tr__keep"
        :events="events"
        :width="width"
        :era="era"
        :selected-id="selectedId"
        :reading-id="reading.id"
        :reading-state="reading.state"
        :window="compact ? null : win"
        @go="onMiniGo"
      />

      <!-- One region: the selected event's sentence and Read passage (or, editing, its actions). -->
      <div
        class="tr__region"
        :style="{ height: px(regionH) }"
        :inert="presentation !== 'explore' || undefined"
      >
        <RulerRegion
          :mode="editing ? 'editing' : 'reading'"
          :event="regionEvent"
          :missing="previewMissing"
          :era="era"
          @read="read"
          @image="pickerOpen = true"
          @remove-image="authoring.currentId.value && authoring.setImage(authoring.currentId.value, undefined)"
          @remove="authoring.currentId.value && authoring.remove(authoring.currentId.value)"
          @show-in-text="showInText"
        />
      </div>
    </section>
  </Teleport>

  <Teleport
    v-if="editing"
    to="body"
  >
    <AuthorBar
      :count="authoring.items.value.length"
      :is-new="!!authoring.draft.value?.isNew"
      :can-undo="authoring.canUndo.value"
      @undo="authoring.undo()"
      @cancel="authoring.cancel()"
      @done="authoring.done()"
    />
  </Teleport>
  <ImagePicker
    v-model:open="pickerOpen"
    :images="ctx.article.images"
    :event="editEvent"
    :subject="ctx.article.subject.name"
    @choose="chooseImage"
  />
</template>

<style scoped>
/* Thin top and bottom rules, the article's own surface and type (as in the earlier figure). */
.tr {
  --tr-ease: var(--transition-timing-function-user, ease-out);
  position: relative;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  padding: 2px 0;
  overflow: hidden;
  border-block-start: var(--border-width-base) solid var(--border-color-base);
  border-block-end: var(--border-width-base) solid var(--border-color-subtle);
  background: var(--background-color-base);
  font-family: var(--font-family-base);
  font-size: var(--font-size-medium);
  transition:
    height var(--tr-motion) var(--tr-ease),
    box-shadow var(--tr-motion) linear;
}
.tr--stuck {
  border-block-end-color: var(--border-color-base);
  box-shadow: 0 6px 6px -6px rgba(0, 0, 0, 0.2);
}
.tr--editing {
  border-block-start: var(--border-width-thick) solid var(--border-color-progressive);
}
.tr > * {
  flex: none;
}

/* Header */
.tr__top {
  display: flex;
  align-items: center;
  gap: var(--spacing-25) var(--spacing-75);
  min-height: 30px;
}
.mw-parser-output .tr__title,
.tr__title {
  display: flex;
  align-items: center;
  gap: var(--spacing-25);
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
  font-family: var(--font-family-base);
  font-size: var(--font-size-medium);
  line-height: var(--line-height-medium);
  font-weight: var(--font-weight-bold);
}
.tr__title-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.tr__title--reading {
  font-size: var(--font-size-small);
}
.tr__caret {
  flex: none;
  overflow: visible;
}
.tr__caret path {
  fill: var(--background-color-base);
  stroke: var(--color-base);
  stroke-width: 1.6;
  stroke-linejoin: round;
}
.tr__caret--after path {
  stroke-dasharray: 2 1.6;
}
/* Edit timeline: a plain text link beside the title. */
.tr__edit {
  flex: none;
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-progressive);
  font: inherit;
  font-size: var(--font-size-small);
  cursor: pointer;
}
.tr__edit:hover {
  text-decoration: underline;
}
.tr__edit:focus-visible {
  outline: var(--border-width-thick) solid var(--outline-color-progressive--focus);
  outline-offset: 1px;
}
.tr__spacer {
  flex: 1;
}
.tr__mode,
.tr__return {
  flex: none;
}
/* The region fades first when contracting (0–70 ms) and last when expanding. */
.tr__region {
  overflow: hidden;
  border-block-start: var(--border-width-base) solid var(--border-color-subtle);
  transition:
    opacity 100ms linear 140ms,
    height var(--tr-motion) var(--tr-ease);
}
.tr:not(.tr--explore) .tr__region {
  opacity: 0;
  transition:
    opacity 70ms linear,
    height var(--tr-motion) var(--tr-ease);
}

/* Phones: button texts give way. */
.tr--narrow .tr__btn-text {
  display: none;
}

@media (prefers-reduced-motion: reduce) {
  .tr,
  .tr * {
    transition: none !important;
  }
}
</style>
