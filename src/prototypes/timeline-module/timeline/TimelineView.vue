<script setup lang="ts">
/**
 * Reader rendering of a timeline. Pure view: takes events, knows nothing about
 * the editor or the article. Every layout is an ordered list underneath.
 *
 * - horizontal: desktop, when the column is wide enough. One axis; cards
 *   alternate above and below it, connected to their dot by a leader line.
 * - vertical: mobile, or desktop when horizontal would be cramped.
 * - fallback: a plain dated list (also what print gets).
 *
 * Spacing: "proportional" places dots (horizontal) or gaps (vertical) by time;
 * "even" spaces events equally and marks long gaps with a break label.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { CdxButton, CdxIcon } from '@wikimedia/codex'
import { cdxIconNext, cdxIconPrevious } from '@wikimedia/codex-icons'

import { formatDate, isoDate, sortEvents, toYears } from './format'
import type { TimelineEvent } from './types'

const props = withDefaults(
  defineProps<{
    events: TimelineEvent[]
    title?: string
    spacing?: 'proportional' | 'even'
    fallback?: boolean
    skin?: 'desktop' | 'mobile'
    /** Force a layout (preview panes); otherwise chosen from skin + width. */
    layout?: 'auto' | 'horizontal' | 'vertical'
    activeId?: string | null
  }>(),
  {
    title: 'Timeline',
    spacing: 'proportional',
    fallback: false,
    skin: 'desktop',
    layout: 'auto',
    activeId: null,
  },
)

const emit = defineEmits<{ select: [event: TimelineEvent] }>()

const sorted = computed(() => sortEvents(props.events))

const rootRef = ref<HTMLElement | null>(null)
const width = ref(0)
let ro: ResizeObserver | null = null
onMounted(() => {
  ro = new ResizeObserver(([entry]) => (width.value = entry.contentRect.width))
  if (rootRef.value) {
    width.value = rootRef.value.getBoundingClientRect().width
    ro.observe(rootRef.value)
  }
})
onBeforeUnmount(() => ro?.disconnect())

/** Narrowest slot a horizontal card can live in (cards span two slots, alternating sides). */
const MIN_SLOT = 84

const effectiveLayout = computed<'horizontal' | 'vertical'>(() => {
  if (props.layout !== 'auto') return props.layout
  if (props.skin !== 'desktop') return 'vertical'
  // Fall back to vertical when even two-slot cards would get too narrow to read.
  return width.value >= 560 ? 'horizontal' : 'vertical'
})

const span = computed(() => {
  const list = sorted.value
  if (!list.length) return { min: 0, max: 1 }
  const min = toYears(list[0].date.start)
  const last = list[list.length - 1]
  const max = Math.max(
    ...list.map((e) => toYears(e.date.end ?? e.date.start)),
    toYears(last.date.start),
  )
  return { min, max: max === min ? min + 1 : max }
})

const yearsRange = computed(() => {
  const list = sorted.value
  if (!list.length) return ''
  const a = list[0].date.start.y
  const b = Math.max(...list.map((e) => (e.date.end ?? e.date.start).y))
  return a === b ? String(a) : `${a}–${b}`
})

/** Gap (years) before each event, for break labels. */
function gapBefore(i: number): number {
  if (i === 0) return 0
  return toYears(sorted.value[i].date.start) - toYears(sorted.value[i - 1].date.start)
}
const BREAK_YEARS = 8
function gapLabel(i: number): string | null {
  const gap = Math.round(gapBefore(i))
  return gap >= BREAK_YEARS ? `${gap} years` : null
}

// ── Horizontal ─────────────────────────────────────────────────────────────
const trackRef = ref<HTMLElement | null>(null)
const n = computed(() => sorted.value.length)
const trackWidth = computed(() => Math.max(width.value, n.value * MIN_SLOT))
const EDGE = 0.035

