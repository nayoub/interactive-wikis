<script setup lang="ts">
/**
 * Line or columns: a quantity over time (population by census year). One hue;
 * a second set (Compare) is a second lightness step of it. Direct labels on
 * the first, last and peak values, and each set's name at its end; no legend.
 * Variant "columns" draws the same points as columns from zero.
 */
import { computed, onMounted, ref } from 'vue'

import type { Item } from '../../model/visual'
import { fmt, readPx, useWidth, type FormEmits, type FormProps } from './shared'

const props = defineProps<FormProps>()
const emit = defineEmits<FormEmits>()

/** One renderer, two forms: columns draw the same points from zero. */
const variant = computed(() => (props.visual.form === 'columns' ? 'columns' : 'line'))
const root = ref<HTMLElement | null>(null)
const width = useWidth(root)
const t = ref({
  'dot-size': 7,
  'label-gap': 4,
  'chart-aspect': 0.5,
  'chart-min-height': 180,
  'chart-max-height': 300,
})
const font = ref('14px sans-serif')
onMounted(() => {
  if (!root.value) return
  t.value = readPx(root.value, t.value) as typeof t.value
  const probe = root.value.querySelector('.lf__probe')
  if (probe) {
    const cs = getComputedStyle(probe)
    font.value = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
  }
})
let ctx: CanvasRenderingContext2D | null = null
const textW = (s: string) => {
  ctx ??= document.createElement('canvas').getContext('2d')
  if (!ctx) return s.length * 7
  ctx.font = font.value
  return ctx.measureText(s).width
}

interface Pt {
  item: Item
  year: number
  value: number
}
const series = computed(() =>
  props.visual.sets.map((s) => ({
    label: s.label,
    points: s.items
      .filter((i) => i.components.time && i.components.quantity)
      .map((i) => ({
        item: i,
        year: i.components.time!.start.y,
        value: i.components.quantity!.value,
      }))
      .sort((a, b) => a.year - b.year) as Pt[],
  })),
)
const compare = computed(() => series.value.length > 1)

const geo = computed(() => {
  const W = width.value
  const all = series.value.flatMap((s) => s.points)
  if (!W || !all.length) return null
  const line = 20
  const right = compare.value ? Math.max(...series.value.map((s) => textW(s.label))) + 12 : 12
  const left = Math.max(textW(fmt(Math.max(...all.map((p) => p.value)))) + 8, 32)
  const H = Math.round(
    Math.min(
      t.value['chart-max-height'],
      Math.max(t.value['chart-min-height'], W * t.value['chart-aspect']),
    ),
  )
  const top = line + 4
  const bottom = H - line
  const y0 = Math.min(...all.map((p) => p.year))
  const y1 = Math.max(...all.map((p) => p.year))
  const vmax = Math.max(...all.map((p) => p.value)) * 1.08
  const x = (yr: number) => left + ((yr - y0) / Math.max(1, y1 - y0)) * (W - left - right)
  const y = (v: number) => bottom - (v / vmax) * (bottom - top)
  // Gridlines at round values.
  const raw = vmax / 3
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const grid = [1, 2, 3, 4, 5].map((k) => k * step).filter((v) => v < vmax)
  // Year ticks: first, last, and round years between that do not crowd them.
  const span = y1 - y0
  const every = [10, 20, 25, 50, 100].find((e) => (span / e) * 44 < W - left - right) ?? 100
  const ticks: number[] = [y0]
  for (let yr = Math.ceil(y0 / every) * every; yr < y1; yr += every)
    if (yr - y0 > every / 2 && y1 - yr > every / 2) ticks.push(yr)
  ticks.push(y1)
  // Columns: width from the closest pair of years.
  const years = [...new Set(all.map((p) => p.year))].sort((a, b) => a - b)
  const minGap = Math.min(...years.slice(1).map((yr, i) => x(yr) - x(years[i])), W)
  const colW = Math.max(2, (minGap * 0.7) / series.value.length)
  return { W, H, left, right, top, bottom, x, y, grid, ticks, colW }
})

/** Direct labels: first, last and peak of each set (a set's peak only when it is not an end). */
const valueLabels = computed(() => {
  const g = geo.value
  if (!g) return []
  const out: { key: string; x: number; y: number; text: string; set: number }[] = []
  series.value.forEach((s, si) => {
    if (!s.points.length) return
    const peak = s.points.reduce((a, b) => (b.value > a.value ? b : a))
    const picks = [s.points[0], peak, s.points[s.points.length - 1]].filter(
      (p, i, arr) => arr.indexOf(p) === i,
    )
    for (const p of picks) {
      const px =
        g.x(p.year) +
        (variant.value === 'columns' ? (si - (series.value.length - 1) / 2) * g.colW : 0)
      const label = {
        key: `${si}-${p.item.id}`,
        x: px,
        y: g.y(p.value) - t.value['label-gap'] * 2,
        text: fmt(p.value),
        set: si,
      }
      const w = textW(label.text)
      const clash = out.some(
        (o) =>
          Math.abs(o.x - label.x) < (w + textW(o.text)) / 2 + 4 && Math.abs(o.y - label.y) < 16,
      )
      if (!clash) out.push(label)
    }
  })
  return out
})

const path = (pts: Pt[]) => {
  const g = geo.value!
  return pts
    .map((p, i) => `${i ? 'L' : 'M'}${g.x(p.year).toFixed(1)} ${g.y(p.value).toFixed(1)}`)
    .join('')
}
const dim = (id: string) => !!props.selectedId && props.selectedId !== id

