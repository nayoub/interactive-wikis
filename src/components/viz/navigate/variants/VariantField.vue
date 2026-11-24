<script setup lang="ts">
/**
 * 1 · Events positioned in time. A field of small marks on a real time axis:
 * one mark per unique event (repeated mentions of the same event add no
 * mark). Columns are explicit, equal-duration bins; a mark goes into a bin
 * only when its date's precision fits inside it, and stacks count the
 * events in a bin. Durations and approximate dates that could fall in
 * several bins are drawn as spans below the axis instead.
 *
 *   field         horizontal, embedded below the introduction, with direct
 *                 labels the editor chose (leaders to their marks)
 *   field-margin  vertical, in the margin beside the article (time runs
 *                 down, counts run across, labels in the margin)
 *
 * Selecting a mark (click, Enter) shows its event in a card; nothing moves.
 * Read this passage, in the card, goes to the sentence.
 */
import { computed, inject, onBeforeUnmount, ref, watch, type Ref } from 'vue'

import { NAV, type NavContext } from '../context'
import EventList from '../EventList.vue'
import { msg } from '../messages'
import OccurrenceCard from '../OccurrenceCard.vue'
import { CATEGORY_LABEL, type Category, type Occurrence } from '../occurrences'
import ReturnBar from '../ReturnBar.vue'
import { formatWhen, interval, timeKind, yearLabel } from '../time'

const ctx = inject(NAV) as NavContext & { leadMount: Ref<HTMLElement | null>; margin: Ref<'start' | 'end' | null> }
const nav = ctx.nav
const occ = ctx.occurrences
const vertical = computed(() => ctx.variant === 'field-margin')
const inMargin = computed(() => vertical.value && ctx.margin.value === 'start')
const narrow = computed(() => ctx.width.value === 'narrow')

// ── Bins ───────────────────────────────────────────────────────────────────
const iv = occ.map((o) => interval(o.date))
const lo = Math.min(...iv.map((i) => i[0]))
const hi = Math.max(...iv.map((i) => i[1]))
const SIZES = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500]
const size = SIZES.find((s) => (hi - lo) / s <= 40) ?? 1000
const start = Math.floor(lo / size) * size
const nBins = Math.ceil((hi - start) / size)
const binOf = (y: number) => Math.floor((y - start) / size)

/** A mark sits in a bin only when the whole period its date names is inside that bin. */
const binned = occ.flatMap((o, k) => {
  const [a, b] = iv[k]
  if (timeKind(o.date) !== 'point') return []
  const i = binOf(a)
  return i === binOf(b - 1e-6) ? [{ o, bin: i }] : []
})
const spans = occ
  .map((o, k) => ({ o, a: iv[k][0], b: iv[k][1] }))
  .filter((s) => !binned.some((x) => x.o.id === s.o.id))
const bins = Array.from({ length: nBins }, (_, i) => ({
  i,
  from: start + i * size,
  marks: binned.filter((x) => x.bin === i).map((x) => x.o),
}))
const maxStack = Math.max(1, ...bins.map((b) => b.marks.length))

const CATS = [...new Set(occ.map((o) => o.category))] as Category[]
const SHAPE: Record<Category, string> = { work: 'circle', life: 'square', recognition: 'diamond', city: 'square', history: 'circle' }

// ── Geometry (horizontal) ───────────────────────────────────────────────────
const figEl = ref<HTMLElement | null>(null)
const width = ref(0)
let ro: ResizeObserver | null = null
watch(figEl, (el) => {
  ro?.disconnect()
  if (!el) return
  width.value = el.getBoundingClientRect().width
  ro = new ResizeObserver(([e]) => (width.value = e.contentRect.width))
  ro.observe(el)
})
onBeforeUnmount(() => ro?.disconnect())
const PAD = 8
const MARK = 9
const PITCH = 11
const binW = computed(() => (width.value - 2 * PAD) / nBins)
const xYear = (y: number) => PAD + ((y - start) / (nBins * size)) * (width.value - 2 * PAD)
const xBin = (i: number) => PAD + (i + 0.5) * binW.value
const fits = computed(() => binW.value >= MARK + 2)
const plotH = maxStack * PITCH + 6
/** Spans packed in rows under the axis; positions exact. */
const spanRows = computed(() => {
  const rows: number[] = []
  return spans
    .map((s) => ({ ...s, x0: xYear(s.a), x1: Math.max(xYear(s.b), xYear(s.a) + 4) }))
    .sort((p, q) => p.x0 - q.x0)
    .map((s) => {
      let r = rows.findIndex((end) => end + 4 <= s.x0)
      if (r === -1) {
        r = rows.length
        rows.push(s.x1)
      } else rows[r] = s.x1
      return { ...s, row: r }
    })
})
const nSpanRows = computed(() => Math.max(0, ...spanRows.value.map((s) => s.row + 1)))

