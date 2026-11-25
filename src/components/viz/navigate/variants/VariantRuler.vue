<script setup lang="ts">
/**
 * B · Time ruler: the article's authored timeline (ruler/authoring.ts),
 * read and edited in the same place.
 *
 * Reading. One persistent timeline in three presentations:
 *   overview   below the introduction, open: "Timeline", Edit timeline, and
 *              the even timeline (dates, short titles, occasional photographs)
 *   compact    docked under the wiki header: the same line and points with
 *              every visible date beside its point; one quiet chevron opens it
 *   explore    the same object opened where it is
 * The timeline is the control: scroll it sideways (a native scrollbar, arrow
 * keys); select an event (click, tap or Enter) to go straight to its passage.
 * The date being read is underlined. Docking and anchoring (the article
 * follows the panel's lower edge; ruler/useDock.ts) and the reading anchor
 * are unchanged.
 *
 * Editing (Edit timeline, or the article editor's Insert → Timeline): dates in
 * the article become chips; selecting one adds its event to the live timeline
 * in date order (focus stays in the article). Selecting an event shows its
 * Title field, its image (Add image, or the thumbnail to change it), View
 * source and Remove event. Undo, Cancel and Done are in one bar.
 */
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import { CdxButton, CdxIcon } from '@wikimedia/codex'
import { cdxIconCollapse, cdxIconExpand } from '@wikimedia/codex-icons'

import ImagePicker from '../../curate/ImagePicker.vue'
import type { EventImage } from '../../model/types'
import { useSelectMode } from '../../pick/useSelectMode'
import { NAV, type NavContext } from '../context'
import type { NavEvent } from '../events'
import { msg } from '../messages'
import AuthorBar from '../ruler/AuthorBar.vue'
import EvenTrack from '../ruler/EvenTrack.vue'
import { AGE_LINE, blockFor, COMPACT, MOTION_MS, richLayout, slotFor, slotsOf, stackLines } from '../ruler/layout'
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
const presentation = computed<'overview' | 'compact' | 'explore'>(() =>
  exploring.value || editing.value ? 'explore' : dock.contracted.value ? 'compact' : 'overview',
)
const compact = computed(() => presentation.value === 'compact')

// ── Measurements ─────────────────────────────────────────────────────────
const root = ref<HTMLElement | null>(null)
const ctrlEl = ref<HTMLElement | null>(null)
const track = ref<InstanceType<typeof EvenTrack> | null>(null)
const width = ref(0)
const ctrlW = ref(0)
let ro: ResizeObserver | null = null
watch([root, ctrlEl], () => {
  ro?.disconnect()
  ro = new ResizeObserver(() => {
    if (root.value) width.value = root.value.clientWidth
    ctrlW.value = ctrlEl.value?.offsetWidth ?? 0
  })
  for (const el of [root.value, ctrlEl.value]) if (el) ro.observe(el)
})
onBeforeUnmount(() => ro?.disconnect())

// ── Geometry ─────────────────────────────────────────────────────────────
const PADY = 2
const HEAD = 40
const editH = computed(() => (narrow.value ? 128 : 84))
/** The editing bar (Undo, Cancel, Done), inside the panel under the editor. */
const barH = computed(() => 48)
const slot = computed(() => slotFor(width.value, narrow.value))
const blockW = computed(() => blockFor(slot.value, narrow.value))
const sb = computed(() => track.value?.sb ?? 0)
const avail = computed(() => dock.viewH.value - dock.header.value)
/** The cap: the whole open panel stays within about 44% of the visible height below the header. */
const cap = computed(() => Math.round(avail.value * 0.44))
/** Editing on a phone is a deliberate mode: the panel may take a little more of the screen. */
const editCap = computed(() => (narrow.value ? Math.round(avail.value * 0.55) : cap.value))
/** Ages: the subject's birth year from the infobox (biographies only; none for a city). */
const birthYear = computed(() => ctx.article.subject.birth?.y ?? null)
const ageLine = computed(() => (birthYear.value !== null ? AGE_LINE : 0))
/** One slot per date (same-date events share a point, a date and an age). */
const slots = computed(() => slotsOf(events.value, era))
const maxLines = computed(() => stackLines(slots.value, blockW.value))
/** In flow (not docked), the timeline may be as rich as the reference figure. */
const richOverview = computed(() =>
  richLayout(slots.value, Math.max(cap.value, avail.value * 0.55) - 2 * PADY - HEAD - sb.value, maxLines.value, false, ageLine.value),
)
/** Docked and open (or editing): within the cap, the editing area included. */
const richDocked = computed(() =>
  editing.value
    ? richLayout(slots.value, editCap.value - 2 * PADY - HEAD - sb.value - editH.value - barH.value, maxLines.value, true, ageLine.value)
    : richLayout(slots.value, cap.value - 2 * PADY - HEAD - sb.value, maxLines.value, false, ageLine.value),
)
const rich = computed(() => (editing.value || (presentation.value === 'explore' && dock.stuck.value) ? richDocked.value : richOverview.value))
const trackMode = computed<'rich' | 'compact'>(() => (compact.value ? 'compact' : 'rich'))
const trackH = computed(() => (trackMode.value === 'rich' ? rich.value.height : COMPACT.height) + sb.value)
const headH = computed(() => (compact.value ? 0 : HEAD))
const regionH = computed(() => (editing.value ? editH.value : 0))
const panelH = computed(() => 2 * PADY + headH.value + trackH.value + regionH.value + (editing.value ? barH.value : 0))

