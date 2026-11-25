<script setup lang="ts">
/**
 * B's timeline track: the earlier evenly spaced timeline (one thin line,
 * points, short stems, events alternating above and below), driven by the
 * ruler. Each event is its date (always visible, next to its stem), a short
 * title, and an optional photograph furthest from the line.
 *
 *   rich     the open timeline: date, title and photograph on each side
 *   compact  the docked strip: titles and photographs withdraw first, the
 *            stems shorten, and the dates settle into two tight alternating
 *            rows around the same line, each beside its own point
 *
 * Nothing is remounted between the two; horizontal positions, order and the
 * scroll offset belong to this one scroller. Dates stay legible throughout.
 *
 * State on the existing marks, no pointers or badges:
 *   reading   the date of the passage being read (the event last gone to):
 *             a progressive date and a filled progressive point
 *   selected  (editing) the event being edited, the same treatment
 *   focus     Codex focus outline around the date
 *
 * It owns no selection or navigation: activating an event emits `pick`.
 * Native horizontal scrolling (a visible scrollbar) and arrow keys browse.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import type { NavEvent } from '../events'
import { msg } from '../messages'
import { formatWhen, interval, timeKind } from '../time'
import { above, BLOCK_PAD, COMPACT, imgWidth, linesPerTitle, slotsOf, STEM, type RichLayout, type Slot } from './layout'

const props = withDefaults(
  defineProps<{
    events: NavEvent[]
    slotW: number
    blockW: number
    mode: 'rich' | 'compact'
    geom: RichLayout
    era?: boolean
    selectedId?: string | null
    readingId?: string | null
    /** The subject's birth year: each event shows the age at it (event year − birth year). */
    birthYear?: number | null
    /** Accessible description of the figure (how to read it). */
    description?: string
  }>(),
  { era: false, selectedId: null, readingId: null, birthYear: null, description: '' },
)
const emit = defineEmits<{ pick: [id: string]; tap: []; scrolled: [] }>()

const rich = computed(() => props.mode === 'rich')
/** One slot per date; a slot of several events stacks their titles under one date. */
const slots = computed<Slot[]>(() => slotsOf(props.events, props.era))
const n = computed(() => slots.value.length)
const slotOf = (id: string) => slots.value.findIndex((s) => s.events.some((e) => e.id === id))
const has = (s: Slot, id: string | null) => !!id && s.events.some((e) => e.id === id)
/** Margin before the first point, so its block starts inside the track. */
const lead = computed(() => props.blockW / 2 + BLOCK_PAD)
const cx = (i: number) => lead.value + i * props.slotW
const trackW = computed(() => 2 * lead.value + Math.max(0, n.value - 1) * props.slotW)
const axisY = computed(() => (rich.value ? props.geom.aboveH : COMPACT.axisY))
const stemNow = computed(() => (rich.value ? STEM : COMPACT.stem))
const contentH = computed(() => (rich.value ? props.geom.height : COMPACT.height))
const aboveItemH = computed(() => props.geom.aboveH - STEM)
const belowItemH = computed(() => props.geom.belowH - STEM)

/** "aged 60", "aged 40–44" (a span), or nothing (no birth year, or at or before birth). */
function age(e: NavEvent): string | null {
  const b = props.birthYear
  if (b === null || b === undefined) return null
  const [a, z] = interval(e.date)
  const from = Math.floor(a) - b
  const to = Math.ceil(z) - 1 - b
  if (to < 1) return null
  return from === to || from < 1 ? `aged ${to}` : `aged ${from}–${to}`
}
function aria(e: NavEvent) {
  const bits = [`${formatWhen(e.date, props.era)}: ${e.label}`]
  const a = age(e)
  if (a) bits.push(a)
  if (props.selectedId === e.id) bits.push(msg.trSelected)
  if (props.readingId === e.id) bits.push(msg.trReadingHere)
  return bits.join(', ')
}
const credit = (e: NavEvent) =>
  e.image?.source === 'commons' ? [e.image.caption, e.image.artist, e.image.license].filter(Boolean).join(' · ') : (e.image?.caption ?? '')

// ── Scrolling ────────────────────────────────────────────────────────────
const scroller = ref<HTMLElement | null>(null)
const sb = ref(0)
const more = ref({ start: false, end: false })
function edges() {
  const el = scroller.value
  if (!el) return
  const left = Math.abs(el.scrollLeft)
  more.value = { start: left > 2, end: left + el.clientWidth < el.scrollWidth - 2 }
}
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
function onScroll() {
  edges()
  emit('scrolled')
}
/** The reader's own horizontal gesture: following the reading position waits for it. */
let userAt = 0
const markUser = () => (userAt = performance.now())