/** Where each event's mark is (for direct labels and tooltips). */
function markPos(o: Occurrence): { x: number; y: number } | null {
  const b = binned.find((x) => x.o.id === o.id)
  if (b) {
    const k = bins[b.bin].marks.indexOf(o)
    return { x: xBin(b.bin), y: plotH - 3 - k * PITCH - MARK / 2 }
  }
  const s = spanRows.value.find((x) => x.o.id === o.id)
  return s ? { x: (s.x0 + s.x1) / 2, y: plotH + 30 + s.row * 10 } : null
}

/** Direct labels (editor's choice), staggered in rows so they never overlap; leaders drop to the mark. */
const LABEL_ROW = 18
const directs = computed(() => {
  if (!width.value) return []
  const rows: number[] = []
  return occ
    .filter((o) => o.direct)
    .map((o) => ({ o, pos: markPos(o)! }))
    .filter((d) => d.pos)
    .sort((a, b) => a.pos.x - b.pos.x)
    .map((d) => {
      const w = d.o.direct!.length * 7 + 8
      // Kept inside the figure; the leader still drops from the label to the mark's true position.
      const x0 = Math.max(0, Math.min(d.pos.x - 4, width.value - w))
      let r = rows.findIndex((end) => end <= x0)
      if (r === -1) {
        r = rows.length
        rows.push(x0 + w)
      } else rows[r] = x0 + w
      return { ...d, row: r, w, x0 }
    })
})
const labelRows = computed(() => Math.max(1, ...directs.value.map((d) => d.row + 1)))
const labelBand = computed(() => labelRows.value * LABEL_ROW + 8)

const ticks = computed(() => {
  // A labelled tick about every 70px, always on bin boundaries.
  const every = Math.max(1, Math.ceil(70 / Math.max(1, binW.value)))
  return Array.from({ length: Math.floor(nBins / every) + 1 }, (_, k) => k * every).filter((i) => i <= nBins)
})

// ── Focus / hover preview, selection ──────────────────────────────────────
const preview = ref<Occurrence | null>(null)
const selected = computed(() => (nav.selectedId.value ? (occ.find((o) => o.id === nav.selectedId.value) ?? null) : null))
const shown = computed(() => preview.value ?? selected.value)
function select(o: Occurrence) {
  nav.selectedId.value = nav.selectedId.value === o.id ? null : o.id
}
const aria = (o: Occurrence) =>
  `${formatWhen(o.date, ctx.era)}, ${o.label}. ${CATEGORY_LABEL[o.category]}${o.status !== 'occurred' ? `, ${o.status}` : ''}. Select to show; the card has Read this passage.`

// ── Vertical rows ──────────────────────────────────────────────────────────
const ROW = 22
const vSpanCols = computed(() => {
  const cols: number[] = []
  return spans
    .map((s) => ({ ...s, y0: ((s.a - start) / size) * ROW, y1: Math.max(((s.b - start) / size) * ROW, ((s.a - start) / size) * ROW + 4) }))
    .sort((p, q) => p.y0 - q.y0)
    .map((s) => {
      let c = cols.findIndex((end) => end + 3 <= s.y0)
      if (c === -1) {
        c = cols.length
        cols.push(s.y1)
      } else cols[c] = s.y1
      return { ...s, col: c }
    })
})
const nSpanCols = computed(() => Math.max(1, ...vSpanCols.value.map((s) => s.col + 1)))
const listOpen = computed(() => narrow.value || (!vertical.value && !fits.value))
</script>

