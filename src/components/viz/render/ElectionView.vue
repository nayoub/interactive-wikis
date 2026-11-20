<script setup lang="ts">
/**
 * Render, for a "Visual" built from a results table: a seat diagram (a
 * hemicycle of the same dots as the timeline and map, filled party by party in
 * the editor's order) or horizontal bars, with an optional year control over
 * the series' earlier elections. Tap a party: its seats stay, the rest dim,
 * and a note gives seats, share and change, with "Show in article".
 *
 * Colour: party colours (from the article's table) only for seats and bars;
 * everything else is the page's neutrals. Every party is labelled, so colour
 * is never the only key. "Monochrome" redraws in one hue by lightness.
 * Everything here reads ../tokens.css.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { CdxToggleButtonGroup } from '@wikimedia/codex'

import { globalTheme } from '@/theme'
import { blocsFor, electionsOf, yearOf, type Bloc } from '../model/parties'
import type { Party, VisualSpec } from '../model/types'
import { contrast, hemicycle, mix, radiusFor } from './hemicycle'

const props = withDefaults(
  defineProps<{
    items: Party[]
    spec: VisualSpec
    title?: string
    fallback?: boolean
    monochrome?: boolean
    /** "Show in article" in the party note (off in the editor's preview). */
    canShowSource?: boolean
    /** Ids of parties to show selected (linking from elsewhere). */
    activeIds?: string[]
  }>(),
  { title: '', fallback: false, monochrome: false, canShowSource: true, activeIds: () => [] },
)
const emit = defineEmits<{ select: [party: Party] }>()

const titleId = useId()
const rootRef = ref<HTMLElement | null>(null)

// ── Tokens, read where the module sits (themes apply) ───────────────────────
const tok = ref({
  paper: '#fff',
  others: '#72777d',
  step1: '#eaf3ff',
  step4: '#233566',
  contrastMin: 3,
  seatMin: 10,
  seatMax: 12,
  inner: 0.4,
  labelRoom: 104,
  narrow: 560,
  dot: 7,
  gap: 4,
  font: '14px sans-serif',
  line: 20,
})
function readTokens() {
  const el = rootRef.value
  if (!el) return
  const cs = getComputedStyle(el)
  const v = (n: string) => cs.getPropertyValue(n).trim()
  const px = (n: string, d: number) => parseFloat(v(n)) || d
  // Colour tokens resolve through Codex variables; a probe gives their computed value.
  const probe = document.createElement('span')
  el.appendChild(probe)
  const color = (n: string) => {
    probe.style.color = `var(${n})`
    return getComputedStyle(probe).color
  }
  const small = getComputedStyle(el.querySelector('.el__probe') ?? el)
  tok.value = {
    paper: color('--viz-paper'),
    others: color('--viz-others'),
    step1: color('--viz-step-1'),
    step4: color('--viz-step-4'),
    contrastMin: px('--viz-contrast-min', 3),
    seatMin: px('--viz-seat-min', 10),
    seatMax: px('--viz-seat-max', 12),
    inner: px('--viz-hemicycle-inner', 0.4),
    labelRoom: px('--viz-label-room', 104),
    narrow: px('--viz-narrow', 560),
    dot: px('--viz-dot-size', 7),
    gap: px('--viz-label-gap', 4),
    font: `${small.fontWeight} ${small.fontSize} ${small.fontFamily}`,
    line: parseFloat(small.lineHeight) || 20,
  }
  probe.remove()
}

const width = ref(0)
let ro: ResizeObserver | null = null
onMounted(() => {
  readTokens()
  ro = new ResizeObserver(([e]) => (width.value = Math.round(e.contentRect.width)))
  if (rootRef.value) ro.observe(rootRef.value)
})
onBeforeUnmount(() => ro?.disconnect())
watch(globalTheme, () => nextTick(readTokens))
const narrow = computed(() => width.value > 0 && width.value < tok.value.narrow)

