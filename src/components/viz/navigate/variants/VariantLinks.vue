<script setup lang="ts">
/**
 * 2 · A timeline made from links. The article's own linked names (works,
 * places, people, concepts) are the marks, placed by the dated event the
 * article describes, never by unrelated facts about the linked page. One
 * entry per event; a name can appear at several dates when it takes part in
 * distinct events (an exhibition in 2002 and an opening in 1997).
 *
 *   link-columns     compact period columns, names stacked on a baseline
 *   link-chronology  an airy vertical chronology, dates and linked phrases
 *
 * Three separate actions per entry:
 *   the name         follows its link (as in the article; red = missing page)
 *   the date         Read this passage (the local sentence)
 *   Follow mentions  the same subject's other appearances (in the card)
 */
import { computed, inject, type Ref } from 'vue'
import { CdxButton, CdxIcon } from '@wikimedia/codex'
import { cdxIconListBullet } from '@wikimedia/codex-icons'

import { NAV, type NavContext } from '../context'
import { msg } from '../messages'
import OccurrenceCard from '../OccurrenceCard.vue'
import type { Occurrence } from '../occurrences'
import ReturnBar from '../ReturnBar.vue'
import { formatWhen, interval, periodOf, periodSize, yearLabel } from '../time'
import WikiLink from '../WikiLink.vue'

const ctx = inject(NAV) as NavContext & { leadMount: Ref<HTMLElement | null> }
const nav = ctx.nav
const occ = ctx.occurrences
const columns = computed(() => ctx.variant === 'link-columns')
const narrow = computed(() => ctx.width.value === 'narrow')

const iv = occ.map((o) => interval(o.date))
const lo = Math.min(...iv.map((i) => i[0]))
const hi = Math.max(...iv.map((i) => i[0]))
/** Equal periods; columns need room for names, so at most eight of them (the chronology uses decades or centuries). */
const colSize = [10, 20, 25, 50, 100, 200, 500, 1000].find((s) => Math.floor(hi / s) - Math.floor(lo / s) + 1 <= 8) ?? 1000
const size = columns.value ? colSize : periodSize(lo, Math.max(...iv.map((i) => i[1])))
const periodLabel = (y: number) => {
  if (size === 10 || size === 100 || size === 1000) return periodOf(y, size as 10 | 100 | 1000, ctx.era).label
  const a = Math.floor(y / size) * size
  return `${yearLabel(a, ctx.era)}–${yearLabel(a + size - 1, ctx.era)}`
}
const periods = (() => {
  const out: { id: string; label: string; items: Occurrence[] }[] = []
  for (let y = Math.floor(lo / size) * size; y <= hi; y += size) {
    const k = Math.floor(y / size)
    out.push({ id: `p${y}`, label: periodLabel(y), items: occ.filter((_, i) => Math.floor(iv[i][0] / size) === k) })
  }
  return out
})()
const tallest = Math.max(1, ...periods.map((p) => p.items.length))

/** A name that appears at more than one date needs its qualifier to tell them apart. */
const targetCount = new Map<string, number>()
for (const o of occ) for (const l of o.links) if (l.target) targetCount.set(l.target, (targetCount.get(l.target) ?? 0) + 1)
const ambiguous = (o: Occurrence) => !o.links[0] || (o.links[0].target ? (targetCount.get(o.links[0].target) ?? 0) > 1 : false)

const selected = computed(() => (nav.selectedId.value ? (occ.find((o) => o.id === nav.selectedId.value) ?? null) : null))
const short = (o: Occurrence) => {
  const y = o.date.start.y
  return o.date.end || o.date.circa || o.date.qualifier || y < 0 ? formatWhen(o.date, ctx.era) : String(y)
}
const readLabel = (o: Occurrence) => msg.readPassageOf(formatWhen(o.date, ctx.era), o.label)
const select = (o: Occurrence) => (nav.selectedId.value = nav.selectedId.value === o.id ? null : o.id)
</script>