function onClick(e: MouseEvent) {
  const g = geo.value
  const svg = e.currentTarget as SVGSVGElement
  const ctm = svg.getScreenCTM()
  if (!g || !ctm) return
  const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
  let best: Item | null = null
  let d = Infinity
  series.value.forEach((s, si) =>
    s.points.forEach((p) => {
      const px =
        g.x(p.year) +
        (variant.value === 'columns' ? (si - (series.value.length - 1) / 2) * g.colW : 0)
      const dd = Math.hypot(px - pt.x, variant.value === 'columns' ? 0 : g.y(p.value) - pt.y)
      if (dd < d) {
        d = dd
        best = p.item
      }
    }),
  )
  const reach = variant.value === 'columns' ? Math.max(g.colW, 12) : 24
  const id = best && d <= reach ? (best as Item).id : null
  emit('select', id === props.selectedId ? null : id)
}
const unit = computed(() => {
  const q = series.value[0]?.points[0]?.item.components.quantity
  return q ? q.measure || q.unit : ''
})
</script>

<template>
  <div ref="root" class="lf">
    <small class="lf__probe" aria-hidden="true" />
    <!-- eslint-disable-next-line vuejs-accessibility/click-events-have-key-events, vuejs-accessibility/no-static-element-interactions -->
    <svg
      v-if="geo"
      class="lf__svg"
      :width="geo.W"
      :height="geo.H"
      :viewBox="`0 0 ${geo.W} ${geo.H}`"
      role="img"
      :aria-label="`${unit} by year, ${series.map((s) => s.label).join(' and ')}`"
      @click="onClick"
    >
      <g class="lf__grid">
        <template v-for="v in geo.grid" :key="v">
          <line :x1="geo.left" :x2="geo.W - geo.right" :y1="geo.y(v)" :y2="geo.y(v)" />
          <text :x="geo.left - 6" :y="geo.y(v) + 4" text-anchor="end">{{ fmt(v) }}</text>
        </template>
        <line
          class="lf__base"
          :x1="geo.left"
          :x2="geo.W - geo.right"
          :y1="geo.bottom"
          :y2="geo.bottom"
        />
        <text v-for="yr in geo.ticks" :key="yr" :x="geo.x(yr)" :y="geo.H - 4" text-anchor="middle">
          {{ yr }}
        </text>
      </g>

      <g v-for="(s, si) in series" :key="si" :class="`lf__set lf__set--${si}`">
        <template v-if="variant === 'columns'">
          <rect
            v-for="p in s.points"
            :key="p.item.id"
            class="lf__col"
            :class="{ 'lf--dim': dim(p.item.id) }"
            :x="geo.x(p.year) + (si - (series.length - 1) / 2) * geo.colW - geo.colW / 2"
            :y="geo.y(p.value)"
            :width="geo.colW"
            :height="geo.bottom - geo.y(p.value)"
          />
        </template>
        <template v-else>
          <path class="lf__line" :class="{ 'lf--dim': !!selectedId }" :d="path(s.points)" />
          <circle
            v-for="p in s.points"
            :key="p.item.id"
            class="lf__dot"
            :class="{ 'lf--dim': dim(p.item.id), 'lf__dot--on': selectedId === p.item.id }"
            :cx="geo.x(p.year)"
            :cy="geo.y(p.value)"
            :r="t['dot-size'] / 2"
          />
        </template>
        <text
          v-if="compare && s.points.length"
          class="lf__set-label"
          :x="geo.W - geo.right + 6"
          :y="geo.y(s.points[s.points.length - 1].value) + 4"
        >
          {{ s.label }}
        </text>
      </g>

      <text
        v-for="l in valueLabels"
        :key="l.key"
        class="lf__value"
        :class="`lf__value--${l.set}`"
        :x="l.x"
        :y="l.y"
        text-anchor="middle"
      >
        {{ l.text }}
      </text>
    </svg>
  </div>
</template>

<style scoped>
/* Everything here reads ../../tokens.css. */
.lf {
  position: relative;
  min-width: 0;
}
.lf__probe {
  position: absolute;
  visibility: hidden;
  font-family: var(--viz-font-family);
  font-size: var(--viz-small-size);
}
.lf__svg {
  display: block;
  overflow: visible;
  cursor: pointer;
}
.lf__svg text {
  font-family: var(--viz-font-family);
  font-size: var(--viz-small-size);
  fill: var(--viz-ink-tertiary);
}
.lf__grid line {
  stroke: var(--viz-rule-light);
  stroke-width: var(--viz-line-width);
}
.lf__grid .lf__base {
  stroke: var(--viz-rule);
}
.lf__line {
  fill: none;
  stroke: var(--viz-series-1);
  stroke-width: var(--viz-focus-width);
  stroke-linejoin: round;
}
.lf__set--1 .lf__line {
  stroke: var(--viz-series-2);
}
.lf__dot,
.lf__col {
  fill: var(--viz-series-1);
  transition: opacity var(--viz-transition);
}
.lf__set--1 .lf__dot,
.lf__set--1 .lf__col {
  fill: var(--viz-series-2);
}
.lf__dot--on {
  stroke: var(--viz-paper);
  stroke-width: var(--viz-line-width);
}
.lf--dim {
  opacity: var(--viz-dim);
}
.lf__svg .lf__value {
  fill: var(--viz-ink-secondary);
}
.lf__svg .lf__set-label {
  fill: var(--viz-ink);
}
</style>
