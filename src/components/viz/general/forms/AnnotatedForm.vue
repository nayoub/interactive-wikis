<script setup lang="ts">
/**
 * Annotated image (first tier): numbered markers on an image. The frame's
 * numbered list sits under it; selecting a marker or a list entry selects the
 * same item. No named regions or shapes in this round.
 */
import { computed, ref } from 'vue'

import { labelIn } from '../../model/visual'
import type { FormEmits, FormProps } from './shared'

const props = defineProps<FormProps>()
const emit = defineEmits<FormEmits>()
const items = computed(() => (props.visual.sets[0]?.items ?? []).filter((i) => i.components.region))
const image = computed(() => items.value[0]?.image)
/** Never drawn at more than twice the snapshot's own resolution. */
const natural = ref(0)
const pick = (id: string) => emit('select', id === props.selectedId ? null : id)
</script>

<template>
  <div v-if="image" class="af">
    <!-- eslint-disable-next-line vuejs-accessibility/click-events-have-key-events, vuejs-accessibility/no-static-element-interactions -->
    <div
      class="af__stage"
      :style="{ width: natural ? `${natural * 2}px` : '100%' }"
      @click.self="emit('select', null)"
    >
      <img
        class="af__img"
        :src="image.src"
        :alt="image.caption"
        @load="natural = ($event.target as HTMLImageElement).naturalWidth"
        @click="emit('select', null)"
      />
      <button
        v-for="(i, k) in items"
        :key="i.id"
        type="button"
        class="af__marker"
        :class="{
          'af__marker--on': selectedId === i.id,
          'af--dim': !!selectedId && selectedId !== i.id,
        }"
        :style="{
          left: `${i.components.region!.x * 100}%`,
          top: `${i.components.region!.y * 100}%`,
        }"
        :aria-label="`${k + 1}: ${labelIn(i, lang)}`"
        :aria-pressed="selectedId === i.id"
        @click.stop="pick(i.id)"
      >
        <small>{{ k + 1 }}</small>
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Everything here reads ../../tokens.css. */
.af__stage {
  position: relative;
  max-width: 100%;
  line-height: 0;
}
.af__img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: var(--viz-radius);
}
.af__marker {
  position: absolute;
  display: grid;
  place-items: center;
  width: var(--viz-marker-size);
  height: var(--viz-marker-size);
  padding: 0;
  transform: translate(-50%, -50%);
  border: var(--viz-focus-width) solid var(--viz-paper);
  border-radius: 50%;
  background: var(--viz-strong);
  color: var(--viz-paper);
  cursor: pointer;
  transition: opacity var(--viz-transition);
}
.af__marker small {
  font-family: var(--viz-font-family);
  font-size: var(--viz-small-size);
  font-weight: var(--viz-heading-weight);
  line-height: 1;
}
.af__marker--on {
  background: var(--viz-accent);
}
.af__marker:focus-visible {
  outline: var(--viz-focus-width) solid var(--viz-accent);
  outline-offset: 2px;
}
.af--dim {
  opacity: var(--viz-dim);
}
</style>