<template>
  <Teleport
    v-if="ctx.leadMount.value"
    :to="ctx.leadMount.value"
  >
    <section
      class="vl"
      :class="{ 'vl--columns': columns && !narrow, 'vl--narrow': narrow }"
      aria-labelledby="vl-title"
    >
      <h2
        id="vl-title"
        class="vl__title"
      >
        {{ ctx.collection.title }}, by date: {{ msg.eventsCount(occ.length) }}
      </h2>
      <p class="vl__note">
        {{ msg.linksNote }}
      </p>

      <!-- 2a · compact period columns -->
      <div
        v-if="columns"
        class="vl__cols"
        :style="{ '--vl-n': periods.length, '--vl-rows': tallest }"
      >
        <section
          v-for="p in periods"
          :key="p.id"
          class="vl__col"
          :aria-label="`${p.label}, ${msg.columnsCount(p.items.length)}`"
        >
          <ol class="vl__stack">
            <li
              v-for="o in p.items"
              :key="o.id"
              class="vl__entry"
              :class="{ 'vl__entry--selected': nav.selectedId.value === o.id, 'vl__entry--in-view': nav.inView.value.includes(o.id) }"
            >
              <span class="vl__name">
                <template
                  v-for="(l, i) in o.links"
                  :key="l.href + i"
                ><WikiLink :link="l" /><span v-if="i < o.links.length - 1">, </span></template>
                <span
                  v-if="!o.links.length"
                  class="vl__plain"
                >{{ o.qualifier }} <span class="vl__plain-section">· {{ o.sourceAnchor.sectionTitle === 'Lead' ? 'Introduction' : o.sourceAnchor.sectionTitle }}</span></span>
                <span
                  v-if="o.links[0] && ambiguous(o)"
                  class="vl__qual"
                >{{ o.qualifier }}</span>
              </span>
              <button
                type="button"
                class="vl__date"
                :aria-label="readLabel(o)"
                :title="msg.readPassage"
                @click="nav.jump(o)"
              >
                {{ short(o) }}
              </button>
              <button
                type="button"
                class="vl__more"
                :aria-label="`${msg.followMentions}: ${o.label}`"
                :aria-pressed="nav.selectedId.value === o.id ? 'true' : 'false'"
                @click="select(o)"
              >
                <CdxIcon
                  :icon="cdxIconListBullet"
                  size="x-small"
                />
              </button>
            </li>
          </ol>
          <div class="vl__foot">
            <b>{{ p.label }}</b>
            <span>{{ msg.columnsCount(p.items.length) }}</span>
          </div>
        </section>
      </div>

      <!-- 2b · airy vertical chronology -->
      <ol
        v-else
        class="vl__chron"
      >
        <li
          v-for="p in periods.filter((x) => x.items.length)"
          :key="p.id"
          class="vl__period"
        >
          <h3 class="vl__period-title">
            {{ p.label }}
          </h3>
          <ol class="vl__rows">
            <li
              v-for="o in p.items"
              :key="o.id"
              class="vl__row"
              :class="{ 'vl__row--selected': nav.selectedId.value === o.id, 'vl__row--in-view': nav.inView.value.includes(o.id) }"
            >
              <button
                type="button"
                class="vl__row-date"
                :aria-label="readLabel(o)"
                :title="msg.readPassage"
                @click="nav.jump(o)"
              >
                {{ formatWhen(o.date, ctx.era) }}
              </button>
              <p class="vl__phrase">
                <template
                  v-for="(l, i) in o.links"
                  :key="l.href + i"
                >
                  <WikiLink :link="l" /><span v-if="i < o.links.length - 1">, </span>
                </template>
                <span class="vl__qual-inline"><template v-if="o.links.length"> — </template>{{ o.qualifier }}</span>
                <span class="vl__section">{{ o.sourceAnchor.sectionTitle === 'Lead' ? 'Introduction' : o.sourceAnchor.sectionTitle }}</span>
              </p>
              <CdxButton
                class="vl__follow"
                weight="quiet"
                size="small"
                :aria-pressed="nav.selectedId.value === o.id ? 'true' : 'false'"
                :aria-label="`${msg.followMentions}: ${o.label}`"
                @click="select(o)"
              >
                <CdxIcon
                  :icon="cdxIconListBullet"
                  size="small"
                />
              </CdxButton>
            </li>
          </ol>
        </li>
      </ol>

      <OccurrenceCard
        v-if="selected || !narrow"
        class="vl__card"
        :occurrence="selected"
        :hint="msg.linksHint"
      />
    </section>
  </Teleport>
  <ReturnBar />
