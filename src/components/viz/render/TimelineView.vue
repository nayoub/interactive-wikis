<script setup lang="ts">
/**
 * Render: draws a timeline from a plain list of events, styled only by the
 * shared visualization tokens (../tokens.css). Knows nothing about the
 * article, picking or curating. Every layout is an ordered list underneath.
 *
 * - horizontal (desktop, when every event gets at least one slot): one axis.
 *   Labels sit in an even rhythm, alternating above and below; each is tied to
 *   its dot by an orthogonal leader, routed so leaders never cross.
 * - vertical (mobile, or whenever horizontal would not fit): a single rule.
 * - fallback: a plain dated list (also what print gets).
 *
 * Spacing: "proportional" puts dots (horizontal) or gaps (vertical) where time
 * puts them; "even" spaces events equally and dots the stretches it skipped.
 * Options: age at each event (needs `birth`), labelled gaps between events.
 */
import '../tokens.css'

import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { ageAt, dateYears, formatDate, isoDate, sortEvents } from '../model/dates'
import type { PartialDate, TimelineEvent, TimelineOptions } from '../model/types'

const props = withDefaults(
  defineProps<{
    events: TimelineEvent[]
    title?: string
    spacing?: 'proportional' | 'even'
    fallback?: boolean
    skin?: 'desktop' | 'mobile'
    /** Force a layout (preview panes); otherwise chosen from skin + width. */
    layout?: 'auto' | 'horizontal' | 'vertical'
    options?: TimelineOptions
    /** Subject's birth date, for ages. */
    birth?: PartialDate
    activeId?: string | null
    /** Events to show as active (selected here, or linked from a map). */
    activeIds?: string[]
  }>(),
  {
    title: 'Timeline',
    spacing: 'proportional',
    fallback: false,
    skin: 'desktop',
    layout: 'auto',
    options: () => ({ showAge: false, showGaps: true }),
    birth: undefined,
    activeId: null,
    activeIds: () => [],
  },
)

const emit = defineEmits<{ select: [event: TimelineEvent] }>()

const sorted = computed(() => sortEvents(props.events))
const n = computed(() => sorted.value.length)
const years = computed(() => sorted.value.map((e) => dateYears(e.date)))

// ── Measure the container and read geometry tokens ─────────────────────────
const rootRef = ref<HTMLElement | null>(null)
const width = ref(0)
const geo = ref({ slot: 80, base: 16, step: 7, perYear: 6, even: 32, gapYears: 8 })
let ro: ResizeObserver | null = null
onMounted(() => {
  const el = rootRef.value
  if (!el) return
  const cs = getComputedStyle(el)
  const px = (name: string, fallback: number) => parseFloat(cs.getPropertyValue(name)) || fallback
  geo.value = {
    slot: px('--viz-slot-min', 80),
    base: px('--viz-leader-base', 16),
    step: px('--viz-leader-step', 7),
    perYear: px('--viz-px-per-year', 6),
    even: px('--viz-gap-even', 32),
    gapYears: px('--viz-gap-years', 8),
  }
  width.value = el.getBoundingClientRect().width
  ro = new ResizeObserver(([entry]) => (width.value = entry.contentRect.width))
  ro.observe(el)
})
onBeforeUnmount(() => ro?.disconnect())

const hoverId = ref<string | null>(null)
const lit = (id: string) =>
  hoverId.value === id || props.activeId === id || props.activeIds.includes(id)

/** Horizontal needs at least one slot per event plus one for the margins; otherwise vertical. */
const fitsHorizontally = computed(() => width.value >= (n.value + 1) * geo.value.slot)
const effectiveLayout = computed<'horizontal' | 'vertical'>(() => {
  if (props.layout === 'vertical') return 'vertical'
  if (props.layout === 'horizontal') return fitsHorizontally.value ? 'horizontal' : 'vertical'
  return props.skin === 'desktop' && fitsHorizontally.value ? 'horizontal' : 'vertical'
})

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

// ── Ages and gaps ──────────────────────────────────────────────────────────
const age = (e: TimelineEvent) =>
  props.options.showAge && props.birth ? ageAt(props.birth, e.date) : null

