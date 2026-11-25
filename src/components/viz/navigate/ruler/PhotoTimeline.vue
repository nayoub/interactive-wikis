<script setup lang="ts">
/**
 * The same timeline as photographs: one large card per date, in order, swiped
 * sideways and snapping into place. Each card is its photograph with the date,
 * title(s) and age over a soft shade at its foot; a date without a photograph
 * is a quiet card with the date set large. The date being read is ringed in
 * blue and kept in the middle; selecting a card goes to its passage.
 */
import { computed, ref } from 'vue'

import type { NavEvent } from '../events'
import { msg } from '../messages'
import { ageAt, slotsOf } from './layout'

const props = defineProps<{
  events: NavEvent[]
  era: boolean
  readingId: string | null
  birthYear: number | null
  /** Card height (px); the strip is this tall. */
  height: number
  /** Short cards (docked): date and title only. */
  short?: boolean
}>()
const emit = defineEmits<{ pick: [id: string] }>()

const scroller = ref<HTMLElement | null>(null)
const slots = computed(() => slotsOf(props.events, props.era))
const has = (events: NavEvent[], id: string | null) => !!id && events.some((e) => e.id === id)
/** Landscape cards, a little wider than tall; short (docked) cards wider still. */
const cardW = computed(() => Math.round(props.height * (props.short ? 1.9 : 1.35)))

/** A larger rendition of a Wikimedia thumbnail (cards are bigger than the timeline's thumbnails). */
function bigger(src: string): string {
  // Only Wikimedia's thumbnailer makes other sizes (a saved snapshot has just the one).
  if (!/upload\.wikimedia\.org\/.+\/thumb\//.test(src)) return src
  const want = Math.min(1280, Math.round(cardW.value * 2))
  return src.replace(/\/(\d+)px-([^/]+)$/, (m, w, name) => (Number(w) < want ? `/${want}px-${name}` : m))
}

/** Bring the card of the date being read to the middle (the strip's own scroll only). */
function reveal(id: string, smooth = true) {
  const el = scroller.value
  const card = el?.querySelector<HTMLElement>(`[data-slot-of~="${CSS.escape(id)}"]`)
  if (!el || !card) return
  const left = card.offsetLeft - (el.clientWidth - card.offsetWidth) / 2
  el.scrollTo({ left: Math.max(0, left), behavior: smooth ? 'smooth' : 'auto' })
}
defineExpose({ reveal })
</script>

<template>
  <div
    ref="scroller"
    class="pt"
    :class="{ 'pt--short': short }"
    :style="{ height: `${height}px`, '--pt-card-w': `${cardW}px` }"
  >
    <ol
      class="pt__list"
      :aria-label="msg.trRulerLabel"
    >
      <li
        v-for="s in slots"
        :key="s.events[0].id"
        class="pt__card"
        :class="{ 'pt__card--reading': has(s.events, readingId), 'pt__card--plain': !s.image }"
        :data-slot-of="s.events.map((e) => e.id).join(' ')"
      >
        <img
          v-if="s.image"
          class="pt__img"
          :src="bigger(s.image.src)"
          :alt="s.image.caption"
          loading="lazy"
        >
        <div class="pt__text">
          <span class="pt__date">{{ s.key }}</span>
          <button
            v-for="e in s.events"
            :key="e.id"
            type="button"
            class="pt__title"
            :class="{ 'pt__title--cover': s.events.length === 1 }"
            :aria-current="e.id === readingId ? 'location' : undefined"
            @click="emit('pick', e.id)"
          >
            {{ e.label }}
          </button>
          <span
            v-if="!short && ageAt(s.events[0].date, birthYear)"
            class="pt__age"
          >{{ ageAt(s.events[0].date, birthYear) }}</span>
        </div>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.pt {
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-x: contain;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
}
.pt::-webkit-scrollbar {
  display: none;
}
.mw-parser-output .pt__list,
.pt__list {
  display: flex;
  gap: var(--spacing-75);
  box-sizing: border-box;
  height: 100%;
  margin: 0;
  padding: 4px 0;
  list-style: none;
}
.mw-parser-output .pt__card,
.pt__card {
  position: relative;
  flex: none;
  width: var(--pt-card-w);
  height: 100%;
  margin: 0;
  overflow: hidden;
  border-radius: 6px;
  background: var(--background-color-neutral, #eaecf0);
  scroll-snap-align: center;
  transition: box-shadow 200ms;
}
.pt__card--reading {
  box-shadow:
    0 0 0 2px var(--background-color-base),
    0 0 0 4px var(--border-color-progressive, #36c);
}
.pt__img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
/* The words sit on a shade at the card's foot (white on the photograph). */
.pt__text {
  position: absolute;
  inset: auto 0 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 40px 14px 12px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.72), rgba(0, 0, 0, 0.35) 60%, transparent);
  color: #fff;
}
.pt--short .pt__text {
  padding: 28px 12px 8px;
}
.pt__date {
  font-size: 20px;
  font-weight: var(--font-weight-bold, 700);
  line-height: 24px;
  font-variant-numeric: tabular-nums;
}
.pt--short .pt__date {
  font-size: 16px;
  line-height: 20px;
}
.pt__title {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  font-size: 15px;
  line-height: 20px;
  text-align: start;
  cursor: pointer;
}
.pt--short .pt__title {
  -webkit-line-clamp: 1;
  font-size: 14px;
}
/* One event: the whole card is its button. */
.pt__title--cover::after {
  content: '';
  position: absolute;
  inset: 0;
}
.pt__title:focus-visible {
  outline: none;
}
.pt__card:has(.pt__title:focus-visible) {
  box-shadow:
    0 0 0 2px var(--background-color-base),
    0 0 0 4px var(--outline-color-progressive--focus, #36c);
}
.pt__age {
  font-size: 12px;
  line-height: 16px;
  opacity: 0.85;
}
/* No photograph: a quiet card, the date set large. */
/* No photograph: narrower, so the photographs lead. */
.mw-parser-output .pt__card--plain,
.pt__card--plain {
  width: calc(var(--pt-card-w) * 0.62);
  background: var(--background-color-interactive-subtle, #f8f9fa);
  box-shadow: inset 0 0 0 1px var(--border-color-subtle, #c8ccd1);
}
.pt__card--plain.pt__card--reading {
  box-shadow:
    inset 0 0 0 1px var(--border-color-subtle, #c8ccd1),
    0 0 0 2px var(--background-color-base),
    0 0 0 4px var(--border-color-progressive, #36c);
}
.pt__card--plain .pt__text {
  inset: 0;
  justify-content: flex-end;
  background: none;
  color: var(--color-base);
}
.pt__card--plain .pt__date {
  font-size: 28px;
  line-height: 32px;
}
.pt--short .pt__card--plain .pt__date {
  font-size: 18px;
  line-height: 22px;
}
.pt__card--plain .pt__age {
  color: var(--color-subtle);
  opacity: 1;
}
.pt__card--reading .pt__date {
  color: inherit;
}
.pt__card--plain.pt__card--reading .pt__date {
  color: var(--color-progressive);
}
@media (prefers-reduced-motion: reduce) {
  .pt__card {
    transition: none;
  }
}
</style>
