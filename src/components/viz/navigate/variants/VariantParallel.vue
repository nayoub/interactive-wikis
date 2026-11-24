<script setup lang="ts">
/**
 * D · Parallel histories. "What else was happening at the same time?"
 * Three (at most four) rows, each drawn from named sections of the article
 * (curated per article in events.ts), on one shared proportional scale.
 * Choosing a period lists every row's events in it side by side, with an
 * explicit "no indexed events" for an empty row. Choosing a row narrows the
 * navigator only. No lines between events: being near in time is not cause.
 *
 * Phones: the same comparison as a period-grouped list with row labels.
 */
import { computed, inject, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { CdxIcon, CdxToggleButtonGroup } from '@wikimedia/codex'
import { cdxIconEye } from '@wikimedia/codex-icons'

import { NAV, type NavContext } from '../context'
import EventLink from '../EventLink.vue'
import type { NavEvent } from '../events'
import { msg } from '../messages'
import PeriodControls from '../PeriodControls.vue'
import ReturnBar from '../ReturnBar.vue'
import RulerAxis from '../RulerAxis.vue'
import RulerTrack from '../RulerTrack.vue'
import UnresolvedNotice from '../UnresolvedNotice.vue'
import { domainOf, formatWhen, interval, overlaps, periodsBetween, xOf, yearLabel } from '../time'

const ctx = inject(NAV) as NavContext & { leadMount: Ref<HTMLElement | null> }
const nav = ctx.nav
const events = ctx.collection.events
const topics = ctx.collection.topics
const sectionTitle = (id: string) =>
  id === 'Lead' ? 'Introduction' : (ctx.article.sections.find((s) => s.id === id)?.title ?? id.replace(/_/g, ' '))
const rowSources = (t: (typeof topics)[number]) => t.sections.map(sectionTitle).join(', ')

const intervals = events.map((e) => interval(e.date))
const domain = domainOf(intervals)
const periods = periodsBetween(
  Math.min(...intervals.map((i) => i[0])),
  Math.max(...intervals.map((i) => i[1])),
  ctx.era,
)
const narrow = computed(() => ctx.width.value === 'narrow')

const range = computed({ get: () => nav.range.value, set: (r) => (nav.range.value = r) })
const rowFilter = ref<string>('all')
const rowButtons = [{ value: 'all', label: msg.allTopics }, ...topics.map((t) => ({ value: t.id, label: t.label }))]
const rows = computed(() => (rowFilter.value === 'all' ? topics : topics.filter((t) => t.id === rowFilter.value)))
const inRow = (id: string) => events.filter((e) => e.topic === id)
const inRange = (list: NavEvent[], r: [number, number] | null) => (r ? list.filter((e) => overlaps(interval(e.date), r)) : list)

const periodLabel = computed(() => {
  const r = range.value
  if (!r) return msg.allPeriods.toLowerCase()
  const p = periods.find((x) => x.range[0] === r[0] && x.range[1] === r[1])
  if (p) return p.label
  const a = yearLabel(Math.floor(r[0]), ctx.era)
  const b = yearLabel(Math.ceil(r[1]) - 1, ctx.era)
  return a === b ? a : `${a}–${b}`
})

// ── Lanes width ────────────────────────────────────────────────────────────
const laneEl = ref<HTMLElement | null>(null)
const width = ref(0)
let ro: ResizeObserver | null = null
watch(laneEl, (el) => {
  ro?.disconnect()
  if (!el) return
  width.value = el.getBoundingClientRect().width
  ro = new ResizeObserver(([e]) => (width.value = e.contentRect.width))
  ro.observe(el)
})
onBeforeUnmount(() => ro?.disconnect())
const band = computed(() => {
  if (!range.value || !width.value) return null
  const s = xOf(Math.max(range.value[0], domain[0]), domain, width.value)
  const e = xOf(Math.min(range.value[1], domain[1]), domain, width.value)
  return { start: s, size: Math.max(2, e - s) }
})
function showCluster(_: NavEvent[], extent: [number, number]) {
  range.value = [Math.floor(extent[0]), Math.ceil(extent[1])]
}

/** Phone: periods that hold an event in a shown row (and overlap the chosen period). */
const phonePeriods = computed(() =>
  periods
    .filter((p) => !range.value || overlaps(p.range, range.value))
    .map((p) => ({ p, rows: rows.value.map((t) => ({ t, list: inRange(inRow(t.id), p.range) })) }))
    .filter((g) => g.rows.some((r) => r.list.length)),
)
</script>

<template>
  <Teleport
    v-if="ctx.leadMount.value"
    :to="ctx.leadMount.value"
  >
    <section
      class="vp"
      :class="{ 'vp--narrow': narrow }"
      aria-labelledby="vp-title"
    >
      <header class="vp__head">
        <h2
          id="vp-title"
          class="vp__title"
        >
          {{ msg.parallelTitle }}
        </h2>
        <span class="vp__note">{{ msg.parallelNote }}</span>
      </header>
      <p
        v-if="ctx.collection.topicNote"
        class="vp__caveat"
      >
        {{ ctx.collection.topicNote }}
      </p>

      <div class="vp__controls">
        <PeriodControls
          v-model:range="range"
          :periods="periods"
          :events="events"
          :compact="narrow"
          :era="ctx.era"
        />
        <CdxToggleButtonGroup
          v-model="rowFilter"
          class="vp__rows-filter"
          :buttons="rowButtons"
          aria-label="Rows"
        />
      </div>

      <!-- The figure: rows on one shared scale. -->
      <div
        v-if="!narrow"
        class="vp__figure"
        role="group"
        :aria-label="msg.parallelTitle"
      >
        <template
          v-for="t in rows"
          :key="t.id"
        >
          <div class="vp__label">
            <b>{{ t.label }}</b>
            <span class="vp__sources">{{ msg.rowSections(rowSources(t)) }}</span>
          </div>
          <div
            :ref="t.id === rows[0].id ? (el) => (laneEl = el as HTMLElement) : undefined"
            class="vp__lane"
          >
            <div
              v-if="band"
              class="vp__band"
              :style="{ insetInlineStart: `${band.start}px`, inlineSize: `${band.size}px` }"
            />
            <RulerTrack
              v-if="width"
              :events="inRow(t.id)"
              :domain="domain"
              :width="width"
              :labels="true"
              @cluster="showCluster"
            />
          </div>
        </template>
        <div />
        <RulerAxis
          v-if="width"
          :domain="domain"
          :width="width"
          :era="ctx.era"
        />
      </div>
      <p
        v-if="!narrow"
        class="vp__hint"
      >
        {{ msg.blankMeaning }}
      </p>

      <UnresolvedNotice />

      <!-- The comparison: every shown row in the chosen period. -->
      <div
        v-if="!narrow"
        class="vp__compare"
        aria-live="polite"
      >
        <h3 class="vp__compare-title">
          {{ msg.comparing(periodLabel) }}
        </h3>
        <div
          class="vp__columns"
          :style="{ '--vp-cols': rows.length }"
        >
          <section
            v-for="t in rows"
            :key="t.id"
            class="vp__col"
            :aria-label="t.label"
          >
            <h4 class="vp__col-title">
              {{ t.label }}
            </h4>
            <ol
              v-if="inRange(inRow(t.id), range).length"
              class="vp__events"
            >
              <li
                v-for="e in inRange(inRow(t.id), range)"
                :key="e.id"
                class="vp__event"
                :class="{ 'vp__event--selected': nav.selectedId.value === e.id }"
              >
                <span class="vp__date">{{ formatWhen(e.date, ctx.era) }}</span>
                <EventLink :event="e" />
                <span class="vp__section">
                  {{ e.sourceAnchor.sectionTitle }}
                  <CdxIcon
                    v-if="nav.inView.value.includes(e.id)"
                    :icon="cdxIconEye"
                    size="x-small"
                    :icon-label="msg.inView"
                  />
                </span>
              </li>
            </ol>
            <p
              v-else
              class="vp__none"
            >
              {{ msg.noRowEvents }}
            </p>
          </section>
        </div>
      </div>

      <!-- Phone: grouped by period, rows labelled, so concurrent strands stay comparable. -->
      <div
        v-else
        class="vp__phone"
      >
        <section
          v-for="g in phonePeriods"
          :key="g.p.id"
          class="vp__period"
          :aria-labelledby="`vp-p-${g.p.id}`"
        >
          <h3
            :id="`vp-p-${g.p.id}`"
            class="vp__period-title"
          >
            {{ g.p.label }}
          </h3>
          <div
            v-for="r in g.rows"
            :key="r.t.id"
            class="vp__strand"
          >
            <span class="vp__strand-label">{{ r.t.label }}</span>
            <ol
              v-if="r.list.length"
              class="vp__events"
            >
              <li
                v-for="e in r.list"
                :key="e.id"
                class="vp__event"
                :class="{ 'vp__event--selected': nav.selectedId.value === e.id }"
              >
                <span class="vp__date">{{ formatWhen(e.date, ctx.era) }}</span>
                <EventLink :event="e" />
                <span class="vp__section">
                  {{ e.sourceAnchor.sectionTitle }}
                  <CdxIcon
                    v-if="nav.inView.value.includes(e.id)"
                    :icon="cdxIconEye"
                    size="x-small"
                    :icon-label="msg.inView"
                  />
                </span>
              </li>
            </ol>
            <p
              v-else
              class="vp__none"
            >
              {{ msg.noRowEvents }}
            </p>
          </div>
        </section>
        <p
          v-if="!phonePeriods.length"
          class="vp__none"
        >
          {{ msg.noEventsIn }}
        </p>
      </div>
    </section>
  </Teleport>
  <ReturnBar />
</template>

<style scoped>
.vp {
  padding-block: var(--spacing-75);
  border-block: var(--border-width-base) solid var(--border-color-base);
  font-family: var(--font-family-base);
}
.vp__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--spacing-25) var(--spacing-75);
}
.mw-parser-output .vp__title,
.vp__title {
  margin: 0;
  padding: 0;
  border: 0;
  font-family: var(--font-family-base);
  font-size: var(--font-size-medium);
  line-height: var(--line-height-medium);
  font-weight: var(--font-weight-bold);
}
.vp__note,
.vp__hint,
.vp__sources,
.vp__section,
.vp__none,
.vp__caveat {
  color: var(--color-subtle);
  font-size: var(--font-size-small);
  line-height: var(--line-height-small);
}
.vp__caveat {
  margin: var(--spacing-25) 0 0;
  color: var(--color-warning);
}
.vp__controls {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-50);
  margin-block: var(--spacing-75);
}
.vp__rows-filter {
  flex-wrap: wrap;
}
.vp__figure {
  display: grid;
  grid-template-columns: 11em minmax(0, 1fr);
  column-gap: var(--spacing-75);
}
.vp__label {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding-block: var(--spacing-25);
  border-block-start: var(--border-width-base) solid var(--border-color-subtle);
  font-size: var(--font-size-small);
  line-height: var(--line-height-small);
}
.vp__lane {
  position: relative;
  min-height: 56px;
  border-block-start: var(--border-width-base) solid var(--border-color-subtle);
}
.vp__band {
  position: absolute;
  inset-block: 0;
  background: var(--background-color-progressive-subtle);
  border-inline: 2px solid var(--color-progressive);
  pointer-events: none;
}
.vp__hint {
  margin: var(--spacing-25) 0 0;
}
.mw-parser-output .vp__compare-title,
.vp__compare-title,
.mw-parser-output .vp__period-title,
.vp__period-title {
  margin: var(--spacing-75) 0 var(--spacing-50);
  padding: 0;
  border: 0;
  font-family: var(--font-family-base);
  font-size: var(--font-size-small);
  line-height: var(--line-height-small);
  font-weight: var(--font-weight-bold);
}
.vp__columns {
  display: grid;
  grid-template-columns: repeat(var(--vp-cols), minmax(0, 1fr));
  gap: var(--spacing-100);
}
.vp__col {
  min-width: 0;
  border-block-start: 2px solid var(--color-base);
}
.mw-parser-output .vp__col-title,
.vp__col-title {
  margin: var(--spacing-25) 0;
  padding: 0;
  border: 0;
  font-family: var(--font-family-base);
  font-size: var(--font-size-small);
  line-height: var(--line-height-small);
  font-weight: var(--font-weight-bold);
}
.mw-parser-output .vp__events,
.vp__events {
  max-height: 260px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}
