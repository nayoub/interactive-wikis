<script setup lang="ts">
/**
 * B · Time ruler: the earlier evenly spaced timeline, carried by the ruler's
 * reading interaction. One persistent timeline, three presentations:
 *
 *   overview   below the introduction: the even timeline (dates, short labels,
 *              occasional article images on stems above and below one line)
 *   compact    docked under the wiki header (about 68px): the same line and
 *              dots drawn up, years under them, the reading caret, the passage
 *              being read, and Explore timeline
 *   explore    the same object expanded where it is, plus one bounded region
 *              for the results or a preview (≤ 44% of the visible height)
 *
 * The timeline (ruler/EvenTrack.vue) stays mounted: positions, order and its
 * horizontal scroll offset survive every change; only vertical geometry and
 * opacity animate (one motion value, MOTION_MS). On phones the persistent
 * object is an overview of every event (ruler/EvenMini.vue); the timeline
 * itself is the nearby-period view above it, withdrawn when docked.
 *
 * This component keeps everything the visual pass must not change: docking
 * (separate from expansion), anchoring (the article follows the panel's
 * lower edge; native scroll anchoring held off while the panel moves; see
 * ruler/useDock.ts), the reading anchor, and the separate selection, preview,
 * filter and navigation origin. Picking a block previews it and never moves
 * the article; only Read this passage navigates; Resume reading closes at the
 * current passage; Return to reading restores the origin of a real jump.
 */
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import { CdxButton, CdxIcon } from '@wikimedia/codex'
import {
  cdxIconArrowPrevious,
  cdxIconClose,
  cdxIconCollapse,
  cdxIconExpand,
  cdxIconFunnel,
  cdxIconInfo,
  cdxIconNext,
  cdxIconPrevious,
} from '@wikimedia/codex-icons'

import { NAV, type NavContext } from '../context'
import type { NavEvent } from '../events'
import { msg } from '../messages'
import { formatWhen, interval, midpoint, overlaps, yearLabel } from '../time'
import EvenMini from '../ruler/EvenMini.vue'
import EvenTrack from '../ruler/EvenTrack.vue'
import { COMPACT, MINI_H, MOTION_MS, richLayout, SLOT_MIN, SLOT_MIN_PHONE, slotWidth } from '../ruler/layout'
import RulerRegion, { type RegionView } from '../ruler/RulerRegion.vue'
import { useDock } from '../ruler/useDock'
import { useReading } from '../ruler/useReading'

const ctx = inject(NAV) as NavContext & { leadMount: Ref<HTMLElement | null> }
const nav = ctx.nav
const era = ctx.era
const events = [...ctx.collection.events].sort((a, b) => midpoint(a.date) - midpoint(b.date) || a.order - b.order)
const intervals = events.map((e) => interval(e.date))
const lo = Math.floor(Math.min(...intervals.map((v) => v[0])))
const hi = Math.ceil(Math.max(...intervals.map((v) => v[1])))
const narrow = computed(() => ctx.width.value === 'narrow')

const reduced = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.tnMotion === 'reduce'
const frame = () =>
  new Promise<void>((r) => {
    let done = false
    const go = () => !done && ((done = true), r())
    requestAnimationFrame(go)
    setTimeout(go, 50)
  })
/** The panel's rendered height has reached its target (reading it starts any pending transition). */
const settledNow = () => !root.value || Math.abs(root.value.getBoundingClientRect().height - panelH.value) < 0.5
/** Wait until the panel has actually reached its new geometry (however slowly frames arrive). */
async function settle() {
  const t0 = performance.now()
  while (!settledNow() && performance.now() - t0 < 4000) await frame()
  await frame()
}

// ── Docking and reading ──────────────────────────────────────────────────
const dock = useDock(ctx.leadMount)
const body = () => document.querySelector<HTMLElement>('.tn-body')
const { reading, update: updateReading, set: setReading } = useReading({ body, events: () => events, resolve: nav.resolve })