const gapBefore = (i: number) => (i === 0 ? 0 : years.value[i] - years.value[i - 1])
/** A gap long enough to matter, whether or not it is labelled. */
const skipped = (i: number) => Math.round(gapBefore(i)) >= geo.value.gapYears
const gapLabel = (i: number) =>
  props.options.showGaps && skipped(i) ? `${Math.round(gapBefore(i))} yrs` : null

// ── Horizontal geometry (px) ───────────────────────────────────────────────
const halfCols = computed(() => n.value * 2 + 2)
const half = computed(() => width.value / halfCols.value)
/** Label centre: an even rhythm, with a half slot of margin at each end. */
const cx = (i: number) => (2 * i + 2) * half.value
/** Dot: where time puts it (between the first and last label centres), or under its label. */
function dx(i: number) {
  if (props.spacing === 'even' || n.value < 2) return cx(i)
  const { min, max } = span.value
  return cx(0) + ((years.value[i] - min) / (max - min)) * (cx(n.value - 1) - cx(0))
}
const above = (i: number) => i % 2 === 0
const gridColumn = (i: number) => `${2 * i + 1} / span 4`

/**
 * Jog levels (0 = nearest the axis). Within a run of leaders bending the same
 * way, later leaders jog further from the axis when bending right and nearer
 * when bending left — which is what keeps them from crossing.
 */
const levels = computed(() => {
  const out = new Array<number>(n.value).fill(0)
  for (const side of [0, 1]) {
    const idx = sorted.value.map((_, i) => i).filter((i) => i % 2 === side)
    const dir = (i: number) => Math.sign(Math.round(dx(i) - cx(i)))
    for (let k = 1; k < idx.length; k++) {
      const a = idx[k - 1]
      const b = idx[k]
      if (dir(a) > 0 && dir(b) > 0 && cx(b) < dx(a) + 8) out[b] = out[a] + 1
    }
    for (let k = idx.length - 2; k >= 0; k--) {
      const a = idx[k]
      const b = idx[k + 1]
      if (dir(a) < 0 && dir(b) < 0 && dx(b) - 8 < cx(a)) out[a] = out[b] + 1
    }
  }
  return out
})
const band = computed(
  () => 2 * (geo.value.base + Math.max(0, ...levels.value) * geo.value.step + 12),
)
const axisY = computed(() => band.value / 2)

