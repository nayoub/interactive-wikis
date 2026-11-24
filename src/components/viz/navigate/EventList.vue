<script setup lang="ts">
/**
 * The complete event list as a compact encyclopedia index: neutral periods
 * (decades, centuries), a narrow date column, short linked labels, thin
 * rules. Even row spacing; no axis. Used as Chronological contents (A) and
 * wherever a variant exposes "All events".
 *
 * Marks: the selected event is bold with a bar at its start and
 * aria-current; an event whose passage is on screen has an eye and the
 * words "In view" for assistive tech. Neither implies the earlier rows are
 * "done".
 */
import { computed, inject, reactive, watch } from 'vue'
import { CdxButton, CdxIcon } from '@wikimedia/codex'
import { cdxIconCollapse, cdxIconExpand, cdxIconEye } from '@wikimedia/codex-icons'

import { NAV, type NavContext } from './context'
import EventLink from './EventLink.vue'
import type { NavEvent } from './events'
import { msg } from './messages'
import { formatWhen, interval, periodOf, periodSize, timeKind } from './time'

const props = withDefaults(
  defineProps<{
    events: NavEvent[]
    collapsible?: boolean
    /** Which groups start open: all, none, or the ones holding the selected / in-view event. */
    open?: 'all' | 'none' | 'relevant'
    showSection?: boolean
    /** Heading level of the group labels, for the page outline. */
    level?: 3 | 4
    /** Ids of the subset shown elsewhere (E): marked in this list. */
    marked?: Set<string>
    markedLabel?: string
    jumpWith?: (e: NavEvent) => Promise<boolean>
  }>(),
  { collapsible: true, open: 'relevant', showSection: false, level: 3, marked: undefined, markedLabel: '', jumpWith: undefined },
)
const emit = defineEmits<{ jumped: [ok: boolean] }>()
const ctx = inject(NAV) as NavContext
const nav = ctx.nav

const size = computed(() => {
  const all = ctx.collection.events.map((e) => interval(e.date))
  return periodSize(Math.min(...all.map((i) => i[0])), Math.max(...all.map((i) => i[1])))
})
const groups = computed(() => {
  const out: { id: string; label: string; events: NavEvent[] }[] = []
  for (const e of props.events) {
    const p = periodOf(interval(e.date)[0], size.value, ctx.era)
    const g = out.find((x) => x.id === p.id)
    if (g) g.events.push(e)
    else out.push({ id: p.id, label: p.label, events: [e] })
  }
  return out
})

const expanded = reactive<Record<string, boolean>>({})
function relevant(g: { events: NavEvent[] }) {
  return g.events.some((e) => e.id === nav.selectedId.value || nav.inView.value.includes(e.id))
}
function initOpen() {
  for (const g of groups.value) {
    if (g.id in expanded) continue
    expanded[g.id] = !props.collapsible || props.open === 'all' || (props.open === 'relevant' && relevant(g))
  }
}
watch(groups, initOpen, { immediate: true })
// The selected event's group opens (navigator only: the article does not move).
watch(
  () => nav.selectedId.value,
  () => {
    for (const g of groups.value) if (g.events.some((e) => e.id === nav.selectedId.value)) expanded[g.id] = true
  },
  { immediate: true },
)
const allOpen = computed(() => groups.value.every((g) => expanded[g.id]))
function toggleAll() {
  const next = !allOpen.value
  for (const g of groups.value) expanded[g.id] = next
}
defineExpose({ toggleAll, allOpen })

const sameDateAsPrev = (list: NavEvent[], i: number) =>
  i > 0 && formatWhen(list[i - 1].date, ctx.era) === formatWhen(list[i].date, ctx.era)
</script>

