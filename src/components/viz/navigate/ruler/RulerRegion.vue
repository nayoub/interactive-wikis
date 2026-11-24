<script setup lang="ts">
/**
 * The ruler's one bounded region. It shows one thing at a time and scrolls
 * inside its allocation, so opening different previews never resizes the
 * panel:
 *
 *   results   the events matching the filter (the readable list alternative)
 *   cluster   the events behind a count mark
 *   help      How to read this timeline
 *   preview   one event: date and label, source section, the source
 *             sentence, then Read this passage (the only control that moves
 *             the article)
 */
import { computed, nextTick, ref, watch } from 'vue'
import { CdxButton, CdxIcon, CdxMessage } from '@wikimedia/codex'
import { cdxIconArrowPrevious, cdxIconArticle } from '@wikimedia/codex-icons'

import type { NavEvent } from '../events'
import { msg } from '../messages'
import { formatWhen, kindPhrase } from '../time'

export type RegionView = 'results' | 'cluster' | 'help' | 'preview'

const props = defineProps<{
  view: RegionView
  results: NavEvent[]
  resultsTitle: string
  cluster: NavEvent[]
  clusterTitle: string
  preview: NavEvent | null
  previewOutside: boolean
  previewMissing: boolean
  selectedId: string | null
  readingId: string | null
  era: boolean
}>()
const emit = defineEmits<{ open: [id: string]; read: [e: NavEvent]; back: [] }>()

const section = (e: NavEvent) => (e.sourceAnchor.sectionTitle === 'Lead' ? 'Introduction' : e.sourceAnchor.sectionTitle)

/** The source sentence, cut around its date when long; the date text in bold. */
const excerpt = computed(() => {
  const e = props.preview
  if (!e?.sourceText) return null
  const text = e.sourceText.trim()
  const d = e.sourceDateText ? text.indexOf(e.sourceDateText) : -1
  let a = 0
  let b = text.length
  if (text.length > 280) {
    const c = d >= 0 ? d : 0
    a = Math.max(0, c - 120)
    b = Math.min(text.length, a + 260)
  }
  const cut = text.slice(a, b)
  const i = d >= 0 ? d - a : -1
  const pre = (a > 0 ? '…' : '') + (i >= 0 ? cut.slice(0, i) : cut)
  const date = i >= 0 ? cut.slice(i, i + e.sourceDateText.length) : ''
  const post = (i >= 0 ? cut.slice(i + e.sourceDateText.length) : '') + (b < text.length ? '…' : '')
  return { pre, date, post }
})

const list = computed(() => (props.view === 'cluster' ? props.cluster : props.results))
const root = ref<HTMLElement | null>(null)
watch(
  () => [props.view, props.preview?.id],
  () => nextTick(() => root.value?.scrollTo({ top: 0 })),
)
defineExpose({ root })
</script>

<template>
  <div
    ref="root"
    class="rr"
  >
    <article
      v-if="view === 'preview' && preview"
      class="rr__preview"
      aria-labelledby="rr-preview-title"
    >
      <h3
        id="rr-preview-title"
        class="rr__heading"
        tabindex="-1"
      >
        <span class="rr__when">{{ formatWhen(preview.date, era) }}</span> · {{ preview.label }}
      </h3>
      <p class="rr__section">
        {{ msg.inSection(section(preview)) }}
      </p>
      <p
        v-if="excerpt"
        class="rr__quote"
      >
        {{ excerpt.pre }}<b>{{ excerpt.date }}</b>{{ excerpt.post }}
      </p>
      <p class="rr__meta">
        <span v-if="kindPhrase(preview.date)">{{ kindPhrase(preview.date) }}</span>
        <span v-if="previewOutside">{{ msg.trOutsideRangeNote }}</span>
      </p>
      <CdxMessage
        v-if="previewMissing"
        type="warning"
        :inline="true"
      >
        {{ msg.trMissing }}
      </CdxMessage>
      <div class="rr__actions">
        <CdxButton
          action="progressive"
          weight="primary"
          :disabled="previewMissing"
          @click="emit('read', preview)"
        >
          <CdxIcon :icon="cdxIconArticle" />{{ msg.readPassage }}
        </CdxButton>
        <CdxButton
          weight="quiet"
          @click="emit('back')"
        >
          <CdxIcon :icon="cdxIconArrowPrevious" />{{ msg.trBackToList }}
        </CdxButton>
      </div>
    </article>

    <div
      v-else-if="view === 'help'"
      class="rr__help"
    >
      <h3 class="rr__heading">
        {{ msg.trHowToRead }}
      </h3>
      <ul>
        <li>{{ msg.rulerNote }}</li>
        <li>{{ msg.trLegendShapes }}</li>
        <li>{{ msg.trLegendReading }}</li>
        <li>{{ msg.trLegendRange }}</li>
        <li>{{ msg.blankMeaning }}</li>
      </ul>
      <CdxButton
        weight="quiet"
        @click="emit('back')"
      >
        <CdxIcon :icon="cdxIconArrowPrevious" />{{ msg.trBackToList }}
      </CdxButton>
    </div>

    <template v-else>
      <p class="rr__list-head">
        {{ view === 'cluster' ? clusterTitle : resultsTitle }}
        <CdxButton
          v-if="view === 'cluster'"
          weight="quiet"
          size="small"
          @click="emit('back')"
        >
          {{ msg.trBackToList }}
        </CdxButton>
      </p>
      <ol class="rr__list">
        <li
          v-for="e in list"
          :key="e.id"
        >
          <button
            type="button"
            class="rr__row"
            :class="{ 'rr__row--selected': selectedId === e.id }"
            :aria-pressed="selectedId === e.id ? 'true' : 'false'"
            :data-event="e.id"
            @click="emit('open', e.id)"
          >
            <span class="rr__date">{{ formatWhen(e.date, era) }}</span>
            <span class="rr__what">
              {{ e.label }}
              <span class="rr__row-section">{{ section(e) }}<template v-if="kindPhrase(e.date)"> · {{ kindPhrase(e.date) }}</template></span>
            </span>
            <span
              v-if="readingId === e.id"
              class="rr__reading"
            >{{ msg.trReading }}</span>
          </button>
        </li>
        <li
          v-if="!list.length"
          class="rr__empty"
        >
          {{ msg.noEventsIn }}
        </li>
      </ol>
    </template>
  </div>