function leaderPath(i: number) {
  const c = cx(i)
  const d = dx(i)
  const ay = axisY.value
  const top = above(i)
  const y0 = top ? 0 : band.value
  const off = geo.value.base + levels.value[i] * geo.value.step
  const jog = top ? ay - off : ay + off
  if (Math.abs(c - d) < 1) return `M${c},${y0} V${ay}`
  const s = Math.sign(d - c)
  const v = top ? 1 : -1
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

/** Axis segments between dots; dotted where even spacing skipped time. */
const segments = computed(() =>
  sorted.value.slice(1).map((_, k) => {
    const i = k + 1
    return {
      x1: dx(i - 1),
      x2: dx(i),
      elided: props.spacing === 'even' && skipped(i),
      label: gapLabel(i),
      mid: (dx(i - 1) + dx(i)) / 2,
    }
  }),
)

/** Ruler years (proportional, when gaps are not labelled), skipped where they'd touch a dot. */
const ticks = computed(() => {
  if (props.spacing === 'even' || props.options.showGaps || n.value < 2) return []
  const { min, max } = span.value
  const step = max - min > 60 ? 20 : max - min > 25 ? 10 : 5
  const dots = sorted.value.map((_, i) => dx(i))
  const out: { x: number; label: string }[] = []
  for (let y = Math.ceil(min / step) * step; y <= max; y += step) {
    const x = cx(0) + ((y - min) / (max - min)) * (cx(n.value - 1) - cx(0))
    if (dots.every((d) => Math.abs(d - x) > 26)) out.push({ x, label: String(y) })
  }
  return out
})

// ── Vertical ───────────────────────────────────────────────────────────────
function verticalGap(i: number) {
  if (i === 0) return 0
  if (props.spacing === 'even') return skipped(i) && props.options.showGaps ? geo.value.even : 0
  return Math.round(gapBefore(i) * geo.value.perYear)
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
    rootRef.value?.querySelectorAll<HTMLElement>('.tl__rich .tl-ev__link') ?? [],
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
  rootRef.value
    ?.querySelector<HTMLElement>(`.tl__rich [data-event-id="${id}"] .tl-ev__link`)
    ?.focus({ preventScroll: true })
}
defineExpose({ focusEvent, el: rootRef })

const credit = (e: TimelineEvent) =>
  e.image?.source === 'commons'
    ? [e.image.fileTitle, e.image.artist, e.image.license].filter(Boolean).join(' · ')
    : e.image?.caption
/** Commons images are credited under the timeline (article images are credited on their own pages). */
const commonsImages = computed(() =>
  sorted.value.flatMap((e) => (e.image?.source === 'commons' ? [e.image] : [])),
)
const titleId = `tl-title-${Math.random().toString(36).slice(2, 8)}`
</script>

<template>
  <div
    ref="rootRef"
    class="viz tl"
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
        ><template v-if="age(event)"> ({{ age(event) }})</template> – {{ event.label
        }}<sup v-if="event.citation" class="reference"
          ><a :href="event.citation.href">{{ event.citation.label }}</a></sup
        >
      </li>
    </ol>

    <div v-if="sorted.length && !fallback" class="tl__rich">
      <!-- Horizontal -->
      <ol
        v-if="effectiveLayout === 'horizontal'"
        class="tl-h"
        :style="{
          gridTemplateColumns: `repeat(${halfCols}, 1fr)`,
          gridTemplateRows: `auto ${band}px auto`,
        }"
      >
        <li
          v-for="(event, i) in sorted"
          :key="event.id"
          class="tl-h__item tl-ev"
          :class="[
            above(i) ? 'tl-h__item--above' : 'tl-h__item--below',
            { 'tl-ev--lit': lit(event.id) },
          ]"
          :style="{ gridColumn: gridColumn(i) }"
          :data-event-id="event.id"
          @mouseenter="hoverId = event.id"
          @mouseleave="hoverId = null"
          @focusin="hoverId = event.id"
          @focusout="hoverId = null"
        >
          <img
            v-if="event.image"
            class="tl-ev__img"
            :src="event.image.src"
            :alt="event.image.caption"
            :title="credit(event)"
            loading="lazy"
          />
          <time class="tl-ev__date" :datetime="isoDate(event.date)">{{
            formatDate(event.date)
          }}</time>
          <small v-if="age(event)" class="tl-ev__age">{{ age(event) }}</small>
          <small class="tl-ev__label"
            ><a
              class="tl-ev__link"
              :href="`#tl-src-${event.sourceAnchor.mentionId}`"
              @click="onActivate($event, event)"
              >{{ event.label }}</a
            ><sup v-if="event.citation" class="reference tl-ev__ref"
              ><a :href="event.citation.href">{{ event.citation.label }}</a></sup
            ></small
          >
        </li>

        <li class="tl-h__axis" aria-hidden="true">
          <svg class="tl-h__svg" :width="width" :height="band">
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
          </svg>
          <span
            v-for="(event, i) in sorted"
            :key="`d${event.id}`"
            class="tl-dot"
            :class="{ 'tl-dot--lit': lit(event.id) }"
            :style="{ left: `${dx(i)}px`, top: `${axisY}px` }"
          />
          <small
            v-for="tick in ticks"
            :key="tick.label"
            class="tl-h__note"
            :style="{ left: `${tick.x}px`, top: `${axisY}px` }"
            >{{ tick.label }}</small
          >
          <template v-for="(seg, k) in segments" :key="`g${k}`">
            <small
              v-if="seg.label"
              class="tl-h__note"
              :style="{ left: `${seg.mid}px`, top: `${axisY}px` }"
              >{{ seg.label }}</small
            >
          </template>
        </li>
      </ol>

      <!-- Vertical -->
      <ol v-else class="tl-v">
        <li
          v-for="(event, i) in sorted"
          :key="event.id"
          class="tl-v__item tl-ev"
          :class="{
            'tl-v__item--first': i === 0,
            'tl-v__item--last': i === n - 1,
            'tl-v__item--elided': spacing === 'even' && skipped(i),
            'tl-ev--lit': lit(event.id),
          }"
          :style="{ '--gap': `${verticalGap(i)}px` }"
          :data-event-id="event.id"
          @mouseenter="hoverId = event.id"
          @mouseleave="hoverId = null"
        >
          <small v-if="gapLabel(i) && verticalGap(i)" class="tl-v__gap" aria-hidden="true">{{
            gapLabel(i)
          }}</small>
          <span
            class="tl-dot tl-v__dot"
            :class="{ 'tl-dot--lit': lit(event.id) }"
            aria-hidden="true"
          />
          <div class="tl-v__body">
            <div class="tl-v__text">
              <time class="tl-ev__date" :datetime="isoDate(event.date)">{{
                formatDate(event.date)
              }}</time>
              <small v-if="age(event)" class="tl-ev__age">{{ age(event) }}</small>
              <small class="tl-ev__label"
                ><a
                  class="tl-ev__link"
                  :href="`#tl-src-${event.sourceAnchor.mentionId}`"
                  @click="onActivate($event, event)"
                  >{{ event.label }}</a
                ><sup v-if="event.citation" class="reference tl-ev__ref"
                  ><a :href="event.citation.href">{{ event.citation.label }}</a></sup
                ></small
              >
            </div>
            <img
              v-if="event.image"
              class="tl-ev__img"
              :src="event.image.src"
              :alt="event.image.caption"
              :title="credit(event)"
              loading="lazy"
            />
          </div>
        </li>
      </ol>
    </div>

    <p v-if="commonsImages.length" class="tl__credits">
      <small
        >Images from Wikimedia Commons:
        <template v-for="(img, k) in commonsImages" :key="img.id"
          ><a :href="img.pageUrl" target="_blank" rel="noopener">{{ img.artist }}</a
          >, {{ img.license }}{{ k < commonsImages.length - 1 ? '; ' : '' }}</template
        ></small
      >
    </p>
  </div>