// ── Presentation (docking ≠ expansion) ───────────────────────────────────
const exploring = ref(false)
const view = ref<RegionView>('results')
const previewId = ref<string | null>(null)
const filterOpen = ref(false)
const presentation = computed<'overview' | 'compact' | 'explore'>(() =>
  exploring.value ? 'explore' : dock.contracted.value ? 'compact' : 'overview',
)
const compact = computed(() => presentation.value === 'compact')

// ── Measurements ─────────────────────────────────────────────────────────
const root = ref<HTMLElement | null>(null)
const topEl = ref<HTMLElement | null>(null)
const filterEl = ref<HTMLElement | null>(null)
const track = ref<InstanceType<typeof EvenTrack> | null>(null)
const width = ref(0)
const topH = ref(28)
const filterH = ref(0)
let ro: ResizeObserver | null = null
watch([root, topEl, filterEl], () => {
  ro?.disconnect()
  ro = new ResizeObserver(() => {
    if (root.value) width.value = root.value.clientWidth
    if (topEl.value) topH.value = topEl.value.offsetHeight
    filterH.value = filterEl.value?.offsetHeight ?? 0
  })
  for (const el of [root.value, topEl.value, filterEl.value]) if (el) ro.observe(el)
  filterH.value = filterEl.value?.offsetHeight ?? 0
})
onBeforeUnmount(() => ro?.disconnect())

// ── Geometry ─────────────────────────────────────────────────────────────
const PADY = 2
const minRegion = computed(() => (narrow.value ? 96 : 104))
const slot = computed(() => slotWidth(events.length, width.value || 600, narrow.value ? SLOT_MIN_PHONE : SLOT_MIN))
const sb = computed(() => track.value?.sb ?? 0)
const avail = computed(() => dock.viewH.value - dock.header.value)
/** The cap: the whole expanded panel stays within about 44% of the visible height below the header. */
const cap = computed(() => Math.round(avail.value * 0.44))
const miniH = computed(() => (narrow.value ? MINI_H : 0))
const head = computed(() => 2 * PADY + topH.value + (compact.value ? 0 : filterH.value))
/** The overview is in flow, not docked: it may be as rich as the reference figure. */
const richOverview = computed(() => richLayout(events, Math.max(cap.value, avail.value * 0.55) - head.value - miniH.value - sb.value))
const richExplore = computed(() => richLayout(events, cap.value - head.value - miniH.value - sb.value - minRegion.value))
const rich = computed(() => (presentation.value === 'explore' ? richExplore.value : richOverview.value))
const trackMode = computed<'rich' | 'compact' | 'hidden'>(() => (compact.value ? (narrow.value ? 'hidden' : 'compact') : 'rich'))
const trackH = computed(() =>
  trackMode.value === 'rich' ? rich.value.height + sb.value : trackMode.value === 'compact' ? COMPACT.height + sb.value : 0,
)
const compactH = computed(() => 2 * PADY + topH.value + (narrow.value ? MINI_H : COMPACT.height + sb.value))
const baseH = computed(() => (compact.value ? compactH.value : head.value + trackH.value + miniH.value))
const panelH = computed(() => (presentation.value === 'explore' ? Math.max(cap.value, baseH.value + 80) : baseH.value))
const regionH = computed(() => (presentation.value === 'explore' ? panelH.value - baseH.value : 0))

// Every presentation change is a panel transition: hold native anchoring off until it lands.
const motion = ref<'expand' | 'collapse'>('expand')
watch(panelH, (h, old) => {
  motion.value = h >= (old ?? 0) ? 'expand' : 'collapse'
  dock.holdAnchoring(settledNow)
})

