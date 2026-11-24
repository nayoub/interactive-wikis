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
 *   reading   the date of the passage being read: a subtle neutral underline
 *   selected  a progressive date and a filled progressive point
 *   focus     Codex focus outline around the date
 *
 * It owns no selection or navigation: activating an event emits `pick`.
 * Native horizontal scrolling (a visible scrollbar) and arrow keys browse.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import type { NavEvent } from '../events'
import { msg } from '../messages'
import { formatWhen, timeKind } from '../time'
import { above, BLOCK_PAD, COMPACT, imgWidth, STEM, type RichLayout } from './layout'

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
    /** Accessible description of the figure (how to read it). */
    description?: string
  }>(),
  { era: false, selectedId: null, readingId: null, description: '' },
)
const emit = defineEmits<{ pick: [id: string]; tap: []; scrolled: [] }>()

const rich = computed(() => props.mode === 'rich')
const n = computed(() => props.events.length)
/** Margin before the first point, so its block starts inside the track. */
const lead = computed(() => props.blockW / 2 + BLOCK_PAD)
const cx = (i: number) => lead.value + i * props.slotW
const trackW = computed(() => 2 * lead.value + Math.max(0, n.value - 1) * props.slotW)
const axisY = computed(() => (rich.value ? props.geom.aboveH : COMPACT.axisY))
const stemNow = computed(() => (rich.value ? STEM : COMPACT.stem))
const contentH = computed(() => (rich.value ? props.geom.height : COMPACT.height))
const aboveItemH = computed(() => props.geom.aboveH - STEM)
const belowItemH = computed(() => props.geom.belowH - STEM)

function aria(e: NavEvent) {
  const bits = [`${formatWhen(e.date, props.era)}: ${e.label}`]
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
  const i = props.events.findIndex((e) => e.id === id)
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
  const b = scroller.value?.querySelector<HTMLElement>(`.et__block[data-event="${CSS.escape(id)}"]`)
  if (!b) return
  reveal(id, { smooth: false })
  b.focus({ preventScroll: true })
}
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return
  const id = (e.target as HTMLElement).closest<HTMLElement>('.et__block')?.dataset.event
  if (!id) return
  e.preventDefault()
  e.stopPropagation()
  markUser()
  const i = props.events.findIndex((v) => v.id === id)
  const fwd = (e.key === 'ArrowRight') !== rtl()
  const j = e.key === 'Home' ? 0 : e.key === 'End' ? n.value - 1 : Math.max(0, Math.min(n.value - 1, i + (fwd ? 1 : -1)))
  focusBlock(props.events[j].id)
}
defineExpose({ reveal, focusBlock, el: scroller, sb })

