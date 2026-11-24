<script setup lang="ts">
/**
 * The ruler's scene: event marks, duration lanes, direct labels, the axis
 * and the reading caret, on one proportional scale. The same elements stay
 * mounted through every presentation; only their vertical geometry
 * (translate, height) and the labels' opacity change, so contraction and
 * expansion read as one object moving. Horizontal positions depend only on
 * the domain and width.
 *
 *   point / open point   an event / an approximate date at its date
 *   bar / dotted bar     a duration / an approximate range, at its real extent
 *   count                points too close to tell apart (never spread apart)
 *   filled + ring        the selected event (deliberate choice)
 *   outlined caret       Reading: the passage being read (dashed: after it)
 *
 * Marks select and preview; they never move the article. Dragging across
 * the background (when `draggable`) previews a range with its count and
 * commits it on release; Escape cancels.
 */
import { computed, onBeforeUnmount, ref } from 'vue'

import type { NavEvent } from '../events'
import { msg } from '../messages'
import { formatWhen, interval, overlaps, ticks, timeKind, yearLabel } from '../time'
import { pointMarks, rangeMarks, xAt, yearAtX, LABEL_ROW, type PlacedLabel, type SceneLayout } from './layout'

const props = withDefaults(
  defineProps<{
    events: NavEvent[]
    domain: [number, number]
    width: number
    layout: SceneLayout
    minGap: number
    era?: boolean
    labels?: PlacedLabel[]
    selectedId?: string | null
    readingId?: string | null
    readingState?: 'at' | 'after' | 'before'
    /** The committed filter: marks outside it are dimmed, never moved. */
    range?: [number, number] | null
    /** Marks are buttons (false: the compact strip, where the whole scene is one target). */
    interactive?: boolean
    draggable?: boolean
    /** A bracket on the axis (the phone's local period). */
    windowBand?: [number, number] | null
    /** Show a single label at a mark (hover or keyboard focus elsewhere). */
    inspectId?: string | null
  }>(),
  {
    era: false,
    labels: () => [],
    selectedId: null,
    readingId: null,
    readingState: 'before',
    range: null,
    interactive: true,
    draggable: false,
    windowBand: null,
    inspectId: null,
  },
)
const emit = defineEmits<{
  pick: [id: string]
  cluster: [events: NavEvent[], extent: [number, number]]
  commit: [range: [number, number]]
  tap: [year: number]
  inspect: [id: string | null]
  dragging: [active: boolean]
}>()

const x = (y: number) => xAt(y, props.domain, props.width)
const points = computed(() => pointMarks(props.events, props.domain, props.width, props.minGap))
const ranges = computed(() => rangeMarks(props.events, props.domain, props.width))
const axisTicks = computed(() => ticks(props.domain[0], props.domain[1], Math.max(2, Math.floor(props.width / 80))))

const L = computed(() => props.layout)
const hitH = computed(() => (L.value.compact ? Math.max(3, L.value.rangeStep) : L.value.rangeStep))
const inRange = (e: NavEvent) => !props.range || overlaps(interval(e.date), props.range)

/** Where the reading caret sits: at its event's mark. */
const caretX = computed(() => {
  if (!props.readingId) return null
  const r = ranges.value.find((m) => m.e.id === props.readingId)
  if (r) return r.x0
  for (const m of points.value) {
    if (m.kind === 'point' && m.e.id === props.readingId) return m.x
    if (m.kind === 'cluster' && m.events.some((e) => e.id === props.readingId)) return m.x
  }
  return null
})

const inspected = computed(() => {
  const id = hoverId.value ?? props.inspectId
  if (!id || L.value.compact) return null
  const e = props.events.find((v) => v.id === id)
  if (!e) return null
  const r = ranges.value.find((m) => m.e.id === id)
  const p = points.value.find((m) => (m.kind === 'point' ? m.e.id === id : m.events.some((v) => v.id === id)))
  const px = r ? r.x0 : (p?.x ?? 0)
  return { e, x: px, align: px > props.width * 0.6 ? 'end' : 'start' }
})
const hoverId = ref<string | null>(null)
function hover(id: string | null) {
  hoverId.value = id
  emit('inspect', id)
}

function aria(e: NavEvent) {
  const bits = [`${formatWhen(e.date, props.era)}: ${e.label}`]
  if (props.selectedId === e.id) bits.push(msg.trSelected)
  if (props.readingId === e.id) bits.push(msg.trReadingHere)
  if (!inRange(e)) bits.push(msg.trOutsideRange)
  return bits.join(', ')
}
function clusterAria(events: NavEvent[], extent: [number, number]) {
  return msg.clusterLabel(events.length, yearLabel(Math.floor(extent[0]), props.era), yearLabel(Math.ceil(extent[1]) - 1, props.era))
}

