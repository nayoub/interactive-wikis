<script setup lang="ts">
/**
 * B's timeline track: the earlier evenly spaced timeline (one thin line,
 * small neutral dots, short straight stems, event blocks alternating above
 * and below, prominent dates, short labels, occasional article images,
 * dotted and labelled gaps), adapted so the ruler can drive it:
 *
 *   - It never owns selection, preview or navigation. A block emits `pick`
 *     (preview it: the old renderer's `focus`); reading the passage stays
 *     the ruler's explicit Read this passage (the old `select`).
 *   - Reading (an outlined caret) and selection (progressive date, dot and
 *     stem) are two separate props with two separate treatments.
 *   - `mode` animates the same mounted marks between the rich layout and
 *     the compact strip: blocks fade and withdraw with the line, stems shorten
 *     into it, the line rises under the header, the years fade in. Nothing
 *     is remounted, and the horizontal scroll offset is the same element's.
 *   - When every event cannot get `SLOT_MIN`, the track scrolls sideways
 *     (the old renderer fell back to a vertical list instead).
 *
 * Distances are order, not time: there are no ticks. A drag with a mouse
 * across the background picks the events under it and commits their real
 * date bounds; touch scrolls the track instead (From/To are the alternative).
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import type { NavEvent } from '../events'
import { msg } from '../messages'
import { formatWhen, interval, overlaps, timeKind, yearLabel } from '../time'
import {
  above,
  BLOCK_PAD,
  boundsOf,
  COMPACT,
  cx,
  gaps as gapsOf,
  imgWidth,
  STEM,
  type RichLayout,
} from './layout'

const props = withDefaults(
  defineProps<{
    events: NavEvent[]
    slotW: number
    mode: 'rich' | 'compact' | 'hidden'
    geom: RichLayout
    era?: boolean
    selectedId?: string | null
    readingId?: string | null
    readingState?: 'at' | 'after' | 'before'
    range?: [number, number] | null
    /** Accept a mouse drag as a range gesture. */
    draggable?: boolean
  }>(),
  { era: false, selectedId: null, readingId: null, readingState: 'before', range: null, draggable: false },
)
const emit = defineEmits<{
  pick: [id: string]
  commit: [range: [number, number]]
  tap: []
  scrolled: []
}>()

const rich = computed(() => props.mode === 'rich')
const n = computed(() => props.events.length)
const trackW = computed(() => props.slotW * (n.value + 1))
const axisY = computed(() => (props.mode === 'rich' ? props.geom.aboveH : COMPACT.axisY))
const contentH = computed(() => (props.mode === 'rich' ? props.geom.height : props.mode === 'compact' ? COMPACT.height : 0))
const blockW = computed(() => 2 * props.slotW - 2 * BLOCK_PAD)
const gaps = computed(() => gapsOf(props.events))
const inRange = (e: NavEvent) => !props.range || overlaps(interval(e.date), props.range)
const label = (e: NavEvent) => e.short || e.label

/** A short year for the compact strip ("1969–73", "1970s", "c. 1631"). */
function year(e: NavEvent) {
  const d = e.date
  const k = timeKind(d)
  if (k === 'approximate' && !d.end && !d.circa) return formatWhen(d, props.era)
  const a = yearLabel(d.start.y, props.era)
  if (d.end && d.end.y !== d.start.y) {
    const b = String(d.end.y)
    return d.start.y > 0 && b.length === 4 && b.slice(0, 2) === String(d.start.y).slice(0, 2) ? `${a}–${b.slice(2)}` : `${a}–${yearLabel(d.end.y, props.era)}`
  }
  return d.circa ? `c. ${a}` : a
}
function aria(e: NavEvent) {
  const bits = [`${formatWhen(e.date, props.era)}: ${e.label}`]
  if (props.selectedId === e.id) bits.push(msg.trSelected)
  if (props.readingId === e.id) bits.push(msg.trReadingHere)
  if (!inRange(e)) bits.push(msg.trOutsideRange)
  return bits.join(', ')
}
const credit = (e: NavEvent) => e.image?.caption ?? ''

// ── The reading caret: on the side of its dot that has no stem ────────────
const readingIndex = computed(() => props.events.findIndex((e) => e.id === props.readingId))
const caretBelow = computed(() => !rich.value || above(readingIndex.value))

