<script setup lang="ts">
/**
 * Phones: the same timeline read top to bottom, in place of the horizontal
 * one (in the article, or docked under the header with its own scroll).
 * One point per date on a vertical line; the date, its title(s), the age
 * and the photograph beside it. The date being read is blue and kept in
 * view; selecting a title goes to its passage.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'

import type { NavEvent } from '../events'
import { msg } from '../messages'
import { ageAt, slotsOf } from './layout'

defineProps<{
  events: NavEvent[]
  era: boolean
  readingId: string | null
  birthYear: number | null
}>()
const emit = defineEmits<{ pick: [id: string]; size: [height: number] }>()

const scroller = ref<HTMLElement | null>(null)
const list = ref<HTMLElement | null>(null)
const has = (events: NavEvent[], id: string | null) => !!id && events.some((e) => e.id === id)

/** The list's natural height, so the panel can be exactly as tall as it needs (up to its cap). */
let ro: ResizeObserver | null = null
onMounted(() => {
  if (!list.value) return
  ro = new ResizeObserver(() => emit('size', list.value?.offsetHeight ?? 0))
  ro.observe(list.value)
})
onBeforeUnmount(() => ro?.disconnect())

/** Bring the date being read to the middle of the list (its own scroll only, never the page's). */
function reveal(id: string, smooth = true) {
  const el = scroller.value
  const item = list.value?.querySelector<HTMLElement>(`[data-slot-of~="${CSS.escape(id)}"]`)
  if (!el || !item || el.scrollHeight <= el.clientHeight) return
  const top = item.offsetTop - el.clientHeight / 2 + item.offsetHeight / 2
  el.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' })
}
defineExpose({ reveal })
/**
 * The whole row is the touch target. One event: its title button covers the row.
 * Several on one date: each title is its own target; a tap on the date, the age or
 * the photograph goes to the first.
 */
function onRow(first: string, e: MouseEvent) {
  if ((e.target as Element | null)?.closest('button')) return
  emit('pick', first)
}
</script>

<template>
  <div
    ref="scroller"
    class="vt"
  >
    <ol
      ref="list"
      class="vt__list"
      :aria-label="msg.trRulerLabel"
    >
      <li
        v-for="s in slotsOf(events, era)"
        :key="s.events[0].id"
        class="vt__slot"
        :class="{ 'vt__slot--reading': has(s.events, readingId), 'vt__slot--single': s.events.length === 1 }"
        :data-slot-of="s.events.map((e) => e.id).join(' ')"
        @click="onRow(s.events[0].id, $event)"
      >
        <span
          class="vt__dot"
          aria-hidden="true"
        />
        <div class="vt__text">
          <span class="vt__date">{{ s.key }}</span>
          <button
            v-for="e in s.events"
            :key="e.id"
            type="button"
            class="vt__title"
            :aria-current="e.id === readingId ? 'location' : undefined"
            @click="emit('pick', e.id)"
          >
            {{ e.label }}
          </button>
          <span
            v-if="ageAt(s.events[0].date, birthYear)"
            class="vt__age"
          >{{ ageAt(s.events[0].date, birthYear) }}</span>
        </div>
        <img
          v-if="s.image"
          class="vt__img"
          :src="s.image.src"
          :alt="s.image.caption"
          loading="lazy"
        >
      </li>
    </ol>
  </div>
</template>

<style scoped>
.vt {
  height: 100%;
  overflow-y: auto;
  overscroll-behavior: contain;
  /* Soft edges where the list scrolls under the header and the panel's foot. */
  -webkit-mask-image: linear-gradient(to bottom, transparent, #000 12px, #000 calc(100% - 12px), transparent);
  mask-image: linear-gradient(to bottom, transparent, #000 12px, #000 calc(100% - 12px), transparent);
}
.mw-parser-output .vt__list,
.vt__list {
  position: relative;
  margin: 0;
  padding: 0;
  list-style: none;
}
/* The line, through every point. */
.vt__list::before {
  content: '';
  position: absolute;
  inset-block: 14px;
  inset-inline-start: 5px;
  border-inline-start: var(--border-width-base) solid var(--border-color-base);
}
.mw-parser-output .vt__slot,
.vt__slot {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-75);
  margin: 0;
  padding-block: var(--spacing-50);
  padding-inline-start: var(--spacing-150);
}
.vt__dot {
  position: absolute;
  inset-block-start: calc(var(--spacing-50) + 8px);
  inset-inline-start: 2px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-base);
  box-shadow: 0 0 0 2px var(--background-color-base);
}
.vt__slot--reading .vt__dot {
  inset-inline-start: 0.5px;
  width: 10px;
  height: 10px;
  inset-block-start: calc(var(--spacing-50) + 6.5px);
  background: var(--color-progressive);
  box-shadow:
    0 0 0 2px var(--background-color-base),
    0 0 0 4px var(--background-color-progressive-subtle);
}
.vt__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
}
.vt__date {
  font-size: var(--font-size-medium);
  font-weight: var(--font-weight-bold);
  line-height: 24px;
  font-variant-numeric: tabular-nums;
}
.vt__slot--reading .vt__date {
  color: var(--color-progressive);
}
.vt__title {
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-base);
  font: inherit;
  font-size: var(--font-size-small);
  line-height: 20px;
  text-align: start;
  cursor: pointer;
}
/* One event: its button covers the whole row (date, title, age, photograph). */
.vt__slot--single .vt__title::after {
  content: '';
  position: absolute;
  inset: 0;
}
/* Several titles: each one a comfortable target of its own. */
.vt__slot:not(.vt__slot--single) .vt__title {
  display: block;
  width: 100%;
  padding-block: 4px;
}
.vt__slot {
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.vt__slot:active {
  background-color: var(--background-color-interactive-subtle--active, rgba(0, 0, 0, 0.06));
}
.vt__title:hover {
  color: var(--color-progressive--hover, var(--color-progressive));
}
.vt__title:focus-visible {
  outline: var(--border-width-thick) solid var(--outline-color-progressive--focus);
  outline-offset: 1px;
}
.vt__age {
  color: var(--color-placeholder);
  font-size: var(--font-size-x-small, 12px);
  line-height: 16px;
}
.vt__img {
  flex: none;
  width: 60px;
  height: 40px;
  margin-block-start: 4px;
  object-fit: cover;
  box-shadow: 0 0 0 1px var(--border-color-muted, rgba(0, 0, 0, 0.08));
}
</style>