// ── Elections and blocs ────────────────────────────────────────────────────
const elections = computed(() => {
  const all = electionsOf(props.items, props.spec)
  return props.spec.years ? all : all.slice(-1)
})
const year = ref('')
watch(
  elections,
  (list) => {
    if (!list.some((e) => e.year === year.value)) year.value = list[list.length - 1]?.year ?? ''
  },
  { immediate: true },
)
const shownIndex = computed(() =>
  Math.max(
    0,
    elections.value.findIndex((e) => e.year === year.value),
  ),
)
const shown = computed(() => elections.value[shownIndex.value])
const isLatest = computed(() => shownIndex.value === elections.value.length - 1)
const yearButtons = computed(() => elections.value.map((e) => ({ value: e.year, label: e.year })))

const form = computed(() => props.spec.form ?? 'seats')
const measure = computed<'seats' | 'share'>(() =>
  form.value === 'seats' ? 'seats' : props.spec.measure,
)
const blocsOf = (parties: Party[]) => blocsFor(props.items, parties, props.spec, measure.value)
const blocs = computed<Bloc[]>(() => (shown.value ? blocsOf(shown.value.parties) : []))
const totalSeats = computed(() => blocs.value.reduce((s, b) => s + b.seats, 0))

// ── Colour ─────────────────────────────────────────────────────────────────
/** Monochrome: one lightness step per party, in the editor's order, darkest first (stable across years). */
const monoRank = computed(() => {
  const keys = new Set(elections.value.flatMap((e) => blocsOf(e.parties).map((b) => b.key)))
  const order = props.items.map((p) => p.key).filter((k) => keys.has(k))
  return new Map(order.map((k, i) => [k, order.length > 1 ? i / (order.length - 1) : 0]))
})
function colorOf(b: Bloc): string {
  if (b.key === 'others') return tok.value.others
  if (props.monochrome) return mix(tok.value.step4, tok.value.step1, monoRank.value.get(b.key) ?? 0)
  return b.color ?? tok.value.others
}
const outlined = (c: string) => contrast(c, tok.value.paper) < tok.value.contrastMin

// ── Selection ──────────────────────────────────────────────────────────────
const selectedKey = ref<string | null>(null)
watch(
  () => props.activeIds,
  (ids) => {
    const p = props.items.find((x) => ids.includes(x.id))
    if (p) selectedKey.value = p.key
  },
)
const selected = computed(() => blocs.value.find((b) => b.key === selectedKey.value) ?? null)
function toggle(key: string) {
  selectedKey.value = selectedKey.value === key ? null : key
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') selectedKey.value = null
}
defineExpose({
  focusParty(id: string) {
    const p = props.items.find((x) => x.id === id)
    if (p) selectedKey.value = p.key
  },
})