</template>

<style scoped>
.vl {
  padding-block: var(--spacing-75);
  border-block: var(--border-width-base) solid var(--border-color-base);
  font-family: var(--font-family-base);
}
.mw-parser-output .vl__title,
.vl__title {
  margin: 0;
  padding: 0;
  border: 0;
  font-family: var(--font-family-base);
  font-size: var(--font-size-medium);
  line-height: var(--line-height-medium);
  font-weight: var(--font-weight-bold);
}
.vl__note {
  margin: var(--spacing-25) 0 var(--spacing-75);
  color: var(--color-subtle);
  font-size: var(--font-size-small);
  line-height: var(--line-height-small);
}

/* 2a: columns on one baseline; a column's height is its count of events. */
.vl__cols {
  display: grid;
  grid-template-columns: repeat(var(--vl-n), minmax(0, 1fr));
  align-items: end;
  gap: 0 var(--spacing-50);
}
.vl__col {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  min-width: 0;
}
.mw-parser-output .vl__stack,
.vl__stack {
  margin: 0;
  padding: 0;
  list-style: none;
}
.mw-parser-output .vl__entry,
.vl__entry {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: baseline;
  column-gap: 2px;
  margin: 0;
  padding: 1px 0 1px 4px;
  font-size: var(--font-size-small);
  line-height: 1.35;
  box-shadow: inset 2px 0 0 transparent;
}
.vl__name {
  min-width: 0;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
  overflow-wrap: anywhere;
}
.vl__qual {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--color-subtle);
  font-size: var(--font-size-x-small, 12px);
  line-height: 1.2;
}
.vl__plain {
  color: var(--color-subtle);
  font-style: italic;
}
.vl__plain-section {
  font-style: normal;
}
.vl__date {
  padding: 0 2px;
  border: 0;
  background: none;
  color: var(--color-subtle);
  font: inherit;
  font-size: var(--font-size-x-small, 12px);
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  unicode-bidi: plaintext;
}
.vl__date:hover {
  color: var(--color-progressive);
  text-decoration: underline;
}
.vl__more {
  position: absolute;
  inset-inline-end: -2px;
  inset-block-start: -18px;
  display: none;
  padding: 1px 3px;
  border: var(--border-width-base) solid var(--border-color-base);
  border-radius: var(--border-radius-base);
  background: var(--background-color-base);
  color: var(--color-base);
  cursor: pointer;
}
.vl__entry:hover .vl__more,
.vl__entry:focus-within .vl__more,
.vl__entry--selected .vl__more {
  display: block;
}
@media (hover: none) {
  .vl__more {
    position: static;
    display: inline-block;
    grid-column: 1 / -1;
    justify-self: start;
  }
}
.vl__date:focus-visible,
.vl__more:focus-visible,
.vl__row-date:focus-visible {
  outline: var(--border-width-thick) solid var(--outline-color-progressive--focus);
  outline-offset: 1px;
}
.mw-parser-output .vl__entry--selected,
.vl__entry--selected {
  box-shadow: inset 2px 0 0 var(--color-progressive);
  background: var(--background-color-progressive-subtle);
}
[dir='rtl'] .mw-parser-output .vl__entry--selected,
.vl__entry--selected {
  box-shadow: inset -2px 0 0 var(--color-progressive);
}
.vl__entry--in-view .vl__date,
.vl__row--in-view .vl__row-date {
  text-decoration: underline dotted;
}
.vl__foot {
  display: flex;
  flex-direction: column;
  margin-block-start: var(--spacing-25);
  padding-block-start: var(--spacing-25);
  border-block-start: var(--border-width-base) solid var(--color-base);
  font-size: var(--font-size-x-small, 12px);
  line-height: 1.3;
  text-align: center;
  color: var(--color-subtle);
}
.vl__foot b {
  color: var(--color-base);
}

