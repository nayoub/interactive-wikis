<script setup lang="ts">
/**
 * Insert → Visual asks one thing: what to pick. Only the kinds the section
 * has are offered (one kind per visual). A section with none offers the
 * whole article instead.
 */
import { computed } from 'vue'
import { CdxButton, CdxPopover } from '@wikimedia/codex'

import type { PickFilter } from './draft'

const props = defineProps<{
  anchor: HTMLElement | null
  /** The section's title, and which kinds it has. */
  section: string
  kinds: Record<Exclude<PickFilter, 'all'>, boolean>
  /** Kinds present anywhere in the article (when the section has none). */
  anywhere: Record<Exclude<PickFilter, 'all'>, boolean>
}>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ choose: [kind: Exclude<PickFilter, 'all'>, whole: boolean] }>()

const LABEL = { date: 'Dates', place: 'Places', table: 'A table', image: 'An image' } as const
const here = computed(() =>
  (Object.keys(LABEL) as (keyof typeof LABEL)[]).filter((k) => props.kinds[k]),
)
const whole = computed(() => !here.value.length)
const offered = computed(() =>
  whole.value
    ? (Object.keys(LABEL) as (keyof typeof LABEL)[]).filter((k) => props.anywhere[k])
    : here.value,
)
</script>

<template>
  <CdxPopover
    v-model:open="open"
    :anchor="anchor"
    placement="bottom-start"
    title="What do you want to pick?"
    :use-close-button="true"
    class="kc"
  >
    <p class="kc__where">
      <template v-if="whole">Nothing to pick in “{{ section }}”; from the whole article:</template>
      <template v-else>In “{{ section }}”:</template>
    </p>
    <div class="kc__kinds">
      <CdxButton v-for="k in offered" :key="k" @click="emit('choose', k, whole)">{{
        LABEL[k]
      }}</CdxButton>
    </div>
  </CdxPopover>
</template>

<style scoped>
.kc__where {
  margin: 0 0 var(--spacing-50);
  color: var(--color-subtle);
}
.kc__kinds {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-50);
}
</style>