<template>
  <!-- ── Horizontal field, embedded in the article ── -->
  <Teleport
    v-if="!vertical && ctx.leadMount.value"
    :to="ctx.leadMount.value"
  >
    <section
      class="vf"
      aria-labelledby="vf-title"
    >
      <h2
        id="vf-title"
        class="vf__title"
      >
        {{ ctx.collection.title }}: {{ msg.eventsCount(occ.length) }} in time
      </h2>
      <ul class="vf__legend">
        <li
          v-for="c in CATS"
          :key="c"
        >
          <span
            class="vf__shape"
            :class="`vf__shape--${SHAPE[c]}`"
          />{{ CATEGORY_LABEL[c] }}
        </li>
        <li><span class="vf__span-key" />{{ msg.duration }}</li>
        <li><span class="vf__span-key vf__span-key--approx" />{{ msg.approximate }}</li>
        <li v-if="occ.some((o) => o.status !== 'occurred')">
          <span class="vf__shape vf__shape--circle vf__shape--expected" />{{ msg.expectedMark }}
        </li>
      </ul>

      <p
        class="vf__readout"
        aria-hidden="true"
      >
        <template v-if="shown">
          <b>{{ formatWhen(shown.date, ctx.era) }}</b> {{ shown.label }}
        </template>
      </p>
      <div
        ref="figEl"
        class="vf__fig"
        role="group"
        :aria-label="`${occ.length} events, ${yearLabel(start)} to ${yearLabel(start + nBins * size)}`"
      >
        <template v-if="width && fits">
          <!-- direct labels -->
          <div
            class="vf__labels"
            :style="{ height: `${labelBand}px` }"
            aria-hidden="true"
          >
            <template
              v-for="d in directs"
              :key="d.o.id"
            >
              <span
                class="vf__direct"
                :class="{ 'vf__direct--selected': nav.selectedId.value === d.o.id }"
                :style="{ insetInlineStart: `${d.x0}px`, insetBlockStart: `${d.row * LABEL_ROW}px` }"
              >{{ d.o.direct }}</span>
              <span
                class="vf__leader"
                :style="{
                  insetInlineStart: `${d.pos.x}px`,
                  insetBlockStart: `${d.row * LABEL_ROW + 16}px`,
                  height: `${labelBand - d.row * LABEL_ROW - 16 + d.pos.y - MARK / 2}px`,
                }"
              />
            </template>
          </div>
          <!-- stacked marks -->
          <div
            class="vf__plot"
            :style="{ height: `${plotH}px` }"
          >
            <div
              v-for="b in bins"
              :key="b.i"
              class="vf__bin"
              :style="{ insetInlineStart: `${PAD + b.i * binW}px`, inlineSize: `${binW}px` }"
            />
            <template
              v-for="b in bins"
              :key="'m' + b.i"
            >
              <button
                v-for="(o, k) in b.marks"
                :key="o.id"
                type="button"
                class="vf__mark"
                :class="[
                  `vf__mark--${SHAPE[o.category]}`,
                  { 'vf__mark--selected': nav.selectedId.value === o.id, 'vf__mark--in-view': nav.inView.value.includes(o.id), 'vf__mark--expected': o.status !== 'occurred' },
                ]"
                :style="{ insetInlineStart: `${xBin(b.i)}px`, insetBlockEnd: `${3 + k * PITCH}px` }"
                :aria-label="aria(o)"
                :aria-pressed="nav.selectedId.value === o.id ? 'true' : 'false'"
                @click="select(o)"
                @mouseenter="preview = o"
                @mouseleave="preview = null"
                @focus="preview = o"
                @blur="preview = null"
              />
            </template>
          </div>
          <!-- axis: bin boundaries and labelled years -->
          <div
            class="vf__axis"
            aria-hidden="true"
          >
            <span
              v-for="i in ticks"
              :key="i"
              class="vf__tick"
              :style="{ insetInlineStart: `${PAD + i * binW}px` }"
            >
              <span
                class="vf__tick-label"
                :class="{ 'vf__tick-label--start': i === 0, 'vf__tick-label--end': PAD + i * binW > width - 24 }"
              >{{ yearLabel(start + i * size, ctx.era) }}</span>
            </span>
          </div>
          <!-- durations and approximate dates -->
          <div
            class="vf__spans"
            :style="{ height: `${nSpanRows * 10 + 4}px` }"
          >
            <button
              v-for="s in spanRows"
              :key="s.o.id"
              type="button"
              class="vf__span"
              :class="{
                'vf__span--approx': timeKind(s.o.date) === 'approximate',
                'vf__span--selected': nav.selectedId.value === s.o.id,
                'vf__span--expected': s.o.status !== 'occurred',
              }"
              :style="{ insetInlineStart: `${s.x0}px`, inlineSize: `${s.x1 - s.x0}px`, insetBlockStart: `${s.row * 10}px` }"
              :aria-label="aria(s.o)"
              :aria-pressed="nav.selectedId.value === s.o.id ? 'true' : 'false'"
              @click="select(s.o)"
              @mouseenter="preview = s.o"
              @mouseleave="preview = null"
              @focus="preview = s.o"
              @blur="preview = null"
            />
          </div>
        </template>
      </div>
      <p class="vf__note">
        {{ msg.binNote(size, yearLabel(start, ctx.era), yearLabel(start + size - 1, ctx.era)) }} {{ msg.spansNote }}
        {{ msg.blankMeaning }}
      </p>
      <OccurrenceCard
        class="vf__card"
        :occurrence="selected"
      />
      <details
        class="vf__list"
        :open="listOpen"
      >
        <summary>{{ msg.listAll(occ.length) }}</summary>
        <EventList
          :events="occ"
          open="all"
          :collapsible="false"
          show-section
        />
      </details>
    </section>
  </Teleport>

  <!-- ── Vertical field, in the margin (or below the introduction when there is no margin) ── -->
  <Teleport
    v-if="vertical && (inMargin || ctx.leadMount.value)"
    :to="inMargin ? '#tn-margin-start' : ctx.leadMount.value!"
    defer
  >
    <section
      class="vv"
      :class="{ 'vv--margin': inMargin }"
      aria-labelledby="vv-title"
    >
      <h2
        id="vv-title"
        class="vf__title"
      >
        {{ msg.eventsCount(occ.length) }} in time
      </h2>
      <p class="vf__note">
        {{ msg.binNoteVertical(size) }}
      </p>
      <div
        class="vv__fig"
        :style="{ height: `${nBins * ROW}px`, '--vv-spans': `${nSpanCols * 6}px` }"
      >
        <div
          v-for="b in bins"
          :key="b.i"
          class="vv__row"
          :style="{ insetBlockStart: `${b.i * ROW}px`, height: `${ROW}px` }"
        >
          <span class="vv__year">{{ b.i % (size >= 10 ? 1 : 2) === 0 ? yearLabel(b.from, ctx.era) : '' }}</span>
          <span class="vv__marks">
            <button
              v-for="o in b.marks"
              :key="o.id"
              type="button"
              class="vf__mark vv__mark"
              :class="[
                `vf__mark--${SHAPE[o.category]}`,
                { 'vf__mark--selected': nav.selectedId.value === o.id, 'vf__mark--in-view': nav.inView.value.includes(o.id), 'vf__mark--expected': o.status !== 'occurred' },
              ]"
              :aria-label="aria(o)"
              :aria-pressed="nav.selectedId.value === o.id ? 'true' : 'false'"
              @click="select(o)"
              @mouseenter="preview = o"
              @mouseleave="preview = null"
              @focus="preview = o"
              @blur="preview = null"
            />
          </span>
          <span class="vv__label">
            <template v-if="shown && b.marks.includes(shown)"><b>{{ formatWhen(shown.date, ctx.era) }}</b> {{ shown.label }}</template>
            <template v-else>{{ b.marks.filter((o) => o.direct).map((o) => o.direct).join(' · ') }}</template>
          </span>
        </div>
        <button
          v-for="s in vSpanCols"
          :key="s.o.id"
          type="button"
          class="vv__span"
          :class="{ 'vf__span--approx': timeKind(s.o.date) === 'approximate', 'vf__span--selected': nav.selectedId.value === s.o.id, 'vf__span--expected': s.o.status !== 'occurred' }"
          :style="{ insetBlockStart: `${s.y0}px`, blockSize: `${s.y1 - s.y0}px`, insetInlineStart: `calc(3.4em + ${s.col * 6}px)` }"
          :aria-label="aria(s.o)"
          :aria-pressed="nav.selectedId.value === s.o.id ? 'true' : 'false'"
          @click="select(s.o)"
          @mouseenter="preview = s.o"
          @mouseleave="preview = null"
          @focus="preview = s.o"
          @blur="preview = null"
        />
      </div>
      <OccurrenceCard
        class="vf__card"
        :occurrence="selected"
        compact
      />
      <details
        class="vf__list"
        :open="narrow"
      >
        <summary>{{ msg.listAll(occ.length) }}</summary>
        <EventList
          :events="occ"
          open="all"
          :collapsible="false"
          show-section
        />
      </details>
    </section>
  </Teleport>

  <ReturnBar />