// Every presentation change is a panel transition: hold native anchoring off until it lands.
const motion = ref<'expand' | 'collapse'>('expand')
watch(panelH, (h, old) => {
  motion.value = h >= (old ?? 0) ? 'expand' : 'collapse'
  dock.holdAnchoring(settledNow)
})

// ── Selecting an event: go to its passage, or (editing) edit it ──────────
/** Only while editing is an event "selected"; reading, selecting an event goes to it. */
const selectedId = computed(() => (editing.value ? authoring.currentId.value : null))
const editEvent = computed(() => (authoring.currentId.value ? (events.value.find((e) => e.id === authoring.currentId.value) ?? null) : null))
function pick(id: string) {
  const e = events.value.find((v) => v.id === id)
  if (!e) return
  if (editing.value) {
    authoring.currentId.value = authoring.currentId.value === id ? null : id
    track.value?.reveal(id, { smooth: !reduced() })
    return
  }
  // Reading: straight to the passage.
  void read(e)
}

// ── Open, close, read, return ────────────────────────────────────────────
const modeBtn = ref<InstanceType<typeof CdxButton> | null>(null)
const focusModeButton = () => ((modeBtn.value?.$el as HTMLElement | undefined) ?? null)?.focus({ preventScroll: true })
/** If closing would hide the focused control, focus moves to the chevron (without scrolling). */
watch(
  presentation,
  (p) => {
    const a = document.activeElement as HTMLElement | null
    if (!a || !root.value?.contains(a)) return
    if (p === 'compact' && a.closest('.tr__top')) nextTick(focusModeButton)
  },
  { flush: 'pre' },
)
function explore() {
  exploring.value = true
}
function resume() {
  exploring.value = false
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
    nav.announce(msg.trMissing)
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
  if (exploring.value) {
    ev.preventDefault()
    resume()
  }
}

// ── Editing: dates in the article, the title, the image ──────────────────
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
function viewSource() {
  const e = editEvent.value
  const el = e ? nav.resolve(e) : null
  el?.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' })
}
function setTitle(text: string) {
  const id = authoring.currentId.value
  if (id) authoring.setTitle(id, text)
}
const pickerOpen = ref(false)
function chooseImage(img: EventImage | undefined) {
  const id = authoring.currentId.value
  if (id) authoring.setImage(id, img)
}
function startEdit() {
  authoring.startEdit()
}
// The article editor's toolbar comes and goes with editing: dock below it (phones pin it to the top).
watch(
  () => authoring.ve.value,
  () => nextTick(() => requestAnimationFrame(() => dock.check())),
)
watch(editing, (on) => {
  if (!on) {
    exploring.value = false
    pickerOpen.value = false
  }
})

// While reading (not exploring or editing), the timeline keeps the date being read in view,
// unless the reader is scrolling it sideways themselves.
watch(
  () => reading.value.id,
  (id) => {
    if (id && !exploring.value && !editing.value) track.value?.reveal(id, { smooth: !reduced(), follow: true })
  },
)