const fmtChange = (n?: number) => (n === undefined ? '' : n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0')
const fmtShare = (n?: number) => (n === undefined ? '' : `${n}%`)
const previousYear = computed(() => {
  // The change column compares with the election before the shown one.
  const e = shown.value
  if (!e) return ''
  const i = elections.value.indexOf(e)
  return i > 0 ? elections.value[i - 1].year : ''
})

// ── Seat diagram geometry ──────────────────────────────────────────────────
let ctx: CanvasRenderingContext2D | null = null
function textWidth(s: string) {
  ctx ??= document.createElement('canvas').getContext('2d')
  if (!ctx) return s.length * 7
  ctx.font = tok.value.font
  return ctx.measureText(s).width
}

const maxSeats = computed(() =>
  Math.max(1, ...elections.value.map((e) => blocsOf(e.parties).reduce((s, b) => s + b.seats, 0))),
)

const geo = computed(() => {
  const t = tok.value
  const W = width.value
  if (!W || form.value !== 'seats') return null
  const room = narrow.value ? t.dot : t.labelRoom
  const availR = Math.max(40, W / 2 - room)
  // One dot per seat while dots stay distinguishable; else one per two (or more).
  let per = 1
  while (per < 6 && radiusFor(Math.ceil(maxSeats.value / per), t.seatMin, t.inner) > availR) per++
  const R = Math.min(availR, radiusFor(Math.ceil(maxSeats.value / per), t.seatMax, t.inner))
  const n = Math.ceil(totalSeats.value / per)
  const { seats } = hemicycle(n, R, t.inner)

  // Party ranges in dots: cumulative seats, rounded, so the total stays exact.
  const ranges: { bloc: Bloc; from: number; to: number }[] = []
  let cum = 0
  for (const b of blocs.value) {
    if (b.seats <= 0) continue
    const from = Math.round(cum / per)
    cum += b.seats
    ranges.push({ bloc: b, from, to: Math.round(cum / per) })
  }
  const owner: number[] = new Array(n).fill(-1)
  ranges.forEach((r, i) => {
    for (let j = r.from; j < r.to && j < n; j++) owner[j] = i
  })

  const top = narrow.value ? t.line * 0.5 : t.line * 2 + t.gap * 2
  const H = top + R + t.dot + t.line * (narrow.value ? 0.2 : 1)
  const cx = W / 2
  const cy = top + R

  // Majority: the boundary between the majority-th seat and the next.
  const maj = shown.value?.election.majority
  let majority: {
    x1: number
    y1: number
    x2: number
    y2: number
    ix1: number
    iy1: number
    ix2: number
    iy2: number
  } | null = null
  if (maj && maj < totalSeats.value) {
    const b = Math.min(n - 1, Math.max(1, Math.round(maj / per)))
    const a = (seats[b - 1].angle + seats[b].angle) / 2
    const c = Math.cos(a)
    const s = -Math.sin(a)
    const r0 = R * t.inner
    majority = {
      x1: cx + c * (R + t.dot),
      y1: cy + s * (R + t.dot),
      x2: cx + c * (R + t.dot + t.gap * 2),
      y2: cy + s * (R + t.dot + t.gap * 2),
      ix1: cx + c * (r0 - t.dot),
      iy1: cy + s * (r0 - t.dot),
      ix2: cx + c * (r0 - t.dot - t.gap * 2),
      iy2: cy + s * (r0 - t.dot - t.gap * 2),
    }
  }

  // Direct labels at each block's outer edge; a label that would collide moves out a step, else goes to the list.
  type Box = [number, number, number, number]
  const boxes: Box[] = []
  if (majority) boxes.push([majority.x2 - 3, majority.y2 - 3, majority.x2 + 3, majority.y1 + 3])
  const hits = (b: Box) =>
    boxes.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])
  const labels: {
    key: string
    x: number
    y: number
    anchor: string
    text: string
    seats: string
    change: string
  }[] = []
  const unplaced: string[] = []
  if (!narrow.value) {
    const order = ranges.map((r, i) => ({ r, i })).sort((p, q) => q.r.bloc.seats - p.r.bloc.seats)
    for (const { r } of order) {
      const first = seats[Math.min(r.from, n - 1)]
      const last = seats[Math.min(r.to - 1, n - 1)]
      const mid = (first.angle + last.angle) / 2
      const c = Math.cos(mid)
      const s = Math.sin(mid)
      const anchor = c > 0.3 ? 'start' : c < -0.3 ? 'end' : 'middle'
      const change = props.spec.years && previousYear.value ? fmtChange(r.bloc.change) : ''
      const text = `${r.bloc.label} ${r.bloc.seats}${change ? ` ${change}` : ''}`
      const w = textWidth(text)
      let placed = false
      for (const step of [0, 1, 2]) {
        const rad = R + t.dot + t.gap * 2 + step * t.line * 0.75
        const x = cx + c * rad
        const y = cy - s * rad
        const x0 = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2
        // Baseline: centred on the ray at the sides, sitting on it at the top.
        const base = anchor === 'middle' ? y - t.gap : y + t.line * 0.3
        const box: Box = [x0 - 2, base - t.line * 0.75, x0 + w + 2, base + t.line * 0.25]
        if (box[0] < 0 || box[2] > W || box[1] < 0 || hits(box)) continue
        boxes.push(box)
        labels.push({
          key: r.bloc.key,
          x,
          y: base,
          anchor,
          text: r.bloc.label,
          seats: String(r.bloc.seats),
          change,
        })
        placed = true
        break
      }
      if (!placed) unplaced.push(r.bloc.key)
    }
  }

  return {
    W,
    H,
    cx,
    cy,
    per,
    dots: seats.map((p, i) => ({
      x: cx + p.x,
      y: cy + p.y,
      bloc: owner[i] >= 0 ? ranges[owner[i]].bloc : null,
    })),
    r: t.dot / 2,
    majority,
    labels,
    unplaced,
  }
})

