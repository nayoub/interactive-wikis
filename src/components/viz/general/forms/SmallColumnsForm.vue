<script setup lang="ts">
/**
 * Rows of small columns: several measures over the same times (a climate
 * table). One row per measure, one column per time, all rows on one shared
 * axis of times. Each row has its own scale (its own unit). Single hue:
 * columns above the row's mean are the darker step. The row label carries the
 * unit; the row's lowest and highest values are labelled.
 */
import { computed, onMounted, ref } from 'vue'

import { MONTH_NAMES } from '../../model/dates'
import type { Item } from '../../model/visual'
import { fmt, readPx, useWidth, type FormEmits, type FormProps } from './shared'

const props = defineProps<FormProps>()
const emit = defineEmits<FormEmits>()
const root = ref<HTMLElement | null>(null)
const width = useWidth(root)
const t = ref({ 'row-height': 28, 'label-gap': 4 })
onMounted(() => root.value && (t.value = readPx(root.value, t.value) as typeof t.value))

const items = computed(() => props.visual.sets[0]?.items ?? [])
const timeKey = (i: Item) => {
  const s = i.components.time!.start
  return s.y * 100 + (s.m ?? 0)
}
/** The shared axis: every time any row has, in order. */
const times = computed(() =>
  [
    ...new Map(
      items.value.filter((i) => i.components.time).map((i) => [timeKey(i), i.components.time!]),
    ).entries(),
  ]
    .sort((a, b) => a[0] - b[0])
    .map(([k, time]) => ({
      key: k,
      label: time.recurring
        ? MONTH_NAMES[(time.start.m ?? 1) - 1].slice(0, 3)
        : String(time.start.y),
      short: time.recurring
        ? MONTH_NAMES[(time.start.m ?? 1) - 1][0]
        : String(time.start.y).slice(-2),
    })),
)
const rows = computed(() => {
  const by = new Map<string, Item[]>()
  for (const i of items.value) {
    const c = i.components.category ?? i.components.quantity?.measure ?? ''
    if (!by.has(c)) by.set(c, [])
    by.get(c)!.push(i)
  }
  return [...by.entries()].map(([name, list]) => {
    const values = list.map((i) => i.components.quantity!.value)
    const mean = values.reduce((s, v) => s + v, 0) / values.length
    const min = Math.min(0, ...values)
    const max = Math.max(0, ...values)
    const lo = list.reduce((a, b) =>
      b.components.quantity!.value < a.components.quantity!.value ? b : a,
    )
    const hi = list.reduce((a, b) =>
      b.components.quantity!.value > a.components.quantity!.value ? b : a,
    )
    return {
      name,
      unit: list[0].components.quantity?.unit ?? '',
      cells: new Map(list.map((i) => [timeKey(i), i])),
      mean,
      min,
      max,
      lo: lo.id,
      hi: hi.id,
    }
  })
})

const narrow = computed(() => width.value > 0 && width.value < 560)
const geo = computed(() => {
  const W = width.value
  if (!W || !times.value.length) return null
  const labelW = narrow.value ? 0 : Math.min(200, W * 0.32)
  const valueW = 96
  const plotW = W - labelW - valueW
  const step = plotW / times.value.length
  return { W, labelW, plotW, step, colW: Math.max(2, step * 0.7) }
})
const rowH = computed(() => t.value['row-height'])
const yOf = (r: (typeof rows.value)[number], v: number) => {
  const h = rowH.value
  const span = r.max - r.min || 1
  return ((r.max - v) / span) * h
}
const dim = (id: string) => !!props.selectedId && props.selectedId !== id
function pick(id: string) {
  emit('select', id === props.selectedId ? null : id)
}
</script>