<template>
  <div class="tn-list">
    <div
      v-if="collapsible && groups.length > 1"
      class="tn-list__tools"
    >
      <CdxButton
        weight="quiet"
        size="small"
        @click="toggleAll"
      >
        {{ allOpen ? msg.collapseAll : msg.expandAll }}
      </CdxButton>
    </div>
    <section
      v-for="g in groups"
      :key="g.id"
      class="tn-list__group"
      :aria-labelledby="`tn-g-${g.id}`"
    >
      <component
        :is="`h${level}`"
        :id="`tn-g-${g.id}`"
        class="tn-list__period"
      >
        <button
          v-if="collapsible"
          type="button"
          class="tn-list__toggle"
          :aria-expanded="expanded[g.id] ? 'true' : 'false'"
          @click="expanded[g.id] = !expanded[g.id]"
        >
          <CdxIcon
            :icon="expanded[g.id] ? cdxIconCollapse : cdxIconExpand"
            size="small"
          />
          <span class="tn-list__period-label">{{ g.label }}</span>
          <span class="tn-list__count">{{ msg.eventsCount(g.events.length) }}</span>
          <CdxIcon
            v-if="!expanded[g.id] && g.events.some((e) => nav.inView.value.includes(e.id))"
            class="tn-list__eye"
            :icon="cdxIconEye"
            size="small"
            :icon-label="msg.inView"
          />
        </button>
        <template v-else>
          <span class="tn-list__period-label">{{ g.label }}</span>
          <span class="tn-list__count">{{ msg.eventsCount(g.events.length) }}</span>
        </template>
      </component>
      <ol
        v-show="expanded[g.id]"
        class="tn-list__rows"
      >
        <li
          v-for="(e, i) in g.events"
          :key="e.id"
          class="tn-row"
          :class="{
            'tn-row--selected': nav.selectedId.value === e.id,
            'tn-row--in-view': nav.inView.value.includes(e.id),
            'tn-row--unresolved': nav.unresolved.value === e.id,
          }"
        >
          <span
            class="tn-row__date"
            :class="{ 'tn-row__date--repeat': sameDateAsPrev(g.events, i) }"
          >
            <time :datetime="String(e.date.start.y)">{{ formatWhen(e.date, ctx.era) }}</time>
            <span
              v-if="timeKind(e.date) === 'approximate'"
              class="tn-visually-hidden"
            >, {{ msg.approximate }}</span>
          </span>
          <span class="tn-row__body">
            <EventLink
              :event="e"
              :jump-with="jumpWith"
              @jumped="emit('jumped', $event)"
            />
            <span
              v-if="marked?.has(e.id)"
              class="tn-row__marked"
            >{{ markedLabel }}</span>
            <span
              v-if="showSection"
              class="tn-row__section"
            >{{ e.sourceAnchor.sectionTitle }}</span>
            <span
              v-if="nav.unresolved.value === e.id"
              class="tn-row__missing"
            >{{ msg.unresolvedShort }}</span>
          </span>
          <span class="tn-row__marks">
            <CdxIcon
              v-if="nav.inView.value.includes(e.id)"
              class="tn-row__eye"
              :icon="cdxIconEye"
              size="small"
              :icon-label="msg.inView"
              :title="msg.inViewHint"
            />
            <span
              v-if="nav.selectedId.value === e.id"
              class="tn-visually-hidden"
            >{{ msg.selected }}</span>
          </span>
        </li>
      </ol>
    </section>
  </div>
</template>

<style scoped>
.tn-list__tools {
  display: flex;
  justify-content: flex-end;
  margin-block-end: var(--spacing-25);
}
.tn-list__group {
  border-block-start: var(--border-width-base) solid var(--border-color-subtle);
}
.tn-list__period {
  margin: 0;
  padding: 0;
  border: 0;
  font-family: var(--font-family-base);
  font-size: var(--font-size-small);
  line-height: var(--line-height-small);
  font-weight: var(--font-weight-bold);
}
.tn-list__toggle {
  display: flex;
  align-items: center;
  gap: var(--spacing-25);
  width: 100%;
  min-height: 32px;
  padding: var(--spacing-25) 0;
  border: 0;
  background: none;
  color: var(--color-base);
  font: inherit;
  text-align: start;
  cursor: pointer;
}
.tn-list__toggle:hover .tn-list__period-label {
  text-decoration: underline;
}
.tn-list__toggle:focus-visible {
  outline: var(--border-width-thick) solid var(--outline-color-progressive--focus);
  outline-offset: 1px;
}
.tn-list__toggle :deep(.cdx-icon) {
  color: var(--color-subtle);
}
.tn-list__count {
  margin-inline-start: auto;
  color: var(--color-subtle);
  font-weight: var(--font-weight-normal);
}
.tn-list__eye {
  margin-inline-start: var(--spacing-25);
}
.tn-list__rows {
  margin: 0 0 var(--spacing-50);
  padding: 0;
  list-style: none;
}
.tn-row {
  display: grid;
  grid-template-columns: 6.5em minmax(0, 1fr) 16px;
  gap: var(--spacing-50);
  align-items: baseline;
  margin: 0;
  padding: var(--spacing-25) 0 var(--spacing-25) var(--spacing-50);
  font-size: var(--font-size-small);
  line-height: var(--line-height-small);
  box-shadow: inset 3px 0 0 transparent;
}
[dir='rtl'] .tn-row {
  box-shadow: inset -3px 0 0 transparent;
}
.tn-row__date {
  color: var(--color-subtle);
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.tn-row__date--repeat time {
  /* A repeated date: still read, quieter to scan. */
  color: var(--color-placeholder);
}
.tn-row__body {
  min-width: 0;
  overflow-wrap: anywhere;
}
.tn-row__section,
.tn-row__marked,
.tn-row__missing {
  display: block;
  color: var(--color-subtle);
}
.tn-row__missing {
  color: var(--color-warning);
}
.tn-row__marks {
  align-self: center;
  color: var(--color-subtle);
}
.tn-row--selected {
  box-shadow: inset 3px 0 0 var(--color-progressive);
}
[dir='rtl'] .tn-row--selected {
  box-shadow: inset -3px 0 0 var(--color-progressive);
}
.tn-row--selected :deep(.tn-link) {
  font-weight: var(--font-weight-bold);
}
</style>