/** The list under the diagram: on narrow columns always; else only when a label found no room. */
const showList = computed(
  () => form.value === 'seats' && (narrow.value || (geo.value?.unplaced.length ?? 0) > 0),
)

// ── Bars ───────────────────────────────────────────────────────────────────
const barMax = computed(() =>
  Math.max(
    1e-9,
    ...elections.value.flatMap((e) =>
      blocsOf(e.parties).map((b) => (measure.value === 'share' ? (b.voteShare ?? 0) : b.seats)),
    ),
  ),
)
const nameWidth = computed(() => {
  void tok.value
  return Math.ceil(
    Math.min(width.value * 0.4 || 160, Math.max(24, ...blocs.value.map((b) => textWidth(b.label)))),
  )
})
const barValue = (b: Bloc) => (measure.value === 'share' ? (b.voteShare ?? 0) : b.seats)
const barText = (b: Bloc) => (measure.value === 'share' ? fmtShare(b.voteShare) : String(b.seats))

const meta = computed(() => {
  const e = shown.value?.election
  if (!e) return ''
  const parts = [e.date]
  if (form.value === 'seats' || measure.value === 'seats') parts.push(`${totalSeats.value} seats`)
  if (form.value === 'bars' && measure.value === 'share') parts.push('share of the vote')
  return parts.filter(Boolean).join(' · ')
})

function onFigureClick(e: MouseEvent) {
  const key = (e.target as Element).closest<SVGElement>('[data-key]')?.dataset.key
  if (key) toggle(key)
  else selectedKey.value = null
}

const ariaSummary = computed(() =>
  blocs.value
    .filter((b) => b.seats > 0 || measure.value === 'share')
    .map((b) => `${b.label} ${barText(b)}`)
    .join(', '),
)
</script>