/** Card centre, 0..1 across the track: evenly spaced slots. */
function slotX(i: number) {
  return (i + 0.5) / n.value
}
/** Dot position, 0..1: proportional to time, or the slot itself. */
function dotX(i: number) {
  if (props.spacing === 'even') return slotX(i)
  const t = toYears(sorted.value[i].date.start)
  return EDGE + ((t - span.value.min) / (span.value.max - span.value.min)) * (1 - 2 * EDGE)
}
/** Grid placement: a card spans two slots, centred on its own, clamped at the ends. */
function gridColumn(i: number) {
  // Slot i is half-columns [2i, 2i+2); its card spans [2i-1, 2i+3), shrunk (not
  // shifted) at the ends so same-side neighbours never overlap.
  const cols = n.value * 2
  const start = Math.max(0, i * 2 - 1)
  const end = Math.min(cols, i * 2 + 3)
  return `${start + 1} / ${end + 1}`
}

const ticks = computed(() => {
  if (props.spacing === 'even' || !n.value) return []
  const { min, max } = span.value
  const step = max - min > 60 ? 20 : max - min > 25 ? 10 : 5
  const out: { x: number; label: string }[] = []
  for (let y = Math.ceil(min / step) * step; y <= max; y += step) {
    out.push({ x: EDGE + ((y - min) / (max - min)) * (1 - 2 * EDGE), label: String(y) })
  }
  return out
})

const BAND = 64
function leader(i: number) {
  const above = i % 2 === 0
  const xc = slotX(i) * 1000
  const xd = dotX(i) * 1000
  const mid = BAND / 2
  return above
    ? `${xc},0 ${xc},8 ${xd},${mid - 8} ${xd},${mid}`
    : `${xd},${mid} ${xd},${mid + 8} ${xc},${BAND - 8} ${xc},${BAND}`
}

const canScrollLeft = ref(false)
const canScrollRight = ref(false)
function updateScroll() {
  const el = trackRef.value
  if (!el) return
  canScrollLeft.value = el.scrollLeft > 2
  canScrollRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 2
}
function scrollTrack(dir: 1 | -1) {
  const el = trackRef.value
  if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' })
}
watch([trackWidth, width, effectiveLayout], () => nextTick(updateScroll))

// ── Vertical ───────────────────────────────────────────────────────────────
const PX_PER_YEAR = 6
function verticalGap(i: number) {
  if (i === 0) return 0
  if (props.spacing === 'even') return gapLabel(i) ? 28 : 0
  return Math.round(gapBefore(i) * PX_PER_YEAR)
}

// ── Interaction ────────────────────────────────────────────────────────────
function onActivate(e: MouseEvent, event: TimelineEvent) {
  e.preventDefault()
  emit('select', event)
}

function onKeydown(e: KeyboardEvent) {
  const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']
  if (!keys.includes(e.key)) return
  const links = Array.from(
    rootRef.value?.querySelectorAll<HTMLElement>('.tl__rich .tl-card__link') ?? [],
  )
  const i = links.indexOf(document.activeElement as HTMLElement)
  if (i === -1) return
  e.preventDefault()
  let next = i
  if (e.key === 'Home') next = 0
  else if (e.key === 'End') next = links.length - 1
  else next = i + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1)
  links[Math.max(0, Math.min(links.length - 1, next))]?.focus()
}

function focusEvent(id: string) {
  const el = rootRef.value?.querySelector<HTMLElement>(
    `.tl__rich [data-event-id="${id}"] .tl-card__link`,
  )
  el?.focus({ preventScroll: true })
  // Bring it into view inside a horizontal track only; the page scroll is the caller's.
  const track = el?.closest('.tl-h__track') as HTMLElement | null
  if (el && track) {
    const left =
      el.closest('li')!.offsetLeft - track.clientWidth / 2 + el.closest('li')!.clientWidth / 2
    track.scrollTo({ left, behavior: 'smooth' })
  }
}
defineExpose({ focusEvent, el: rootRef })

const titleId = `tl-title-${Math.random().toString(36).slice(2, 8)}`
</script>

