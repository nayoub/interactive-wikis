<script setup lang="ts">
/** A timeline event in the curation list: its date (editable) over the generic item fields. */
import { computed, ref } from 'vue'
import { CdxCheckbox, CdxSelect, CdxTextInput } from '@wikimedia/codex'

import { MONTH_NAMES, formatDate } from '../model/dates'
import type { Precision, Qualifier, TimelineEvent } from '../model/types'
import ItemEditor from './ItemEditor.vue'

defineProps<{ draftLabel?: string }>()
const event = defineModel<TimelineEvent>({ required: true })
const emit = defineEmits<{ remove: []; chooseImage: []; showSource: [] }>()

const dateOpen = ref(false)

// Date
const precisionItems = [
  { value: 'year', label: 'Year' },
  { value: 'month', label: 'Month' },
  { value: 'day', label: 'Day' },
]
const monthItems = MONTH_NAMES.map((m, i) => ({ value: i + 1, label: m }))
const precision = computed({
  get: () => event.value.date.precision,
  set: (p: Precision) => {
    const d = event.value.date
    d.precision = p
    if (p === 'year') {
      delete d.start.m
      delete d.start.d
    } else {
      d.start.m ??= 1
      if (p === 'day') d.start.d ??= 1
      else delete d.start.d
    }
  },
})
function num(v: string | number, min: number, max: number) {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min
}
const year = computed({
  get: () => String(event.value.date.start.y),
  set: (v) => (event.value.date.start.y = num(v, 1, 2100)),
})
const month = computed({
  get: () => event.value.date.start.m ?? 1,
  set: (v: number) => (event.value.date.start.m = v),
})
const day = computed({
  get: () => String(event.value.date.start.d ?? 1),
  set: (v) => (event.value.date.start.d = num(v, 1, 31)),
})
const isRange = computed({
  get: () => !!event.value.date.end,
  set: (on: boolean) => {
    if (on) event.value.date.end = { y: event.value.date.start.y + 1 }
    else delete event.value.date.end
  },
})
const endYear = computed({
  get: () => String(event.value.date.end?.y ?? ''),
  set: (v) => {
    if (event.value.date.end) event.value.date.end.y = num(v, event.value.date.start.y, 2100)
  },
})
const qualifierItems = [
  { value: '', label: 'Exact' },
  { value: 'early', label: 'Early' },
  { value: 'mid', label: 'Mid' },
  { value: 'late', label: 'Late' },
  { value: 'spring', label: 'Spring' },
  { value: 'summer', label: 'Summer' },
  { value: 'fall', label: 'Fall' },
  { value: 'winter', label: 'Winter' },
]
const qualifier = computed({
  get: () => event.value.date.qualifier ?? '',
  set: (v: string) => {
    if (v) event.value.date.qualifier = v as Qualifier
    else delete event.value.date.qualifier
  },
})
const circa = computed({
  get: () => !!event.value.date.circa,
  set: (v: boolean) => (event.value.date.circa = v),
})
</script>

<template>
  <ItemEditor
    v-model="event"
    noun="event"
    :draft-label="draftLabel"
    @remove="emit('remove')"
    @choose-image="emit('chooseImage')"
    @show-source="emit('showSource')"
  >
    <template #head>
      <button
        type="button"
        class="ev__date"
        :aria-expanded="dateOpen"
        :aria-label="`${formatDate(event.date)}. Adjust date`"
        @click="dateOpen = !dateOpen"
      >
        {{ formatDate(event.date) }}
      </button>
    </template>
    <template #details>
      <div v-if="dateOpen" class="ev__dates">
        <CdxSelect
          v-model:selected="precision"
          class="ev__precision"
          :menu-items="precisionItems"
        />
        <CdxTextInput
          v-if="precision === 'day'"
          v-model="day"
          class="ev__num ev__num--day"
          input-type="number"
          aria-label="Day"
        />
        <CdxSelect
          v-if="precision !== 'year'"
          v-model:selected="month"
          class="ev__month"
          :menu-items="monthItems"
        />
        <CdxSelect
          v-if="precision === 'year'"
          v-model:selected="qualifier"
          class="ev__month"
          aria-label="Part of the year or decade"
          :menu-items="qualifierItems"
        />
        <CdxTextInput v-model="year" class="ev__num" input-type="number" aria-label="Year" />
        <span v-if="isRange" class="ev__until">to</span>
        <CdxTextInput
          v-if="isRange"
          v-model="endYear"
          class="ev__num"
          input-type="number"
          aria-label="Until year"
        />
        <div class="ev__flags">
          <CdxCheckbox v-model="circa" inline>c.</CdxCheckbox>
          <CdxCheckbox v-model="isRange" inline>Span</CdxCheckbox>
        </div>
      </div>
    </template>
  </ItemEditor>
