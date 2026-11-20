<script setup lang="ts">
/**
 * Curate, for a Visual built from a table: what each column is (proposed by
 * the rules, editable), which form fits (small previews of the real data), and
 * the parties — one row each, in an order the editor can drag, with small
 * parties grouped as "Others" under a threshold the editor sets.
 *
 * The starting order is the article's own (its infobox); no political
 * left–right order is inferred.
 */
import { computed, ref } from 'vue'
import { CdxButton, CdxIcon, CdxSelect, CdxTextInput } from '@wikimedia/codex'
import { cdxIconArticle, cdxIconDraggable, cdxIconTable } from '@wikimedia/codex-icons'

import type { LoadedArticle } from '../host/loadArticle'
import { electionsOf, groupedOut } from '../model/parties'
import type { ColumnRole, Draft, Party, VisualForm } from '../model/types'
import { proposeRoles } from '../pick/tables'
import { hemicycle } from '../render/hemicycle'
import { applyTable, formsFor, tableOf } from './visual'

const props = defineProps<{ article: LoadedArticle }>()
const draft = defineModel<Draft>('draft', { required: true })
const emit = defineEmits<{ showSource: [party: Party]; showTable: [] }>()

const spec = computed(() => draft.value.spec!)
const items = computed(() => draft.value.items as Party[])
const table = computed(() => tableOf(props.article, spec.value.tableId))
const reasons = computed(() =>
  table.value
    ? proposeRoles(table.value, props.article.infobox.chamberSize).map((p) => p.reason)
    : [],
)
const proposed = computed(() =>
  table.value
    ? proposeRoles(table.value, props.article.infobox.chamberSize).map((p) => p.role)
    : [],
)

// ── Columns ────────────────────────────────────────────────────────────────
const ROLE_LABEL: Record<ColumnRole, string> = {
  category: 'Party names',
  seats: 'Seats',
  votes: 'Votes',
  share: 'Share of the vote',
  change: 'Seat change',
  ignore: 'Not used',
}
const roleItems = (Object.keys(ROLE_LABEL) as ColumnRole[]).map((r) => ({
  value: r,
  label: ROLE_LABEL[r],
}))
const columnsOpen = ref(true)
const changedRoles = computed(() => spec.value.roles.some((r, i) => r !== proposed.value[i]))

function setRole(col: number, role: ColumnRole) {
  if (!table.value) return
  // One column per role (except "not used").
  const roles = spec.value.roles.map((r, i) =>
    i === col ? role : r === role && role !== 'ignore' ? 'ignore' : r,
  )
  rebuild(roles)
}
function resetRoles() {
  rebuild(null)
}
function rebuild(roles: ColumnRole[] | null) {
  if (!table.value) return
  const next = applyTable(props.article, table.value, roles, {
    items: items.value,
    spec: spec.value,
  })
  draft.value.items = next.items
  draft.value.spec = next.spec
}
const used = computed(
  () => spec.value.roles.map((r, i) => ({ i, r })).filter(({ r }) => r !== 'ignore').length,
)

// ── Forms that fit ─────────────────────────────────────────────────────────
const years = computed(() => electionsOf(items.value, spec.value).map((e) => e.year))
const forms = computed(() =>
  formsFor(spec.value.roles, spec.value.previous.length > 0).map((f) => ({
    ...f,
    id: `${f.form}${f.years ? '-years' : ''}`,
    label:
      f.form === 'bars'
        ? 'Bars'
        : f.years
          ? `Seat diagram, ${years.value[0]}–${years.value[years.value.length - 1]}`
          : 'Seat diagram',
  })),
)
function chooseForm(form: VisualForm, withYears: boolean) {
  draft.value.spec = { ...spec.value, form, years: withYears }
}
const isForm = (f: { form: VisualForm; years: boolean }) =>
  spec.value.form === f.form && spec.value.years === f.years

