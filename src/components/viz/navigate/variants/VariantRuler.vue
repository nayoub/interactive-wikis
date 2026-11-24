<script setup lang="ts">
/**
 * B · Time ruler. "When did these things happen, and how far apart were
 * they?" A calibrated, proportional rule below the introduction: marks at
 * their dates, durations at their real start and end, approximate dates
 * open; marks too close to separate become a labelled count. Choosing a
 * period (buttons, a select on phones, a drag along the rule, a cluster)
 * fills a list of matching events below it. Only a passage link moves the
 * article.
 *
 * The frame has a fixed height while open (the list scrolls inside it).
 * Once used it stays below the top of the screen (desktop) with a Collapse
 * control; opening or collapsing keeps the passage you are reading in place.
 */
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { CdxButton, CdxIcon } from '@wikimedia/codex'
import { cdxIconCollapse, cdxIconExpand, cdxIconEye } from '@wikimedia/codex-icons'

import { NAV, type NavContext } from '../context'
import EventLink from '../EventLink.vue'
import { msg } from '../messages'
import PeriodControls from '../PeriodControls.vue'
import ReturnBar from '../ReturnBar.vue'
import RulerAxis from '../RulerAxis.vue'
import RulerTrack from '../RulerTrack.vue'
import UnresolvedNotice from '../UnresolvedNotice.vue'
import type { NavEvent } from '../events'
import { obstructions } from '../useNavigator'
import { domainOf, formatWhen, interval, overlaps, periodsBetween, timeKind, xOf, yearLabel } from '../time'
import type { Ref } from 'vue'

const ctx = inject(NAV) as NavContext & { leadMount: Ref<HTMLElement | null> }
const nav = ctx.nav
const events = ctx.collection.events
const intervals = events.map((e) => interval(e.date))
const domain = domainOf(intervals)
const periods = periodsBetween(
  Math.min(...intervals.map((i) => i[0])),
  Math.max(...intervals.map((i) => i[1])),
  ctx.era,
)
const narrow = computed(() => ctx.width.value === 'narrow')

const range = computed({ get: () => nav.range.value, set: (r) => (nav.range.value = r) })
const matching = computed(() => (range.value ? events.filter((e) => overlaps(interval(e.date), range.value!)) : events))
const periodLabel = computed(() => {
  const r = range.value
  if (!r) return msg.allPeriods.toLowerCase()
  const p = periods.find((x) => x.range[0] === r[0] && x.range[1] === r[1])
  if (p) return p.label
  const a = yearLabel(Math.floor(r[0]), ctx.era)
  const b = yearLabel(Math.ceil(r[1]) - 1, ctx.era)
  return a === b ? a : `${a}–${b}`
})

// ── Width of the rule ───────────────────────────────────────────────────────
const ruleEl = ref<HTMLElement | null>(null)
const width = ref(0)
let ro: ResizeObserver | null = null
watch(ruleEl, (el) => {
  ro?.disconnect()
  if (!el) return
  width.value = el.getBoundingClientRect().width
  ro = new ResizeObserver(([e]) => (width.value = e.contentRect.width))
  ro.observe(el)
})
onBeforeUnmount(() => ro?.disconnect())

// ── In use, sticky, collapsed ──────────────────────────────────────────────
const inUse = ref(false)
const collapsed = ref(false)
/** Only where it leaves most of the screen for reading (not on phones, short windows or high zoom). */
const vh = ref(window.innerHeight)
const onResize = () => (vh.value = window.innerHeight)
window.addEventListener('resize', onResize)
onBeforeUnmount(() => window.removeEventListener('resize', onResize))
const sticky = computed(() => inUse.value && !narrow.value && vh.value >= 820)
watch([range, () => nav.jumps.value], () => (inUse.value = true))
// The mount is what sticks (a sticky element only sticks inside its parent, here the article body).
watch(
  [sticky, () => ctx.leadMount.value],
  ([on, mount]) => {
    if (!mount) return
    mount.classList.toggle('tn-mount--sticky', on)
    if (on) mount.dataset.tnObstruct = 'top'
    else delete mount.dataset.tnObstruct
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  const m = ctx.leadMount.value
  m?.classList.remove('tn-mount--sticky')
  if (m) delete m.dataset.tnObstruct
})

/** Keep the passage being read where it is when the frame changes height. */
async function keepingPlace(change: () => void) {
  const { top } = obstructions()
  const root = document.querySelector('.tn-body')
  let anchor: Element | null = null
  let before = 0
  if (root)
    for (const b of root.querySelectorAll('p, li, h2, h3, figure, table')) {
      if (b.closest('.tn-mount')) continue
      const r = b.getBoundingClientRect()
      if (r.height && r.bottom > top + 8) {
        anchor = b
        before = r.top
        break
      }
    }
  change()
  await nextTick()
  if (anchor) {
    const delta = anchor.getBoundingClientRect().top - before
    if (Math.abs(delta) > 0.5) window.scrollBy({ top: delta, behavior: 'instant' as ScrollBehavior })
  }
}
const toggleCollapsed = () => keepingPlace(() => (collapsed.value = !collapsed.value))