<template>
  <div
    ref="rootRef"
    class="tl"
    :class="[`tl--${effectiveLayout}`, `tl--${spacing}`, { 'tl--fallback': fallback }]"
    role="group"
    :aria-labelledby="titleId"
    @keydown="onKeydown"
  >
    <div class="tl__header">
      <div :id="titleId" class="tl__title">{{ title || 'Timeline' }}</div>
      <small v-if="sorted.length" class="tl__meta"
        >{{ sorted.length }} events · {{ yearsRange }}</small
      >
    </div>

    <p v-if="!sorted.length" class="tl__empty">No events yet.</p>

    <!-- Plain dated list: the no-JavaScript / print rendering. -->
    <ol class="tl-fallback">
      <li v-for="event in sorted" :key="event.id">
        <a :href="`#tl-src-${event.sourceAnchor.mentionId}`" @click="onActivate($event, event)"
          ><b
            ><time :datetime="isoDate(event.date)">{{ formatDate(event.date) }}</time></b
          ></a
        >
        – {{ event.label
        }}<sup v-if="event.citation" class="reference"
          ><a :href="event.citation.href">{{ event.citation.label }}</a></sup
        >
      </li>
    </ol>

    <div v-if="sorted.length && !fallback" class="tl__rich">
      <!-- Horizontal -->
      <div v-if="effectiveLayout === 'horizontal'" class="tl-h">
        <div ref="trackRef" class="tl-h__track" @scroll="updateScroll">
          <ol
            class="tl-h__grid"
            :style="{
              width: `${trackWidth}px`,
              gridTemplateColumns: `repeat(${n * 2}, 1fr)`,
              '--tl-band': `${BAND}px`,
            }"
          >
            <li
              v-for="(event, i) in sorted"
              :key="event.id"
              class="tl-h__item"
              :class="i % 2 === 0 ? 'tl-h__item--above' : 'tl-h__item--below'"
              :style="{ gridColumn: gridColumn(i) }"
              :data-event-id="event.id"
            >
              <div class="tl-card" :class="{ 'tl-card--active': activeId === event.id }">
                <img
                  v-if="event.image"
                  class="tl-card__img"
                  :src="event.image.src"
                  alt=""
                  loading="lazy"
                />
                <time class="tl-card__date" :datetime="isoDate(event.date)">{{
                  formatDate(event.date)
                }}</time>
                <small class="tl-card__label"
                  ><a
                    class="tl-card__link"
                    :href="`#tl-src-${event.sourceAnchor.mentionId}`"
                    @click="onActivate($event, event)"
                    >{{ event.label }}</a
                  ><sup v-if="event.citation" class="reference tl-card__ref"
                    ><a :href="event.citation.href">{{ event.citation.label }}</a></sup
                  ></small
                >
              </div>
            </li>
            <li class="tl-h__axis" aria-hidden="true">
              <svg
                class="tl-h__leaders"
                viewBox="0 0 1000 64"
                preserveAspectRatio="none"
                :height="BAND"
              >
                <polyline v-for="(event, i) in sorted" :key="event.id" :points="leader(i)" />
              </svg>
              <span class="tl-h__line" />
              <span
                v-for="tick in ticks"
                :key="tick.label"
                class="tl-h__tick"
                :style="{ left: `${tick.x * 100}%` }"
                ><small>{{ tick.label }}</small></span
              >
              <template v-if="spacing === 'even'">
                <span
                  v-for="(event, i) in sorted"
                  v-show="gapLabel(i)"
                  :key="`gap-${event.id}`"
                  class="tl-h__break"
                  :style="{ left: `${(slotX(i) + slotX(i - 1)) * 50}%` }"
                  ><small>{{ gapLabel(i) }}</small></span
                >
              </template>
              <span
                v-for="(event, i) in sorted"
                :key="`dot-${event.id}`"
                class="tl-h__dot"
                :class="{ 'tl-h__dot--active': activeId === event.id }"
                :style="{ left: `${dotX(i) * 100}%` }"
              />
            </li>
          </ol>
        </div>
        <CdxButton
          v-if="canScrollLeft"
          class="tl-h__scroll tl-h__scroll--prev"
          aria-label="Earlier events"
          @click="scrollTrack(-1)"
        >
          <CdxIcon :icon="cdxIconPrevious" />
        </CdxButton>
        <CdxButton
          v-if="canScrollRight"
          class="tl-h__scroll tl-h__scroll--next"
          aria-label="Later events"
          @click="scrollTrack(1)"
        >
          <CdxIcon :icon="cdxIconNext" />
        </CdxButton>
      </div>

      <!-- Vertical -->
      <ol v-else class="tl-v">
        <li
          v-for="(event, i) in sorted"
          :key="event.id"
          class="tl-v__item"
          :style="{ marginTop: `${verticalGap(i)}px`, '--gap': `${verticalGap(i)}px` }"
          :data-event-id="event.id"
        >
          <span v-if="gapLabel(i)" class="tl-v__gap" aria-hidden="true"
            ><small>{{ gapLabel(i) }}</small></span
          >
          <span
            class="tl-v__dot"
            :class="{ 'tl-v__dot--active': activeId === event.id }"
            aria-hidden="true"
          />
          <div class="tl-card tl-card--row" :class="{ 'tl-card--active': activeId === event.id }">
            <div class="tl-card__text">
              <time class="tl-card__date" :datetime="isoDate(event.date)">{{
                formatDate(event.date)
              }}</time>
              <small class="tl-card__label"
                ><a
                  class="tl-card__link"
                  :href="`#tl-src-${event.sourceAnchor.mentionId}`"
                  @click="onActivate($event, event)"
                  >{{ event.label }}</a
                ><sup v-if="event.citation" class="reference tl-card__ref"
                  ><a :href="event.citation.href">{{ event.citation.label }}</a></sup
                ></small
              >
            </div>
            <img
              v-if="event.image"
              class="tl-card__thumb"
              :src="event.image.src"
              alt=""
              loading="lazy"
            />
          </div>
        </li>
      </ol>
    </div>
  </div>