// ── Range gesture ────────────────────────────────────────────────────────
const el = ref<HTMLElement | null>(null)
const draft = ref<{ x0: number; x1: number } | null>(null)
let downX: number | null = null
const rtl = () => !!el.value && getComputedStyle(el.value).direction === 'rtl'
function localX(e: PointerEvent) {
  const r = el.value!.getBoundingClientRect()
  return rtl() ? r.right - e.clientX : e.clientX - r.left
}
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || !draft.value) return
  // Escape cancels the gesture first, before anything else in the ruler.
  e.preventDefault()
  e.stopImmediatePropagation()
  endGesture()
}
function endGesture() {
  draft.value = null
  downX = null
  window.removeEventListener('keydown', onKey, true)
  emit('dragging', false)
}
function onDown(e: PointerEvent) {
  if ((e.target as HTMLElement).closest('button') && props.interactive) return
  if (e.button !== 0) return
  downX = localX(e)
  if (props.draggable) {
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    window.addEventListener('keydown', onKey, true)
  }
}
function onMove(e: PointerEvent) {
  if (downX === null || !props.draggable) return
  const x1 = localX(e)
  if (!draft.value && Math.abs(x1 - downX) < 6) return
  if (!draft.value) emit('dragging', true)
  draft.value = { x0: downX, x1 }
}
function onUp(e: PointerEvent) {
  const d = draft.value
  const start = downX
  endGesture()
  if (d) {
    const a = yearAtX(Math.min(d.x0, d.x1), props.domain, props.width)
    const b = yearAtX(Math.max(d.x0, d.x1), props.domain, props.width)
    const lo = Math.floor(a)
    emit('commit', [lo, Math.max(Math.ceil(b), lo + 1)])
  } else if (start !== null) emit('tap', yearAtX(localX(e), props.domain, props.width))
}
const draftYears = computed(() => {
  const d = draft.value
  if (!d) return null
  const lo = Math.floor(yearAtX(Math.min(d.x0, d.x1), props.domain, props.width))
  const hi = Math.max(Math.ceil(yearAtX(Math.max(d.x0, d.x1), props.domain, props.width)), lo + 1)
  const n = props.events.filter((e) => overlaps(interval(e.date), [lo, hi])).length
  return { lo, hi, n, start: Math.min(d.x0, d.x1), size: Math.abs(d.x1 - d.x0) }
})
const committedBand = computed(() => {
  const r = props.range
  if (!r || draft.value) return null
  const s = x(Math.max(r[0], props.domain[0]))
  return { start: s, size: Math.max(2, x(Math.min(r[1], props.domain[1])) - s) }
})
const windowRect = computed(() => {
  const w = props.windowBand
  if (!w) return null
  const s = x(Math.max(w[0], props.domain[0]))
  return { start: s, size: Math.max(2, x(Math.min(w[1], props.domain[1])) - s) }
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))

const px = (n: number) => `${Math.round(n * 10) / 10}px`
</script>