<template>
  <div
    ref="rootRef"
    class="viz el"
    :class="{ 'el--fallback': fallback, 'el--narrow': narrow, 'el--selecting': !!selected }"
    role="group"
    :aria-labelledby="titleId"
    @keydown="onKeydown"
  >
    <small class="el__probe" aria-hidden="true" />
    <div class="el__header">
      <div :id="titleId" class="el__title">{{ title || shown?.election.name || 'Results' }}</div>
      <small class="el__meta">{{ meta }}</small>
    </div>
    <CdxToggleButtonGroup
      v-if="spec.years && elections.length > 1 && !fallback"
      v-model="year"
      class="el__years"
      :buttons="yearButtons"
      aria-label="Election"
    />

    <p v-if="!items.length" class="el__empty"><small>No results yet.</small></p>

    <!-- Plain list: the results as a table, restyled. Also the print rendering. -->
    <table v-if="items.length" class="el-fallback">
      <thead>
        <tr>
          <th scope="col"><small>Party</small></th>
          <th scope="col" class="el-fallback__n"><small>Seats</small></th>
          <th scope="col" class="el-fallback__n"><small>Vote</small></th>
          <th v-if="isLatest" scope="col" class="el-fallback__n"><small>±</small></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="b in blocs" :key="b.key">
          <th scope="row">
            <span
              class="el__swatch"
              :style="{ '--c': colorOf(b) }"
              :class="{ 'el__swatch--outline': outlined(colorOf(b)) }"
            />
            <a
              v-if="b.party?.sourceAnchor && isLatest && canShowSource"
              :href="`#${b.party.sourceAnchor.mentionId}`"
              @click.prevent="emit('select', b.party)"
              >{{ b.name }}</a
            ><template v-else>{{ b.name }}</template>
          </th>
          <td class="el-fallback__n">{{ b.seats }}</td>
          <td class="el-fallback__n">{{ fmtShare(b.voteShare) }}</td>
          <td v-if="isLatest" class="el-fallback__n">{{ fmtChange(b.change) }}</td>
        </tr>
      </tbody>
    </table>

    <div v-if="items.length && !fallback" class="el__rich">
      <!-- Seat diagram -->
      <template v-if="form === 'seats' && geo">
        <!-- eslint-disable-next-line vuejs-accessibility/click-events-have-key-events, vuejs-accessibility/no-static-element-interactions -->
        <svg
          class="el__svg"
          :width="geo.W"
          :height="geo.H"
          :viewBox="`0 0 ${geo.W} ${geo.H}`"
          role="img"
          :aria-label="`Seats: ${ariaSummary}`"
          @click="onFigureClick"
        >
          <g class="el__dots">
            <circle
              v-for="(d, i) in geo.dots"
              :key="i"
              class="el__dot"
              :class="{
                'el__dot--outline': d.bloc && outlined(colorOf(d.bloc)),
                'el__dot--dim': selected && d.bloc?.key !== selected.key,
              }"
              :r="geo.r"
              :data-key="d.bloc?.key"
              :style="{
                transform: `translate(${d.x}px, ${d.y}px)`,
                fill: d.bloc ? colorOf(d.bloc) : 'none',
              }"
            />
          </g>
          <g v-if="geo.majority" class="el__majority" aria-hidden="true">
            <line
              :x1="geo.majority.x1"
              :y1="geo.majority.y1"
              :x2="geo.majority.x2"
              :y2="geo.majority.y2"
            />
            <line
              :x1="geo.majority.ix1"
              :y1="geo.majority.iy1"
              :x2="geo.majority.ix2"
              :y2="geo.majority.iy2"
            />
          </g>
          <text class="el__total" :x="geo.cx" :y="geo.cy - tok.line * 1.1" text-anchor="middle">
            {{ totalSeats }}
          </text>
          <text class="el__centre" :x="geo.cx" :y="geo.cy - tok.gap" text-anchor="middle">
            <template v-if="shown?.election.majority">
              {{ shown.election.majority }} for a majority
            </template>
            <template v-else>seats</template>
          </text>
          <g
            v-for="l in geo.labels"
            :key="l.key"
            class="el__label"
            :class="{ 'el__label--dim': selected && selected.key !== l.key }"
            :data-key="l.key"
            role="button"
            tabindex="0"
            :aria-pressed="selected?.key === l.key"
            @keydown.enter.prevent="toggle(l.key)"
            @keydown.space.prevent="toggle(l.key)"
          >
            <text :x="l.x" :y="l.y" :text-anchor="l.anchor">
              <tspan class="el__label-name">{{ l.text }}</tspan>
              <tspan class="el__label-n">{{ `\u00a0${l.seats}` }}</tspan>
              <tspan v-if="l.change" class="el__label-change">{{ `\u00a0${l.change}` }}</tspan>
            </text>
          </g>
        </svg>
        <small v-if="geo.per > 1" class="el__note">Each dot is {{ geo.per }} seats.</small>
      </template>

      <!-- Bars -->
      <ol v-else-if="form === 'bars'" class="el__bars" :style="{ '--name-w': `${nameWidth}px` }">
        <li
          v-for="b in blocs"
          :key="b.key"
          class="el__bar-row"
          :class="{ 'el__bar-row--dim': selected && selected.key !== b.key }"
        >
          <button
            type="button"
            class="el__bar-btn"
            :aria-pressed="selected?.key === b.key"
            @click="toggle(b.key)"
          >
            <small class="el__bar-name">{{ b.label }}</small>
            <span class="el__bar-track">
              <span
                class="el__bar"
                :class="{ 'el__bar--outline': outlined(colorOf(b)) }"
                :style="{
                  width: `calc((100% - var(--viz-bar-value-room)) * ${barValue(b) / barMax})`,
                  '--c': colorOf(b),
                }"
              />
              <small class="el__bar-value"
                >{{ barText(b)
                }}<span
                  v-if="spec.years && previousYear && b.change !== undefined && measure === 'seats'"
                  class="el__label-change"
                >
                  {{ fmtChange(b.change) }}</span
                ></small
              >
            </span>
          </button>
        </li>
      </ol>

      <ul v-if="showList" class="el__list">
        <li
          v-for="b in blocs.filter((x) => x.seats > 0 && (narrow || geo?.unplaced.includes(x.key)))"
          :key="b.key"
          :class="{ 'el__list-item--dim': selected && selected.key !== b.key }"
        >
          <button
            type="button"
            class="el__list-btn"
            :aria-pressed="selected?.key === b.key"
            @click="toggle(b.key)"
          >
            <span
              class="el__swatch"
              :style="{ '--c': colorOf(b) }"
              :class="{ 'el__swatch--outline': outlined(colorOf(b)) }"
            />
            <small
              ><span class="el__label-name">{{ b.label }}</span
              ><span class="el__label-n">{{ `\u00a0${b.seats}` }}</span
              ><span v-if="spec.years && previousYear" class="el__label-change">{{
                `\u00a0${fmtChange(b.change)}`
              }}</span></small
            >
          </button>
        </li>
      </ul>

      <!-- The selected party -->
      <div v-if="selected" class="el__note-box" role="status">
        <div class="el__callout-name">{{ selected.name }}</div>
        <small class="el__callout-meta">
          {{ selected.seats }} {{ selected.seats === 1 ? 'seat' : 'seats'
          }}<template v-if="selected.voteShare !== undefined">
            · {{ fmtShare(selected.voteShare) }} of the vote</template
          ><template v-if="selected.change !== undefined && previousYear">
            · {{ fmtChange(selected.change) }} seats since {{ previousYear }}</template
          >
          <template v-else-if="selected.change !== undefined">
            · {{ fmtChange(selected.change) }} seats</template
          >
        </small>
        <small v-if="selected.members" class="el__callout-members">{{
          selected.members.map((m) => m.name).join(', ')
        }}</small>
        <button
          v-if="selected.party?.sourceAnchor && isLatest && canShowSource"
          type="button"
          class="el__link"
          @click="emit('select', selected.party)"
        >
          <small>Show in article</small>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Everything here reads ../tokens.css; no literal colours, weights or sizes. */