// ── Clusters and dragging (narrow the navigator; never move the article) ──
const listEl = ref<HTMLElement | null>(null)
function showCluster(_: NavEvent[], extent: [number, number]) {
  range.value = [Math.floor(extent[0]), Math.ceil(extent[1])]
  nextTick(() => listEl.value?.scrollTo({ top: 0 }))
}
watch(range, () => nextTick(() => listEl.value?.scrollTo({ top: 0 })))

const drag = ref<{ x0: number; x1: number } | null>(null)
const yearAt = (px: number) => {
  const [a, b] = domain
  const w = Math.max(1, width.value - 24)
  const rtl = getComputedStyle(ruleEl.value!).direction === 'rtl'
  const t = ((rtl ? width.value - px : px) - 12) / w
  return a + Math.min(1, Math.max(0, t)) * (b - a)
}
function onDown(e: PointerEvent) {
  if ((e.target as HTMLElement).closest('a, button')) return
  const r = ruleEl.value!.getBoundingClientRect()
  drag.value = { x0: e.clientX - r.left, x1: e.clientX - r.left }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}
function onMove(e: PointerEvent) {
  if (!drag.value) return
  drag.value.x1 = e.clientX - ruleEl.value!.getBoundingClientRect().left
}
function onUp() {
  const d = drag.value
  drag.value = null
  if (!d || Math.abs(d.x1 - d.x0) < 6) return
  const a = yearAt(Math.min(d.x0, d.x1))
  const b = yearAt(Math.max(d.x0, d.x1))
  const lo = Math.floor(Math.min(a, b))
  const hi = Math.ceil(Math.max(a, b))
  range.value = [lo, Math.max(hi, lo + 1)]
}
const band = computed(() => {
  if (drag.value) {
    const a = Math.min(drag.value.x0, drag.value.x1)
    const b = Math.max(drag.value.x0, drag.value.x1)
    const rtl = ruleEl.value && getComputedStyle(ruleEl.value).direction === 'rtl'
    return rtl ? { start: width.value - b, size: b - a } : { start: a, size: b - a }
  }
  if (!range.value) return null
  const s = xOf(Math.max(range.value[0], domain[0]), domain, width.value)
  const e = xOf(Math.min(range.value[1], domain[1]), domain, width.value)
  return { start: s, size: Math.max(2, e - s) }
})

// ── Back to the ruler after a jump ─────────────────────────────────────────
const frameEl = ref<HTMLElement | null>(null)
function backToRuler() {
  frameEl.value?.scrollIntoView({ block: 'start', behavior: 'instant' as ScrollBehavior })
  if (collapsed.value) collapsed.value = false
  nextTick(() => frameEl.value?.querySelector<HTMLElement>('.vr__list a[aria-current="true"], .vr__title')?.focus())
}
onMounted(() => (inUse.value = false))
</script>

<template>
  <Teleport
    v-if="ctx.leadMount.value"
    :to="ctx.leadMount.value"
  >
    <section
      ref="frameEl"
      class="vr"
      :class="{ 'vr--sticky': sticky, 'vr--collapsed': collapsed, 'vr--narrow': narrow }"
      aria-labelledby="vr-title"
      @pointerdown.capture="inUse = true"
      @focusin="inUse = true"
    >
      <header class="vr__head">
        <h2
          id="vr-title"
          class="vr__title"
          tabindex="-1"
        >
          {{ msg.rulerTitle }}
        </h2>
        <span
          v-if="collapsed"
          class="vr__summary"
        >{{ periodLabel }} · {{ msg.eventsCount(matching.length) }}</span>
        <span
          v-else
          class="vr__note"
        >{{ msg.rulerNote }}</span>
        <CdxButton
          class="vr__collapse"
          weight="quiet"
          size="small"
          :aria-expanded="collapsed ? 'false' : 'true'"
          aria-controls="vr-body"
          @click="toggleCollapsed"
        >
          <CdxIcon
            :icon="collapsed ? cdxIconExpand : cdxIconCollapse"
            size="small"
          />
          {{ collapsed ? msg.expand : msg.collapse }}
        </CdxButton>
      </header>

      <div
        v-show="!collapsed"
        id="vr-body"
        class="vr__body"
      >
        <PeriodControls
          v-model:range="range"
          class="vr__periods"
          :periods="periods"
          :events="events"
          :compact="narrow"
          :era="ctx.era"
        />

        <div
          ref="ruleEl"
          class="vr__rule"
          :class="{ 'vr__rule--dragging': !!drag }"
          @pointerdown="onDown"
          @pointermove="onMove"
          @pointerup="onUp"
          @pointercancel="drag = null"
        >
          <div
            v-if="band"
            class="vr__band"
            :style="{ insetInlineStart: `${band.start}px`, inlineSize: `${band.size}px` }"
          />
          <template v-if="width">
            <RulerTrack
              :events="events"
              :domain="domain"
              :width="width"
              :min-gap="narrow ? 22 : 18"
              @cluster="showCluster"
            />
            <RulerAxis
              :domain="domain"
              :width="width"
              :era="ctx.era"
            />
          </template>
        </div>
        <p
          v-if="!narrow"
          class="vr__hint"
        >
          {{ msg.dragHint }} {{ msg.blankMeaning }}
        </p>

        <UnresolvedNotice />
        <div
          class="vr__list-head"
          aria-live="polite"
        >
          {{ msg.matching(matching.length, periodLabel) }}
        </div>
        <ol
          ref="listEl"
          class="vr__list"
          tabindex="-1"
        >
          <li
            v-for="e in matching"
            :key="e.id"
            class="vr__row"
            :class="{ 'vr__row--selected': nav.selectedId.value === e.id }"
          >
            <span class="vr__date">{{ formatWhen(e.date, ctx.era) }}</span>
            <span class="vr__what">
              <EventLink :event="e" />
              <span class="vr__section">
                {{ e.sourceAnchor.sectionTitle
                }}<template v-if="timeKind(e.date) !== 'point'">
                  · {{ timeKind(e.date) === 'span' ? msg.duration : msg.approximate }}</template>
              </span>
            </span>
            <CdxIcon
              v-if="nav.inView.value.includes(e.id)"
              class="vr__eye"
              :icon="cdxIconEye"
              size="small"
              :icon-label="msg.inView"
            />
          </li>
          <li
            v-if="!matching.length"
            class="vr__empty"
          >
            {{ msg.noEventsIn }}
          </li>
        </ol>
      </div>
    </section>
  </Teleport>

  <ReturnBar>
    <CdxButton
      weight="quiet"
      @click="backToRuler"
    >
      {{ msg.backToRuler }}
    </CdxButton>
  </ReturnBar>
