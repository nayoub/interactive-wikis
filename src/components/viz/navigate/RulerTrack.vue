<script setup lang="ts">
/**
 * One proportional track: events at their actual dates on a shared scale.
 *
 *   point        dark dot at its date
 *   approximate  open dot (c. 1200) or a dotted, open range (the 1970s, a century)
 *   duration     a solid bar from its start to its end
 *   cluster      points too close to tell apart become one labelled count;
 *                activating it narrows the navigator to them (never picks one)
 *
 * Marks are never moved to make room for labels: labels appear on hover or
 * focus (and for the selected event) in a reserved row above, so nothing
 * shifts. Every individual mark is a passage link. Logical positions, so
 * the axis runs right to left in a right-to-left page.
 */
import { computed, inject, ref } from 'vue'

import { NAV, type NavContext } from './context'
import EventLink from './EventLink.vue'
import type { NavEvent } from './events'
import { msg } from './messages'
import { formatWhen, interval, midpoint, timeKind, yearLabel } from './time'

const props = withDefaults(
  defineProps<{
    events: NavEvent[]
    domain: [number, number]
    width: number
    /** Reserve the label row (B); lanes (D) show labels below the figure instead. */
    labels?: boolean
    /** Closest distance (px) at which two points stay separate. */
    minGap?: number
  }>(),
  { labels: true, minGap: 18 },
)
const emit = defineEmits<{ cluster: [events: NavEvent[], extent: [number, number]] }>()
const ctx = inject(NAV) as NavContext
const nav = ctx.nav

const PAD = 12
const x = (y: number) => {
  const [a, b] = props.domain
  const w = Math.max(1, props.width - 2 * PAD)
  return PAD + ((y - a) / (b - a || 1)) * w
}

// Points (incl. circa points) and ranges (durations, decades, centuries).
const isRange = (e: NavEvent) => !!e.date.end
const points = computed(() =>
  props.events.filter((e) => !isRange(e)).map((e) => ({ e, x: x(midpoint(e.date)) })).sort((p, q) => p.x - q.x),
)
type Mark = { kind: 'point'; e: NavEvent; x: number } | { kind: 'cluster'; events: NavEvent[]; x: number }
const marks = computed<Mark[]>(() => {
  const out: { events: NavEvent[]; xs: number[] }[] = []
  for (const p of points.value) {
    const last = out[out.length - 1]
    if (last && p.x - last.xs[last.xs.length - 1] < props.minGap) {
      last.events.push(p.e)
      last.xs.push(p.x)
    } else out.push({ events: [p.e], xs: [p.x] })
  }
  return out.map((g) =>
    g.events.length === 1
      ? { kind: 'point' as const, e: g.events[0], x: g.xs[0] }
      : { kind: 'cluster' as const, events: g.events, x: (g.xs[0] + g.xs[g.xs.length - 1]) / 2 },
  )
})

/** Ranges packed into rows so none overlap; positions stay exact. */
const ranges = computed(() => {
  const rows: number[] = []
  return props.events
    .filter(isRange)
    .map((e) => {
      const [a, b] = interval(e.date)
      return { e, x0: x(a), x1: Math.max(x(b), x(a) + 4), approx: timeKind(e.date) === 'approximate' }
    })
    .sort((p, q) => p.x0 - q.x0)
    .map((r) => {
      let row = rows.findIndex((end) => end + 6 <= r.x0)
      if (row === -1) {
        row = rows.length
        rows.push(r.x1)
      } else rows[row] = r.x1
      return { ...r, row }
    })
})
const rangeRows = computed(() => Math.max(0, ...ranges.value.map((r) => r.row + 1)))

const hover = ref<string | null>(null)
const shownLabel = computed(() => {
  const id = hover.value ?? (props.events.some((e) => e.id === nav.selectedId.value) ? nav.selectedId.value : null)
  if (!id) return null
  const e = props.events.find((v) => v.id === id)
  if (!e) return null
  const r = ranges.value.find((v) => v.e.id === id)
  const px = r ? (r.x0 + r.x1) / 2 : (points.value.find((p) => p.e.id === id)?.x ?? 0)
  const align = px < 120 ? 'start' : px > props.width - 120 ? 'end' : 'center'
  return { e, x: px, align }
})