/** Thumbnail data: a small hemicycle of the real seats (one dot per ~8 seats), or the top bars. */
const withSeats = computed(() => items.value.filter((p) => (p.seats ?? 0) > 0))
const thumbDots = computed(() => {
  const total = withSeats.value.reduce((s, p) => s + (p.seats ?? 0), 0)
  if (!total) return []
  const n = Math.min(72, total)
  const { seats } = hemicycle(n, 26, 0.4)
  let cum = 0
  const bounds = withSeats.value.map((p) => {
    cum += p.seats ?? 0
    return { p, to: Math.round((cum / total) * n) }
  })
  return seats.map((s, i) => ({
    x: 48 + s.x,
    y: 34 + s.y,
    c: bounds.find((b) => i < b.to)?.p.color,
  }))
})
const thumbBars = computed(() => {
  const by = spec.value.roles.includes('seats') ? 'seats' : 'voteShare'
  const list = [...items.value].filter((p) => (p[by] ?? 0) > 0).slice(0, 5)
  const max = Math.max(1, ...list.map((p) => p[by] ?? 0))
  return list.map((p, i) => ({ y: 8 + i * 9, w: ((p[by] ?? 0) / max) * 64, c: p.color }))
})

// ── Parties: order and grouping ────────────────────────────────────────────
const measure = computed(() => (spec.value.form === 'bars' ? spec.value.measure : 'seats'))
const grouped = computed(
  () => new Set(groupedOut(items.value, spec.value, measure.value).map((p) => p.id)),
)
const listed = computed(() => items.value.filter((p) => !grouped.value.has(p.id)))
const others = computed(() => items.value.filter((p) => grouped.value.has(p.id)))
const othersOpen = ref(false)

const thresholdModel = computed({
  get: () => String(measure.value === 'share' ? spec.value.minShare : spec.value.minSeats),
  set: (v: string) => {
    const n = Math.max(0, Number(v) || 0)
    draft.value.spec =
      measure.value === 'share'
        ? { ...spec.value, minShare: n }
        : { ...spec.value, minSeats: Math.round(n) }
  },
})

/** Move a listed party to another listed position; grouped parties keep their place at the end. */
function move(from: number, to: number) {
  const list = [...listed.value]
  if (to < 0 || to >= list.length || from === to) return
  const [p] = list.splice(from, 1)
  list.splice(to, 0, p)
  draft.value.items = [...list, ...others.value]
}
const infoboxOrder = computed(() => {
  const fresh = table.value
    ? applyTable(props.article, table.value, spec.value.roles, null).items
    : []
  return fresh.map((p) => p.key)
})
const reordered = computed(() => items.value.some((p, i) => infoboxOrder.value[i] !== p.key))
function resetOrder() {
  const rank = new Map(infoboxOrder.value.map((k, i) => [k, i]))
  draft.value.items = [...items.value].sort(
    (a, b) => (rank.get(a.key) ?? 1e9) - (rank.get(b.key) ?? 1e9),
  )
}

// Drag by the handle (pointer), or arrow keys on it.
const listRef = ref<HTMLElement | null>(null)
const dragging = ref<string | null>(null)
function onHandleDown(e: PointerEvent, id: string) {
  if (e.button !== 0) return
  dragging.value = id
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}
function onHandleMove(e: PointerEvent) {
  if (!dragging.value || !listRef.value) return
  const rows = Array.from(listRef.value.querySelectorAll<HTMLElement>(':scope > li'))
  const from = listed.value.findIndex((p) => p.id === dragging.value)
  let to = rows.findIndex((row) => {
    const r = row.getBoundingClientRect()
    return e.clientY < r.top + r.height / 2
  })
  if (to === -1) to = rows.length - 1
  else if (to > from) to -= 1
  if (to !== from) move(from, to)
}
function onHandleUp() {
  dragging.value = null
}
const announce = ref('')
function onHandleKey(e: KeyboardEvent, index: number) {
  const delta = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0
  if (!delta) return
  e.preventDefault()
  const to = index + delta
  if (to < 0 || to >= listed.value.length) return
  const p = listed.value[index]
  move(index, to)
  announce.value = `${p.label}, position ${to + 1} of ${listed.value.length}`
  // Keep focus on the moved row's handle.
  requestAnimationFrame(() =>
    listRef.value?.querySelectorAll<HTMLElement>('.vc__handle')[to]?.focus(),
  )
}

const figures = (p: Party) =>
  [
    p.seats !== undefined ? `${p.seats} ${p.seats === 1 ? 'seat' : 'seats'}` : '',
    p.voteShare !== undefined ? `${p.voteShare}%` : '',
  ]
    .filter(Boolean)
    .join(' · ')
</script>