/* 2a on phones: periods as rows of names. */
.vl--narrow .vl__cols {
  display: block;
}
.vl--narrow .vl__col {
  display: grid;
  grid-template-columns: 4.5em minmax(0, 1fr);
  gap: var(--spacing-50);
  padding-block: var(--spacing-50);
  border-block-start: var(--border-width-base) solid var(--border-color-subtle);
}
.vl--narrow .vl__stack {
  grid-column: 2;
  grid-row: 1;
}
.vl--narrow .vl__foot {
  grid-column: 1;
  grid-row: 1;
  margin: 0;
  padding: 0;
  border: 0;
  text-align: start;
}
.vl--narrow .vl__name {
  white-space: normal;
}

/* 2b: airy chronology. */
.mw-parser-output .vl__chron,
.vl__chron,
.mw-parser-output .vl__rows,
.vl__rows {
  margin: 0;
  padding: 0;
  list-style: none;
}
.mw-parser-output .vl__period,
.vl__period {
  margin: 0;
  padding-block: var(--spacing-75) var(--spacing-50);
  border-block-start: var(--border-width-base) solid var(--border-color-subtle);
}
.mw-parser-output .vl__period-title,
.vl__period-title {
  margin: 0 0 var(--spacing-50);
  padding: 0;
  border: 0;
  color: var(--color-subtle);
  font-family: var(--font-family-base);
  font-size: var(--font-size-small);
  font-weight: var(--font-weight-normal);
  letter-spacing: 0.04em;
}
.mw-parser-output .vl__row,
.vl__row {
  display: grid;
  grid-template-columns: 9.5em minmax(0, 1fr) auto;
  gap: var(--spacing-100);
  align-items: baseline;
  margin: 0;
  padding: var(--spacing-50) 0 var(--spacing-50) var(--spacing-75);
  box-shadow: inset 3px 0 0 transparent;
}
.vl--narrow .vl__row {
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0 var(--spacing-50);
}
.vl--narrow .vl__row-date {
  grid-column: 1 / -1;
}
.mw-parser-output .vl__row--selected,
.vl__row--selected {
  box-shadow: inset 3px 0 0 var(--color-progressive);
  background: var(--background-color-progressive-subtle);
}
[dir='rtl'] .vl__row--selected {
  box-shadow: inset -3px 0 0 var(--color-progressive);
}
.vl__row-date {
  justify-self: start;
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-base);
  font-family: 'Linux Libertine', 'Georgia', 'Times', 'Source Serif Pro', serif;
  font-size: 1.15em;
  text-align: start;
  cursor: pointer;
  unicode-bidi: plaintext;
}
.vl__row-date:hover {
  color: var(--color-progressive);
  text-decoration: underline;
}
.mw-parser-output .vl__phrase,
.vl__phrase {
  margin: 0;
  font-size: var(--font-size-medium);
  line-height: var(--line-height-medium);
}
.vl__qual-inline {
  color: var(--color-base);
}
.vl__section {
  display: block;
  color: var(--color-subtle);
  font-size: var(--font-size-small);
}
.vl__card {
  min-height: 8em;
  margin-block-start: var(--spacing-75);
  padding: var(--spacing-50) var(--spacing-75);
  border-inline-start: 3px solid var(--color-progressive);
  background: var(--background-color-interactive-subtle);
}
.vl:not(.vl--columns):not(.vl--narrow) .vl__card {
  position: sticky;
  inset-block-end: var(--spacing-100);
}
</style>