</template>

<style scoped>
.tl {
  /* Sit beside floated figures/infoboxes (narrower), don't drop below them. */
  display: flow-root;
  min-width: 0;
  margin-block: var(--spacing-150) var(--spacing-150);
  padding-block: var(--spacing-75) var(--spacing-100);
  border-block: var(--border-width-base, 1px) solid var(--border-color-subtle);
  color: var(--color-base);
  font-family: var(--font-family-base);
}

.tl__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--spacing-75);
  flex-wrap: wrap;
  margin-block-end: var(--spacing-75);
}

/* Heading 4 */
.tl__title {
  font-family: var(--font-family-base);
  font-size: var(--font-size-large);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-large);
}

.tl__meta {
  color: var(--color-subtle);
}

.tl__empty {
  color: var(--color-subtle);
  margin: 0;
}

/* Fallback list: hidden unless asked for, or printing. */
.tl ol.tl-fallback {
  display: none;
  margin: 0 0 0 1.6em;
  padding: 0;
}
.tl .tl-fallback li {
  margin-block: var(--spacing-25);
}
.tl.tl--fallback ol.tl-fallback {
  display: block;
}

/* ── Cards (shared) ─────────────────────────────────────────────────────── */
.tl-card {
  position: relative;
  border-radius: var(--border-radius-base, 2px);
}
/* Beat the skin's `.mw-parser-output a:link` colours: labels read as text, not links. */
.tl .tl-card__link.tl-card__link,
.tl .tl-card__link.tl-card__link:visited {
  color: var(--color-base);
  text-decoration: none;
}
/* Stretched link: the whole card is the target; the citation sits above it. */
.tl-card__link::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
}
.tl-card__link:focus-visible {
  outline: none;
}
.tl-card__link:focus-visible::after {
  box-shadow: 0 0 0 var(--border-width-thick, 2px) var(--box-shadow-color-progressive--focus);
  border-radius: var(--border-radius-base, 2px);
}
.tl-card:hover {
  background-color: var(--background-color-interactive-subtle);
}
.tl .tl-card:hover .tl-card__link.tl-card__link {
  color: var(--color-progressive);
}
.tl-card--active {
  background-color: var(--background-color-progressive-subtle);
}

/* Heading 4 */
.tl-card__date {
  display: block;
  font-family: var(--font-family-base);
  font-size: var(--font-size-large);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-large);
}

/* Small */
.tl-card__label {
  display: block;
  font-family: var(--font-family-base);
  font-size: var(--font-size-small);
  font-weight: var(--font-weight-normal);
  line-height: var(--line-height-small);
  color: var(--color-base);
}

.tl-card__ref {
  position: relative;
  z-index: 1;
}