// ── Scrolling ────────────────────────────────────────────────────────────
const scroller = ref<HTMLElement | null>(null)
const sb = ref(0)
let ro: ResizeObserver | null = null
onMounted(() => {
  const el = scroller.value
  if (!el) return
  const measure = () => {
    sb.value = Math.max(0, el.offsetHeight - el.clientHeight)
    edges()
  }
  measure()
  ro = new ResizeObserver(measure)
  ro.observe(el)
})
onBeforeUnmount(() => ro?.disconnect())

const rtl = () => !!scroller.value && getComputedStyle(scroller.value).direction === 'rtl'
/** Bring event `id` into view: centred, or only if it is not already comfortably visible. */
function reveal(id: string, how: { center?: boolean; smooth?: boolean } = {}) {
  const el = scroller.value
  const i = props.events.findIndex((e) => e.id === id)
  if (!el || i < 0 || el.scrollWidth <= el.clientWidth) return
  const x = cx(i, props.slotW)
  const view = el.clientWidth
  const left = Math.abs(el.scrollLeft)
  const margin = props.slotW
  if (!how.center && x > left + margin && x < left + view - margin) return
  const target = Math.max(0, Math.min(trackW.value - view, x - view / 2))
  el.scrollTo({ left: rtl() ? -target : target, behavior: how.smooth ? 'smooth' : 'auto' })
}
/** The visible window, as fractional event indexes (for the phone's overview bracket). */
function windowIndexes(): [number, number] {
  const el = scroller.value
  if (!el) return [0, n.value - 1]
  const left = Math.abs(el.scrollLeft)
  return [left / props.slotW - 1, (left + el.clientWidth) / props.slotW - 1]
}
function scrollToIndex(i: number, smooth = true) {
  const id = props.events[Math.max(0, Math.min(n.value - 1, Math.round(i)))]?.id
  if (id) reveal(id, { center: true, smooth })
}
defineExpose({ reveal, windowIndexes, scrollToIndex, el: scroller, sb })

/** Soft edges where the timeline continues out of view. */
const more = ref({ start: false, end: false })
function edges() {
  const el = scroller.value
  if (!el) return
  const left = Math.abs(el.scrollLeft)
  more.value = { start: left > 2, end: left + el.clientWidth < el.scrollWidth - 2 }
}
function onScroll() {
  edges()
  emit('scrolled')
}
onMounted(() => requestAnimationFrame(edges))

// ── Range gesture (mouse or pen; touch scrolls) ──────────────────────────
const draft = ref<{ x0: number; x1: number } | null>(null)
let down: { x: number; id: number } | null = null
function localX(e: PointerEvent) {
  const el = scroller.value!
  const r = el.getBoundingClientRect()
  const left = Math.abs(el.scrollLeft)
  return (rtl() ? r.right - e.clientX : e.clientX - r.left) + left
}
function under(a: number, b: number) {
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  return props.events.filter((_, i) => cx(i, props.slotW) >= lo && cx(i, props.slotW) <= hi)
}
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || !draft.value) return
  e.preventDefault()
  e.stopImmediatePropagation()
  end()
}
function end() {
  draft.value = null
  down = null
  window.removeEventListener('keydown', onKey, true)
}
function onDown(e: PointerEvent) {
  if (e.button !== 0) return
  if (rich.value && (e.target as HTMLElement).closest('button')) return
  down = { x: localX(e), id: e.pointerId }
  if (props.draggable && rich.value && e.pointerType !== 'touch') {
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    window.addEventListener('keydown', onKey, true)
  }
}
function onMove(e: PointerEvent) {
  if (!down || !props.draggable || !rich.value || e.pointerType === 'touch') return
  const x1 = localX(e)
  if (!draft.value && Math.abs(x1 - down.x) < 6) return
  draft.value = { x0: down.x, x1 }
}
function onUp() {
  const d = draft.value
  const wasDown = !!down
  end()
  if (d) {
    const b = boundsOf(under(d.x0, d.x1))
    if (b) emit('commit', [Math.floor(b[0]), Math.max(Math.ceil(b[1]), Math.floor(b[0]) + 1)])
  } else if (wasDown) emit('tap')
}
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
const draftInfo = computed(() => {
  const d = draft.value
  if (!d) return null
  const list = under(d.x0, d.x1)
  const b = boundsOf(list)
  const lo = b ? Math.floor(b[0]) : null
  const hi = b ? Math.max(Math.ceil(b[1]), (lo ?? 0) + 1) : null
  const count = b ? props.events.filter((e) => overlaps(interval(e.date), [lo!, hi!])).length : 0
  return {
    start: Math.min(d.x0, d.x1),
    size: Math.abs(d.x1 - d.x0),
    text: b ? `${yearLabel(lo!, props.era)} – ${yearLabel(hi! - 1, props.era)} · ${msg.eventsCount(count)}` : msg.noEventsIn,
  }
})
/** The committed range, drawn from its first to its last matching slot. */
const band = computed(() => {
  if (!props.range || draft.value) return null
  const idx = props.events.map((e, i) => (inRange(e) ? i : -1)).filter((i) => i >= 0)
  if (!idx.length) return null
  const a = cx(idx[0], props.slotW) - props.slotW / 2
  const b = cx(idx[idx.length - 1], props.slotW) + props.slotW / 2
  return { start: a, size: b - a }
})

