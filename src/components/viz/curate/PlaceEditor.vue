<script setup lang="ts">
/** A map place in the curation list: name, country and year over the generic item fields. */
import { computed, ref } from 'vue'
import { CdxTextInput } from '@wikimedia/codex'

import type { Place } from '../model/types'
import ItemEditor from './ItemEditor.vue'

defineProps<{ draftLabel?: string }>()
const place = defineModel<Place>({ required: true })
const emit = defineEmits<{ remove: []; chooseImage: []; showSource: [] }>()

const yearOpen = ref(false)
const year = computed({
  get: () => (place.value.date ? String(place.value.date.start.y) : ''),
  set: (v: string) => {
    const n = Math.round(Number(v))
    if (!v.trim() || !Number.isFinite(n)) {
      place.value.date = undefined
      place.value.dateFrom = undefined
      return
    }
    place.value.date = { start: { y: Math.max(1, Math.min(2100, n)) }, precision: 'year' }
  },
})
const dateNote = computed(() =>
  place.value.dateFrom === 'sentence'
    ? 'from the sentence'
    : place.value.dateFrom === 'wikidata'
      ? 'from Wikidata'
      : '',
)
</script>

<template>
  <ItemEditor
    v-model="place"
    noun="place"
    :draft-label="draftLabel"
    @remove="emit('remove')"
    @choose-image="emit('chooseImage')"
    @show-source="emit('showSource')"
  >
    <template #head>
      <div class="pl__head">
        <span class="pl__name">{{ place.name }}</span>
        <small class="pl__meta">
          {{ place.country ?? 'Unknown country' }} ·
          <button
            type="button"
            class="pl__year"
            :aria-expanded="yearOpen"
            :aria-label="place.date ? `Year ${year}. Adjust` : 'Add a year'"
            @click="yearOpen = !yearOpen"
          >
            {{ place.date ? year : 'no year' }}</button
          ><template v-if="dateNote"> ({{ dateNote }})</template>
        </small>
      </div>
    </template>
    <template #details>
      <div v-if="yearOpen" class="pl__details">
        <CdxTextInput
          v-model="year"
          class="pl__year-input"
          input-type="number"
          aria-label="Completion or opening year"
          placeholder="Year"
          @update:model-value="place.dateFrom = undefined"
        />
        <small>Completion or opening year. Leave empty for none.</small>
      </div>
    </template>
  </ItemEditor>
</template>

<style scoped>
.pl__head {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
/* Heading 4 */
.pl__name {
  font-family: var(--font-family-base);
  font-size: var(--font-size-large);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-large);
}
.pl__meta {
  color: var(--color-subtle);
}
.pl__year {
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-decoration: underline dotted var(--border-color-base);
  text-underline-offset: 3px;
  cursor: pointer;
}
.pl__details {
  display: flex;
  align-items: center;
  gap: var(--spacing-50);
  padding-block: var(--spacing-50);
  color: var(--color-subtle);
}
.pl__year-input {
  width: 96px;
  min-width: 0;
}
</style>