// ── Filter range (by real dates; the controls own its count) ─────────────
const range = computed({ get: () => nav.range.value, set: (r) => (nav.range.value = r) })
const inRange = (e: NavEvent) => !range.value || overlaps(interval(e.date), range.value)
const matching = computed(() => events.filter(inRange))
const rangeLabel = computed(() => {
  const r = range.value
  if (!r) return ''
  const a = yearLabel(r[0], era)
  const b = yearLabel(r[1] - 1, era)
  return a === b ? a : `${a}–${b}`
})
/** The bounds offered are the events' own dates, never invented in-between years. */
const fromOptions = computed(() =>
  [...new Set([...intervals.map((v) => Math.floor(v[0])), ...(range.value ? [range.value[0]] : [])])].sort((a, b) => a - b),
)
const toOptions = computed(() =>
  [...new Set([...intervals.map((v) => Math.ceil(v[1]) - 1), ...(range.value ? [range.value[1] - 1] : [])])].sort((a, b) => a - b),
)
function setFrom(v: string) {
  if (v === '') return void (range.value = range.value && range.value[1] < hi ? [lo, range.value[1]] : null)
  const a = Number(v)
  const b = range.value?.[1] ?? hi
  range.value = [a, Math.max(b, a + 1)]
}
function setTo(v: string) {
  if (v === '') return void (range.value = range.value && range.value[0] > lo ? [range.value[0], hi] : null)
  const b = Number(v) + 1
  const a = range.value?.[0] ?? lo
  range.value = [Math.min(a, b - 1), b]
}
// A range that excludes the open preview closes it; the selection is kept.
watch(range, () => {
  const p = previewId.value ? events.find((e) => e.id === previewId.value) : null
  if (p && !inRange(p)) {
    previewId.value = null
    if (view.value === 'preview') view.value = 'results'
  }
})

// ── Preview, selection, stepping ─────────────────────────────────────────
const preview = computed(() => (previewId.value ? (events.find((e) => e.id === previewId.value) ?? null) : null))
const previewMissing = computed(() => !!preview.value && !nav.resolve(preview.value))
function open(id: string) {
  const e = events.find((v) => v.id === id)
  if (!e) return
  nav.selectedId.value = id
  previewId.value = id
  view.value = 'preview'
  exploring.value = true
  track.value?.reveal(id, { smooth: !reduced() })
  nav.announce(`${formatWhen(e.date, era)}: ${e.label}. ${msg.inSection(e.sourceAnchor.sectionTitle)}.`)
}
function stepBy(dir: 1 | -1) {
  const list = matching.value
  if (!list.length) return
  // From the block that has keyboard focus, else the preview, the selection, then the passage being read.
  const onBlock = (document.activeElement as HTMLElement | null)?.closest?.<HTMLElement>('.et__block')
  const curId = onBlock?.dataset.event ?? previewId.value ?? nav.selectedId.value ?? reading.value.id
  const cur = curId ? events.find((e) => e.id === curId) : null
  let next: NavEvent | undefined
  const i = cur ? list.indexOf(cur) : -1
  if (i >= 0) next = list[i + dir]
  else if (cur) {
    const t = midpoint(cur.date)
    next = dir > 0 ? list.find((e) => midpoint(e.date) > t) : [...list].reverse().find((e) => midpoint(e.date) < t)
  } else next = dir > 0 ? list[0] : list[list.length - 1]
  if (!next) return
  open(next.id)
  if (onBlock) nextTick(() => root.value?.querySelector<HTMLElement>(`.et__block[data-event="${CSS.escape(next!.id)}"]`)?.focus({ preventScroll: true }))
}

// ── Explore, resume, read, return ────────────────────────────────────────
const modeBtn = ref<InstanceType<typeof CdxButton> | null>(null)
const focusModeButton = () => ((modeBtn.value?.$el as HTMLElement | undefined) ?? null)?.focus({ preventScroll: true })
/** If collapsing would hide the focused control, focus moves to the surviving button (without scrolling). */
watch(
  presentation,
  (p) => {
    const a = document.activeElement as HTMLElement | null
    if (!a || !root.value?.contains(a)) return
    const hidden = (p === 'compact' && !a.closest('.tr__keep')) || (p !== 'explore' && !!a.closest('.tr__region'))
    if (hidden) nextTick(focusModeButton)
  },
  { flush: 'pre' },
)
function explore() {
  view.value = previewId.value ? 'preview' : 'results'
  exploring.value = true
}
function resume() {
  exploring.value = false
  previewId.value = null
  view.value = 'results'
}
const modeAction = computed(() =>
  presentation.value === 'explore'
    ? { label: dock.stuck.value ? msg.trResume : msg.trClose, icon: cdxIconCollapse, run: resume }
    : { label: msg.trExplore, icon: cdxIconExpand, run: explore },
)
function toggleHelp() {
  if (view.value === 'help' && exploring.value) view.value = previewId.value ? 'preview' : 'results'
  else {
    view.value = 'help'
    exploring.value = true
  }
}