</template>

<style scoped>
.vf,
.vv {
  font-family: var(--font-family-base);
}
.vf {
  padding-block: var(--spacing-75);
  border-block: var(--border-width-base) solid var(--border-color-base);
}
.mw-parser-output .vf__title,
.vf__title {
  margin: 0 0 var(--spacing-25);
  padding: 0;
  border: 0;
  font-family: var(--font-family-base);
  font-size: var(--font-size-medium);
  line-height: var(--line-height-medium);
  font-weight: var(--font-weight-bold);
}
.mw-parser-output .vf__legend,
.vf__legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-25) var(--spacing-100);
  margin: 0 0 var(--spacing-50);
  padding: 0;
  list-style: none;
  color: var(--color-subtle);
  font-size: var(--font-size-small);
}
.mw-parser-output .vf__legend li,
.vf__legend li {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-25);
  margin: 0;
}
.vf__note {
  margin: var(--spacing-25) 0 var(--spacing-75);
  color: var(--color-subtle);
  font-size: var(--font-size-small);
  line-height: var(--line-height-small);
}
.vf__fig {
  position: relative;
}
.vf__labels {
  position: relative;
}
.vf__readout {
  min-height: 1.5em;
  margin: 0 0 var(--spacing-25);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-small);
  line-height: 1.5;
}
.vf__tick-label--start {
  transform: none !important;
}
.vf__tick-label--end {
  transform: translateX(-100%) !important;
}
.vf__direct {
  position: absolute;
  z-index: 1;
  padding-inline-end: 2px;
  background: var(--background-color-base);
  white-space: nowrap;
  color: var(--color-base);
  font-size: var(--font-size-small);
  line-height: 16px;
}
.vf__direct--selected {
  color: var(--color-progressive);
  font-weight: var(--font-weight-bold);
}
.vf__leader {
  position: absolute;
  width: 0;
  border-inline-start: var(--border-width-base) solid var(--border-color-base);
  pointer-events: none;
}
.vf__plot {
  position: relative;
}
.vf__bin {
  position: absolute;
  inset-block: 0;
  border-inline-start: var(--border-width-base) solid var(--border-color-subtle);
}
.vf__bin:nth-child(even) {
  background: var(--background-color-interactive-subtle);
}

