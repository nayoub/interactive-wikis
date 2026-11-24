<script setup lang="ts">
/**
 * B's timeline track: the earlier evenly spaced timeline (one thin line,
 * small neutral dots, short straight stems, event blocks alternating above
 * and below, bold dates, short labels, occasional images), driven by the ruler:
 *
 *   - It owns no selection or navigation. Activating a block emits `pick`;
 *     the ruler decides what that means (a reader preview, or the event being
 *     edited). Reading (an outlined caret) and the selected event (progressive
 *     date, dot and stem) are separate props with separate looks.
 *   - `mode` moves the same mounted marks between the rich layout and the
 *     compact strip: blocks fade and withdraw with the line, stems shorten into
 *     it, the line rises under the header. Nothing is remounted, and the
 *     horizontal offset belongs to this one scroller.
 *   - Wide slots (five to seven events across a desktop column, part of the
 *     next one showing) and a native horizontal scrollbar; arrow keys move
 *     between events. The blocks are an ordered list in date order.
 *
 * Even spacing is order, not elapsed time: no ticks, no gap annotations. The
 * figure's description says so.
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
    mode: 'rich' | 'compact' | 'hidden'
    geom: RichLayout
    era?: boolean
    selectedId?: string | null
    readingId?: string | null
    readingState?: 'at' | 'after' | 'before'
    /** Accessible description of the figure (how to read it). */
    description?: string
  }>(),
  { era: false, selectedId: null, readingId: null, readingState: 'before', description: '' },
)
const emit = defineEmits<{ pick: [id: string]; tap: []; scrolled: [] }>()

const rich = computed(() => props.mode === 'rich')
const n = computed(() => props.events.length)
/** Margin before the first dot, so its block starts inside the track. */
const lead = computed(() => props.blockW / 2 + BLOCK_PAD)
const cx = (i: number) => lead.value + i * props.slotW
const trackW = computed(() => 2 * lead.value + Math.max(0, n.value - 1) * props.slotW)
const axisY = computed(() => (props.mode === 'rich' ? props.geom.aboveH : COMPACT.axisY))
const contentH = computed(() => (props.mode === 'rich' ? props.geom.height : props.mode === 'compact' ? COMPACT.height : 0))

function aria(e: NavEvent) {
  const bits = [`${formatWhen(e.date, props.era)}: ${e.label}`]
  if (props.selectedId === e.id) bits.push(msg.trSelected)
  if (props.readingId === e.id) bits.push(msg.trReadingHere)
  return bits.join(', ')
}
const credit = (e: NavEvent) =>
  e.image?.source === 'commons' ? [e.image.caption, e.image.artist, e.image.license].filter(Boolean).join(' · ') : (e.image?.caption ?? '')

// ── The reading caret: on the side of its dot that has no stem ────────────
const readingIndex = computed(() => props.events.findIndex((e) => e.id === props.readingId))
const caretBelow = computed(() => !rich.value || above(readingIndex.value))

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