function clusterExtent(events: NavEvent[]): [number, number] {
  const iv = events.map((e) => interval(e.date))
  return [Math.min(...iv.map((i) => i[0])), Math.max(...iv.map((i) => i[1]))]
}
function clusterAria(events: NavEvent[]) {
  const [a, b] = clusterExtent(events)
  return msg.clusterLabel(events.length, yearLabel(Math.floor(a), ctx.era), yearLabel(Math.ceil(b) - 1, ctx.era))
}
const has = (events: NavEvent[], ids: string[]) => events.some((e) => ids.includes(e.id))
</script>

<template>
  <div
    class="rt"
    :class="{ 'rt--labels': labels }"
    :style="{ '--rt-rows': rangeRows }"
  >
    <div
      v-if="labels"
      class="rt__label-row"
      aria-hidden="true"
    >
      <span
        v-if="shownLabel"
        class="rt__label"
        :class="[`rt__label--${shownLabel.align}`, { 'rt__label--selected': shownLabel.e.id === nav.selectedId.value }]"
        :style="{ insetInlineStart: `${shownLabel.x}px` }"
      ><b>{{ formatWhen(shownLabel.e.date, ctx.era) }}</b> {{ shownLabel.e.label }}</span>
    </div>

    <div class="rt__points">
      <template
        v-for="m in marks"
        :key="m.kind === 'point' ? m.e.id : m.events[0].id + '+'"
      >
        <EventLink
          v-if="m.kind === 'point'"
          class="rt__hit"
          :class="{
            'rt__hit--selected': nav.selectedId.value === m.e.id,
            'rt__hit--in-view': nav.inView.value.includes(m.e.id),
          }"
          :style="{ insetInlineStart: `${m.x}px` }"
          :event="m.e"
          describe
          @mouseenter="hover = m.e.id"
          @mouseleave="hover = null"
          @focus="hover = m.e.id"
          @blur="hover = null"
        >
          <span
            class="rt__dot"
            :class="{ 'rt__dot--open': timeKind(m.e.date) === 'approximate' }"
          />
        </EventLink>
        <button
          v-else
          type="button"
          class="rt__hit rt__cluster"
          :class="{
            'rt__hit--selected': has(m.events, nav.selectedId.value ? [nav.selectedId.value] : []),
            'rt__hit--in-view': has(m.events, nav.inView.value),
          }"
          :style="{ insetInlineStart: `${m.x}px` }"
          :aria-label="clusterAria(m.events)"
          :title="clusterAria(m.events)"
          @click="emit('cluster', m.events, clusterExtent(m.events))"
        >
          <span class="rt__count">{{ m.events.length }}</span>
        </button>
      </template>
    </div>

    <div
      v-if="rangeRows"
      class="rt__ranges"
    >
      <EventLink
        v-for="r in ranges"
        :key="r.e.id"
        class="rt__range"
        :class="{
          'rt__range--approx': r.approx,
          'rt__range--selected': nav.selectedId.value === r.e.id,
          'rt__range--in-view': nav.inView.value.includes(r.e.id),
        }"
        :style="{ insetInlineStart: `${r.x0}px`, inlineSize: `${r.x1 - r.x0}px`, insetBlockStart: `${r.row * 14}px` }"
        :event="r.e"
        describe
        @mouseenter="hover = r.e.id"
        @mouseleave="hover = null"
        @focus="hover = r.e.id"
        @blur="hover = null"
      >
        <span class="rt__bar" />
      </EventLink>
    </div>
  </div>
</template>