/* Marks: one size; shape says the category; ink by default. */
.vf__mark {
  position: absolute;
  width: 9px;
  height: 9px;
  margin-inline-start: -4.5px;
  padding: 0;
  border: 0;
  background: var(--color-base);
  cursor: pointer;
}
.vv__mark {
  position: static;
  margin: 0;
  flex: none;
}
.vf__mark--circle {
  border-radius: 50%;
}
.vf__mark--diamond {
  transform: rotate(45deg) scale(0.85);
}
.vf__mark--expected {
  background: var(--background-color-base);
  border: 1.5px dashed var(--color-base);
}
.vf__mark:hover,
.vf__mark:focus-visible {
  background: var(--color-progressive);
}
.vf__mark:focus-visible {
  outline: var(--border-width-thick) solid var(--outline-color-progressive--focus);
  outline-offset: 2px;
}
/* Selected: accent fill and a ring (a shape change, not only colour). */
.vf__mark--selected {
  background: var(--color-progressive);
  box-shadow:
    0 0 0 2px var(--background-color-base),
    0 0 0 4px var(--color-progressive);
}
/* Passage on screen: a thin neutral underline below the mark. */
.vf__mark--in-view::after {
  content: '';
  position: absolute;
  inset-inline: -1px;
  inset-block-end: -4px;
  height: 2px;
  background: var(--color-subtle);
}
.vf__mark--diamond.vf__mark--in-view::after {
  transform: rotate(-45deg);
}