const rtl = () => !!scroller.value && getComputedStyle(scroller.value).direction === 'rtl'
/**
 * Bring event `id` into view (only when it is not already comfortably visible,
 * unless `center`). `follow`: a reading-follow request, which yields to a
 * recent horizontal gesture by the reader.
 */
function reveal(id: string, how: { center?: boolean; smooth?: boolean; follow?: boolean } = {}) {
  const el = scroller.value
  const i = slotOf(id)
  if (!el || i < 0 || el.scrollWidth <= el.clientWidth) return
  if (how.follow && performance.now() - userAt < 2500) return
  const x = cx(i)
  const view = el.clientWidth
  const left = Math.abs(el.scrollLeft)
  const margin = props.blockW / 2
  if (!how.center && x > left + margin && x < left + view - margin) return
  const target = Math.max(0, Math.min(trackW.value - view, x - view / 2))
  el.scrollTo({ left: rtl() ? -target : target, behavior: how.smooth ? 'smooth' : 'auto' })
}
/** Keyboard browsing: focus moves along the line; nothing is selected until Enter. */
function focusBlock(id: string) {
  const b = scroller.value?.querySelector<HTMLElement>(`[data-event="${CSS.escape(id)}"]`)
  if (!b) return
  reveal(id, { smooth: false })
  b.focus({ preventScroll: true })
}
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return
  const id = (e.target as HTMLElement).closest<HTMLElement>('[data-event]')?.dataset.event
  if (!id) return
  e.preventDefault()
  e.stopPropagation()
  markUser()
  // Event by event, in date order (a slot's titles one after another).
  const last = props.events.length - 1
  const i = props.events.findIndex((v) => v.id === id)
  const fwd = (e.key === 'ArrowRight') !== rtl()
  const j = e.key === 'Home' ? 0 : e.key === 'End' ? last : Math.max(0, Math.min(last, i + (fwd ? 1 : -1)))
  focusBlock(props.events[j].id)
}
defineExpose({ reveal, focusBlock, el: scroller, sb })

/** In the strip, a click between dates opens the timeline. */
function onClick(e: MouseEvent) {
  // (A shared date in the strip opens it too: which of its events is the reader's choice.)
  if (!rich.value && !(e.target as HTMLElement).closest('[data-event]')) emit('tap')
}

const px = (v: number) => `${Math.round(v * 10) / 10}px`
</script>