const px = (v: number) => `${Math.round(v * 10) / 10}px`
</script>

<template>
  <div
    ref="scroller"
    class="et"
    :class="[
      `et--${mode}`,
      { 'et--selecting': !!selectedId, 'et--draggable': draggable && rich, 'et--dragging': !!draft, 'et--more-start': more.start, 'et--more-end': more.end },
    ]"
    :style="{ height: px(contentH + (mode === 'hidden' ? 0 : sb)) }"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="end"
    @scroll.passive="onScroll"
  >
    <div
      class="et__track"
      :style="{ width: px(trackW), height: px(Math.max(geom.height, COMPACT.height)) }"
    >
      <div
        v-if="band"
        class="et__band"
        :style="{ insetInlineStart: px(band.start), inlineSize: px(band.size) }"
        aria-hidden="true"
      />
      <template v-if="draftInfo">
        <div
          class="et__band et__band--draft"
          :style="{ insetInlineStart: px(draftInfo.start), inlineSize: px(draftInfo.size) }"
          aria-hidden="true"
        />
        <span
          class="et__draft"
          role="status"
          :style="{ insetInlineStart: px(draftInfo.start) }"
        >{{ draftInfo.text }}</span>
      </template>

      <!-- The line, its gaps and every dot move together. -->
      <div
        class="et__axis"
        :style="{ transform: `translateY(${px(axisY)})` }"
        aria-hidden="true"
      >
        <span
          v-for="g in gaps"
          :key="'s' + g.i"
          class="et__seg"
          :class="{ 'et__seg--elided': g.skipped }"
          :style="{ insetInlineStart: px(cx(g.i - 1, slotW)), inlineSize: px(slotW) }"
        />
        <span
          v-for="g in gaps.filter((v) => v.label)"
          :key="'g' + g.i"
          class="et__gap"
          :style="{ insetInlineStart: px(cx(g.i, slotW) - slotW / 2) }"
        >{{ g.label }}</span>
        <template
          v-for="(e, i) in events"
          :key="'d' + e.id"
        >
          <span
            class="et__stem"
            :class="{
              'et__stem--above': above(i),
              'et__stem--on': selectedId === e.id,
              'et__x--out': !inRange(e),
            }"
            :style="{ insetInlineStart: px(cx(i, slotW)), height: px(rich ? STEM : 0) }"
          />
          <span
            class="et__dot"
            :class="{
              'et__dot--span': timeKind(e.date) === 'span',
              'et__dot--approx': timeKind(e.date) === 'approximate',
              'et__dot--on': selectedId === e.id,
              'et__x--out': !inRange(e),
            }"
            :style="{ insetInlineStart: px(cx(i, slotW)) }"
          />
          <span
            class="et__year"
            :class="{ 'et__year--on': selectedId === e.id, 'et__x--out': !inRange(e) }"
            :style="{ insetInlineStart: px(cx(i, slotW)) }"
          >{{ year(e) }}</span>
        </template>
        <svg
          v-if="readingIndex >= 0"
          class="et__caret"
          :class="{ 'et__caret--above': !caretBelow, 'et__caret--after': readingState === 'after' }"
          :style="{ insetInlineStart: px(cx(readingIndex, slotW) - 6) }"
          width="12"
          height="10"
          viewBox="0 0 12 10"
        >
          <path d="M6 1.2 L11 9 L1 9 Z" />
        </svg>
      </div>

      <!-- Event blocks: the date, label and image read with their stem and dot. -->
      <button
        v-for="(e, i) in events"
        :key="e.id"
        type="button"
        class="et__block"
        :class="[
          above(i) ? 'et__block--above' : 'et__block--below',
          {
            'et__block--on': selectedId === e.id,
            'et__block--reading': readingId === e.id,
            'et__x--out': !inRange(e),
          },
        ]"
        :data-event="e.id"
        :tabindex="rich ? 0 : -1"
        :aria-hidden="rich ? undefined : 'true'"
        :aria-label="aria(e)"
        :aria-pressed="selectedId === e.id ? 'true' : 'false'"
        :style="{
          insetInlineStart: px(cx(i, slotW) - blockW / 2),
          inlineSize: px(blockW),
          ...(above(i)
            ? { height: px(geom.aboveH - STEM), transform: `translateY(${px(axisY - geom.aboveH)})` }
            : { top: px(STEM), height: px(geom.belowH - STEM), transform: `translateY(${px(axisY)})` }),
          '--et-lines': geom.lines,
        }"
        @click="emit('pick', e.id)"
      >
        <img
          v-if="e.image && geom.imgH"
          class="et__img"
          :src="e.image.src"
          :alt="e.image.caption"
          :title="credit(e)"
          :style="{ width: px(imgWidth(geom.imgH)), height: px(geom.imgH) }"
          loading="lazy"
        >
        <span class="et__date">{{ formatWhen(e.date, era) }}</span>
        <span class="et__label">{{ label(e) }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.et {
  --et-ease: var(--transition-timing-function-user, ease-out);
  --et-motion: var(--tr-motion, 240ms);
  position: relative;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-x: contain;
  scrollbar-width: thin;
  touch-action: pan-x pan-y;
  transition: height var(--et-motion) var(--et-ease);
}
.et--compact {
  cursor: pointer;
}
.et--more-start {
  mask-image: linear-gradient(to right, transparent, #000 32px);
}
.et--more-end {
  mask-image: linear-gradient(to right, #000 calc(100% - 32px), transparent);
}
.et--more-start.et--more-end {
  mask-image: linear-gradient(to right, transparent, #000 32px, #000 calc(100% - 32px), transparent);
}
[dir='rtl'] .et--more-start,
[dir='rtl'] .et--more-end {
  mask-image: none;
}
.et--draggable {
  cursor: crosshair;
}
.et__track {
  position: relative;
}
.et__band {
  position: absolute;
  inset-block: 0;
  background: var(--background-color-progressive-subtle);
  pointer-events: none;
}
.et__band--draft {
  border-inline: 2px solid var(--border-color-progressive);
}
.et__draft {
  position: absolute;
  inset-block-start: 0;
  z-index: 3;
  padding-inline: var(--spacing-25);
  background: var(--background-color-base);
  border: var(--border-width-base) solid var(--border-color-subtle);
  font-size: var(--font-size-small);
  line-height: 20px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}

/* ── The line ─────────────────────────────────────────────────────────── */
.et__axis {
  position: absolute;
  inset-block-start: 0;
  inset-inline-start: 0;
  width: 100%;
  height: 0;
  /* Settles last when contracting (≈100–240 ms), first when expanding. */
  transition: transform 140ms var(--et-ease) 100ms;
}
.et--rich .et__axis {
  transition: transform 180ms var(--et-ease);
}
.et__seg {
  position: absolute;
  inset-block-start: 0;
  border-block-start: var(--border-width-base) solid var(--color-base);
}
.et__seg--elided {
  border-block-start-style: dotted;
}
.et__gap {
  position: absolute;
  inset-block-start: 0;
  transform: translate(-50%, -50%);
  padding-inline: var(--spacing-25);
  background: var(--background-color-base);
  color: var(--color-placeholder);
  font-size: var(--font-size-x-small, 12px);
  line-height: 14px;
  white-space: nowrap;
}
[dir='rtl'] .et__gap {
  transform: translate(50%, -50%);
}
.et__dot {
  position: absolute;
  inset-block-start: -3.5px;
  width: 7px;
  height: 7px;
  margin-inline-start: -3.5px;
  border-radius: 50%;
  background: var(--color-base);
  border: 1.5px solid var(--color-base);
  box-sizing: border-box;
}
/* A duration: a short fixed capsule (never proportional), its range in the date. */
.et__dot--span {
  width: 15px;
  margin-inline-start: -7.5px;
  border-radius: 4px;
}
/* Approximate: open. */
.et__dot--approx {
  background: var(--background-color-base);
}
.et__dot--on {
  background: var(--color-progressive);
  border-color: var(--color-progressive);
  box-shadow: 0 0 0 2px var(--background-color-base), 0 0 0 3.5px var(--color-progressive);
}
.et__dot--approx.et__dot--on {
  background: var(--background-color-base);
}
.et__stem {
  position: absolute;
  inset-block-start: 0;
  width: 0;
  border-inline-start: var(--border-width-base) solid var(--border-color-base);
  transition: height 140ms var(--et-ease) 40ms;
}
.et__stem--above {
  transform: translateY(-100%);
}
.et__stem--on {
  border-color: var(--color-progressive);
  border-inline-start-width: 2px;
  margin-inline-start: -0.5px;
}
.et__caret {
  position: absolute;
  inset-block-start: 1px;
  z-index: 2;
  overflow: visible;
}
.et__caret--above {
  inset-block-start: -11px;
  transform: scaleY(-1);
}
.et__caret path {
  fill: var(--background-color-base);
  stroke: var(--color-base);
  stroke-width: 1.6;
  stroke-linejoin: round;
}
.et__caret--after path {
  stroke-dasharray: 2 1.6;
}
/* Compact years: they come in as the blocks go. */
.et__year {
  position: absolute;
  inset-block-start: 11px;
  transform: translateX(-50%);
  color: var(--color-subtle);
  font-size: var(--font-size-x-small, 12px);
  line-height: 14px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  unicode-bidi: plaintext;
  opacity: 0;
  transition: opacity 90ms linear;
  pointer-events: none;
}
[dir='rtl'] .et__year {
  transform: translateX(50%);
}
.et--compact .et__year {
  opacity: 1;
  transition: opacity 100ms linear 140ms;
}
.et__year--on {
  color: var(--color-progressive);
  font-weight: var(--font-weight-bold);
}

/* ── Event blocks ─────────────────────────────────────────────────────── */
.et__block {
  position: absolute;
  inset-block-start: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-base);
  font: inherit;
  text-align: center;
  cursor: pointer;
  /* Expanding: blocks come back last. */
  transition:
    opacity 100ms linear 140ms,
    transform var(--et-motion) var(--et-ease);
}
.et__block--above {
  justify-content: flex-end;
}
.et__block--below {
  justify-content: flex-start;
}
/* Contracting: blocks fade first (0–60 ms) and withdraw with the line. */
.et--compact .et__block,
.et--hidden .et__block {
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 60ms linear,
    transform var(--et-motion) var(--et-ease);
}
.et__img {
  flex: none;
  margin-block-end: 6px;
  object-fit: cover;
  background: var(--background-color-neutral-subtle);
}
.et__date {
  display: block;
  /* A long date may use the gap between same-side neighbours (they are two slots apart). */
  white-space: nowrap;
  font-size: var(--font-size-large, 18px);
  font-weight: var(--font-weight-bold);
  line-height: 24px;
  font-variant-numeric: tabular-nums;
  unicode-bidi: plaintext;
}
.et__label {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: var(--et-lines, 3);
  line-clamp: var(--et-lines, 3);
  color: var(--color-subtle);
  font-size: var(--font-size-small, 14px);
  line-height: 20px;
  overflow-wrap: anywhere;
}
.et__block:hover .et__label {
  color: var(--color-base);
  text-decoration: underline;
}
.et__block:focus-visible {
  outline: var(--border-width-thick) solid var(--outline-color-progressive--focus);
  outline-offset: 2px;
}
.et__block--on .et__date {
  color: var(--color-progressive);
}
.et__block--on .et__label {
  color: var(--color-base);
}
/* Selecting softens the others a little; they stay readable. */
.et--selecting .et__block:not(.et__block--on) {
  opacity: 0.78;
}
.et--compact.et--selecting .et__block:not(.et__block--on) {
  opacity: 0;
}
/* Outside the filter: dimmed in place, never moved. */
.et__x--out {
  opacity: 0.3;
}
.et--rich .et__block.et__x--out {
  opacity: 0.3;
}

@media (prefers-reduced-motion: reduce) {
  .et,
  .et * {
    transition: none !important;
  }
}
</style>