// ── Scroll: docking and the reading anchor (genuine scrolling only) ──────
const readingLine = () => {
  const top = dock.header.value + 2 * PADY + COMPACT.height + sb.value
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
watch(
  () => events.value.map((e) => e.id).join(),
  () => nextTick(() => updateReading(readingLine())),
)
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
  }
  nextTick(first)
  // The mount is placed after the skin settles.
  setTimeout(first, 200)
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', onResize)
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
      :style="{ height: px(panelH), '--tr-motion': `${MOTION_MS}ms`, '--tr-ctrl': px(ctrlW) }"
      aria-labelledby="tr-title"
      @keydown="onKeydown"
    >
      <!-- Header (open only): the title and Edit timeline. -->
      <div
        class="tr__top"
        :style="{ height: px(headH) }"
        :inert="compact || undefined"
      >
        <h2
          id="tr-title"
          class="tr__title"
        >
          {{ editing ? msg.trEditingTitle : msg.trTitle }}
        </h2>
        <button
          v-if="!editing"
          type="button"
          class="tr__link tr__edit"
          @click="startEdit"
        >
          {{ msg.trEditTimeline }}
        </button>
      </div>

      <!-- The chevron: in the header when open, at the strip's end when docked. -->
      <div
        ref="ctrlEl"
        class="tr__ctrl"
      >
        <CdxButton
          v-if="showToggle"
          ref="modeBtn"
          size="small"
          weight="quiet"
          class="tr__mode"
          :aria-label="toggle.label"
          :title="toggle.label"
          :aria-expanded="toggle.expanded ? 'true' : 'false'"
          @click="toggle.run"
        >
          <CdxIcon :icon="toggle.icon" />
        </CdxButton>
      </div>

      <!-- The timeline: one surface, dates always visible. -->
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
        :reading-id="editing ? null : reading.id"
        :birth-year="birthYear"
        :description="msg.trFigure"
        @pick="pick"
        @tap="explore"
      />

      <!-- Editing: the selected event's title, image and quiet actions. -->
      <div
        v-if="editing"
        class="tr__region"
        :style="{ height: px(regionH) }"
      >
        <RulerRegion
          :event="editEvent"
          :era="era"
          @title-start="authoring.begin()"
          @title="setTitle"
          @image="pickerOpen = true"
          @view-source="viewSource"
          @remove="authoring.currentId.value && authoring.remove(authoring.currentId.value)"
        />
      </div>
      <!-- Editing: Undo, Cancel and Done, right under what is being edited. -->
      <AuthorBar
        v-if="editing"
        class="tr__bar"
        :style="{ height: px(barH) }"
        :count="authoring.items.value.length"
        :is-new="!!authoring.draft.value?.isNew"
        :can-undo="authoring.canUndo.value"
        @undo="authoring.undo()"
        @cancel="authoring.cancel()"
        @done="authoring.done()"
      />
    </section>
  </Teleport>
  <ImagePicker
    v-model:open="pickerOpen"
    :images="ctx.article.images"
    :event="editEvent"
    :subject="ctx.article.subject.name"
    removable
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
  /* Hairlines, not rules: the figure belongs to the page. */
  border-block-start: var(--border-width-base) solid var(--border-color-subtle);
  border-block-end: var(--border-width-base) solid var(--border-color-subtle);
  background: var(--background-color-base);
  font-family: var(--font-family-base);
  font-size: var(--font-size-medium);
  transition:
    height var(--tr-motion) var(--tr-ease),
    box-shadow var(--tr-motion) linear,
    background-color var(--tr-motion) linear;
}
/* Docked: a frosted surface the article passes under, with a soft shadow and a hairline. */
.tr--stuck {
  border-block-start-color: transparent;
  background: color-mix(in srgb, var(--background-color-base) 92%, transparent);
  -webkit-backdrop-filter: saturate(180%) blur(16px);
  backdrop-filter: saturate(180%) blur(16px);
  box-shadow:
    0 1px 0 var(--border-color-subtle),
    0 8px 24px -16px rgba(0, 0, 0, 0.35);
}
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .tr--stuck {
    background: var(--background-color-base);
  }
}
.tr--editing {
  border-block-start: var(--border-width-thick) solid var(--border-color-progressive);
}
.tr > * {
  flex: none;
}

/* Header: open only; it folds away (height and opacity) when the strip docks. */
.tr__top {
  display: flex;
  align-items: baseline;
  gap: var(--spacing-50) var(--spacing-75);
  padding-block-start: var(--spacing-50);
  box-sizing: border-box;
  padding-inline-end: calc(var(--tr-ctrl) + var(--spacing-50));
  overflow: hidden;
  white-space: nowrap;
  transition:
    height var(--tr-motion) var(--tr-ease),
    opacity 100ms linear 140ms;
}
.tr--compact .tr__top {
  padding-block-start: 0;
  opacity: 0;
  transition:
    height var(--tr-motion) var(--tr-ease),
    opacity 60ms linear;
}
.mw-parser-output .tr__title,
.tr__title {
  flex: none;
  margin: 0;
  padding: 0;
  border: 0;
  font-family: var(--font-family-base);
  font-size: var(--font-size-medium);
  line-height: var(--line-height-medium);
  font-weight: var(--font-weight-bold);
}
/* Quiet text actions, as links. */
.tr__link {
  flex: none;
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-progressive);
  font: inherit;
  font-size: var(--font-size-small);
  cursor: pointer;
}
.tr__link:hover {
  text-decoration: underline;
}
.tr__link:focus-visible {
  outline: var(--border-width-thick) solid var(--outline-color-progressive--focus);
  outline-offset: 1px;
}
/* Controls: at the header's end when open, at the strip's end when docked. */
.tr__ctrl {
  position: absolute;
  inset-block-start: 8px;
  inset-inline-end: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: var(--spacing-25);
}
.tr--compact .tr__ctrl {
  inset-block-start: 50%;
  transform: translateY(-60%);
}
.tr__track {
  transition: margin var(--tr-motion) var(--tr-ease);
}
/* Docked: the dates end before the controls, so none is hidden under them. */
.tr--compact .tr__track {
  margin-inline-end: calc(var(--tr-ctrl) + var(--spacing-25));
}
.tr__region {
  overflow: hidden;
  border-block-start: var(--border-width-base) solid var(--border-color-subtle);
}

@media (prefers-reduced-motion: reduce) {
  .tr,
  .tr * {
    transition: none !important;
  }
}
</style>