let jumpTarget: string | null = null
/** Read this passage: resolve first, settle the compact geometry, then place the passage below it. */
async function read(e: NavEvent) {
  const el = nav.resolve(e)
  if (!el) {
    nav.unresolved.value = e.id
    return
  }
  const below = el.getBoundingClientRect().top > dock.sentinel.getBoundingClientRect().top
  const was = panelH.value
  resume()
  if (below) dock.contracted.value = true
  await nextTick()
  if (panelH.value !== was) await settle()
  jumpTarget = e.id
  await nav.jump(e, { travel: 'nearby' })
}
async function back() {
  const was = panelH.value
  resume()
  await nextTick()
  if (panelH.value !== was) await settle()
  jumpTarget = null
  await nav.returnToOrigin({ travel: 'nearby' })
}

// ── Keyboard inside the ruler (no global handlers) ───────────────────────
function onKeydown(ev: KeyboardEvent) {
  const t = ev.target as HTMLElement
  if (ev.key === 'Escape') {
    if (view.value !== 'results' && exploring.value) {
      ev.preventDefault()
      const id = previewId.value
      previewId.value = null
      view.value = 'results'
      if (t.closest('.tr__region'))
        nextTick(() => root.value?.querySelector<HTMLElement>(`.rr__row[data-event="${CSS.escape(id ?? '')}"], .rr__row`)?.focus({ preventScroll: true }))
    } else if (exploring.value) {
      ev.preventDefault()
      resume()
    }
    return
  }
  if ((ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') && !compact.value) {
    if (t.matches('select, input, textarea')) return
    ev.preventDefault()
    const rtl = getComputedStyle(root.value!).direction === 'rtl'
    stepBy((ev.key === 'ArrowRight') !== rtl ? 1 : -1)
  }
}

// ── The timeline's sideways window ───────────────────────────────────────
const win = ref<[number, number] | null>(null)
const onTrackScroll = () => (win.value = track.value?.windowIndexes() ?? null)
function onTrackTap() {
  if (compact.value) explore()
}
function onMiniGo(i: number) {
  if (compact.value) explore()
  nextTick(() => track.value?.scrollToIndex(i, !reduced()))
}
// While reading (not exploring), the timeline keeps the passage being read in view.
watch(
  () => reading.value.id,
  (id) => {
    if (id && !exploring.value) track.value?.reveal(id, { smooth: !reduced() })
  },
)

// ── Scroll: docking and the reading anchor (genuine scrolling only) ──────
const readingLine = () => {
  const top = dock.header.value + compactH.value
  const k = (dock.viewH.value - top) / 3
  // Docked, the line rides with the panel's lower edge, like the article does.
  if (dock.stuck.value && root.value) return root.value.getBoundingClientRect().bottom + k
  return top + k
}
let pending = false
function onScroll() {
  if (pending) return
  pending = true
  const run = () => {
    if (!pending) return
    pending = false
    dock.check()
    // A jump's own travel is not reading; the reading anchor is set when it lands.
    if (!nav.jumping.value) updateReading(readingLine())
  }
  requestAnimationFrame(run)
  setTimeout(run, 60)
}
watch(
  () => nav.jumping.value,
  (j) => {
    if (j) return
    if (jumpTarget) setReading(jumpTarget)
    else updateReading(readingLine())
    jumpTarget = null
  },
)
const onResize = () => dock.check()
onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onResize)
  const first = () => {
    dock.check()
    updateReading(readingLine())
    if (reading.value.id) track.value?.reveal(reading.value.id, { center: true })
    onTrackScroll()
  }
  nextTick(first)
  // The mount is placed after the skin settles.
  setTimeout(first, 200)
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', onResize)
})

