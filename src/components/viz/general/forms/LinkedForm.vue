<script setup lang="ts">
/**
 * Map and timeline, linked: the same items as a map and as a timeline, one
 * selection. Selecting a place lights its event and the other way round
 * (the Link operator, here on one visual: both views read the same items).
 * On wide columns they sit side by side; on narrow ones the map comes first.
 */
import { ref } from 'vue'

import MapForm from './MapForm.vue'
import { useWidth, type FormEmits, type FormProps } from './shared'
import TimelineForm from './TimelineForm.vue'

defineProps<FormProps>()
const emit = defineEmits<FormEmits>()
const root = ref<HTMLElement | null>(null)
const width = useWidth(root)
</script>

<template>
  <div ref="root" class="lk" :class="{ 'lk--wide': width >= 760 }">
    <div class="lk__map">
      <MapForm
        :visual="visual"
        :selected-id="selectedId"
        :lang="lang"
        :skin="skin"
        @select="emit('select', $event)"
      />
    </div>
    <div class="lk__timeline">
      <TimelineForm
        :visual="visual"
        :selected-id="selectedId"
        :lang="lang"
        skin="mobile"
        :spacing="spacing"
        @select="emit('select', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
/* Everything here reads ../../tokens.css. */
.lk {
  display: flex;
  flex-direction: column;
  gap: var(--viz-space-l);
  min-width: 0;
}
.lk--wide {
  display: grid;
  grid-template-columns: 3fr 2fr;
  align-items: start;
}
.lk__map,
.lk__timeline {
  min-width: 0;
}
.lk--wide .lk__timeline {
  max-height: calc(var(--viz-chart-max-height) * 1.6);
  overflow-y: auto;
}
</style>