.mw-parser-output .vp__event,
.vp__event {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: var(--spacing-25) var(--spacing-50);
  border-block-end: var(--border-width-base) solid var(--border-color-subtle);
  font-size: var(--font-size-small);
  line-height: var(--line-height-small);
  overflow-wrap: anywhere;
}
.vp__event--selected {
  box-shadow: inset 3px 0 0 var(--color-progressive);
}
[dir='rtl'] .vp__event--selected {
  box-shadow: inset -3px 0 0 var(--color-progressive);
}
.vp__event--selected :deep(.tn-link) {
  font-weight: var(--font-weight-bold);
}
.vp__date {
  color: var(--color-subtle);
  font-variant-numeric: tabular-nums;
}
.vp__none {
  margin: var(--spacing-25) 0;
  font-style: italic;
}
.vp__phone {
  max-height: 480px;
  overflow-y: auto;
}
.vp__period {
  border-block-start: var(--border-width-base) solid var(--border-color-base);
}
.vp__strand {
  display: grid;
  grid-template-columns: 6.5em minmax(0, 1fr);
  gap: var(--spacing-50);
  padding-block: var(--spacing-25);
  border-block-start: var(--border-width-base) solid var(--border-color-subtle);
}
.vp__strand-label {
  font-size: var(--font-size-small);
  line-height: var(--line-height-small);
  font-weight: var(--font-weight-bold);
  overflow-wrap: anywhere;
}
.vp__strand .vp__events {
  max-height: none;
}
.vp__strand .vp__event {
  padding-inline: 0;
}
.vp__strand .vp__event:last-child {
  border-block-end: 0;
}
</style>
