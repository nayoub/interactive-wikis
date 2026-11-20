<script setup lang="ts">
/**
 * Seat diagram form: the election module's hemicycle, fed the general object.
 * Items carry no party colours, so it is drawn in one hue by lightness.
 */
import { computed } from 'vue'

import type { VisualSpec } from '../../model/types'
import { toParties } from '../../model/visual'
import ElectionView from '../../render/ElectionView.vue'
import type { FormEmits, FormProps } from './shared'

const props = defineProps<FormProps>()
const emit = defineEmits<FormEmits>()
const parties = computed(() => toParties(props.visual.sets[0]?.items ?? [], props.lang))
const spec = computed<VisualSpec>(() => ({
  tableId: null,
  headers: [],
  roles: [],
  form: 'seats',
  measure: 'seats',
  years: false,
  minSeats: 1,
  minShare: 0,
  election: { name: props.visual.title, date: '' },
  previous: [],
}))
</script>

<template>
  <ElectionView
    bare
    monochrome
    :items="parties"
    :spec="spec"
    :selection="selectedId"
    @focus="emit('select', $event?.id ?? null)"
  />
</template>