<template>
  <div
    ref="el"
    class="rs"
    :class="{ 'rs--compact': L.compact, 'rs--draggable': draggable, 'rs--dragging': !!draft }"
    :style="{ height: px(L.height) }"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="endGesture"
  >
    <div
      v-if="windowRect"
      class="rs__window"
      :style="{ insetInlineStart: px(windowRect.start), inlineSize: px(windowRect.size) }"
      aria-hidden="true"
    />
    <div
      v-if="committedBand"
      class="rs__band"
      :style="{ insetInlineStart: px(committedBand.start), inlineSize: px(committedBand.size) }"
      aria-hidden="true"
    />
    <template v-if="draftYears">
      <div
        class="rs__band rs__band--draft"
        :style="{ insetInlineStart: px(draftYears.start), inlineSize: px(draftYears.size) }"
        aria-hidden="true"
      />
      <span
        class="rs__draft-label"
        :class="{ 'rs__draft-label--end': draftYears.start > width * 0.6 }"
        :style="{ insetInlineStart: px(draftYears.start > width * 0.6 ? draftYears.start + draftYears.size : draftYears.start) }"
        role="status"
      ><b>{{ yearLabel(draftYears.lo, era) }} – {{ yearLabel(draftYears.hi - 1, era) }}</b> · {{ msg.eventsCount(draftYears.n) }}</span>
    </template>

    <!-- Direct labels (milestones), with a stem down to their mark. -->
    <template
      v-for="l in labels"
      :key="'l' + l.e.id"
    >
      <span
        class="rs__stem"
        aria-hidden="true"
        :class="{ 'rs__label--hidden': l.row >= L.labelRows }"
        :style="{
          insetInlineStart: px(l.x),
          transform: `translateY(${px(l.row * LABEL_ROW + 17)})`,
          height: px(Math.max(0, L.pointsY - 6 - (l.row * LABEL_ROW + 17))),
        }"
      />
      <span
        class="rs__label"
        aria-hidden="true"
        :class="{ 'rs__label--out': !inRange(l.e), 'rs__label--hidden': l.row >= L.labelRows }"
        :style="{
          insetInlineStart: px(l.align === 'start' ? l.x - 3 : l.x - l.width + 3),
          inlineSize: px(l.width),
          transform: `translateY(${px(l.row * LABEL_ROW)})`,
        }"
      ><b>{{ formatWhen(l.e.date, era) }}</b> {{ l.e.label }}</span>
    </template>
    <span
      v-if="inspected"
      class="rs__inspect"
      :class="`rs__inspect--${inspected.align}`"
      :style="{ insetInlineStart: px(inspected.x) }"
      aria-hidden="true"
    ><b>{{ formatWhen(inspected.e.date, era) }}</b> {{ inspected.e.label }}</span>

    <!-- Points and clusters -->
    <template
      v-for="m in points"
      :key="m.key"
    >
      <button
        v-if="m.kind === 'point'"
        type="button"
        class="rs__mark"
        :class="{
          'rs__mark--selected': selectedId === m.e.id,
          'rs__mark--reading': readingId === m.e.id,
          'rs__mark--out': !inRange(m.e),
        }"
        :data-event="m.e.id"
        :tabindex="interactive ? 0 : -1"
        :aria-hidden="interactive ? undefined : 'true'"
        :aria-label="aria(m.e)"
        :aria-pressed="selectedId === m.e.id ? 'true' : 'false'"
        :style="{ insetInlineStart: px(m.x), inlineSize: px(minGap), marginInlineStart: px(-minGap / 2), transform: `translateY(${px(L.pointsY - 12)})` }"
        @click="emit('pick', m.e.id)"
        @mouseenter="hover(m.e.id)"
        @mouseleave="hover(null)"
        @focus="hover(m.e.id)"
        @blur="hover(null)"
      >
        <span
          class="rs__dot"
          :class="{ 'rs__dot--open': timeKind(m.e.date) === 'approximate' }"
        />
      </button>
      <button
        v-else
        type="button"
        class="rs__mark rs__cluster"
        :class="{
          'rs__mark--selected': m.events.some((e) => e.id === selectedId),
          'rs__mark--reading': m.events.some((e) => e.id === readingId),
          'rs__mark--out': !m.events.some(inRange),
        }"
        :data-events="m.events.map((e) => e.id).join(' ')"
        :tabindex="interactive ? 0 : -1"
        :aria-hidden="interactive ? undefined : 'true'"
        :aria-label="clusterAria(m.events, m.extent)"
        :style="{ insetInlineStart: px(m.x), inlineSize: px(minGap), marginInlineStart: px(-minGap / 2), transform: `translateY(${px(L.pointsY - 12)})` }"
        @click="emit('cluster', m.events, m.extent)"
      >
        <span class="rs__count">{{ m.events.length }}</span>
      </button>
    </template>

    <!-- Durations and approximate ranges -->
    <button
      v-for="r in ranges"
      :key="r.key"
      type="button"
      class="rs__range"
      :class="{
        'rs__range--approx': timeKind(r.e.date) === 'approximate',
        'rs__mark--selected': selectedId === r.e.id,
        'rs__mark--reading': readingId === r.e.id,
        'rs__mark--out': !inRange(r.e),
      }"
      :data-event="r.e.id"
      :tabindex="interactive ? 0 : -1"
      :aria-hidden="interactive ? undefined : 'true'"
      :aria-label="aria(r.e)"
      :aria-pressed="selectedId === r.e.id ? 'true' : 'false'"
      :style="{
        insetInlineStart: px(r.x0),
        inlineSize: px(r.x1 - r.x0),
        height: px(hitH),
        transform: `translateY(${px(L.rangeY0 + r.row * L.rangeStep - hitH / 2)})`,
        '--rs-bar': px(L.barH),
      }"
      @click="emit('pick', r.e.id)"
      @mouseenter="hover(r.e.id)"
      @mouseleave="hover(null)"
      @focus="hover(r.e.id)"
      @blur="hover(null)"
    >
      <span class="rs__bar" />
    </button>

    <!-- The axis: line, ticks, labels and the reading caret move as one. -->
    <div
      class="rs__axis"
      :style="{ transform: `translateY(${px(L.axisY)})` }"
      aria-hidden="true"
    >
      <div class="rs__line" />
      <span
        v-for="t in axisTicks"
        :key="t"
        class="rs__tick"
        :style="{ insetInlineStart: px(x(t)) }"
      >
        <span
          class="rs__tick-label"
          :class="{ 'rs__tick-label--start': x(t) < 20, 'rs__tick-label--end': x(t) > width - 20 }"
        >{{ yearLabel(t, era && domain[0] < 0) }}</span>
      </span>
      <svg
        v-if="caretX !== null"
        class="rs__caret"
        :class="{ 'rs__caret--after': readingState === 'after' }"
        :style="{ insetInlineStart: px(caretX - 6) }"
        width="12"
        height="10"
        viewBox="0 0 12 10"
      >
        <path d="M6 1.2 L11 9 L1 9 Z" />
      </svg>
    </div>
  </div>