<template>
  <div ref="root" class="sc2" :class="{ 'sc2--narrow': narrow }">
    <template v-if="geo">
      <!-- The shared axis of times -->
      <div
        class="sc2__axis"
        :style="{ paddingInlineStart: `${geo.labelW}px`, width: `${geo.labelW + geo.plotW}px` }"
      >
        <small v-for="tm in times" :key="tm.key" :style="{ width: `${geo.step}px` }">{{
          narrow || geo.step < 26 ? tm.short : tm.label
        }}</small>
      </div>
      <div v-for="r in rows" :key="r.name" class="sc2__row">
        <small class="sc2__name" :style="narrow ? {} : { width: `${geo.labelW}px` }"
          >{{ r.name }}<span v-if="r.unit" class="sc2__unit"> ({{ r.unit }})</span></small
        >
        <div class="sc2__fig">
          <!-- eslint-disable-next-line vuejs-accessibility/click-events-have-key-events, vuejs-accessibility/no-static-element-interactions -->
          <svg
            :width="geo.plotW"
            :height="rowH"
            class="sc2__svg"
            role="img"
            :aria-label="`${r.name}, ${r.unit}`"
          >
            <line class="sc2__zero" x1="0" :x2="geo.plotW" :y1="yOf(r, 0)" :y2="yOf(r, 0)" />
            <template v-for="(tm, k) in times" :key="tm.key">
              <rect
                v-if="r.cells.get(tm.key)"
                class="sc2__col"
                :class="{
                  'sc2__col--high': r.cells.get(tm.key)!.components.quantity!.value > r.mean,
                  'sc2--dim': dim(r.cells.get(tm.key)!.id),
                  'sc2__col--on': selectedId === r.cells.get(tm.key)!.id,
                }"
                :x="k * geo.step + (geo.step - geo.colW) / 2"
                :y="Math.min(yOf(r, 0), yOf(r, r.cells.get(tm.key)!.components.quantity!.value))"
                :width="geo.colW"
                :height="
                  Math.max(
                    1,
                    Math.abs(yOf(r, 0) - yOf(r, r.cells.get(tm.key)!.components.quantity!.value)),
                  )
                "
                role="button"
                tabindex="0"
                :aria-label="`${r.name}, ${tm.label}: ${fmt(r.cells.get(tm.key)!.components.quantity!.value)} ${r.unit}`"
                @click="pick(r.cells.get(tm.key)!.id)"
                @keydown.enter.prevent="pick(r.cells.get(tm.key)!.id)"
              />
            </template>
          </svg>
          <small class="sc2__range"
            >{{ fmt(Math.min(...[...r.cells.values()].map((i) => i.components.quantity!.value))) }}
            to
            {{
              fmt(Math.max(...[...r.cells.values()].map((i) => i.components.quantity!.value)))
            }}</small
          >
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* Everything here reads ../../tokens.css. */
.sc2 {
  min-width: 0;
}
.sc2 small {
  font-family: var(--viz-font-family);
  font-size: var(--viz-small-size);
  line-height: var(--viz-small-line);
}
.sc2__axis {
  display: flex;
  box-sizing: border-box;
  margin-bottom: var(--viz-space-xs);
  color: var(--viz-ink-tertiary);
}
.sc2__axis small {
  flex: none;
  text-align: center;
}
.sc2__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  padding-block: var(--viz-space-xs);
  border-top: var(--viz-line-width) solid var(--viz-rule-light);
}
.sc2__name {
  flex: none;
  box-sizing: border-box;
  padding-inline-end: var(--viz-space-s);
  color: var(--viz-ink);
}
.sc2__unit {
  color: var(--viz-ink-tertiary);
}
.sc2--narrow .sc2__name {
  width: 100%;
}
.sc2__fig {
  display: flex;
  align-items: center;
  gap: var(--viz-space-xs);
}
.sc2__svg {
  display: block;
  overflow: visible;
}
.sc2__zero {
  stroke: var(--viz-rule);
  stroke-width: var(--viz-line-width);
}
.sc2__col {
  fill: var(--viz-weak);
  cursor: pointer;
  transition: opacity var(--viz-transition);
}
.sc2__col--high {
  fill: var(--viz-strong);
}
.sc2__col--on {
  stroke: var(--viz-accent);
  stroke-width: var(--viz-focus-width);
}
.sc2__col:focus-visible {
  outline: var(--viz-focus-width) solid var(--viz-accent);
}
.sc2--dim {
  opacity: var(--viz-dim);
}
.sc2__range {
  width: 92px;
  color: var(--viz-ink-tertiary);
  white-space: nowrap;
}
</style>
