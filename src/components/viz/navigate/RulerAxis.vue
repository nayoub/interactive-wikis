<script setup lang="ts">
/** A calibrated rule: restrained ticks at even years, directly labelled. Same scale as RulerTrack. */
import { computed } from 'vue'

import { ticks, yearLabel } from './time'

const props = withDefaults(defineProps<{ domain: [number, number]; width: number; era?: boolean; band?: [number, number] | null }>(), {
  era: false,
  band: null,
})
const PAD = 12
const x = (y: number) => {
  const [a, b] = props.domain
  return PAD + ((y - a) / (b - a || 1)) * Math.max(1, props.width - 2 * PAD)
}
/** About one labelled tick per 80px. */
const marks = computed(() => ticks(props.domain[0], props.domain[1], Math.max(2, Math.floor(props.width / 80))))
</script>

<template>
  <div
    class="ra"
    aria-hidden="true"
  >
    <div class="ra__line" />
    <span
      v-for="t in marks"
      :key="t"
      class="ra__tick"
      :style="{ insetInlineStart: `${x(t)}px` }"
    >
      <span
        class="ra__label"
        :class="{ 'ra__label--start': x(t) < 20, 'ra__label--end': x(t) > width - 20 }"
      >{{ t === 0 ? '' : yearLabel(t, era && t > 0 && domain[0] < 0) }}</span>
    </span>
  </div>
</template>

<style scoped>
.ra {
  position: relative;
  height: 26px;
}
.ra__line {
  position: absolute;
  inset-inline: 12px;
  inset-block-start: 0;
  border-block-start: var(--border-width-base) solid var(--color-base);
}
.ra__tick {
  position: absolute;
  inset-block-start: 0;
  height: 5px;
  border-inline-start: var(--border-width-base) solid var(--color-base);
}
.ra__label {
  position: absolute;
  inset-block-start: 6px;
  transform: translateX(-50%);
  color: var(--color-subtle);
  font-size: var(--font-size-x-small, 12px);
  line-height: var(--line-height-x-small, 1.4);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
[dir='rtl'] .ra__label {
  transform: translateX(50%);
}
.ra__label--start {
  transform: none !important;
}
.ra__label--end {
  inset-inline-end: 0;
  transform: none !important;
}
</style>