</template>

<style scoped>
.rs {
  --rs-motion: var(--tr-motion, 240ms);
  --rs-ease: var(--transition-timing-function-user, ease-out);
  position: relative;
  touch-action: pan-y;
  user-select: none;
  transition: height var(--rs-motion) var(--rs-ease);
}
.rs--draggable {
  cursor: crosshair;
}
.rs--compact {
  cursor: pointer;
}
.rs__window,
.rs__band {
  position: absolute;
  inset-block: 0;
  pointer-events: none;
}
.rs__window {
  border-inline: var(--border-width-thick) solid var(--border-color-progressive--focus, var(--color-progressive));
  background: var(--background-color-progressive-subtle);
}
.rs__band {
  background: var(--background-color-progressive-subtle);
  border-inline: var(--border-width-base) solid var(--border-color-progressive);
}
.rs__band--draft {
  border-inline-width: 2px;
}
.rs__draft-label,
.rs__inspect,
.rs__label {
  position: absolute;
  inset-block-start: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-base);
  font-size: var(--font-size-small);
  line-height: 18px;
}
.rs__draft-label,
.rs__inspect {
  z-index: 3;
  max-width: min(360px, 80%);
  padding-inline: var(--spacing-25);
  background: var(--background-color-base);
  border: var(--border-width-base) solid var(--border-color-subtle);
  border-radius: var(--border-radius-base);
  pointer-events: none;
  font-variant-numeric: tabular-nums;
}
.rs__draft-label--end,
.rs__inspect--end {
  transform: translateX(-100%);
}
[dir='rtl'] .rs__draft-label--end,
[dir='rtl'] .rs__inspect--end {
  transform: translateX(100%);
}
.rs--compact .rs__inspect {
  display: none;
}
.rs__label {
  pointer-events: none;
  opacity: 1;
  transition:
    opacity 90ms linear 150ms,
    transform var(--rs-motion) var(--rs-ease);
}
.rs__label b {
  font-weight: var(--font-weight-bold);
  font-variant-numeric: tabular-nums;
}
.rs__label--out {
  color: var(--color-subtle);
}
.rs__stem {
  position: absolute;
  inset-block-start: 0;
  width: 0;
  border-inline-start: var(--border-width-base) solid var(--border-color-base);
  pointer-events: none;
  transition:
    opacity 90ms linear 150ms,
    height var(--rs-motion) var(--rs-ease),
    transform var(--rs-motion) var(--rs-ease);
}
/* Contracting: labels go first, before the lanes draw together under them. */
.rs__label--hidden,
.rs--compact .rs__label,
.rs--compact .rs__stem {
  opacity: 0;
  transition:
    opacity 60ms linear,
    transform var(--rs-motion) var(--rs-ease),
    height var(--rs-motion) var(--rs-ease);
}

