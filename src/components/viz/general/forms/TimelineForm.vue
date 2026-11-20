<script setup lang="ts">
/** Timeline form: the timeline renderer, fed the general object. */
import { computed } from 'vue'

import { toTimelineEvents } from '../../model/visual'
import TimelineView from '../../render/TimelineView.vue'
import type { FormEmits, FormProps } from './shared'

const props = defineProps<FormProps>()
const emit = defineEmits<FormEmits>()
const events = computed(() => toTimelineEvents(props.visual.sets[0]?.items ?? [], props.lang))
</script>

<template>
  <TimelineView
    bare
    :events="events"
    :spacing="spacing ?? 'proportional'"
    :skin="skin"
    :options="{ showAge: false, showGaps: visual.options.showGaps !== false }"
    :selection="selectedId"
    @focus="emit('select', $event?.id ?? null)"
  />
</template>