<template>
  <div class="vc viz">
    <!-- The table -->
    <div class="vc__source">
      <CdxIcon :icon="cdxIconTable" size="small" />
      <small
        >From the table in “{{ table?.sectionTitle }}”<template
          v-if="table?.caption && table.caption !== table.sectionTitle"
          >: {{ table.caption }}</template
        >. Tap another table to switch.</small
      >
      <button type="button" class="vc__link" @click="emit('showTable')"><small>Show</small></button>
    </div>

    <!-- Columns -->
    <section class="vc__section">
      <button
        type="button"
        class="vc__disclosure"
        :aria-expanded="columnsOpen"
        @click="columnsOpen = !columnsOpen"
      >
        <span class="vc__h">Columns</span>
        <small>{{ used }} of {{ spec.headers.length }} used</small>
      </button>
      <div v-show="columnsOpen">
        <ol class="vc__cols">
          <li
            v-for="(h, i) in spec.headers"
            :key="i"
            class="vc__col"
            :class="{ 'vc__col--off': spec.roles[i] === 'ignore' }"
          >
            <div class="vc__col-head">
              <span class="vc__col-name">{{ h || `Column ${i + 1}` }}</span>
              <small class="vc__reason">{{ reasons[i] }}</small>
            </div>
            <CdxSelect
              class="vc__role"
              :selected="spec.roles[i]"
              :menu-items="roleItems"
              :aria-label="`${h || `Column ${i + 1}`}: what it is`"
              @update:selected="setRole(i, $event as ColumnRole)"
            />
          </li>
        </ol>
        <CdxButton v-if="changedRoles" size="small" weight="quiet" @click="resetRoles"
          >Use the proposed roles</CdxButton
        >
      </div>
    </section>

    <!-- Forms that fit -->
    <section v-if="forms.length" class="vc__section">
      <div class="vc__h">Show as</div>
      <div class="vc__forms" role="radiogroup" aria-label="Show as">
        <button
          v-for="f in forms"
          :key="f.id"
          type="button"
          role="radio"
          class="vc__form"
          :class="{ 'vc__form--on': isForm(f) }"
          :aria-checked="isForm(f)"
          @click="chooseForm(f.form, f.years)"
        >
          <svg class="vc__thumb" viewBox="0 0 96 48" aria-hidden="true">
            <template v-if="f.form === 'seats'">
              <circle
                v-for="(d, i) in thumbDots"
                :key="i"
                :cx="d.x"
                :cy="d.y"
                r="1.6"
                :style="{ fill: d.c ?? 'var(--viz-others)' }"
              />
              <g v-if="f.years" class="vc__thumb-years">
                <rect x="58" y="40" width="10" height="5" />
                <rect x="70" y="40" width="10" height="5" />
                <rect x="82" y="40" width="10" height="5" class="vc__thumb-on" />
              </g>
            </template>
            <template v-else>
              <rect
                v-for="(b, i) in thumbBars"
                :key="i"
                x="20"
                :y="b.y"
                :width="b.w"
                height="5"
                :style="{ fill: b.c ?? 'var(--viz-others)' }"
              />
              <line x1="18" y1="5" x2="18" y2="47" class="vc__thumb-axis" />
            </template>
          </svg>
          <small>{{ f.label }}</small>
        </button>
      </div>
      <div
        v-if="spec.form === 'bars' && spec.roles.includes('seats') && spec.roles.includes('share')"
        class="vc__measure"
      >
        <small>Bars show</small>
        <span class="vc__seg" role="radiogroup" aria-label="Bars show">
          <button
            type="button"
            role="radio"
            :aria-checked="spec.measure === 'seats'"
            :class="{ on: spec.measure === 'seats' }"
            @click="draft.spec = { ...spec, measure: 'seats' }"
          >
            <small>Seats</small>
          </button>
          <button
            type="button"
            role="radio"
            :aria-checked="spec.measure === 'share'"
            :class="{ on: spec.measure === 'share' }"
            @click="draft.spec = { ...spec, measure: 'share' }"
          >
            <small>Share of the vote</small>
          </button>
        </span>
      </div>
    </section>

    <!-- Parties -->
    <section class="vc__section">
      <div class="vc__row">
        <div class="vc__h">Order</div>
        <small class="vc__muted">{{ reordered ? 'Your order' : 'As in the infobox' }}</small>
        <CdxButton v-if="reordered" size="small" weight="quiet" class="vc__push" @click="resetOrder"
          >Infobox order</CdxButton
        >
      </div>
      <ol ref="listRef" class="vc__parties" :class="{ 'vc__parties--dragging': dragging }">
        <li
          v-for="(p, i) in listed"
          :key="p.id"
          class="vc__party"
          :class="{ 'vc__party--drag': dragging === p.id }"
        >
          <button
            type="button"
            class="vc__handle"
            :aria-label="`Move ${p.label}, position ${i + 1} of ${listed.length}. Use arrow keys.`"
            @pointerdown="onHandleDown($event, p.id)"
            @pointermove="onHandleMove"
            @pointerup="onHandleUp"
            @pointercancel="onHandleUp"
            @keydown="onHandleKey($event, i)"
          >
            <CdxIcon :icon="cdxIconDraggable" size="small" />
          </button>
          <span
            class="vc__swatch"
            :style="{ '--c': p.color ?? 'var(--viz-others)' }"
            :title="p.colorSource ?? 'No colour in the table'"
          />
          <div class="vc__party-main">
            <input v-model="p.label" class="vc__name" :aria-label="`Short name for ${p.name}`" />
            <small class="vc__muted">{{ p.name }} · {{ figures(p) }}</small>
          </div>
          <button
            type="button"
            class="vc__icon"
            :aria-label="`Show ${p.name} in the table`"
            @click="emit('showSource', p)"
          >
            <CdxIcon :icon="cdxIconArticle" size="small" />
          </button>
        </li>
      </ol>
      <span class="vc__sr" aria-live="polite">{{ announce }}</span>

      <div class="vc__group">
        <label class="vc__threshold">
          <small>Group as Others under</small>
          <CdxTextInput
            v-model="thresholdModel"
            input-type="number"
            class="vc__num"
            :aria-label="measure === 'share' ? 'Percent of the vote' : 'Seats'"
          />
          <small>{{
            measure === 'share' ? '% of the vote' : thresholdModel === '1' ? 'seat' : 'seats'
          }}</small>
        </label>
        <button
          v-if="others.length"
          type="button"
          class="vc__disclosure"
          :aria-expanded="othersOpen"
          @click="othersOpen = !othersOpen"
        >
          <small>Others: {{ others.length }} {{ others.length === 1 ? 'party' : 'parties' }}</small>
        </button>
        <ul v-if="othersOpen" class="vc__others">
          <li v-for="p in others" :key="p.id">
            <small>{{ p.name }} · {{ figures(p) }}</small>
          </li>
        </ul>
      </div>
    </section>
  </div>