// ── The passage label (the compact hierarchy follows reading, not selection) ──
const readingEvent = computed(() => (reading.value.id ? (events.find((e) => e.id === reading.value.id) ?? null) : null))
const readingText = computed(() => {
  const r = reading.value
  const e = readingEvent.value
  if (e && r.state === 'at') return msg.trReadingAt(formatWhen(e.date, era), e.label)
  if (e && r.state === 'after') return msg.trReadingAfter(formatWhen(e.date, era), r.section)
  return r.section
})
const spanLabel = `${yearLabel(events[0]?.date.start.y ?? lo, era)}–${yearLabel((events[events.length - 1]?.date.end ?? events[events.length - 1]?.date.start)?.y ?? hi, era)}`
const resultsTitle = computed(() => (range.value ? msg.trEventsIn(matching.value.length, rangeLabel.value) : msg.trAllEvents(events.length)))
const px = (n: number) => `${Math.round(n)}px`
</script>

<template>
  <Teleport
    v-if="ctx.leadMount.value"
    :to="ctx.leadMount.value"
  >
    <section
      ref="root"
      class="tr"
      :class="[`tr--${presentation}`, `tr--${motion}`, { 'tr--stuck': dock.stuck.value, 'tr--narrow': narrow }]"
      :style="{ height: px(panelH), '--tr-motion': `${MOTION_MS}ms` }"
      aria-labelledby="tr-title"
      @keydown="onKeydown"
    >
      <h2
        id="tr-title"
        class="tn-visually-hidden"
      >
        {{ msg.trRulerLabel }}
      </h2>

      <!-- Header: the passage being read, quiet secondary tools, and the one mode button. -->
      <div
        ref="topEl"
        class="tr__top"
      >
        <p
          class="tr__reading tr__keep"
          :aria-label="msg.trReadingAria(readingText)"
        >
          <svg
            class="tr__caret"
            :class="{ 'tr__caret--after': reading.state === 'after', 'tr__caret--none': reading.state === 'before' }"
            width="12"
            height="10"
            viewBox="0 0 12 10"
            aria-hidden="true"
          ><path d="M6 1.2 L11 9 L1 9 Z" /></svg>
          <span class="tr__reading-word">{{ msg.trReading }}</span>
          <span class="tr__reading-text">{{ readingText }}</span>
        </p>
        <div
          v-show="!compact"
          class="tr__tools"
        >
          <span class="tr__span">{{ spanLabel }}</span>
          <CdxButton
            size="small"
            weight="quiet"
            :aria-label="msg.trPrev"
            :title="msg.trPrev"
            :disabled="!matching.length"
            @click="stepBy(-1)"
          >
            <CdxIcon
              :icon="cdxIconPrevious"
              size="small"
            />
          </CdxButton>
          <CdxButton
            size="small"
            weight="quiet"
            :aria-label="msg.trNext"
            :title="msg.trNext"
            :disabled="!matching.length"
            @click="stepBy(1)"
          >
            <CdxIcon
              :icon="cdxIconNext"
              size="small"
            />
          </CdxButton>
          <CdxButton
            size="small"
            weight="quiet"
            class="tr__filter-btn"
            :aria-expanded="filterOpen ? 'true' : 'false'"
            aria-controls="tr-filter"
            :aria-label="range ? `${msg.trFilter}: ${rangeLabel}, ${msg.trRangeCount(matching.length, events.length)}` : msg.trFilter"
            @click="filterOpen = !filterOpen"
          >
            <CdxIcon
              :icon="cdxIconFunnel"
              size="small"
            /><span
              v-if="range"
              class="tr__filter-on"
            >{{ rangeLabel }}</span>
          </CdxButton>
          <CdxButton
            size="small"
            weight="quiet"
            :aria-label="msg.trHowToRead"
            :title="msg.trHowToRead"
            :aria-pressed="view === 'help' && exploring ? 'true' : 'false'"
            @click="toggleHelp"
          >
            <CdxIcon
              :icon="cdxIconInfo"
              size="small"
            />
          </CdxButton>
        </div>
        <template v-if="nav.origin.value">
          <CdxButton
            size="small"
            class="tr__return tr__keep"
            :title="msg.returnFrom(nav.origin.value.section)"
            @click="back"
          >
            <CdxIcon
              :icon="cdxIconArrowPrevious"
              size="small"
            />
            <span class="tr__btn-text">{{ msg.returnToReading }}</span>
          </CdxButton>
          <CdxButton
            size="small"
            weight="quiet"
            class="tr__keep"
            :aria-label="msg.keepReadingHere"
            :title="msg.keepReadingHereHint"
            @click="nav.endExploration()"
          >
            <CdxIcon
              :icon="cdxIconClose"
              size="small"
            />
          </CdxButton>
        </template>
        <CdxButton
          ref="modeBtn"
          size="small"
          class="tr__mode tr__keep"
          :aria-expanded="presentation === 'explore' ? 'true' : 'false'"
          @click="modeAction.run"
        >
          <CdxIcon
            :icon="modeAction.icon"
            size="small"
          />
          {{ modeAction.label }}
        </CdxButton>
      </div>

      <!-- The date filter: a disclosure, by the events' own dates. -->
      <div
        v-if="filterOpen && !compact"
        id="tr-filter"
        ref="filterEl"
        class="tr__filter"
        role="group"
        :aria-label="msg.trFilter"
      >
        <label class="tr__field">
          <span>{{ msg.trFrom }}</span>
          <select
            class="cdx-select tr__select"
            :value="range ? String(range[0]) : ''"
            @change="setFrom(($event.target as HTMLSelectElement).value)"
          >
            <option value="">{{ msg.trAny }}</option>
            <option
              v-for="y in fromOptions"
              :key="y"
              :value="String(y)"
            >{{ yearLabel(y, era) }}</option>
          </select>
        </label>
        <label class="tr__field">
          <span>{{ msg.trTo }}</span>
          <select
            class="cdx-select tr__select"
            :value="range ? String(range[1] - 1) : ''"
            @change="setTo(($event.target as HTMLSelectElement).value)"
          >
            <option value="">{{ msg.trAny }}</option>
            <option
              v-for="y in toOptions"
              :key="y"
              :value="String(y)"
            >{{ yearLabel(y, era) }}</option>
          </select>
        </label>
        <CdxButton
          v-if="range"
          size="small"
          weight="quiet"
          @click="range = null"
        >
          {{ msg.trClearRange }}
        </CdxButton>
        <span
          class="tr__count"
          aria-live="polite"
        >{{ msg.trRangeCount(matching.length, events.length) }}</span>
      </div>

      <!-- The timeline: the one persistent object on desktop; the nearby-period view on phones. -->
      <EvenTrack
        ref="track"
        class="tr__track"
        :events="events"
        :slot-w="slot"
        :mode="trackMode"
        :geom="rich"
        :era="era"
        :selected-id="nav.selectedId.value"
        :reading-id="reading.id"
        :reading-state="reading.state"
        :range="range"
        :draggable="!narrow"
        @pick="open"
        @commit="(r) => (range = r)"
        @tap="onTrackTap"
        @scrolled="onTrackScroll"
      />

      <!-- Phones: every event, always visible (the compact overview). -->
      <EvenMini
        v-if="narrow && width"
        class="tr__mini tr__keep"
        :events="events"
        :width="width"
        :era="era"
        :selected-id="nav.selectedId.value"
        :reading-id="reading.id"
        :reading-state="reading.state"
        :range="range"
        :window="compact ? null : win"
        @go="onMiniGo"
      />

      <!-- One bounded region: results, help, or one preview. -->
      <div
        class="tr__region"
        :style="{ height: px(regionH) }"
        :inert="presentation !== 'explore' || undefined"
      >
        <RulerRegion
          :view="view"
          :results="matching"
          :results-title="resultsTitle"
          :cluster="[]"
          cluster-title=""
          :preview="preview"
          :preview-outside="!!preview && !inRange(preview)"
          :preview-missing="previewMissing"
          :selected-id="nav.selectedId.value"
          :reading-id="reading.id"
          :era="era"
          @open="open"
          @read="read"
          @back="view = 'results'"
        />
      </div>
    </section>
  </Teleport>
