<script setup lang="ts">
/**
 * Reader rendering of a timeline. Pure view: takes events, knows nothing about
 * the editor or the article. Every layout is an ordered list underneath.
 *
 * - horizontal (desktop, wide column): one axis. Labels sit in an even rhythm,
 *   alternating above and below; each is tied to its dot by an orthogonal
 *   leader (vertical → horizontal → vertical) routed so leaders never cross.
 * - vertical (mobile, or a cramped column): a single rule with dots.
 * - fallback: a plain dated list (also what print gets).
 *
 * Spacing: "proportional" puts dots (horizontal) or gaps (vertical) where time
 * puts them; "even" spaces events equally and dots the stretches it skipped.
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
const n = computed(() => sorted.value.length)

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

const hoverId = ref<string | null>(null)
const lit = (id: string) => hoverId.value === id || props.activeId === id

/** Narrowest slot per event; a label spans two slots (neighbours alternate sides). */
const MIN_SLOT = 80

const effectiveLayout = computed<'horizontal' | 'vertical'>(() => {
  if (props.layout !== 'auto') return props.layout
  if (props.skin !== 'desktop') return 'vertical'
  return width.value >= 560 ? 'horizontal' : 'vertical'
})

const years = computed(() => sorted.value.map((e) => toYears(e.date.start)))
const span = computed(() => {
  const ys = years.value
  if (!ys.length) return { min: 0, max: 1 }
  const min = ys[0]
  const max = ys[ys.length - 1]
  return { min, max: max === min ? min + 1 : max }
})
const yearsRange = computed(() => {
  const list = sorted.value
  if (!list.length) return ''
  const a = list[0].date.start.y
  const b = Math.max(...list.map((e) => (e.date.end ?? e.date.start).y))
  return a === b ? String(a) : `${a}–${b}`
})

/** Years skipped before event i. */
const gapBefore = (i: number) => (i === 0 ? 0 : years.value[i] - years.value[i - 1])
const BREAK_YEARS = 8
function gapLabel(i: number): string | null {
  const gap = Math.round(gapBefore(i))
  return gap >= BREAK_YEARS ? `${gap} yrs` : null
}

// ── Horizontal geometry (px) ───────────────────────────────────────────────
const trackRef = ref<HTMLElement | null>(null)
const trackWidth = computed(() => Math.max(width.value, (n.value + 1) * MIN_SLOT))
/** Half-slot columns, plus one half-slot of margin at each end so no label is clipped. */
const halfCols = computed(() => n.value * 2 + 2)
const half = computed(() => trackWidth.value / halfCols.value)

/** Label centre: an even rhythm. */
const cx = (i: number) => (2 * i + 2) * half.value
/** Dot: where time puts it, between the first and last label centres; or the label itself. */
function dx(i: number) {
  if (props.spacing === 'even' || n.value < 2) return cx(i)
  const { min, max } = span.value
  return cx(0) + ((years.value[i] - min) / (max - min)) * (cx(n.value - 1) - cx(0))
}
const above = (i: number) => i % 2 === 0
const gridColumn = (i: number) => `${2 * i + 1} / span 4`

/**
 * Jog levels (0 = nearest the axis). Within a run of leaders all bending the
 * same way, later leaders jog further from the axis when bending right and
 * nearer when bending left — which is exactly what keeps them from crossing.
 */
const levels = computed(() => {
  const out = new Array<number>(n.value).fill(0)
  for (const side of [0, 1]) {
    const idx = sorted.value.map((_, i) => i).filter((i) => i % 2 === side)
    const dir = (i: number) => Math.sign(Math.round(dx(i) - cx(i)))
    // Right-benders: forward pass.
    for (let k = 1; k < idx.length; k++) {
      const a = idx[k - 1]
      const b = idx[k]
      if (dir(a) > 0 && dir(b) > 0 && cx(b) < dx(a) + 8) out[b] = out[a] + 1
    }
    // Left-benders: backward pass.
    for (let k = idx.length - 2; k >= 0; k--) {
      const a = idx[k]
      const b = idx[k + 1]
      if (dir(a) < 0 && dir(b) < 0 && dx(b) - 8 < cx(a)) out[a] = out[b] + 1
    }
  }
  return out
})

