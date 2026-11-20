<script setup lang="ts">
/**
 * Bars: a quantity per category, horizontal, in the editor's order. One hue
 * (a second set, when compared, is the lighter step); the value at each bar's
 * end; no axis.
 */
import { computed, ref } from 'vue'

import { labelIn } from '../../model/visual'
import { fmt, useWidth, type FormEmits, type FormProps } from './shared'

const props = defineProps<FormProps>()
const emit = defineEmits<FormEmits>()
const root = ref<HTMLElement | null>(null)
useWidth(root)

const rows = computed(() => {
  const [first, ...rest] = props.visual.sets
  return (first?.items ?? []).map((i) => ({
    item: i,
    values: [i, ...rest.map((s) => s.items.find((x) => x.label === i.label))].map(
      (x) => x?.components.quantity?.value ?? null,
    ),
  }))
})
const max = computed(() =>
  Math.max(1e-9, ...rows.value.flatMap((r) => r.values.map((v) => v ?? 0))),
)
const unit = computed(() => props.visual.sets[0]?.items[0]?.components.quantity?.unit ?? '')
const dim = (id: string) => !!props.selectedId && props.selectedId !== id
const pick = (id: string) => emit('select', id === props.selectedId ? null : id)

// Being made: drag a bar to reorder (categories have no natural order).
const dragging = ref<string | null>(null)
function onDown(e: PointerEvent, id: string) {
  if (!props.editing || e.button !== 0) return
  dragging.value = id
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}
function onMove(e: PointerEvent) {
  if (!dragging.value || !root.value) return
  const lis = Array.from(root.value.querySelectorAll<HTMLElement>(':scope > li'))
  const ids = rows.value.map((r) => r.item.id)
  const from = ids.indexOf(dragging.value)
  let to = lis.findIndex((li) => e.clientY < li.getBoundingClientRect().top + li.offsetHeight / 2)
  if (to === -1) to = ids.length - 1
  else if (to > from) to -= 1
  if (to === from) return
  ids.splice(to, 0, ids.splice(from, 1)[0])
  emit('reorder', ids)
}
function onUp() {
  dragging.value = null
}
</script>

<template>
  <ol ref="root" class="bf">
    <li
      v-for="r in rows"
      :key="r.item.id"
      :class="{ 'bf--dim': dim(r.item.id) && !dragging, 'bf--drag': dragging === r.item.id }"
    >
      <button
        type="button"
        class="bf__row"
        :class="{ 'bf__row--editing': editing }"
        @pointerdown="onDown($event, r.item.id)"
        @pointermove="onMove"
        @pointerup="onUp"
        @pointercancel="onUp"
        :aria-pressed="selectedId === r.item.id"
        @click="pick(r.item.id)"
      >
        <small class="bf__name">{{ labelIn(r.item, lang) }}</small>
        <span class="bf__bars">
          <span v-for="(v, k) in r.values" :key="k" class="bf__track">
            <span
              class="bf__bar"
              :class="`bf__bar--${k}`"
              :style="{ width: `calc((100% - var(--viz-bar-value-room)) * ${(v ?? 0) / max})` }"
            />
            <small class="bf__value"
              >{{ v === null ? '–' : fmt(v) }}{{ unit && k === 0 ? ` ${unit}` : '' }}</small
            >
          </span>
        </span>
      </button>
    </li>
  </ol>
</template>

<style scoped>
/* Everything here reads ../../tokens.css. */
.bf,
.bf > li {
  list-style: none;
  list-style-image: none;
  margin: 0;
  padding: 0;
}
.bf > li {
  transition: opacity var(--viz-transition);
}
.bf__row {
  display: grid;
  grid-template-columns: minmax(4em, 30%) 1fr;
  align-items: center;
  gap: var(--viz-space-m);
  width: 100%;
  padding: var(--viz-space-xs) 0;
  border: 0;
  background: none;
  color: inherit;
  text-align: start;
  cursor: pointer;
}
.bf__row:focus-visible {
  outline: var(--viz-focus-width) solid var(--viz-accent);
}
small {
  font-family: var(--viz-font-family);
  font-size: var(--viz-small-size);
  line-height: var(--viz-small-line);
}
.bf__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--viz-ink);
}
.bf__track {
  display: flex;
  align-items: center;
  gap: var(--viz-space-s);
}
.bf__bar {
  flex: none;
  height: var(--viz-bar-height);
  min-width: var(--viz-line-width);
  background: var(--viz-series-1);
}
.bf__bar--1 {
  background: var(--viz-series-2);
}
.bf__value {
  color: var(--viz-ink-secondary);
  white-space: nowrap;
}
.bf__row--editing {
  cursor: grab;
  touch-action: none;
}
.bf--drag .bf__row {
  cursor: grabbing;
  background: var(--viz-accent-wash);
}
.bf--dim {
  opacity: var(--viz-dim);
}
</style>
