<script setup lang="ts">
/**
 * The same timeline as photographs: one large card per date, in order, swiped
 * sideways and snapping into place. Each card is its photograph with the date
 * at its top and the title(s) and age at its foot (the date never moves with the
 * length of the text), each on a soft shade; a date without a photograph is a
 * plain card with the same type in the page's colours. The date being read is ringed in
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
        <span class="pt__date">{{ s.key }}</span>
        <div class="pt__text">
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
  gap: 10px;
  box-sizing: border-box;
  height: 100%;
  margin: 0;
  padding: 4px;
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
  border-radius: 12px;
  background: var(--background-color-neutral-subtle, #f8f9fa);
  scroll-snap-align: center;
  isolation: isolate;
}
/* A fine edge, so light photographs keep their shape on a white page (one class: states below win). */
.pt__card {
  box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.12);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    box-shadow 200ms ease,
    transform 200ms cubic-bezier(0.2, 0.7, 0.2, 1);
}
/* Clickable: a pointer, an underlined title on hover, and the card gives slightly under a press. */
.pt__card:active {
  transform: scale(0.98);
  transition-duration: 80ms;
}
/* The date being read: a thin blue ring, set off from the card by the page colour. */
.pt__card--reading {
  box-shadow:
    0 0 0 2px var(--background-color-base),
    0 0 0 3.5px var(--border-color-progressive, #36c);
}
.pt__img {
  position: absolute;
  inset: 0;
  z-index: -1;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
/* Under the pointer the title reads as a link (underlined), as links do on the wiki. */
@media (hover: hover) {
  .pt__card:hover .pt__title {
    text-decoration: underline;
    text-underline-offset: 2px;
  }
}
/* The date at the top, on a soft shade from the card's top edge. */
.pt__date {
  position: absolute;
  inset: 0 0 auto;
  padding: 10px 12px 24px;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.5), transparent);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  line-height: 16px;
  letter-spacing: 0.01em;
  font-variant-numeric: tabular-nums;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  pointer-events: none;
}
.pt--short .pt__date {
  padding: 7px 10px 16px;
  font-size: 12px;
  line-height: 15px;
}
/* Title(s) and age on a soft shade at the card's foot. */
.pt__text {
  position: absolute;
  inset: auto 0 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  padding: 36px 12px 10px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.62), rgba(0, 0, 0, 0.28) 55%, transparent);
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
}
.pt--short .pt__text {
  padding: 24px 10px 7px;
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
  font-size: 13px;
  line-height: 17px;
  opacity: 0.92;
  text-align: start;
  cursor: pointer;
}
.pt--short .pt__title {
  font-size: 12px;
  line-height: 15px;
}
.pt--short .pt__title {
  -webkit-line-clamp: 1;
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
    0 0 0 3.5px var(--outline-color-progressive--focus, #36c);
}
.pt__age {
  margin-block-start: 2px;
  font-size: 11px;
  line-height: 14px;
  opacity: 0.75;
}
/* No photograph: a lighter, narrower card, the words at its foot in the page's own colours. */
.mw-parser-output .pt__card--plain,
.pt__card--plain {
  width: calc(var(--pt-card-w) * 0.56);
  background: var(--background-color-interactive-subtle, #f8f9fa);
}
.pt__card--plain .pt__text,
.pt__card--plain .pt__date {
  background: none;
  color: var(--color-base);
  text-shadow: none;
}
.pt__card--plain .pt__title {
  color: var(--color-base);
}
.pt__card--plain .pt__age {
  color: var(--color-placeholder);
  opacity: 1;
}
.pt__card--plain.pt__card--reading .pt__date {
  color: var(--color-progressive);
}
@media (prefers-reduced-motion: reduce) {
  .pt__card {
    transition: none;
  }
  .pt__card:active {
    transform: none;
  }
}
</style>