const BASE = 16
const STEP = 7
const LABEL_GAP = 6
const band = computed(() => {
  const maxLevel = Math.max(0, ...levels.value)
  return 2 * (BASE + maxLevel * STEP + 12)
})
const axisY = computed(() => band.value / 2)

function leaderPath(i: number) {
  const c = cx(i)
  const d = dx(i)
  const ay = axisY.value
  const top = above(i)
  const y0 = top ? 0 : band.value
  const jog = top ? ay - BASE - levels.value[i] * STEP : ay + BASE + levels.value[i] * STEP
  if (Math.abs(c - d) < 1) return `M${c},${y0} V${ay}`
  const s = Math.sign(d - c)
  const v = top ? 1 : -1 // direction from label towards axis
  const r = Math.min(4, Math.abs(d - c) / 2)
  return [
    `M${c},${y0}`,
    `V${jog - v * r}`,
    `Q${c},${jog} ${c + s * r},${jog}`,
    `H${d - s * r}`,
    `Q${d},${jog} ${d},${jog + v * r}`,
    `V${ay}`,
  ].join(' ')
}

/** Axis segments between consecutive dots; dotted where even spacing skipped time. */
const segments = computed(() => {
  const out: { x1: number; x2: number; elided: boolean; label: string | null; mid: number }[] = []
  for (let i = 1; i < n.value; i++) {
    const elided = props.spacing === 'even' && !!gapLabel(i)
    out.push({
      x1: dx(i - 1),
      x2: dx(i),
      elided,
      label: elided ? gapLabel(i) : null,
      mid: (dx(i - 1) + dx(i)) / 2,
    })
  }
  return out
})

/** Ruler years on the axis (proportional only), skipped where a dot would collide. */
const ticks = computed(() => {
  if (props.spacing === 'even' || n.value < 2) return []
  const { min, max } = span.value
  const step = max - min > 60 ? 20 : max - min > 25 ? 10 : 5
  const x0 = cx(0)
  const x1 = cx(n.value - 1)
  const dots = sorted.value.map((_, i) => dx(i))
  const out: { x: number; label: string }[] = []
  for (let y = Math.ceil(min / step) * step; y <= max; y += step) {
    const x = x0 + ((y - min) / (max - min)) * (x1 - x0)
    if (dots.every((d) => Math.abs(d - x) > 26)) out.push({ x, label: String(y) })
  }
  return out
})

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
  if (props.spacing === 'even') return gapLabel(i) ? 32 : 0
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
  const li = el?.closest('li')
  if (track && li) {
    track.scrollTo({
      left: li.offsetLeft - track.clientWidth / 2 + li.clientWidth / 2,
      behavior: 'smooth',
    })
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
      <small v-if="sorted.length" class="tl__meta">{{ yearsRange }}</small>
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
              gridTemplateColumns: `repeat(${halfCols}, 1fr)`,
              gridTemplateRows: `auto ${band}px auto`,
            }"
          >
            <li
              v-for="(event, i) in sorted"
              :key="event.id"
              class="tl-h__item"
              :class="[
                above(i) ? 'tl-h__item--above' : 'tl-h__item--below',
                { 'tl-h__item--lit': lit(event.id) },
              ]"
              :style="{ gridColumn: gridColumn(i) }"
              :data-event-id="event.id"
              @mouseenter="hoverId = event.id"
              @mouseleave="hoverId = null"
              @focusin="hoverId = event.id"
              @focusout="hoverId = null"
            >
              <div class="tl-card">
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
              <svg class="tl-h__svg" :width="trackWidth" :height="band">
                <line
                  v-for="(seg, k) in segments"
                  :key="`s${k}`"
                  class="tl-h__seg"
                  :class="{ 'tl-h__seg--elided': seg.elided }"
                  :x1="seg.x1"
                  :x2="seg.x2"
                  :y1="axisY"
                  :y2="axisY"
                />
                <path
                  v-for="(event, i) in sorted"
                  :key="`l${event.id}`"
                  class="tl-h__leader"
                  :class="{ 'tl-h__leader--lit': lit(event.id) }"
                  :d="leaderPath(i)"
                />
                <circle
                  v-for="(event, i) in sorted"
                  :key="`d${event.id}`"
                  class="tl-h__dot"
                  :class="{ 'tl-h__dot--lit': lit(event.id) }"
                  :cx="dx(i)"
                  :cy="axisY"
                  :r="lit(event.id) ? 4.5 : 3.5"
                />
              </svg>
              <small
                v-for="tick in ticks"
                :key="tick.label"
                class="tl-h__tick"
                :style="{ left: `${tick.x}px`, top: `${axisY}px` }"
                >{{ tick.label }}</small
              >
              <template v-for="(seg, k) in segments" :key="`g${k}`">
                <small
                  v-if="seg.label"
                  class="tl-h__tick"
                  :style="{ left: `${seg.mid}px`, top: `${axisY}px` }"
                  >{{ seg.label }}</small
                >
              </template>
            </li>
          </ol>
        </div>
        <CdxButton
          v-if="canScrollLeft"
          class="tl-h__scroll tl-h__scroll--prev"
          size="small"
          aria-label="Earlier events"
          @click="scrollTrack(-1)"
        >
          <CdxIcon :icon="cdxIconPrevious" size="small" />
        </CdxButton>
        <CdxButton
          v-if="canScrollRight"
          class="tl-h__scroll tl-h__scroll--next"
          size="small"
          aria-label="Later events"
          @click="scrollTrack(1)"
        >
          <CdxIcon :icon="cdxIconNext" size="small" />
        </CdxButton>
      </div>

      <!-- Vertical -->
      <ol v-else class="tl-v">
        <li
          v-for="(event, i) in sorted"
          :key="event.id"
          class="tl-v__item"
          :class="{
            'tl-v__item--first': i === 0,
            'tl-v__item--last': i === n - 1,
            'tl-v__item--elided': spacing === 'even' && !!gapLabel(i),
            'tl-v__item--lit': lit(event.id),
          }"
          :style="{ '--gap': `${verticalGap(i)}px` }"
          :data-event-id="event.id"
          @mouseenter="hoverId = event.id"
          @mouseleave="hoverId = null"
        >
          <small v-if="gapLabel(i) && verticalGap(i)" class="tl-v__gap" aria-hidden="true">{{
            gapLabel(i)
          }}</small>
          <span class="tl-v__dot" aria-hidden="true" />
          <div class="tl-card tl-card--row">
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
  margin-block: var(--spacing-200);
  padding-block: var(--spacing-100) var(--spacing-150);
  border-top: var(--border-width-base, 1px) solid var(--border-color-base);
  border-bottom: var(--border-width-base, 1px) solid var(--border-color-subtle);
  color: var(--color-base);
  font-family: var(--font-family-base);
}