/** In the strip, a click between dates opens the timeline. */
function onClick(e: MouseEvent) {
  if (!rich.value && !(e.target as HTMLElement).closest('.et__block')) emit('tap')
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
          v-for="(e, i) in events"
          :key="'d' + e.id"
        >
          <span
            class="et__stem"
            :class="{ 'et__stem--above': above(i), 'et__stem--on': selectedId === e.id }"
            :style="{ insetInlineStart: px(cx(i)), height: px(stemNow) }"
          />
          <span
            class="et__dot"
            :class="{
              'et__dot--approx': timeKind(e.date) === 'approximate',
              'et__dot--on': selectedId === e.id,
            }"
            :style="{ insetInlineStart: px(cx(i)) }"
          />
        </template>
      </div>

      <!-- The events, in date order: date by the stem, then title, then photograph. -->
      <ol class="et__list">
        <li
          v-for="(e, i) in events"
          :key="e.id"
          class="et__item"
          :class="[above(i) ? 'et__item--above' : 'et__item--below']"
          :style="{
            insetInlineStart: px(cx(i) - blockW / 2),
            inlineSize: px(blockW),
            height: px(above(i) ? aboveItemH : belowItemH),
            transform: `translateY(${px(above(i) ? axisY - stemNow - aboveItemH : axisY + stemNow)})`,
          }"
        >
          <button
            type="button"
            class="et__block"
            :class="{ 'et__block--on': selectedId === e.id, 'et__block--reading': readingId === e.id }"
            :data-event="e.id"
            :aria-label="aria(e)"
            :aria-pressed="selectedId === e.id ? 'true' : 'false'"
            :title="e.label"
            :style="{ '--et-lines': geom.lines }"
            @click="emit('pick', e.id)"
          >
            <span class="et__date">{{ formatWhen(e.date, era) }}</span>
            <span class="et__label">{{ e.label }}</span>
            <img
              v-if="e.image && geom.imgH"
              class="et__img"
              :src="e.image.src"
              :alt="e.image.caption"
              :title="credit(e)"
              :style="{ width: px(imgWidth(geom.imgH)), height: px(geom.imgH) }"
              loading="lazy"
            >
          </button>
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
  height: 10px;
}
.et::-webkit-scrollbar-track {
  background: var(--background-color-neutral-subtle);
}
.et::-webkit-scrollbar-thumb {
  background: var(--border-color-base);
  border-radius: 5px;
  border: 2px solid var(--background-color-neutral-subtle);
}
.et::-webkit-scrollbar-thumb:hover {
  background: var(--color-subtle);
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
  border-block-start: var(--border-width-base) solid var(--color-base);
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
  transition:
    background-color var(--transition-duration-base, 100ms),
    border-color var(--transition-duration-base, 100ms);
}
/* Approximate: open (its date text says how: "c.", "the 1970s"). */
.et__dot--approx {
  background: var(--background-color-base);
}
/* Selected: a larger filled point in the progressive colour. */
.et__dot--on {
  inset-block-start: -5px;
  width: 10px;
  height: 10px;
  margin-inline-start: -5px;
  background: var(--color-progressive);
  border-color: var(--color-progressive);
}
.et__stem {
  position: absolute;
  inset-block-start: 0;
  width: 0;
  border-inline-start: var(--border-width-base) solid var(--border-color-base);
  transition: height var(--et-motion) var(--et-ease);
}
.et__stem--above {
  transform: translateY(-100%);
}
.et__stem--on {
  border-color: var(--color-progressive);
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
.et__block {
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
.et__item--above .et__block {
  flex-direction: column-reverse;
}
.et__item--below .et__block {
  flex-direction: column;
}
.et__date {
  flex: none;
  padding: 0 var(--spacing-50);
  border-radius: var(--border-radius-base);
  white-space: nowrap;
  font-size: var(--font-size-large, 18px);
  font-weight: var(--font-weight-bold);
  line-height: 24px;
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
/* Reading: the date of the passage being read, underlined in a neutral tone. */
.et__block--reading .et__date {
  text-decoration: underline;
  text-decoration-color: var(--border-color-base);
  text-decoration-thickness: 2px;
  text-underline-offset: 4px;
}
.et--compact .et__block--reading .et__date {
  text-underline-offset: 2px;
}
/* Selected: the progressive colour (combined with the underline when both apply). */
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
  color: var(--color-subtle);
  font-size: var(--font-size-small, 14px);
  line-height: 20px;
  overflow-wrap: break-word;
}
.et__block--on .et__label {
  color: var(--color-base);
}
.et__img {
  flex: none;
  margin-block: 6px 0;
  object-fit: cover;
  background: var(--background-color-neutral-subtle);
}
.et__item--above .et__img {
  margin-block: 0 6px;
}
/* Titles and photographs recede first when contracting, and come back last. */
.et__label,
.et__img {
  transition: opacity 100ms linear 140ms;
}
.et--compact .et__label,
.et--compact .et__img {
  opacity: 0;
  transition: opacity 60ms linear;
}
.et__block:hover .et__label {
  color: var(--color-base);
  text-decoration: underline;
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