</template>

<style scoped>
.rr {
  box-sizing: border-box;
  height: 100%;
  padding-block-start: var(--spacing-25);
  overflow-y: auto;
  overscroll-behavior: contain;
  font-size: var(--font-size-small);
  line-height: var(--line-height-small);
}
.mw-parser-output .rr__heading,
.rr__heading {
  margin: 0;
  padding: 0;
  border: 0;
  font-family: var(--font-family-base);
  font-size: var(--font-size-medium);
  line-height: var(--line-height-medium);
  font-weight: var(--font-weight-bold);
}
.rr__heading:focus {
  outline: none;
}
.rr__heading:focus-visible {
  outline: var(--border-width-thick) solid var(--outline-color-progressive--focus);
}
.rr__when {
  font-variant-numeric: tabular-nums;
  unicode-bidi: plaintext;
}
.mw-parser-output .rr p,
.rr p {
  margin: 0;
}
.rr__section {
  color: var(--color-subtle);
}
.mw-parser-output .rr .rr__quote,
.rr__quote {
  margin: var(--spacing-50) 0;
  padding: 0 0 0 var(--spacing-75);
  border-inline-start: var(--border-width-thick) solid var(--border-color-subtle);
  color: var(--color-base);
  font-size: var(--font-size-small);
  font-style: normal;
}
.rr__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0 var(--spacing-75);
  color: var(--color-subtle);
}
.rr__preview {
  padding-block-end: var(--spacing-50);
}
/* The one action that moves the article stays reachable however short the region is. */
.rr__actions {
  position: sticky;
  inset-block-end: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-50);
  margin-block-start: var(--spacing-50);
  padding-block: var(--spacing-25);
  background: var(--background-color-base);
}
.rr__help ul {
  margin: var(--spacing-25) 0 var(--spacing-50) var(--spacing-125);
}
.rr__list-head {
  position: sticky;
  inset-block-start: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 28px;
  background: var(--background-color-base);
  border-block-end: var(--border-width-base) solid var(--border-color-subtle);
  font-weight: var(--font-weight-bold);
}
.mw-parser-output .rr__list,
.rr__list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.mw-parser-output .rr__list li,
.rr__list li {
  margin: 0;
}
.rr__row {
  display: grid;
  grid-template-columns: 8.5em minmax(0, 1fr) auto;
  gap: var(--spacing-50);
  align-items: baseline;
  width: 100%;
  padding: var(--spacing-25) var(--spacing-50);
  border: 0;
  border-block-end: var(--border-width-base) solid var(--border-color-subtle);
  background: none;
  color: var(--color-base);
  font: inherit;
  text-align: start;
  cursor: pointer;
}
.rr__row:hover {
  background: var(--background-color-interactive-subtle--hover);
}
.rr__row:focus-visible {
  outline: var(--border-width-thick) solid var(--outline-color-progressive--focus);
  outline-offset: -2px;
}
.rr__row--selected {
  box-shadow: inset 3px 0 0 var(--color-progressive);
}
[dir='rtl'] .rr__row--selected {
  box-shadow: inset -3px 0 0 var(--color-progressive);
}
.rr__row--selected .rr__what {
  font-weight: var(--font-weight-bold);
}
.rr__date {
  color: var(--color-subtle);
  font-variant-numeric: tabular-nums;
  unicode-bidi: plaintext;
}
.rr__row-section {
  display: block;
  color: var(--color-subtle);
  font-weight: var(--font-weight-normal);
}
.rr__reading {
  padding-inline: var(--spacing-25);
  border: var(--border-width-base) solid var(--border-color-base);
  border-radius: var(--border-radius-base);
  color: var(--color-base);
  font-size: var(--font-size-x-small, 12px);
}
.rr__empty {
  padding: var(--spacing-50);
  color: var(--color-subtle);
}
@media (max-width: 639px) {
  .rr__row {
    grid-template-columns: 6.5em minmax(0, 1fr) auto;
  }
}
</style>