/* ── Horizontal ─────────────────────────────────────────────────────────── */
.tl-h {
  position: relative;
}
.tl-h__track {
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
  padding-block-end: var(--spacing-25);
}
.tl ol.tl-h__grid {
  display: grid;
  grid-template-rows: auto var(--tl-band) auto;
  list-style: none;
  margin: 0;
  padding: 0;
}
.tl li.tl-h__item {
  margin: 0;
  padding-inline: var(--spacing-50);
  min-width: 0;
}
.tl-h__item--above {
  grid-row: 1;
  align-self: end;
}
.tl-h__item--below {
  grid-row: 3;
  align-self: start;
}
.tl-h__item .tl-card {
  padding: var(--spacing-50);
  text-align: center;
}
.tl-card__img {
  display: block;
  width: 100%;
  height: 88px;
  object-fit: cover;
  margin-block-end: var(--spacing-50);
  border-radius: var(--border-radius-base, 2px);
  background: var(--background-color-neutral-subtle);
}
.tl li.tl-h__axis {
  margin: 0;
  grid-row: 2;
  grid-column: 1 / -1;
  position: relative;
  height: var(--tl-band);
}
.tl-h__leaders {
  position: absolute;
  inset: 0;
  width: 100%;
  overflow: visible;
}
.tl-h__leaders polyline {
  fill: none;
  stroke: var(--border-color-base);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}
.tl-h__line {
  position: absolute;
  top: calc(50% - 1px);
  inset-inline: 0;
  height: 2px;
  background: var(--color-base);
}
.tl-h__dot {
  position: absolute;
  top: 50%;
  width: 12px;
  height: 12px;
  margin: -6px 0 0 -6px;
  border-radius: 50%;
  background: var(--background-color-base);
  border: 2px solid var(--color-base);
  box-sizing: border-box;
}
.tl-h__dot--active {
  background: var(--color-progressive);
  border-color: var(--color-progressive);
}
.tl-h__tick {
  position: absolute;
  top: 50%;
  width: 1px;
  height: 6px;
  background: var(--color-base);
}
.tl-h__tick small {
  position: absolute;
  top: 6px;
  left: 0;
  transform: translateX(-50%);
  color: var(--color-subtle);
  background: var(--background-color-base);
  padding-inline: 2px;
}
.tl-h__break {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  padding-inline: var(--spacing-25);
  background: var(--background-color-base);
  color: var(--color-subtle);
  white-space: nowrap;
}
.tl-h__scroll {
  position: absolute;
  top: calc(50% - 16px);
  z-index: 2;
  border-radius: 50%;
  box-shadow: var(--box-shadow-medium);
}
.tl-h__scroll--prev {
  inset-inline-start: -8px;
}
.tl-h__scroll--next {
  inset-inline-end: -8px;
}

/* ── Vertical ───────────────────────────────────────────────────────────── */
.tl ol.tl-v {
  position: relative;
  list-style: none;
  margin: 0;
  padding: 0 0 0 28px;
}
.tl-v::before {
  content: '';
  position: absolute;
  top: 10px;
  bottom: 10px;
  left: 7px;
  width: 2px;
  background: var(--color-base);
}
.tl li.tl-v__item {
  position: relative;
  margin: 0;
  padding-block: 2px;
}
.tl-v__dot {
  position: absolute;
  left: -27px;
  top: 12px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid var(--color-base);
  background: var(--background-color-base);
  box-sizing: border-box;
}
.tl-v__dot--active {
  background: var(--color-progressive);
  border-color: var(--color-progressive);
}
.tl-v__gap {
  position: absolute;
  bottom: 100%;
  left: 0;
  display: flex;
  align-items: center;
  height: var(--gap);
  color: var(--color-subtle);
  white-space: nowrap;
}
/* Even spacing: the line is broken where time was skipped. */
.tl--even .tl-v__gap::before {
  content: '';
  position: absolute;
  left: -24px;
  width: 10px;
  height: 6px;
  background: var(--background-color-base);
  border-block: 1px solid var(--color-base);
  transform: skewY(-20deg);
}
.tl-card--row {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-75);
  padding: var(--spacing-25) var(--spacing-50);
  margin-inline-start: calc(-1 * var(--spacing-50));
}
.tl-card__text {
  flex: 1;
  min-width: 0;
}
.tl-card__thumb {
  flex: none;
  width: 64px;
  height: 64px;
  object-fit: cover;
  border-radius: var(--border-radius-base, 2px);
  background: var(--background-color-neutral-subtle);
}

@media print {
  .tl__rich {
    display: none;
  }
  .tl ol.tl-fallback {
    display: block;
  }
}
</style>