<template>
  <!-- eslint-disable-next-line vuejs-accessibility/click-events-have-key-events, vuejs-accessibility/no-static-element-interactions -->
  <div
    ref="scroller"
    class="et"
    :class="[`et--${mode}`, { 'et--more-start': more.start, 'et--more-end': more.end }]"
    :style="{ height: px(contentH + sb) }"
    @scroll.passive="onScroll"
    @click="onClick"
    @keydown="onKeydown"
    @wheel.passive="markUser"
    @pointerdown="markUser"
    @touchstart.passive="markUser"
  >
    <figure
      class="et__track"
      :style="{ width: px(trackW), height: px(Math.max(geom.height, COMPACT.height)) }"
    >
      <figcaption class="tn-visually-hidden">
        {{ description }}
      </figcaption>

      <!-- The line, stems and points move together. -->
      <div
        class="et__axis"
        :style="{ transform: `translateY(${px(axisY)})` }"
        aria-hidden="true"
      >
        <span
          v-if="n > 1"
          class="et__line"
          :style="{ insetInlineStart: px(cx(0)), inlineSize: px(cx(n - 1) - cx(0)) }"
        />
        <template
          v-for="(s, i) in slots"
          :key="'d' + s.events[0].id"
        >
          <span
            class="et__dot"
            :class="{
              'et__dot--approx': timeKind(s.events[0].date) === 'approximate',
              'et__dot--on': has(s, selectedId) || has(s, readingId),
            }"
            :style="{ insetInlineStart: px(cx(i)) }"
          />
        </template>
      </div>

      <!-- The events, in date order, one slot per date: date by the stem, then title(s), then photograph. -->
      <ol class="et__list">
        <li
          v-for="(s, i) in slots"
          :key="s.events[0].id"
          class="et__item"
          :class="[above(i) ? 'et__item--above' : 'et__item--below']"
          :style="{
            insetInlineStart: px(cx(i) - blockW / 2),
            inlineSize: px(blockW),
            height: px(above(i) ? aboveItemH : belowItemH),
            transform: `translateY(${px(above(i) ? axisY - stemNow - aboveItemH : axisY + stemNow)})`,
          }"
        >
          <!-- One event: the whole block is its button. -->
          <button
            v-if="s.events.length === 1"
            type="button"
            class="et__stack et__block"
            :class="{ 'et__block--on': selectedId === s.events[0].id, 'et__block--reading': readingId === s.events[0].id }"
            :data-event="s.events[0].id"
            :aria-label="aria(s.events[0])"
            :aria-pressed="selectedId === s.events[0].id ? 'true' : 'false'"
            :title="s.events[0].label"
            :style="{ '--et-lines': above(i) ? geom.linesAbove : geom.linesBelow }"
            @click="emit('pick', s.events[0].id)"
          >
            <span class="et__date">{{ s.key }}</span>
            <span class="et__label">{{ s.events[0].label }}</span>
            <span
              v-if="age(s.events[0])"
              class="et__age"
            >{{ age(s.events[0]) }}</span>
            <img
              v-if="s.image && geom.imgH && (geom.imgAbove || !above(i))"
              class="et__img"
              :src="s.image.src"
              :alt="s.image.caption"
              :title="credit(s.events[0])"
              :style="{ width: px(imgWidth(geom.imgH)), height: px(geom.imgH) }"
              loading="lazy"
            >
          </button>
          <!-- Several events on one date: the date and age once, each title its own button. -->
          <div
            v-else
            class="et__stack et__group"
            :class="{ 'et__block--on': has(s, selectedId), 'et__block--reading': has(s, readingId) }"
          >
            <span class="et__date">{{ s.key }}</span>
            <ul
              class="et__titles"
              :aria-label="msg.trSameDate(s.key, s.events.length)"
            >
              <li
                v-for="e in s.events"
                :key="e.id"
              >
                <button
                  type="button"
                  class="et__pick"
                  :class="{ 'et__pick--on': selectedId === e.id, 'et__pick--reading': readingId === e.id }"
                  :data-event="e.id"
                  :aria-label="aria(e)"
                  :aria-pressed="selectedId === e.id ? 'true' : 'false'"
                  :title="e.label"
                  :style="{ '--et-lines': linesPerTitle(above(i) ? geom.linesAbove : geom.linesBelow, s.events.length) }"
                  @click="emit('pick', e.id)"
                >
                  {{ e.label }}
                </button>
              </li>
            </ul>
            <span
              v-if="age(s.events[0])"
              class="et__age"
            >{{ age(s.events[0]) }}</span>
            <img
              v-if="s.image && geom.imgH && (geom.imgAbove || !above(i))"
              class="et__img"
              :src="s.image.src"
              :alt="s.image.caption"
              :title="credit(s.events.find((e) => e.image) ?? s.events[0])"
              :style="{ width: px(imgWidth(geom.imgH)), height: px(geom.imgH) }"
              loading="lazy"
            >
          </div>
        </li>
      </ol>
    </figure>
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
  transition: height var(--et-motion) var(--et-ease);
}
/* A real, always-visible scrollbar (not a hidden overlay): the way to browse sideways. */
.et::-webkit-scrollbar {
  height: 8px;
}
.et::-webkit-scrollbar-track {
  background: transparent;
}
.et::-webkit-scrollbar-thumb {
  background: var(--border-color-base);
  border-radius: 4px;
  border: 2px solid var(--background-color-base);
  background-clip: padding-box;
}
.et::-webkit-scrollbar-thumb:hover {
  background-color: var(--color-placeholder);
}
@supports not selector(::-webkit-scrollbar) {
  .et {
    scrollbar-width: thin;
  }
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
.mw-parser-output .et__track,
.et__track {
  position: relative;
  margin: 0;
  padding: 0;
}

/* ── The line ─────────────────────────────────────────────────────────── */
.et__axis {
  position: absolute;
  inset-block-start: 0;
  inset-inline-start: 0;
  width: 100%;
  height: 0;
  transition: transform var(--et-motion) var(--et-ease);
}
.et__line {
  position: absolute;
  inset-block-start: 0;
  border-block-start: var(--border-width-base) solid var(--border-color-base);
}
.et__dot {
  position: absolute;
  inset-block-start: -3.5px;
  width: 7px;
  height: 7px;
  margin-inline-start: -3.5px;
  border-radius: 50%;
  box-sizing: border-box;
  background: var(--color-base);
  border: 1.5px solid var(--color-base);
  /* A thin halo of the page around each point, so it sits on the line rather than in it. */
  box-shadow: 0 0 0 2px var(--background-color-base);
  transition:
    background-color var(--transition-duration-base, 100ms),
    border-color var(--transition-duration-base, 100ms),
    box-shadow var(--transition-duration-base, 100ms);
}
/* Approximate: open (its date text says how: "c.", "the 1970s"). */
.et__dot--approx {
  background: var(--background-color-base);
}
/* The current (or, editing, the selected) event: a larger progressive point with a soft halo. */
.et__dot--on {
  inset-block-start: -5px;
  width: 10px;
  height: 10px;
  margin-inline-start: -5px;
  background: var(--color-progressive);
  border-color: var(--color-progressive);
  box-shadow:
    0 0 0 2px var(--background-color-base),
    0 0 0 5px var(--background-color-progressive-subtle);
}

/* ── Events ───────────────────────────────────────────────────────────── */
.mw-parser-output .et__list,
.et__list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.mw-parser-output .et__item,
.et__item {
  position: absolute;
  inset-block-start: 0;
  margin: 0;
  transition: transform var(--et-motion) var(--et-ease);
}
.et__stack {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-base);
  font: inherit;
  text-align: center;
  cursor: pointer;
}
/* Above the line: the date at the bottom, next to its stem; below: at the top. */
.et__item--above .et__stack {
  flex-direction: column-reverse;
}
.et__item--below .et__stack {
  flex-direction: column;
}
.et__group {
  cursor: default;
}
/* Several titles under one date: a short stack, each its own target. */
.mw-parser-output .et__titles,
.et__titles {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.mw-parser-output .et__titles li,
.et__titles li {
  margin: 0;
}
.et__pick {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: var(--et-lines, 1);
  line-clamp: var(--et-lines, 1);
  max-width: 100%;
  padding: 0 var(--spacing-25);
  border: 0;
  border-radius: var(--border-radius-base);
  background: none;
  color: var(--color-base);
  font: inherit;
  font-size: var(--font-size-small, 14px);
  line-height: 18px;
  text-align: center;
  overflow-wrap: break-word;
  cursor: pointer;
}
.et__pick:hover {
  color: var(--color-progressive--hover, var(--color-progressive));
}
.et__pick:focus-visible {
  outline: var(--border-width-thick) solid var(--outline-color-progressive--focus);
  outline-offset: 1px;
}
.et__pick--reading {
  color: var(--color-base);
}
.et__pick--on {
  color: var(--color-progressive);
}
.et--compact .et__titles {
  opacity: 0;
  pointer-events: none;
  transition: opacity 60ms linear;
}
.et__titles {
  transition: opacity 100ms linear 140ms;
}
.et__date {
  flex: none;
  padding: 0 var(--spacing-50);
  border-radius: var(--border-radius-base);
  white-space: nowrap;
  font-size: var(--font-size-large, 18px);
  font-weight: var(--font-weight-bold);
  line-height: 24px;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
  unicode-bidi: plaintext;
  text-decoration: none;
  transition:
    font-size var(--et-motion) var(--et-ease),
    line-height var(--et-motion) var(--et-ease),
    color var(--transition-duration-base, 100ms);
}
.et--compact .et__date {
  font-size: 15px;
  line-height: 18px;
}
/* Reading (and, editing, the event being edited): the progressive colour, with a filled point. */
.et__block--reading .et__date,
.et__block--on .et__date {
  color: var(--color-progressive);
}
.et__label {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: var(--et-lines, 2);
  line-clamp: var(--et-lines, 2);
  padding-inline: var(--spacing-25);
  color: var(--color-base);
  font-size: var(--font-size-small, 14px);
  line-height: 20px;
  overflow-wrap: break-word;
}
.et__block--on .et__label {
  color: var(--color-base);
}
.et__img {
  flex: none;
  margin-block: 8px 0;
  object-fit: cover;
  border-radius: calc(3 * var(--border-radius-base, 2px));
  background: var(--background-color-neutral-subtle);
  /* A hairline edge, so light photographs keep their shape on the page. */
  box-shadow: 0 0 0 1px var(--border-color-muted, rgba(0, 0, 0, 0.08));
}
.et__item--above .et__img {
  margin-block: 0 8px;
}
.et__age {
  flex: none;
  color: var(--color-placeholder);
  font-size: var(--font-size-x-small, 12px);
  line-height: 16px;
  font-variant-numeric: tabular-nums;
}
/* Titles, ages and photographs recede first when contracting, and come back last. */
.et__age,
.et__label,
.et__img {
  transition: opacity 100ms linear 140ms;
}
.et--compact .et__age,
.et--compact .et__label,
.et--compact .et__img {
  opacity: 0;
  transition: opacity 60ms linear;
}
.et__block:hover .et__label,
.et__block:hover .et__date {
  color: var(--color-progressive--hover, var(--color-progressive));
}
.et__block:focus {
  outline: none;
}
.et__block:focus-visible .et__date {
  outline: var(--border-width-thick) solid var(--outline-color-progressive--focus);
  outline-offset: 1px;
}

@media (prefers-reduced-motion: reduce) {
  .et,
  .et * {
    transition: none !important;
  }
}
</style>