</template>

<style scoped>
/* Everything here reads ../tokens.css; no literal colours, weights or sizes. */
.tl {
  /* Sit beside floated figures/infoboxes (narrower), don't drop below them. */
  display: flow-root;
  min-width: 0;
  margin-block: var(--viz-space-xxl);
  padding-block: var(--viz-space-l) var(--viz-space-xl);
  border-top: var(--viz-line-width) solid var(--viz-rule);
  border-bottom: var(--viz-line-width) solid var(--viz-rule-light);
  color: var(--viz-ink);
  font-family: var(--viz-font-family);
}

.tl__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--viz-space-m);
  margin-block-end: var(--viz-space-xl);
}
.tl__title,
.tl-ev__date {
  font-family: var(--viz-font-family);
  font-size: var(--viz-heading-size);
  font-weight: var(--viz-heading-weight);
  line-height: var(--viz-heading-line);
}
small,
.tl-ev__label,
.tl-ev__age {
  font-family: var(--viz-font-family);
  font-size: var(--viz-small-size);
  font-weight: var(--viz-small-weight);
  line-height: var(--viz-small-line);
}
.tl__meta,
.tl__empty {
  margin: 0;
  color: var(--viz-ink-tertiary);
}

.tl__credits {
  margin: var(--viz-space-l) 0 0;
  color: var(--viz-ink-tertiary);
}
.tl .tl__credits a {
  color: inherit;
}

/* Fallback list: hidden unless asked for, or printing. */
.tl ol.tl-fallback {
  display: none;
  margin: 0 0 0 1.6em;
  padding: 0;
}
.tl .tl-fallback li {
  margin-block: var(--viz-space-xs);
}
.tl.tl--fallback ol.tl-fallback {
  display: block;
}