</template>

<style scoped>
/* Thin top and bottom rules, the article's own surface and type (as in the earlier figure). */
.tr {
  --tr-ease: var(--transition-timing-function-user, ease-out);
  position: relative;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  padding: 2px 0;
  overflow: hidden;
  border-block-start: var(--border-width-base) solid var(--border-color-base);
  border-block-end: var(--border-width-base) solid var(--border-color-subtle);
  background: var(--background-color-base);
  font-family: var(--font-family-base);
  font-size: var(--font-size-medium);
  transition:
    height var(--tr-motion) var(--tr-ease),
    box-shadow var(--tr-motion) linear;
}
.tr--stuck {
  border-block-end-color: var(--border-color-base);
  box-shadow: 0 6px 6px -6px rgba(0, 0, 0, 0.2);
}
.tr > * {
  flex: none;
}

/* Header */
.tr__top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0 var(--spacing-50);
  min-height: 28px;
}
.mw-parser-output .tr__reading,
.tr__reading {
  display: flex;
  align-items: baseline;
  gap: var(--spacing-25);
  flex: 1 1 12em;
  min-width: 0;
  margin: 0;
  font-size: var(--font-size-small);
  line-height: var(--line-height-small);
}
.tr__caret {
  flex: none;
  align-self: center;
  overflow: visible;
}
.tr__caret path {
  fill: var(--background-color-base);
  stroke: var(--color-base);
  stroke-width: 1.6;
  stroke-linejoin: round;
}
.tr__caret--after path {
  stroke-dasharray: 2 1.6;
}
.tr__caret--none {
  visibility: hidden;
}
.tr__reading-word {
  flex: none;
  color: var(--color-subtle);
}
.tr__reading-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: var(--font-weight-bold);
  font-variant-numeric: tabular-nums;
}
/* Secondary tools: quiet icons, a subdued date range. */
.tr__tools {
  display: flex;
  align-items: center;
  gap: 0;
  color: var(--color-subtle);
}
.tr__span {
  margin-inline-end: var(--spacing-25);
  color: var(--color-placeholder);
  font-size: var(--font-size-small);
  font-variant-numeric: tabular-nums;
}
.tr__filter-on {
  margin-inline-start: var(--spacing-25);
  font-size: var(--font-size-small);
  font-weight: var(--font-weight-normal);
}
.tr__tools :deep(.cdx-button) {
  color: var(--color-subtle);
}
.tr__mode,
.tr__return {
  flex: none;
}
.tr__filter {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--spacing-25) var(--spacing-75);
  padding-block: var(--spacing-25);
}
.tr__field {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-25);
  color: var(--color-subtle);
  font-size: var(--font-size-small);
}
.tr__select {
  min-width: 0;
  min-height: 28px;
  padding-block: 0;
  font-size: var(--font-size-small);
}
.tr__count {
  color: var(--color-placeholder);
  font-size: var(--font-size-small);
  font-variant-numeric: tabular-nums;
}
/* The region fades first when contracting (0–70 ms) and last when expanding. */
.tr__region {
  overflow: hidden;
  border-block-start: var(--border-width-base) solid var(--border-color-subtle);
  transition:
    opacity 100ms linear 140ms,
    height var(--tr-motion) var(--tr-ease);
}
.tr:not(.tr--explore) .tr__region {
  opacity: 0;
  transition:
    opacity 70ms linear,
    height var(--tr-motion) var(--tr-ease);
}

/* Phones: the reading word and button texts give way. */
.tr--narrow .tr__btn-text,
.tr--narrow .tr__reading-word,
.tr--narrow .tr__span {
  display: none;
}
.tr--narrow .tr__select {
  width: 6em;
}

@media (prefers-reduced-motion: reduce) {
  .tr,
  .tr * {
    transition: none !important;
  }
}
</style>