.rs__mark,
.rs__range {
  position: absolute;
  inset-block-start: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  /* Lanes: 40–180 ms of the change. */
  transition:
    transform 140ms var(--rs-ease) 40ms,
    height 140ms var(--rs-ease) 40ms,
    opacity 120ms linear;
}
.rs__mark {
  height: 24px;
}
.rs--compact .rs__mark,
.rs--compact .rs__range {
  pointer-events: none;
}
.rs__dot {
  display: block;
  width: 9px;
  height: 9px;
  box-sizing: border-box;
  border-radius: 50%;
  border: 1.5px solid var(--color-base);
  background: var(--color-base);
}
.rs__dot--open {
  background: var(--background-color-base);
}
.rs__count {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding-inline: 3px;
  box-sizing: border-box;
  border-radius: 9px;
  border: 2px solid transparent;
  background: var(--color-base);
  color: var(--color-inverted);
  font-size: 11px;
  font-weight: var(--font-weight-bold);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.rs--compact .rs__count {
  min-width: 14px;
  height: 14px;
  font-size: 10px;
}
.rs__range {
  min-width: 4px;
}
.rs__bar {
  display: block;
  width: 100%;
  height: var(--rs-bar, 5px);
  background: var(--color-base);
  transition: height 140ms var(--rs-ease) 40ms;
}
.rs__range--approx .rs__bar {
  background: transparent;
  border-block: 1.5px dotted var(--color-base);
  box-sizing: border-box;
  min-height: 2px;
}
.rs__mark:hover .rs__dot,
.rs__mark:focus-visible .rs__dot {
  border-color: var(--color-progressive);
}
.rs__range:hover .rs__bar,
.rs__range:focus-visible .rs__bar {
  background: var(--color-progressive--hover, var(--color-progressive));
}
.rs__mark:focus-visible,
.rs__range:focus-visible {
  outline: var(--border-width-thick) solid var(--outline-color-progressive--focus);
  outline-offset: 0;
  border-radius: var(--border-radius-base);
}
/* Selected: filled in the progressive colour, plus a ring (a shape, not only a colour). */
.rs__mark--selected .rs__dot {
  border-color: var(--color-progressive);
  background: var(--color-progressive);
  box-shadow:
    0 0 0 2px var(--background-color-base),
    0 0 0 4px var(--color-progressive);
}
.rs__mark--selected .rs__dot--open {
  background: var(--background-color-base);
  border-width: 2.5px;
}
.rs__mark--selected .rs__count {
  background: var(--color-progressive);
  box-shadow: 0 0 0 2px var(--background-color-base), 0 0 0 4px var(--color-progressive);
}
.rs__range.rs__mark--selected .rs__bar {
  background: var(--color-progressive);
  outline: 2px solid var(--color-progressive);
  outline-offset: 2px;
}
.rs__range--approx.rs__mark--selected .rs__bar {
  background: transparent;
  border-color: var(--color-progressive);
}
/* Outside the filter: dimmed in place, never moved or removed. */
.rs__mark--out {
  opacity: 0.32;
}

.rs__axis {
  position: absolute;
  inset-block-start: 0;
  inset-inline: 0;
  height: 0;
  /* The axis and caret settle last when contracting (≈100–240 ms), first when expanding. */
  transition: transform 140ms var(--rs-ease) 100ms;
}
.rs:not(.rs--compact) .rs__axis {
  transition: transform 180ms var(--rs-ease);
}
.rs__line {
  position: absolute;
  inset-inline: 12px;
  inset-block-start: 0;
  border-block-start: var(--border-width-base) solid var(--color-base);
}
.rs__tick {
  position: absolute;
  inset-block-start: 0;
  height: 5px;
  border-inline-start: var(--border-width-base) solid var(--color-base);
}
.rs__tick-label {
  position: absolute;
  inset-block-start: 4px;
  transform: translateX(-50%);
  color: var(--color-subtle);
  font-size: var(--font-size-x-small, 12px);
  line-height: 14px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  unicode-bidi: plaintext;
}
[dir='rtl'] .rs__tick-label {
  transform: translateX(50%);
}
.rs__tick-label--start {
  transform: none !important;
}
.rs__tick-label--end {
  inset-inline-end: 0;
  transform: none !important;
}
.rs__caret {
  position: absolute;
  inset-block-start: -1px;
  z-index: 2;
  overflow: visible;
}
.rs__caret path {
  fill: var(--background-color-base);
  stroke: var(--color-base);
  stroke-width: 1.6;
  stroke-linejoin: round;
}
.rs__caret--after path {
  stroke-dasharray: 2 1.6;
}

@media (prefers-reduced-motion: reduce) {
  .rs,
  .rs * {
    transition: none !important;
  }
}
</style>