</template>

<style scoped>
.vc__section {
  padding-block: var(--spacing-75);
  border-top: var(--border-width-base, 1px) solid var(--border-color-subtle);
}
.vc__source {
  display: flex;
  align-items: baseline;
  gap: var(--spacing-50);
  padding-block: var(--spacing-25) var(--spacing-75);
  color: var(--color-subtle);
}
.vc__source .cdx-icon {
  align-self: center;
  color: var(--color-subtle);
}
.vc__h {
  font-weight: var(--font-weight-bold);
}
.vc__row {
  display: flex;
  align-items: baseline;
  gap: var(--spacing-50);
  margin-bottom: var(--spacing-25);
}
.vc__push {
  margin-inline-start: auto;
}
.vc__muted,
.vc__reason {
  color: var(--color-subtle);
}
.vc__link {
  margin-inline-start: auto;
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-progressive);
  cursor: pointer;
}
.vc__disclosure {
  display: flex;
  align-items: baseline;
  gap: var(--spacing-50);
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}
.vc__disclosure::before {
  content: '';
  align-self: center;
  width: 0;
  height: 0;
  border: 4px solid transparent;
  border-inline-start-color: currentColor;
  transition: transform var(--transition-duration-base, 100ms);
  transform-origin: 25% 50%;
}
.vc__disclosure[aria-expanded='true']::before {
  transform: rotate(90deg);
}
.vc__disclosure small {
  color: var(--color-subtle);
}
.vc__cols {
  list-style: none;
  margin: var(--spacing-50) 0 0;
  padding: 0;
}
.vc__col {
  display: flex;
  align-items: center;
  gap: var(--spacing-75);
  margin: 0;
  padding-block: var(--spacing-25);
}
.vc__col-head {
  flex: 1;
  min-width: 0;
}
.vc__col-name {
  display: block;
  overflow-wrap: anywhere;
}
.vc__col--off .vc__col-name {
  color: var(--color-subtle);
}
.vc__reason {
  display: block;
}
.vc__role {
  flex: none;
  width: 11.5em;
  min-width: 0;
}
/* Codex selects default to 256px; here the column name needs the room. */
.vc__role :deep(.cdx-select-vue__handle) {
  min-width: 0;
}
.vc__forms {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(8.5em, 1fr));
  gap: var(--spacing-50);
  margin-top: var(--spacing-50);
}
.vc__form {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-25);
  padding: var(--spacing-50);
  border: var(--border-width-base, 1px) solid var(--border-color-subtle);
  border-radius: var(--border-radius-base, 2px);
  background: var(--background-color-base);
  color: var(--color-base);
  cursor: pointer;
  text-align: center;
}
.vc__form:hover {
  border-color: var(--border-color-interactive);
}
.vc__form--on {
  border-color: var(--border-color-progressive);
  box-shadow: inset 0 0 0 1px var(--border-color-progressive);
}
.vc__form:focus-visible {
  outline: var(--border-width-thick, 2px) solid var(--outline-color-progressive--focus, #36c);
}
.vc__thumb {
  width: 96px;
  height: 48px;
}
.vc__thumb-years rect {
  fill: var(--border-color-subtle);
}
.vc__thumb-years .vc__thumb-on {
  fill: var(--border-color-progressive);
}
.vc__thumb-axis {
  stroke: var(--border-color-base);
  stroke-width: 1;
}
.vc__measure {
  display: flex;
  align-items: center;
  gap: var(--spacing-50);
  margin-top: var(--spacing-75);
  color: var(--color-subtle);
}
.vc__seg {
  display: inline-flex;
}
.vc__seg button {
  padding: var(--spacing-12, 2px) var(--spacing-50);
  border: var(--border-width-base, 1px) solid var(--border-color-base);
  background: var(--background-color-base);
  color: var(--color-base);
  cursor: pointer;
}
.vc__seg button + button {
  border-inline-start: 0;
}
.vc__seg button.on {
  border-color: var(--border-color-progressive);
  background: var(--background-color-progressive-subtle);
  color: var(--color-progressive);
}
.vc__parties {
  list-style: none;
  margin: 0;
  padding: 0;
}
.vc__parties--dragging {
  user-select: none;
  -webkit-user-select: none;
}
.vc__party {
  display: flex;
  align-items: center;
  gap: var(--spacing-50);
  margin: 0;
  padding-block: var(--spacing-25);
  border-bottom: var(--border-width-base, 1px) solid var(--border-color-subtle);
  background: var(--background-color-base);
}
.vc__party--drag {
  background: var(--background-color-interactive-subtle);
}
.vc__handle {
  flex: none;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-subtle);
  cursor: grab;
  touch-action: none;
}
.vc__handle:active {
  cursor: grabbing;
}
.vc__handle:focus-visible,
.vc__icon:focus-visible {
  outline: var(--border-width-thick, 2px) solid var(--outline-color-progressive--focus, #36c);
}
.vc__swatch {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--c);
  box-shadow: inset 0 0 0 1px var(--border-color-muted);
}
.vc__party-main {
  flex: 1;
  min-width: 0;
}
.vc__party-main small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.vc__name {
  box-sizing: border-box;
  width: 100%;
  margin-inline-start: calc(-1 * var(--spacing-25));
  padding: 0 var(--spacing-25);
  border: 0;
  border-radius: var(--border-radius-base, 2px);
  background: transparent;
  color: var(--color-base);
  font: inherit;
  font-weight: var(--font-weight-bold);
}
.vc__name:hover {
  background: var(--background-color-interactive-subtle);
}
.vc__name:focus {
  outline: none;
  box-shadow: inset 0 0 0 1px var(--border-color-progressive);
}
.vc__icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-subtle);
  cursor: pointer;
}
.vc__icon:hover {
  color: var(--color-progressive);
}
.vc__group {
  margin-top: var(--spacing-75);
}
.vc__threshold {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--spacing-50);
  margin-bottom: var(--spacing-50);
  color: var(--color-subtle);
}
.vc__num {
  width: 5em;
  min-width: 0;
}
.vc__others {
  margin: var(--spacing-25) 0 0 var(--spacing-150);
  color: var(--color-subtle);
}
.vc__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
</style>