.tl__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--spacing-75);
  margin-block-end: var(--spacing-150);
}

/* Heading 4 */
.tl__title {
  font-family: var(--font-family-base);
  font-size: var(--font-size-large);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-large);
}

.tl__meta,
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

/* ── Labels (shared) ────────────────────────────────────────────────────── */
.tl-card {
  position: relative;
}
/* Beat the skin's `.mw-parser-output a:link` colours: labels read as text, not links. */
.tl .tl-card__link.tl-card__link,
.tl .tl-card__link.tl-card__link:visited {
  color: var(--color-base);
  text-decoration: none;
}
/* Stretched link: the whole label is the target; the citation sits above it. */
.tl-card__link::after {
  content: '';
  position: absolute;
  inset: -4px;
}
.tl-card__link:focus-visible {
  outline: none;
}
.tl-card__link:focus-visible::after {
  border-radius: var(--border-radius-base, 2px);
  box-shadow: 0 0 0 var(--border-width-thick, 2px) var(--box-shadow-color-progressive--focus);
}

/* Heading 4 */
.tl-card__date {
  display: block;
  font-family: var(--font-family-base);
  font-size: var(--font-size-large);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-large);
  transition: color 120ms;
}

/* Small */
.tl-card__label {
  display: block;
  font-family: var(--font-family-base);
  font-size: var(--font-size-small);
  font-weight: var(--font-weight-normal);
  line-height: var(--line-height-small);
  color: var(--color-subtle);
}
.tl-card__ref {
  position: relative;
  z-index: 1;
}

.tl-h__item--lit .tl-card__date,
.tl-v__item--lit .tl-card__date {
  color: var(--color-progressive);
}