</template>

<style scoped>
.vr {
  --vr-height: 400px;
  padding: var(--spacing-75) 0 var(--spacing-50);
  border-block: var(--border-width-base) solid var(--border-color-base);
  background: var(--background-color-base);
  font-family: var(--font-family-base);
  font-size: var(--font-size-medium);
}
.vr--sticky {
  box-shadow: 0 6px 6px -6px rgba(0, 0, 0, 0.18);
}
.vr__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--spacing-25) var(--spacing-75);
}
.mw-parser-output .vr__title,
.vr__title {
  margin: 0;
  padding: 0;
  border: 0;
  font-family: var(--font-family-base);
  font-size: var(--font-size-medium);
  line-height: var(--line-height-medium);
  font-weight: var(--font-weight-bold);
}
.vr__note,
.vr__summary,
.vr__hint {
  color: var(--color-subtle);
  font-size: var(--font-size-small);
  line-height: var(--line-height-small);
}
.vr__summary {
  color: var(--color-base);
  font-variant-numeric: tabular-nums;
}
.vr__collapse {
  margin-inline-start: auto;
}
.vr__body {
  display: flex;
  flex-direction: column;
  height: var(--vr-height);
  margin-block-start: var(--spacing-50);
}
.vr--narrow .vr__body {
  height: 440px;
}
.vr__periods {
  flex: none;
}
.vr__rule {
  position: relative;
  flex: none;
  margin-block-start: var(--spacing-50);
  touch-action: pan-y;
  cursor: crosshair;
  user-select: none;
}
.vr__band {
  position: absolute;
  inset-block: 0 4px;
  background: var(--background-color-progressive-subtle);
  border-inline: 2px solid var(--color-progressive);
  pointer-events: none;
}
.vr__hint {
  flex: none;
  margin: 0 0 var(--spacing-25);
}
.vr__list-head {
  flex: none;
  padding-block: var(--spacing-25);
  border-block-end: var(--border-width-base) solid var(--border-color-subtle);
  font-size: var(--font-size-small);
  font-weight: var(--font-weight-bold);
}
.mw-parser-output .vr__list,
.vr__list {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
  overscroll-behavior: contain;
}
.mw-parser-output .vr__row,
.vr__row {
  display: grid;
  grid-template-columns: 9em minmax(0, 1fr) 16px;
  gap: var(--spacing-50);
  align-items: baseline;
  margin: 0;
  padding: var(--spacing-25) var(--spacing-50);
  border-block-end: var(--border-width-base) solid var(--border-color-subtle);
  font-size: var(--font-size-small);
  line-height: var(--line-height-small);
}
.vr--narrow .vr__row {
  grid-template-columns: 6.5em minmax(0, 1fr) 16px;
}
.vr__row--selected {
  box-shadow: inset 3px 0 0 var(--color-progressive);
}
[dir='rtl'] .vr__row--selected {
  box-shadow: inset -3px 0 0 var(--color-progressive);
}
.vr__row--selected :deep(.tn-link) {
  font-weight: var(--font-weight-bold);
}
.vr__date {
  color: var(--color-subtle);
  font-variant-numeric: tabular-nums;
}
.vr__section {
  display: block;
  color: var(--color-subtle);
}
.vr__eye {
  color: var(--color-subtle);
}
.vr__empty {
  padding: var(--spacing-50);
  color: var(--color-subtle);
  font-size: var(--font-size-small);
}
</style>
