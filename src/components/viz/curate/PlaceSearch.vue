<script setup lang="ts">
/** Add a place the article does not link: search Wikidata by name. Shown folded under the list. */
import { ref } from 'vue'
import { CdxButton, CdxLookup, CdxMessage } from '@wikimedia/codex'

import type { Place } from '../model/types'
import { placeFromItem, searchItems, type ItemHit } from './wikidata'

const emit = defineEmits<{ add: [place: Place] }>()

const open = ref(false)
const selected = ref<string | null>(null)
const input = ref('')
const items = ref<{ value: string; label: string; description?: string }[]>([])
const error = ref<string | null>(null)
const busy = ref(false)
let controller: AbortController | null = null
let timer: ReturnType<typeof setTimeout> | undefined

function onInput(value: string) {
  input.value = value
  clearTimeout(timer)
  controller?.abort()
  if (!value.trim()) return (items.value = [])
  timer = setTimeout(async () => {
    controller = new AbortController()
    try {
      const hits: ItemHit[] = await searchItems(value.trim(), controller.signal)
      items.value = hits.map((h) => ({ value: h.id, label: h.label, description: h.description }))
    } catch (e) {
      if ((e as Error).name !== 'AbortError') error.value = (e as Error).message
    }
  }, 250)
}

async function onSelect(id: string | null) {
  if (!id) return
  busy.value = true
  error.value = null
  try {
    const place = await placeFromItem(id)
    if (!place) error.value = 'That item has no coordinates on Wikidata, so it cannot go on a map.'
    else {
      emit('add', place)
      selected.value = null
      input.value = ''
      items.value = []
    }
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="ps">
    <CdxButton v-if="!open" weight="quiet" size="small" class="ps__toggle" @click="open = true">
      Add a place the article doesn’t link…
    </CdxButton>
    <template v-else>
      <CdxLookup
        v-model:selected="selected"
        v-model:input-value="input"
        :menu-items="items"
        :disabled="busy"
        placeholder="Search Wikidata for a place"
        aria-label="Search Wikidata for a place"
        @input="onInput"
        @update:selected="onSelect"
      >
        <template #no-results>No items found.</template>
      </CdxLookup>
      <small class="ps__note">It will be added without a source sentence.</small>
      <CdxMessage v-if="error" type="warning" inline>{{ error }}</CdxMessage>
    </template>
  </div>
</template>

<style scoped>
.ps {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-25);
  margin-bottom: var(--spacing-75);
}
.ps__toggle {
  align-self: flex-start;
  margin-inline-start: calc(-1 * var(--spacing-50));
}
.ps__note {
  color: var(--color-subtle);
}
</style>