/* ── Horizontal ─────────────────────────────────────────────────────────── */
.tl-h {
  position: relative;
}
.tl-h__track {
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}
.tl-h__track::-webkit-scrollbar {
  display: none;
}
.tl ol.tl-h__grid {
  display: grid;
  list-style: none;
  margin: 0;
  padding: 0;
}
.tl li.tl-h__item {
  margin: 0;
  padding-inline: var(--spacing-75);
  min-width: 0;
  text-align: center;
}
.tl-h__item--above {
  grid-row: 1;
  align-self: end;
  padding-bottom: 6px;
}
.tl-h__item--below {
  grid-row: 3;
  align-self: start;
  padding-top: 6px;
}
.tl-card__img {
  display: block;
  width: 100%;
  max-width: 120px;
  aspect-ratio: 3 / 2;
  margin: 0 auto var(--spacing-50);
  object-fit: cover;
  border-radius: var(--border-radius-base, 2px);
  background: var(--background-color-neutral-subtle);
}

.tl li.tl-h__axis {
  grid-row: 2;
  grid-column: 1 / -1;
  position: relative;
  margin: 0;
}
.tl-h__svg {
  position: absolute;
  inset: 0;
  overflow: visible;
}
.tl-h__seg {
  stroke: var(--color-base);
  stroke-width: 1;
}
.tl-h__seg--elided {
  stroke-dasharray: 1 4;
  stroke-linecap: round;
  stroke-width: 1.5;
}
.tl-h__leader {
  fill: none;
  stroke: var(--border-color-base);
  stroke-width: 1;
  transition: stroke 120ms;
}
.tl-h__leader--lit {
  stroke: var(--color-progressive);
}
.tl-h__dot {
  fill: var(--color-base);
  transition:
    fill 120ms,
    r 120ms;
}
.tl-h__dot--lit {
  fill: var(--color-progressive);
}
/* Ruler labels sit on the axis, interrupting it. */
.tl-h__tick {
  position: absolute;
  transform: translate(-50%, -50%);
  padding-inline: 6px;
  background: var(--background-color-base);
  color: var(--color-subtle);
  white-space: nowrap;
}
.tl-h__scroll {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 2;
  border-radius: 50%;
  background: var(--background-color-base);
  box-shadow: var(--box-shadow-small, 0 1px 2px rgba(0, 0, 0, 0.15));
}
.tl-h__scroll--prev {
  inset-inline-start: 0;
}
.tl-h__scroll--next {
  inset-inline-end: 0;
}

/* ── Vertical ───────────────────────────────────────────────────────────── */
.tl ol.tl-v {
  --dot-y: 14px;
  --rule-x: 3px;
  list-style: none;
  margin: 0;
  padding: 0;
}
.tl li.tl-v__item {
  position: relative;
  margin: 0;
  padding: var(--gap, 0px) 0 var(--spacing-100) 24px;
}
/* The rule is drawn per item: ::after from the previous dot down to this one
   (dotted where time was skipped), ::before from this dot onwards. */
.tl-v__item::before,
.tl-v__item::after {
  content: '';
  position: absolute;
  left: var(--rule-x);
  width: 0;
  border-left: 1px solid var(--color-base);
}
.tl-v__item::after {
  top: 0;
  height: calc(var(--gap, 0px) + var(--dot-y));
}
.tl-v__item::before {
  top: calc(var(--gap, 0px) + var(--dot-y));
  bottom: 0;
}
.tl-v__item--first::after,
.tl-v__item--last::before {
  display: none;
}
.tl-v__item--elided::after {
  border-left-style: dotted;
  border-left-width: 2px;
  margin-left: -0.5px;
}
.tl-v__dot {
  position: absolute;
  left: calc(var(--rule-x) - 3px);
  top: calc(var(--gap, 0px) + var(--dot-y) - 3px);
  z-index: 1;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-base);
  transition:
    background-color 120ms,
    transform 120ms;
}
.tl-v__item--lit .tl-v__dot {
  background: var(--color-progressive);
  transform: scale(1.3);
}
.tl-v__gap {
  position: absolute;
  top: 0;
  left: 24px;
  display: flex;
  align-items: center;
  height: var(--gap);
  color: var(--color-subtle);
}
.tl-card--row {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-75);
}
.tl-card__text {
  flex: 1;
  min-width: 0;
}
.tl-card__thumb {
  flex: none;
  width: 56px;
  height: 56px;
  margin-top: 4px;
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