<style scoped>
.rt {
  position: relative;
  --rt-dot: 8px;
}
.rt__label-row {
  position: relative;
  height: 22px;
}
.rt__label {
  position: absolute;
  inset-block-end: 2px;
  max-width: min(320px, 70%);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-base);
  font-size: var(--font-size-small);
  line-height: var(--line-height-small);
  transform: translateX(-50%);
  pointer-events: none;
}
[dir='rtl'] .rt__label {
  transform: translateX(50%);
}
.rt__label--start {
  transform: none !important;
}
.rt__label--end {
  transform: translateX(-100%) !important;
}
[dir='rtl'] .rt__label--end {
  transform: translateX(100%) !important;
}
.rt__label--selected b {
  color: var(--color-progressive);
}
.rt__points {
  position: relative;
  height: 28px;
}
.rt__hit {
  position: absolute;
  inset-block-start: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 24px;
  margin-inline-start: -9px;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
}
.rt__dot {
  display: block;
  width: var(--rt-dot);
  height: var(--rt-dot);
  border-radius: 50%;
  background: var(--color-base);
  border: 1.5px solid var(--color-base);
  box-sizing: border-box;
}
.rt__dot--open {
  background: var(--background-color-base);
}
.rt__hit:hover .rt__dot,
.rt__hit:focus-visible .rt__dot {
  border-color: var(--color-progressive);
  background: var(--color-progressive);
}
.rt__hit:hover .rt__dot--open,
.rt__hit:focus-visible .rt__dot--open {
  background: var(--background-color-base);
}
.rt__cluster .rt__count {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding-inline: 3px;
  border-radius: 9px;
  background: var(--color-base);
  color: var(--color-inverted);
  font-size: 11px;
  font-weight: var(--font-weight-bold);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.rt__cluster:hover .rt__count,
.rt__cluster:focus-visible .rt__count {
  background: var(--color-progressive);
}
.rt__cluster:focus-visible,
.rt__hit:focus-visible {
  outline: var(--border-width-thick) solid var(--outline-color-progressive--focus);
  outline-offset: 0;
  border-radius: var(--border-radius-base);
}

/* Selected: a stem up to its label (a shape, plus the accent). */
.rt__hit--selected::before {
  content: '';
  position: absolute;
  inset-block-start: -8px;
  inset-block-end: 50%;
  inset-inline-start: 50%;
  width: 2px;
  margin-inline-start: -1px;
  background: var(--color-progressive);
}
.rt__hit--selected .rt__dot {
  border-color: var(--color-progressive);
  background: var(--color-progressive);
}
.rt__hit--selected .rt__dot--open {
  background: var(--background-color-base);
  border-width: 2px;
}
.rt__hit--selected .rt__count {
  background: var(--color-progressive);
}
/* In view: a small caret under the mark (where you are reading), not a colour. */
.rt__hit--in-view::after {
  content: '';
  position: absolute;
  inset-block-end: -6px;
  inset-inline-start: 50%;
  margin-inline-start: -4px;
  border: 4px solid transparent;
  border-block-end-color: var(--color-subtle);
}

.rt__ranges {
  position: relative;
  height: calc(var(--rt-rows) * 14px);
  margin-block-start: 4px;
}
.rt__range {
  position: absolute;
  display: flex;
  align-items: center;
  height: 12px;
  min-width: 4px;
}
.rt__bar {
  display: block;
  width: 100%;
  height: 5px;
  background: var(--color-base);
}
.rt__range--approx .rt__bar {
  height: 7px;
  background: transparent;
  border: 1.5px dotted var(--color-base);
  box-sizing: border-box;
}
.rt__range:hover .rt__bar,
.rt__range:focus-visible .rt__bar,
.rt__range--selected .rt__bar {
  background: var(--color-progressive);
}
.rt__range--approx:hover .rt__bar,
.rt__range--approx:focus-visible .rt__bar,
.rt__range--approx.rt__range--selected .rt__bar {
  background: transparent;
  border-color: var(--color-progressive);
  border-width: 2px;
}
.rt__range--in-view::after {
  content: '';
  position: absolute;
  inset-inline-start: 0;
  inset-block-end: -6px;
  border: 4px solid transparent;
  border-block-end-color: var(--color-subtle);
}
.rt__range:focus-visible {
  outline: var(--border-width-thick) solid var(--outline-color-progressive--focus);
  outline-offset: 1px;
}
@media (prefers-reduced-motion: no-preference) {
  .rt__dot,
  .rt__bar,
  .rt__count {
    transition:
      background-color 120ms,
      border-color 120ms;
  }
}
</style>