/* ── An event (shared by both layouts) ──────────────────────────────────── */
.tl-ev {
  position: relative;
}
.tl-ev__date {
  display: block;
  transition: color var(--viz-transition);
}
.tl-ev__age {
  display: block;
  color: var(--viz-ink-tertiary);
}
.tl-ev__label {
  display: block;
  color: var(--viz-ink-secondary);
}
/* Beat the skin's `.mw-parser-output a:link` colours: labels read as text. */
.tl .tl-ev__link.tl-ev__link,
.tl .tl-ev__link.tl-ev__link:visited {
  color: inherit;
  text-decoration: none;
}
/* Stretched link: the whole event is the target; the citation sits above it. */
.tl-ev__link::after {
  content: '';
  position: absolute;
  inset: 0;
}
.tl-ev__link:focus-visible {
  outline: none;
}
.tl-ev__link:focus-visible::after {
  outline: var(--viz-focus-width) solid var(--viz-accent);
}
.tl-ev__ref {
  position: relative;
  z-index: 1;
}
.tl-ev--lit .tl-ev__date {
  color: var(--viz-accent);
}
.tl-ev__img {
  display: block;
  width: var(--viz-image-width);
  height: var(--viz-image-height);
  object-fit: var(--viz-image-fit);
  border-radius: var(--viz-radius);
  background: var(--viz-image-empty);
}

/* The one dot. */
.tl-dot {
  position: absolute;
  width: var(--viz-dot-size);
  height: var(--viz-dot-size);
  margin: calc(var(--viz-dot-size) / -2) 0 0 calc(var(--viz-dot-size) / -2);
  border-radius: 50%;
  background: var(--viz-ink);
  transition: background-color var(--viz-transition);
}
.tl-dot--lit {
  background: var(--viz-accent);
}

/* ── Horizontal ─────────────────────────────────────────────────────────── */
.tl ol.tl-h {
  display: grid;
  list-style: none;
  margin: 0;
  padding: 0;
}
.tl li.tl-h__item {
  margin: 0;
  padding-inline: var(--viz-space-m);
  min-width: 0;
  text-align: center;
}
.tl-h__item .tl-ev__img {
  margin: 0 auto var(--viz-space-s);
}
.tl-h__item--above {
  grid-row: 1;
  align-self: end;
  padding-bottom: var(--viz-space-s);
}
.tl-h__item--below {
  grid-row: 3;
  align-self: start;
  padding-top: var(--viz-space-s);
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
  stroke: var(--viz-ink);
  stroke-width: var(--viz-line-width);
}
.tl-h__seg--elided {
  stroke-dasharray: var(--viz-line-width) calc(4 * var(--viz-line-width));
}
.tl-h__leader {
  fill: none;
  stroke: var(--viz-rule);
  stroke-width: var(--viz-line-width);
  transition: stroke var(--viz-transition);
}
.tl-h__leader--lit {
  stroke: var(--viz-accent);
}
/* Ruler years and gap lengths sit on the axis, interrupting it. */
.tl-h__note {
  position: absolute;
  transform: translate(-50%, -50%);
  padding-inline: var(--viz-space-s);
  background: var(--viz-paper);
  color: var(--viz-ink-tertiary);
  white-space: nowrap;
}

/* ── Vertical ───────────────────────────────────────────────────────────── */
.tl ol.tl-v {
  /* Dot centred on the date's first line; the rule runs through the dots. */
  --dot-y: calc(var(--viz-heading-line) / 2);
  --rule-x: calc(var(--viz-dot-size) / 2);
  list-style: none;
  margin: 0;
  padding: 0;
}
.tl li.tl-v__item {
  margin: 0;
  padding: var(--gap, 0px) 0 var(--viz-space-l) calc(var(--viz-dot-size) + var(--viz-space-l));
}
/* The rule is drawn per item: ::after from the previous dot down to this one
   (dotted where time was skipped), ::before from this dot onwards. */
.tl-v__item::before,
.tl-v__item::after {
  content: '';
  position: absolute;
  left: var(--rule-x);
  width: 0;
  border-left: var(--viz-line-width) solid var(--viz-ink);
  transform: translateX(-50%);
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
  border-left-style: var(--viz-line-style-elided);
}
.tl-v__dot {
  left: var(--rule-x);
  top: calc(var(--gap, 0px) + var(--dot-y));
  z-index: 1;
}
.tl-v__gap {
  position: absolute;
  top: 0;
  left: calc(var(--viz-dot-size) + var(--viz-space-l));
  display: flex;
  align-items: center;
  height: var(--gap);
  color: var(--viz-ink-tertiary);
}
.tl-v__body {
  display: flex;
  align-items: flex-start;
  gap: var(--viz-space-m);
}
.tl-v__text {
  flex: 1;
  min-width: 0;
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
