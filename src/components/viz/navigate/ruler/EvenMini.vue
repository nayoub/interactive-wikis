<script setup lang="ts">
/**
 * Phones: the persistent overview of every event, evenly spaced across the
 * full width, with the same line, dotted gaps, reading caret and selected
 * dot as the track. A bracket shows the part of the track in view; tapping
 * moves the track there (it never moves the article).
 */
import { computed } from 'vue'

import type { NavEvent } from '../events'
import { msg } from '../messages'
import { interval, overlaps, timeKind, yearLabel } from '../time'
import { gaps as gapsOf } from './layout'

const props = withDefaults(
  defineProps<{
    events: NavEvent[]
    width: number
    era?: boolean
    selectedId?: string | null
    readingId?: string | null
    readingState?: 'at' | 'after' | 'before'
    range?: [number, number] | null
    /** Visible part of the track, as fractional event indexes; null hides the bracket. */
    window?: [number, number] | null
  }>(),
  { era: false, selectedId: null, readingId: null, readingState: 'before', range: null, window: null },
)
const emit = defineEmits<{ go: [index: number] }>()

const PAD = 14
const n = computed(() => props.events.length)
const step = computed(() => (n.value > 1 ? (props.width - 2 * PAD) / (n.value - 1) : 0))
const x = (i: number) => PAD + i * step.value
const gaps = computed(() => gapsOf(props.events))
const inRange = (e: NavEvent) => !props.range || overlaps(interval(e.date), props.range)
const readingIndex = computed(() => props.events.findIndex((e) => e.id === props.readingId))
const bracket = computed(() => {
  const w = props.window
  if (!w || !n.value) return null
  const a = Math.max(-0.5, w[0])
  const b = Math.min(n.value - 0.5, w[1])
  return { start: x(a), size: Math.max(6, x(b) - x(a)) }
})
function onClick(e: MouseEvent) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const rtl = getComputedStyle(e.currentTarget as HTMLElement).direction === 'rtl'
  const px = rtl ? r.right - e.clientX : e.clientX - r.left
  emit('go', step.value ? (px - PAD) / step.value : 0)
}
const first = computed(() => (props.events[0] ? yearLabel(props.events[0].date.start.y, props.era) : ''))
const last = computed(() => {
  const e = props.events[n.value - 1]
  return e ? yearLabel((e.date.end ?? e.date.start).y, props.era) : ''
})
const pxs = (v: number) => `${Math.round(v * 10) / 10}px`
</script>

<template>
  <!-- eslint-disable-next-line vuejs-accessibility/click-events-have-key-events, vuejs-accessibility/no-static-element-interactions -->
  <div
    class="em"
    :aria-label="msg.trMiniLabel"
    role="img"
    @click="onClick"
  >
    <div
      v-if="bracket"
      class="em__window"
      :style="{ insetInlineStart: pxs(bracket.start), inlineSize: pxs(bracket.size) }"
    />
    <span
      v-for="g in gaps"
      :key="'s' + g.i"
      class="em__seg"
      :class="{ 'em__seg--elided': g.skipped }"
      :style="{ insetInlineStart: pxs(x(g.i - 1)), inlineSize: pxs(step) }"
    />
    <span
      v-for="(e, i) in events"
      :key="e.id"
      class="em__dot"
      :class="{
        'em__dot--approx': timeKind(e.date) === 'approximate',
        'em__dot--on': selectedId === e.id,
        'em__dot--out': !inRange(e),
      }"
      :style="{ insetInlineStart: pxs(x(i)) }"
    />
    <svg
      v-if="readingIndex >= 0"
      class="em__caret"
      :class="{ 'em__caret--after': readingState === 'after' }"
      :style="{ insetInlineStart: pxs(x(readingIndex) - 6) }"
      width="12"
      height="10"
      viewBox="0 0 12 10"
    >
      <path d="M6 1.2 L11 9 L1 9 Z" />
    </svg>
    <span class="em__end em__end--start">{{ first }}</span>
    <span class="em__end em__end--end">{{ last }}</span>
  </div>
</template>

<style scoped>
.em {
  position: relative;
  height: 32px;
  cursor: pointer;
}
.em__window {
  position: absolute;
  inset-block: 1px 15px;
  border: var(--border-width-thick) solid var(--border-color-progressive);
  border-radius: 2px;
  background: var(--background-color-progressive-subtle);
}
.em__seg {
  position: absolute;
  inset-block-start: 9px;
  border-block-start: var(--border-width-base) solid var(--color-base);
}
.em__seg--elided {
  border-block-start-style: dotted;
}
.em__dot {
  position: absolute;
  inset-block-start: 6px;
  width: 7px;
  height: 7px;
  margin-inline-start: -3.5px;
  border-radius: 50%;
  box-sizing: border-box;
  border: 1.5px solid var(--color-base);
  background: var(--color-base);
}
.em__dot--approx {
  background: var(--background-color-base);
}
.em__dot--on {
  border-color: var(--color-progressive);
  background: var(--color-progressive);
  box-shadow: 0 0 0 2px var(--background-color-base), 0 0 0 3.5px var(--color-progressive);
}
.em__dot--out {
  opacity: 0.3;
}
.em__caret {
  position: absolute;
  inset-block-start: 10px;
  overflow: visible;
}
.em__caret path {
  fill: var(--background-color-base);
  stroke: var(--color-base);
  stroke-width: 1.6;
  stroke-linejoin: round;
}
.em__caret--after path {
  stroke-dasharray: 2 1.6;
}
.em__end {
  position: absolute;
  inset-block-start: 18px;
  color: var(--color-subtle);
  font-size: var(--font-size-x-small, 12px);
  line-height: 14px;
  font-variant-numeric: tabular-nums;
}
.em__end--start {
  inset-inline-start: 0;
}
.em__end--end {
  inset-inline-end: 0;
}
</style>