.el {
  display: flow-root;
  min-width: 0;
  margin-block: var(--viz-space-xxl);
  padding-block: var(--viz-space-l) var(--viz-space-xl);
  border-top: var(--viz-line-width) solid var(--viz-rule);
  border-bottom: var(--viz-line-width) solid var(--viz-rule-light);
  color: var(--viz-ink);
  font-family: var(--viz-font-family);
  position: relative;
}
.el__probe {
  position: absolute;
  visibility: hidden;
}
/* The same header as the timeline and the map: title, and its facts on the right. */
.el__header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0 var(--viz-space-m);
  margin-block-end: var(--viz-space-l);
}
.el__years {
  margin-block-end: var(--viz-space-l);
}
.el__title,
.el__callout-name {
  font-family: var(--viz-font-family);
  font-size: var(--viz-heading-size);
  font-weight: var(--viz-heading-weight);
  line-height: var(--viz-heading-line);
}
small,
.el__svg text {
  font-family: var(--viz-font-family);
  font-size: var(--viz-small-size);
  font-weight: var(--viz-small-weight);
  line-height: var(--viz-small-line);
}
.el__meta,
.el__note,
.el__empty {
  display: block;
  margin: 0;
  color: var(--viz-ink-tertiary);
}
.el__note {
  text-align: center;
  margin-top: var(--viz-space-xs);
}

/* Fallback table: hidden unless asked for, or printing. */
/* (Doubled class: the skins style article tables with more weight than one class.) */
.viz.el .el-fallback.el-fallback {
  display: none;
  width: 100%;
  margin: 0;
  border: 0;
  border-collapse: collapse;
  background: none;
}
.viz.el.el--fallback .el-fallback.el-fallback {
  display: table;
}
.el .el-fallback th,
.el .el-fallback td {
  padding: var(--viz-space-xs) var(--viz-space-s);
  border-bottom: var(--viz-line-width) solid var(--viz-rule-light);
  text-align: start;
  font-weight: var(--viz-small-weight);
  font-variant-numeric: tabular-nums;
}
.el-fallback thead th {
  color: var(--viz-ink-secondary);
  border-bottom-color: var(--viz-rule);
}
.el-fallback .el-fallback__n {
  text-align: end;
}
.el-fallback th[scope='row'] {
  display: flex;
  align-items: center;
  gap: var(--viz-space-s);
}