.vf__axis {
  position: relative;
  height: 22px;
  border-block-start: var(--border-width-base) solid var(--color-base);
}
.vf__tick {
  position: absolute;
  inset-block-start: 0;
  height: 4px;
  border-inline-start: var(--border-width-base) solid var(--color-base);
}
.vf__tick-label {
  position: absolute;
  inset-block-start: 4px;
  transform: translateX(-50%);
  color: var(--color-subtle);
  font-size: var(--font-size-x-small, 12px);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  unicode-bidi: plaintext;
}
[dir='rtl'] .vf__tick-label {
  transform: translateX(50%);
}
.vf__spans {
  position: relative;
  margin-block-start: 2px;
}
.vf__span,
.vv__span {
  position: absolute;
  height: 6px;
  padding: 0;
  border: 0;
  background: var(--color-base);
  cursor: pointer;
}
.vv__span {
  width: 4px;
  height: auto;
}
.vf__span--approx {
  background: transparent;
  border: 1.5px dotted var(--color-base);
}
.vf__span--expected {
  background: transparent;
  border: 1.5px dashed var(--color-base);
}
.vf__span:hover,
.vf__span:focus-visible,
.vf__span--selected,
.vv__span:hover,
.vv__span:focus-visible {
  background: var(--color-progressive);
  border-color: var(--color-progressive);
}
.vf__span:focus-visible,
.vv__span:focus-visible {
  outline: var(--border-width-thick) solid var(--outline-color-progressive--focus);
  outline-offset: 2px;
}
.vf__tip {
  position: absolute;
  inset-block-start: 0;
  max-width: 340px;
  padding: 2px var(--spacing-50);
  transform: translateX(-50%);
  background: var(--background-color-base);
  border: var(--border-width-base) solid var(--border-color-base);
  border-radius: var(--border-radius-base);
  box-shadow: var(--box-shadow-small, 0 1px 2px rgba(0, 0, 0, 0.15));
  font-size: var(--font-size-small);
  line-height: var(--line-height-small);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  pointer-events: none;
}
[dir='rtl'] .vf__tip {
  transform: translateX(50%);
}
.vf__card {
  min-height: 7em;
  margin-block-start: var(--spacing-50);
  padding: var(--spacing-50) var(--spacing-75);
  border-inline-start: 3px solid var(--color-progressive);
  background: var(--background-color-interactive-subtle);
}
.vf__list {
  margin-block-start: var(--spacing-75);
  font-size: var(--font-size-small);
}
.vf__list summary {
  cursor: pointer;
  color: var(--color-progressive);
}
.vf__list[open] summary {
  margin-block-end: var(--spacing-50);
}
.vf__shape {
  display: inline-block;
  width: 9px;
  height: 9px;
  background: var(--color-base);
}
.vf__shape--circle {
  border-radius: 50%;
}
.vf__shape--diamond {
  transform: rotate(45deg) scale(0.85);
}
.vf__shape--expected {
  background: transparent;
  border: 1.5px dashed var(--color-base);
}
.vf__span-key {
  display: inline-block;
  width: 22px;
  height: 6px;
  background: var(--color-base);
}
.vf__span-key--approx {
  background: transparent;
  border: 1.5px dotted var(--color-base);
}

/* Vertical: time runs down in equal rows; counts run across. */
.vv {
  padding-block: var(--spacing-75);
}
.vv--margin {
  position: sticky;
  inset-block-start: var(--spacing-100);
  max-height: calc(100vh - 2 * var(--spacing-100));
  overflow-y: auto;
  padding-block-start: 0;
  padding-inline-end: var(--spacing-50);
  overscroll-behavior: contain;
}
.vv__fig {
  position: relative;
  border-inline-start: 0;
}
.vv__row {
  position: absolute;
  inset-inline: 0;
  display: grid;
  grid-template-columns: 3.4em var(--vv-spans) auto minmax(0, 1fr);
  align-items: center;
  gap: 0 var(--spacing-25);
  border-block-start: var(--border-width-base) solid var(--border-color-subtle);
  font-size: var(--font-size-x-small, 12px);
  line-height: 1.2;
}
.vv__year {
  grid-column: 1;
  color: var(--color-subtle);
  font-variant-numeric: tabular-nums;
  unicode-bidi: plaintext;
}
.vv__marks {
  grid-column: 3;
  display: flex;
  gap: 2px;
  align-items: center;
}
.vv__label {
  grid-column: 4;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-base);
}
.vv .vf__card {
  min-height: 8em;
}
</style>
