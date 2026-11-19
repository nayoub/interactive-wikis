<script setup lang="ts">
/** One picked event in the curation list: label, date, image, source, delete. */
import { computed, ref } from 'vue'
import {
  CdxButton,
  CdxCheckbox,
  CdxField,
  CdxIcon,
  CdxSelect,
  CdxTextArea,
  CdxTextInput,
} from '@wikimedia/codex'
import { cdxIconCalendar, cdxIconImage, cdxIconTrash, cdxIconUndo } from '@wikimedia/codex-icons'

import { MONTH_NAMES, formatDate } from '../timeline/format'
import type { Precision, TimelineEvent } from '../timeline/types'

const props = defineProps<{ draftLabel?: string }>()
const event = defineModel<TimelineEvent>({ required: true })
const emit = defineEmits<{ remove: []; chooseImage: []; showSource: [] }>()

const dateOpen = ref(false)

const label = computed({
  get: () => event.value.label,
  set: (v: string) => (event.value.label = v.replace(/\n/g, ' ')),
})

const precisionItems = [
  { value: 'year', label: 'Year' },
  { value: 'month', label: 'Month and year' },
  { value: 'day', label: 'Full date' },
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
const circa = computed({
  get: () => !!event.value.date.circa,
  set: (v: boolean) => (event.value.date.circa = v),
})

/** Source sentence split around the matched date, so it can be emphasised. */
const sourceParts = computed(() => {
  const s = event.value.sourceText
  const d = event.value.sourceDateText
  const i = d ? s.indexOf(d) : -1
  if (i === -1) return [s, '', '']
  return [s.slice(0, i), d, s.slice(i + d.length)]
})

const labelEdited = computed(() => !!props.draftLabel && props.draftLabel !== event.value.label)
</script>

<template>
  <div class="ev">
    <div class="ev__row">
      <button
        type="button"
        class="ev__date"
        :aria-expanded="dateOpen"
        :aria-label="`Date: ${formatDate(event.date)}. Adjust date`"
        @click="dateOpen = !dateOpen"
      >
        <CdxIcon :icon="cdxIconCalendar" size="small" />
        <span>{{ formatDate(event.date) }}</span>
      </button>
      <CdxButton
        weight="quiet"
        action="destructive"
        size="small"
        aria-label="Remove event"
        @click="emit('remove')"
      >
        <CdxIcon :icon="cdxIconTrash" />
      </CdxButton>
    </div>

    <div v-if="dateOpen" class="ev__dates">
      <CdxField>
        <template #label>Precision</template>
        <CdxSelect v-model:selected="precision" :menu-items="precisionItems" />
      </CdxField>
      <div class="ev__date-fields">
        <CdxField v-if="precision === 'day'" class="ev__day">
          <template #label>Day</template>
          <CdxTextInput v-model="day" input-type="number" min="1" max="31" />
        </CdxField>
        <CdxField v-if="precision !== 'year'" class="ev__month">
          <template #label>Month</template>
          <CdxSelect v-model:selected="month" :menu-items="monthItems" />
        </CdxField>
        <CdxField class="ev__year">
          <template #label>Year</template>
          <CdxTextInput v-model="year" input-type="number" />
        </CdxField>
      </div>
      <div class="ev__date-fields">
        <CdxCheckbox v-model="circa" inline>Approximate (c.)</CdxCheckbox>
        <CdxCheckbox v-model="isRange" inline>Span of years</CdxCheckbox>
      </div>
      <CdxField v-if="isRange" class="ev__year">
        <template #label>Until</template>
        <CdxTextInput v-model="endYear" input-type="number" />
      </CdxField>
    </div>

    <CdxField class="ev__label">
      <template #label>Label</template>
      <CdxTextArea v-model="label" autosize rows="1" />
      <template v-if="labelEdited" #help-text>
        <button type="button" class="ev__link" @click="event.label = draftLabel!">
          <CdxIcon :icon="cdxIconUndo" size="x-small" /> Use drafted label
        </button>
      </template>
    </CdxField>

    <div class="ev__media">
      <template v-if="event.image">
        <img class="ev__thumb" :src="event.image.src" :alt="event.image.caption" />
        <CdxButton size="small" @click="emit('chooseImage')">Change</CdxButton>
        <CdxButton size="small" weight="quiet" @click="event.image = undefined"
          >Remove image</CdxButton
        >
      </template>
      <CdxButton v-else size="small" weight="quiet" @click="emit('chooseImage')">
        <CdxIcon :icon="cdxIconImage" /> Add image
      </CdxButton>
    </div>

    <blockquote class="ev__source">
      {{ sourceParts[0] }}<mark>{{ sourceParts[1] }}</mark
      >{{ sourceParts[2] }}
      <sup v-if="event.citation" class="reference">{{ event.citation.label }}</sup>
    </blockquote>
    <small class="ev__where">
      {{ event.sourceAnchor.sectionTitle }} ·
      <button type="button" class="ev__link" @click="emit('showSource')">Show in article</button>
    </small>
  </div>
</template>

<style scoped>
.ev {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-50);
}
.ev__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
/* Heading 4 */
.ev__date {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-25);
  padding: 2px var(--spacing-50) 2px var(--spacing-25);
  margin-inline-start: calc(-1 * var(--spacing-25));
  border: 0;
  border-radius: var(--border-radius-base, 2px);
  background: transparent;
  color: var(--color-base);
  font-family: var(--font-family-base);
  font-size: var(--font-size-large);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-large);
  cursor: pointer;
}
.ev__date:hover {
  background: var(--background-color-interactive-subtle--hover);
}
.ev__date .cdx-icon {
  color: var(--color-subtle);
}
.ev__dates {
  padding: var(--spacing-75);
  background: var(--background-color-interactive-subtle);
  border-radius: var(--border-radius-base, 2px);
}
.ev__dates :deep(.cdx-field) {
  margin-top: 0;
}
.ev__date-fields {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-50);
  margin-top: var(--spacing-50);
}
.ev__day {
  width: 72px;
}
.ev__month {
  flex: 1;
  min-width: 120px;
}
.ev__year {
  width: 96px;
}
.ev__label {
  margin-top: 0 !important;
}
.ev__media {
  display: flex;
  align-items: center;
  gap: var(--spacing-50);
}
.ev__thumb {
  width: 56px;
  height: 40px;
  object-fit: cover;
  border-radius: var(--border-radius-base, 2px);
}
/* Block quote */
.ev__source {
  margin: 0;
  padding-inline-start: var(--spacing-75);
  border-inline-start: 2px solid var(--border-color-subtle);
  font-family: var(--font-family-serif, serif);
  font-size: var(--font-size-medium);
  font-weight: var(--font-weight-normal);
  line-height: var(--line-height-medium);
  color: var(--color-subtle);
}
.ev__source mark {
  background: var(--background-color-progressive-subtle);
  color: var(--color-base);
  padding-inline: 1px;
}
.ev__where {
  color: var(--color-subtle);
}
.ev__link {
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
</style>