</template>

<style scoped>
.ev {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-25);
}
.ev__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 32px;
}

/* Heading 4 */
.ev__date {
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-base);
  font-family: var(--font-family-base);
  font-size: var(--font-size-large);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-large);
  text-decoration: underline dotted transparent;
  text-underline-offset: 4px;
  cursor: pointer;
}
.ev__date:hover,
.ev__date[aria-expanded='true'] {
  text-decoration-color: var(--border-color-base);
}

.ev__tools {
  display: flex;
  gap: 2px;
  color: var(--color-subtle);
}
@media (hover: hover) {
  .ev__tools {
    opacity: 0;
    transition: opacity 120ms;
  }
  .ev:hover .ev__tools,
  .ev:focus-within .ev__tools {
    opacity: 1;
  }
}

.ev__dates {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--spacing-50);
  padding-block: var(--spacing-50);
}
.ev__dates :deep(.cdx-select-vue) {
  min-width: 0;
}
.ev__precision {
  width: 96px;
}
.ev__month {
  width: 132px;
}
.ev__num {
  width: 80px;
  min-width: 0;
}
.ev__num--day {
  width: 60px;
}
.ev__until {
  color: var(--color-subtle);
}
.ev__flags {
  display: flex;
  gap: var(--spacing-75);
}
.ev__flags :deep(.cdx-checkbox) {
  margin: 0;
}

.ev__body {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-75);
}
.ev__text {
  flex: 1;
  min-width: 0;
}

/* Body: the label reads as text until you touch it. */
.ev__label {
  display: block;
  box-sizing: border-box;
  margin: 0 0 0 calc(-1 * var(--spacing-50));
  padding: 2px var(--spacing-50);
  width: calc(100% + var(--spacing-50));
  overflow: hidden;
  resize: none;
  border: 0;
  border-radius: var(--border-radius-base, 2px);
  background: transparent;
  color: var(--color-base);
  font-family: var(--font-family-base);
  font-size: var(--font-size-medium);
  font-weight: var(--font-weight-normal);
  line-height: var(--line-height-medium);
  transition:
    background-color 120ms,
    box-shadow 120ms;
}
.ev__label:hover {
  background: var(--background-color-interactive-subtle);
}
.ev__label:focus {
  outline: none;
  background: var(--background-color-base);
  box-shadow: inset 0 0 0 1px var(--border-color-progressive);
}
.ev .ev__revert {
  margin-top: 2px;
  font-size: var(--font-size-small);
  line-height: var(--line-height-small);
  display: none;
}
.ev:focus-within .ev__link.ev__revert {
  display: inline-flex;
}
@media (hover: hover) {
  .ev:hover .ev__link.ev__revert {
    display: inline-flex;
  }
}

.ev__image {
  position: relative;
  flex: none;
}
.ev__thumb {
  display: block;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
}
.ev__thumb img {
  display: block;
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: var(--border-radius-base, 2px);
}
.ev__unimage {
  position: absolute;
  top: -6px;
  right: -6px;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--background-color-base);
  box-shadow: var(--box-shadow-small, 0 1px 2px rgba(0, 0, 0, 0.2));
  color: var(--color-subtle);
  cursor: pointer;
}
@media (hover: hover) {
  .ev__unimage {
    opacity: 0;
  }
  .ev__image:hover .ev__unimage,
  .ev__unimage:focus-visible {
    opacity: 1;
  }
}

/* Small: the source, folded to two lines until opened. */
.ev__source {
  color: var(--color-subtle);
}
.ev__quote {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}
.ev__source--open .ev__quote {
  -webkit-line-clamp: unset;
}
.ev__quote mark {
  background: none;
  color: var(--color-base);
  font-weight: inherit;
  text-decoration: underline;
  text-decoration-color: var(--border-color-progressive);
  text-underline-offset: 3px;
}
.ev__credit {
  color: var(--color-placeholder);
}
.ev__credit a {
  color: inherit;
}
.ev__where {
  display: flex;
  justify-content: space-between;
  color: var(--color-placeholder);
}
.ev__link {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-progressive);
  font: inherit;
  cursor: pointer;
}
.ev__link:hover {
  text-decoration: underline;
}
.ev__link .cdx-icon {
  color: inherit;
}
</style>