/* ── Seat diagram ───────────────────────────────────────────────────────── */
.el__svg {
  display: block;
  margin-inline: auto;
  overflow: visible;
  cursor: pointer;
}
.el__dot {
  transition:
    transform var(--viz-transition-step) ease-in-out,
    fill var(--viz-transition-step),
    opacity var(--viz-transition);
}
.el__dot--outline {
  stroke: var(--viz-party-outline);
  stroke-width: var(--viz-line-width);
}
.el__dot--dim,
.el__label--dim,
.el__bar-row--dim,
.el__list-item--dim {
  opacity: var(--viz-dim);
}
.el__majority line {
  stroke: var(--viz-majority);
  stroke-width: var(--viz-line-width);
}
.el__total {
  fill: var(--viz-ink);
  font-size: var(--viz-heading-size) !important;
  font-weight: var(--viz-heading-weight) !important;
}
.el__centre {
  fill: var(--viz-ink-tertiary);
}
.el__label {
  cursor: pointer;
  transition: opacity var(--viz-transition);
}
.el__label:focus {
  outline: none;
}
.el__label:focus-visible text {
  text-decoration: underline;
  text-decoration-color: var(--viz-accent);
}
.el__label-name {
  fill: var(--viz-ink);
  color: var(--viz-ink);
}
.el__label-n {
  fill: var(--viz-ink-secondary);
  color: var(--viz-ink-secondary);
}
.el__label-change {
  fill: var(--viz-ink-tertiary);
  color: var(--viz-ink-tertiary);
}

/* ── Bars ───────────────────────────────────────────────────────────────── */
/* (Lists inside the article: the skin's bullets and indents don't apply.) */
.el .el__bars,
.el .el__list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.el .el__bars > li,
.el .el__list > li {
  list-style: none;
  list-style-image: none;
  margin: 0;
}
.el__bar-row {
  margin: 0;
  transition: opacity var(--viz-transition);
}
.el__bar-btn {
  display: grid;
  grid-template-columns: var(--name-w, 6em) 1fr;
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
.el__bar-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--viz-ink);
}
.el__bar-track {
  display: flex;
  align-items: center;
  gap: var(--viz-space-s);
  min-width: 0;
}
.el__bar {
  flex: none;
  height: var(--viz-bar-height);
  min-width: var(--viz-line-width);
  background: var(--c);
  border-radius: var(--viz-radius);
  transition:
    width var(--viz-transition-step) ease-in-out,
    background-color var(--viz-transition-step);
}
.el__bar--outline {
  box-shadow: inset 0 0 0 var(--viz-line-width) var(--viz-party-outline);
}
.el__bar-value {
  color: var(--viz-ink-secondary);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.el__bar-btn:focus-visible .el__bar-name {
  outline: var(--viz-focus-width) solid var(--viz-accent);
}

/* ── List under the diagram (narrow columns) ────────────────────────────── */
.el .el__list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(8.5em, 1fr));
  gap: 0 var(--viz-space-m);
  margin-top: var(--viz-space-m);
}
.el__list li {
  margin: 0;
  transition: opacity var(--viz-transition);
}
.el__list-btn {
  display: flex;
  align-items: center;
  gap: var(--viz-space-s);
  padding: var(--viz-space-xs) 0;
  border: 0;
  background: none;
  color: inherit;
  cursor: pointer;
}
.el__swatch {
  flex: none;
  width: var(--viz-dot-size);
  height: var(--viz-dot-size);
  border-radius: 50%;
  background: var(--c);
}
.el__swatch--outline {
  box-shadow: inset 0 0 0 var(--viz-line-width) var(--viz-party-outline);
}

/* ── The selected party ─────────────────────────────────────────────────── */
.el__note-box {
  margin-top: var(--viz-space-m);
  padding-top: var(--viz-space-s);
  border-top: var(--viz-line-width) solid var(--viz-rule-light);
}
.el__callout-meta,
.el__callout-members {
  display: block;
  color: var(--viz-ink-secondary);
}
.el__callout-members {
  color: var(--viz-ink-tertiary);
}
.el__link {
  margin-top: var(--viz-space-xs);
  padding: 0;
  border: 0;
  background: none;
  color: var(--viz-accent);
  cursor: pointer;
}
.el__link:hover {
  text-decoration: underline;
}

@media print {
  .el__rich {
    display: none;
  }
  .viz.el .el-fallback.el-fallback {
    display: table;
  }
}
</style>
