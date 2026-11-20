<script setup lang="ts">
/** Map form: the map renderer, fed the general object. */
import { computed } from 'vue'

import { toPlaces } from '../../model/visual'
import MapView from '../../render/MapView.vue'
import type { FormEmits, FormProps } from './shared'

const props = defineProps<FormProps>()
const emit = defineEmits<FormEmits>()
const places = computed(() => toPlaces(props.visual.sets[0]?.items ?? [], props.lang))
</script>

<template>
  <MapView
    bare
    :places="places"
    :options="{ shadeByDate: visual.options.shadeByDate === true }"
    :selection="selectedId"
    @focus="emit('select', $event?.id ?? null)"
  />
</template>