const rtl = () => !!scroller.value && getComputedStyle(scroller.value).direction === 'rtl'
/** Bring event `id` into view: centred, or only when it is not already comfortably visible. */
function reveal(id: string, how: { center?: boolean; smooth?: boolean } = {}) {
  const el = scroller.value
  const i = props.events.findIndex((e) => e.id === id)
  if (!el || i < 0 || el.scrollWidth <= el.clientWidth) return
  const x = cx(i)
  const view = el.clientWidth
  const left = Math.abs(el.scrollLeft)
  const margin = props.blockW / 2
  if (!how.center && x > left + margin && x < left + view - margin) return
  const target = Math.max(0, Math.min(trackW.value - view, x - view / 2))
  el.scrollTo({ left: rtl() ? -target : target, behavior: how.smooth ? 'smooth' : 'auto' })
}
/** The visible window, as fractional event indexes (the phone overview's bracket). */
function windowIndexes(): [number, number] {
  const el = scroller.value
  if (!el) return [0, n.value - 1]
  const left = Math.abs(el.scrollLeft)
  return [(left - lead.value) / props.slotW, (left + el.clientWidth - lead.value) / props.slotW]
}
function scrollToIndex(i: number, smooth = true) {
  const id = props.events[Math.max(0, Math.min(n.value - 1, Math.round(i)))]?.id
  if (id) reveal(id, { center: true, smooth })
}
/** Keyboard browsing: focus moves along the line; nothing is selected until Enter. */
function focusBlock(id: string) {
  const b = scroller.value?.querySelector<HTMLElement>(`.et__block[data-event="${CSS.escape(id)}"]`)
  if (!b) return
  reveal(id, { smooth: false })
  b.focus({ preventScroll: true })
}
function onKeydown(e: KeyboardEvent) {
  if (!rich.value || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End')) return
  const id = (e.target as HTMLElement).closest<HTMLElement>('.et__block')?.dataset.event
  if (!id) return
  e.preventDefault()
  e.stopPropagation()
  const i = props.events.findIndex((v) => v.id === id)
  const fwd = (e.key === 'ArrowRight') !== rtl()
  const j = e.key === 'Home' ? 0 : e.key === 'End' ? n.value - 1 : Math.max(0, Math.min(n.value - 1, i + (fwd ? 1 : -1)))
  focusBlock(props.events[j].id)
}
defineExpose({ reveal, windowIndexes, scrollToIndex, focusBlock, el: scroller, sb })

/** In the strip, the whole track opens the timeline. */
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
    :class="[
      `et--${mode}`,
      { 'et--selecting': !!selectedId, 'et--more-start': more.start, 'et--more-end': more.end },
    ]"
    :style="{ height: px(contentH + (mode === 'hidden' ? 0 : sb)) }"
    @scroll.passive="onScroll"
    @click="onClick"
    @keydown="onKeydown"
  >
    <figure
      class="et__track"
      :style="{ width: px(trackW), height: px(Math.max(geom.height, COMPACT.height)) }"
    >
      <figcaption class="tn-visually-hidden">
        {{ description }}
      </figcaption>

      <!-- The line and every dot move together. -->
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
            :style="{ insetInlineStart: px(cx(i)), height: px(rich ? STEM : 0) }"
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
        <svg
          v-if="readingIndex >= 0"
          class="et__caret"
          :class="{ 'et__caret--above': !caretBelow, 'et__caret--after': readingState === 'after' }"
          :style="{ insetInlineStart: px(cx(readingIndex) - 6) }"
          width="12"
          height="10"
          viewBox="0 0 12 10"
        >
          <path d="M6 1.2 L11 9 L1 9 Z" />
        </svg>
      </div>

      <!-- The events, in date order: a list underneath the drawing. -->
      <ol class="et__list">
        <li
          v-for="(e, i) in events"
          :key="e.id"
          class="et__item"
          :class="[above(i) ? 'et__item--above' : 'et__item--below']"
          :style="{
            insetInlineStart: px(cx(i) - blockW / 2),
            inlineSize: px(blockW),
            ...(above(i)
              ? { height: px(geom.aboveH - STEM), transform: `translateY(${px(axisY - geom.aboveH)})` }
              : { top: px(STEM), height: px(geom.belowH - STEM), transform: `translateY(${px(axisY)})` }),
          }"
        >
          <button
            type="button"
            class="et__block"
            :class="{ 'et__block--on': selectedId === e.id }"
            :data-event="e.id"
            :tabindex="rich ? 0 : -1"
            :aria-label="aria(e)"
            :aria-pressed="selectedId === e.id ? 'true' : 'false'"
            :style="{ '--et-lines': geom.lines }"
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
            <span class="et__label">{{ e.label }}</span>
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
  /* Settles last when contracting (≈100–240 ms), first when expanding. */
  transition: transform 140ms var(--et-ease) 100ms;
}
.et--rich .et__axis {
  transition: transform 180ms var(--et-ease);
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
}
/* Approximate: open (its date text says how: "c.", "the 1970s"). */
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

/* ── Event blocks ─────────────────────────────────────────────────────── */
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
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 0;
  /* Expanding: blocks come back last. */
  transition:
    opacity 100ms linear 140ms,
    transform var(--et-motion) var(--et-ease);
}
.et__item--above {
  justify-content: flex-end;
}
.et__item--below {
  justify-content: flex-start;
}
/* Contracting: blocks fade first (0–60 ms) and withdraw with the line. */
.et--compact .et__item,
.et--hidden .et__item {
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 60ms linear,
    transform var(--et-motion) var(--et-ease);
}
.et__block {
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 100%;
  padding: 0 var(--spacing-25);
  border: 0;
  background: none;
  color: var(--color-base);
  font: inherit;
  text-align: center;
  cursor: pointer;
}
.et__img {
  flex: none;
  margin-block-end: 6px;
  object-fit: cover;
  background: var(--background-color-neutral-subtle);
}
.et__date {
  display: block;
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
  overflow-wrap: break-word;
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
.et--rich.et--selecting .et__item:has(.et__block:not(.et__block--on)) {
  opacity: 0.78;
}

@media (prefers-reduced-motion: reduce) {
  .et,
  .et * {
    transition: none !important;
  }
}
</style>
