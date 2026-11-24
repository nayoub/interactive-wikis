<script setup lang="ts">
/**
 * Choose a period without dragging or aiming at marks: one button per
 * neutral period (empty ones included, so gaps are visible) or, on a phone,
 * a select. A range chosen another way (a cluster, a drag) shows as its
 * own value with a way to clear it. Changes the navigator only.
 */
import { computed } from 'vue'
import { CdxButton, CdxIcon, CdxSelect, CdxToggleButtonGroup } from '@wikimedia/codex'
import { cdxIconClose } from '@wikimedia/codex-icons'

import type { NavEvent } from './events'
import { msg } from './messages'
import { interval, overlaps, yearLabel, type Period } from './time'

const props = defineProps<{
  periods: Period[]
  events: NavEvent[]
  range: [number, number] | null
  compact?: boolean
  era?: boolean
}>()
const emit = defineEmits<{ 'update:range': [range: [number, number] | null] }>()

const count = (p: Period) => props.events.filter((e) => overlaps(interval(e.date), p.range)).length
const current = computed(() => {
  if (!props.range) return 'all'
  const p = props.periods.find((x) => x.range[0] === props.range![0] && x.range[1] === props.range![1])
  return p ? p.id : 'custom'
})
const customLabel = computed(() => {
  if (!props.range || current.value !== 'custom') return ''
  const [a, b] = props.range
  const from = yearLabel(Math.floor(a), props.era)
  const to = yearLabel(Math.ceil(b) - 1, props.era)
  return from === to ? from : `${from}–${to}`
})
function choose(id: string) {
  if (id === 'all') emit('update:range', null)
  else if (id !== 'custom') emit('update:range', props.periods.find((p) => p.id === id)!.range)
}
const buttons = computed(() => [
  { value: 'all', label: msg.allPeriods },
  ...props.periods.map((p) => ({
    value: p.id,
    label: p.label,
    ariaLabel: `${p.label}, ${msg.eventsCount(count(p))}`,
  })),
])
const items = computed(() => [
  { value: 'all', label: msg.allPeriods },
  ...props.periods.map((p) => ({ value: p.id, label: `${p.label} (${count(p)})` })),
  ...(current.value === 'custom' ? [{ value: 'custom', label: customLabel.value }] : []),
])
const selected = computed({ get: () => current.value, set: choose })
</script>

<template>
  <div
    class="pc"
    role="group"
    :aria-label="msg.period"
  >
    <template v-if="compact">
      <label class="pc__label">
        <span>{{ msg.period }}</span>
        <CdxSelect
          v-model:selected="selected"
          :menu-items="items"
        />
      </label>
    </template>
    <template v-else>
      <CdxToggleButtonGroup
        v-model="selected"
        class="pc__group"
        :buttons="buttons"
      />
      <span
        v-if="current === 'custom'"
        class="pc__custom"
      >
        {{ customLabel }}
        <CdxButton
          weight="quiet"
          size="small"
          :aria-label="msg.allPeriods"
          @click="emit('update:range', null)"
        >
          <CdxIcon
            :icon="cdxIconClose"
            size="small"
          />
        </CdxButton>
      </span>
    </template>
  </div>
</template>

<style scoped>
.pc {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--spacing-50);
}
.pc__group {
  flex-wrap: wrap;
  row-gap: var(--spacing-25);
}
.pc__label {
  display: flex;
  align-items: center;
  gap: var(--spacing-50);
  width: 100%;
  font-size: var(--font-size-small);
}
.pc__label :deep(.cdx-select-vue) {
  flex: 1;
  min-width: 0;
}
.pc__custom {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-25);
  padding-inline-start: var(--spacing-50);
  border-inline-start: var(--border-width-base) solid var(--border-color-subtle);
  font-size: var(--font-size-small);
  font-variant-numeric: tabular-nums;
}
</style>
