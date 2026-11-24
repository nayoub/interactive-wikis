<script setup lang="ts">
/**
 * B · Time ruler: one persistent ruler, three presentations.
 *
 *   overview   below the introduction: the ruler with milestone labels and
 *              the exploration controls (about 260px, never more than the cap)
 *   compact    docked under the wiki header (about 68px): the same axis and
 *              marks drawn together, the reading caret, the passage being
 *              read, and Explore timeline
 *   explore    the same object expanded where it is: labels, controls and one
 *              bounded region for the results or a preview (≤ 44% of the
 *              visible height below the header)
 *
 * The marks stay mounted and keep their horizontal positions; only vertical
 * geometry and opacity animate (one motion value, MOTION_MS). Docking (the
 * sticky mount reaching the header) is separate from expansion: docking
 * contracts the overview; Explore timeline stays open until Resume reading,
 * Close, Escape or Read this passage.
 *
 * Anchoring: the mount is sticky but still in flow, so while docked a change
 * of panel height moves the article after it by the same amount: the line
 * under the panel follows its lower edge. Native scroll anchoring is off for
 * the length of each transition only, so nothing else compensates (see
 * ruler/useDock.ts).
 *
 * States kept apart: the reading anchor (from article position), the
 * selected event (a deliberate choice), the preview (what the region shows),
 * the filter range, and the navigation origin (saved only by Read this
 * passage, restored once by Return to reading).
 */
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import { CdxButton, CdxIcon } from '@wikimedia/codex'
import {
  cdxIconArrowPrevious,
  cdxIconClose,
  cdxIconCollapse,
  cdxIconExpand,
  cdxIconInfo,
  cdxIconNext,
  cdxIconPrevious,
} from '@wikimedia/codex-icons'

import { NAV, type NavContext } from '../context'
import type { NavEvent } from '../events'
import { msg } from '../messages'
import { domainOf, formatWhen, interval, midpoint, overlaps, tickStep, yearLabel } from '../time'
import { MOTION_MS, placeLabels, rangeMarks, sceneLayout, xAt } from '../ruler/layout'
import RulerRegion, { type RegionView } from '../ruler/RulerRegion.vue'
import RulerScene from '../ruler/RulerScene.vue'
import { useDock } from '../ruler/useDock'
import { useReading } from '../ruler/useReading'

const ctx = inject(NAV) as NavContext & { leadMount: Ref<HTMLElement | null> }
const nav = ctx.nav
const era = ctx.era
const events = [...ctx.collection.events].sort((a, b) => midpoint(a.date) - midpoint(b.date) || a.order - b.order)
const domain = domainOf(events.map((e) => interval(e.date)))
const narrow = computed(() => ctx.width.value === 'narrow')

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
const cluster = ref<{ events: NavEvent[]; extent: [number, number] } | null>(null)
const presentation = computed<'overview' | 'compact' | 'explore'>(() =>
  exploring.value ? 'explore' : dock.contracted.value ? 'compact' : 'overview',
)
const compact = computed(() => presentation.value === 'compact')

// ── Measurements ─────────────────────────────────────────────────────────
const root = ref<HTMLElement | null>(null)
const topEl = ref<HTMLElement | null>(null)
const controlsEl = ref<HTMLElement | null>(null)
const width = ref(0)
const topH = ref(28)
const controlsH = ref(40)
let ro: ResizeObserver | null = null
watch([root, topEl, controlsEl], () => {
  ro?.disconnect()
  ro = new ResizeObserver(() => {
    if (root.value) width.value = root.value.clientWidth
    if (topEl.value) topH.value = topEl.value.offsetHeight
    if (controlsEl.value) controlsH.value = controlsEl.value.offsetHeight
  })
  for (const el of [root.value, topEl.value, controlsEl.value]) if (el) ro.observe(el)
})
onBeforeUnmount(() => ro?.disconnect())

// ── Geometry ─────────────────────────────────────────────────────────────
const PADY = 2
const MIN_REGION = 96
const LOCAL_HEAD = 34
const rangeRows = computed(() => Math.max(1, ...rangeMarks(events, domain, Math.max(width.value, 1)).map((r) => r.row + 1)))
const scene = (c: boolean, rows: number) => sceneLayout(c, rangeRows.value, rows)
/** The cap: the whole expanded panel stays within about 44% of the visible height below the header. */
const cap = computed(() => Math.round((dock.viewH.value - dock.header.value) * 0.44))
const block = (rows: number) => PADY + topH.value + scene(false, rows).height + controlsH.value + PADY
const pickRows = (fits: (r: number) => boolean) => [3, 2, 1, 0].find(fits) ?? 0
const overviewRows = computed(() => pickRows((r) => block(r) <= Math.max(cap.value, block(0))))
const exploreRows = computed(() => pickRows((r) => block(r) + MIN_REGION <= cap.value))
/** The phone close-up has no label rows: its room goes to the preview (tapping a mark shows it). */
const localRows = computed(() => 0)
const compactH = computed(() => PADY + topH.value + scene(true, 0).height + PADY)

const fullLayout = computed(() => {
  if (presentation.value === 'compact') return scene(true, 0)
  if (presentation.value === 'explore') return narrow.value ? scene(true, 0) : scene(false, exploreRows.value)
  return scene(false, overviewRows.value)
})
const localLayout = computed(() => scene(false, localRows.value))
const localH = computed(() => (presentation.value === 'explore' && narrow.value ? LOCAL_HEAD + localLayout.value.height : 0))
const baseH = computed(() =>
  presentation.value === 'compact'
    ? compactH.value
    : PADY + topH.value + localH.value + fullLayout.value.height + controlsH.value + PADY,
)
const panelH = computed(() => (presentation.value === 'explore' ? Math.max(cap.value, baseH.value + 80) : baseH.value))
const regionH = computed(() => (presentation.value === 'explore' ? panelH.value - baseH.value : 0))

// Every presentation change is a panel transition: suspend native anchoring for it.
const motion = ref<'expand' | 'collapse'>('expand')
watch(panelH, (h, old) => {
  motion.value = h >= (old ?? 0) ? 'expand' : 'collapse'
  dock.holdAnchoring(settledNow)
})

// ── Labels (depend on the width only, so they never rearrange on selection) ──
const labelFont = () => {
  const cs = root.value ? getComputedStyle(root.value) : null
  return `14px ${cs?.fontFamily ?? 'sans-serif'}`
}
const fullLabels = computed(() =>
  width.value
    ? placeLabels(
        events.filter((e) => e.milestone).map((e) => ({ e, x: xAt(midpoint(e.date), domain, width.value), text: `${formatWhen(e.date, era)} ${e.label}` })),
        width.value,
        3,
        labelFont(),
        narrow.value ? 150 : 220,
      )
    : [],
)

// ── Filter range (the controls own its count) ────────────────────────────
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
const step = tickStep(domain[1] - domain[0], 30)
const bounds: number[] = []
for (let y = Math.ceil(domain[0] / step) * step; y <= domain[1]; y += step) bounds.push(y)
const fromOptions = computed(() => [...new Set([...bounds, ...(range.value ? [range.value[0]] : [])])].sort((a, b) => a - b))
const toOptions = computed(() => [...new Set([...bounds, ...(range.value ? [range.value[1] - 1] : [])])].sort((a, b) => a - b))
function setFrom(v: string) {
  if (v === '') return void (range.value = range.value && range.value[1] < domain[1] ? [domain[0], range.value[1]] : null)
  const a = Number(v)
  const b = range.value?.[1] ?? domain[1] + 1
  range.value = [a, Math.max(b, a + 1)]
}
function setTo(v: string) {
  if (v === '') return void (range.value = range.value && range.value[0] > domain[0] ? [range.value[0], domain[1] + 1] : null)
  const b = Number(v) + 1
  const a = range.value?.[0] ?? domain[0]
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
  nav.announce(`${formatWhen(e.date, era)}: ${e.label}. ${msg.inSection(e.sourceAnchor.sectionTitle)}.`)
}
function openCluster(list: NavEvent[], extent: [number, number]) {
  cluster.value = { events: list, extent }
  view.value = 'cluster'
  exploring.value = true
}
const clusterTitle = computed(() =>
  cluster.value
    ? msg.trClusterTitle(cluster.value.events.length, yearLabel(Math.floor(cluster.value.extent[0]), era), yearLabel(Math.ceil(cluster.value.extent[1]) - 1, era))
    : '',
)
function stepBy(dir: 1 | -1) {
  const list = matching.value
  if (!list.length) return
  const curId = previewId.value ?? nav.selectedId.value ?? reading.value.id
  const cur = curId ? events.find((e) => e.id === curId) : null
  let next: NavEvent | undefined
  const i = cur ? list.indexOf(cur) : -1
  if (i >= 0) next = list[i + dir]
  else if (cur) {
    const t = midpoint(cur.date)
    next = dir > 0 ? list.find((e) => midpoint(e.date) > t) : [...list].reverse().find((e) => midpoint(e.date) < t)
  } else next = dir > 0 ? list[0] : list[list.length - 1]
  if (!next) return
  const onMark = (document.activeElement as HTMLElement | null)?.closest?.('.rs__mark, .rs__range')
  open(next.id)
  if (onMark) nextTick(() => focusMark(next!.id))
}
function focusMark(id: string) {
  const sel = `.rs__mark[data-event="${CSS.escape(id)}"], .rs__range[data-event="${CSS.escape(id)}"], .rs__cluster[data-events~="${CSS.escape(id)}"]`
  const els = [...(root.value?.querySelectorAll<HTMLElement>(sel) ?? [])].filter((el) => el.tabIndex >= 0)
  els[els.length - 1]?.focus({ preventScroll: true })
}
const canPrev = computed(() => matching.value.length > 0)
const canNext = computed(() => matching.value.length > 0)

// ── Explore, resume, read, return ────────────────────────────────────────
const modeBtn = ref<InstanceType<typeof CdxButton> | null>(null)
const focusModeButton = () => ((modeBtn.value?.$el as HTMLElement | undefined) ?? null)?.focus({ preventScroll: true })
/** If collapsing would hide the focused control, focus moves to the surviving button (without scrolling). */
watch(
  presentation,
  (p) => {
    const a = document.activeElement as HTMLElement | null
    if (!a || !root.value?.contains(a)) return
    const hidden = (p === 'compact' && !topEl.value?.contains(a)) || (p !== 'explore' && !!a.closest('.tr__region, .tr__local'))
    if (hidden) nextTick(focusModeButton)
  },
  { flush: 'pre' },
)

const localCenter = ref<number | null>(null)
const panned = ref(false)
function explore() {
  view.value = previewId.value ? 'preview' : 'results'
  exploring.value = true
}
function resume() {
  exploring.value = false
  previewId.value = null
  cluster.value = null
  view.value = 'results'
}
const modeAction = computed(() =>
  presentation.value === 'explore'
    ? { label: dock.stuck.value ? msg.trResume : msg.trClose, icon: cdxIconCollapse, run: resume }
    : { label: msg.trExplore, icon: cdxIconExpand, run: explore },
)

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
      cluster.value = null
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

// ── Phone: a close-up period above the full ruler ─────────────────────────
const SPANS = [10, 20, 25, 50, 100, 200, 250, 500, 1000]
const localSpan = SPANS.find((s) => s >= (domain[1] - domain[0]) / 5) ?? 1000
const clampCenter = (c: number) => Math.min(domain[1] - localSpan / 2, Math.max(domain[0] + localSpan / 2, c))
watch(exploring, (on) => {
  if (!on || !narrow.value || panned.value) return
  const r = reading.value.id ? events.find((e) => e.id === reading.value.id) : null
  localCenter.value = clampCenter(r ? midpoint(r.date) : (domain[0] + domain[1]) / 2)
})
const localDomain = computed<[number, number]>(() => {
  const c = localCenter.value ?? clampCenter((domain[0] + domain[1]) / 2)
  return [c - localSpan / 2, c + localSpan / 2]
})
const localEvents = computed(() => events.filter((e) => overlaps(interval(e.date), localDomain.value)))
const localLabels = computed(() =>
  width.value
    ? placeLabels(
        localEvents.value.map((e) => ({ e, x: xAt(midpoint(e.date), localDomain.value, width.value), text: `${formatWhen(e.date, era)} ${e.label}` })),
        width.value,
        localRows.value,
        labelFont(),
        140,
      )
    : [],
)
function pan(dir: 1 | -1) {
  panned.value = true
  localCenter.value = clampCenter((localCenter.value ?? 0) + (dir * localSpan) / 2)
}
function onFullTap(year: number) {
  if (compact.value) return explore()
  if (presentation.value === 'explore' && narrow.value) {
    panned.value = true
    localCenter.value = clampCenter(year)
  }
}

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
  nextTick(() => {
    dock.check()
    updateReading(readingLine())
  })
  // The mount is placed after the skin settles.
  setTimeout(() => {
    dock.check()
    updateReading(readingLine())
  }, 200)
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

      <!-- The passage label and the one mode button: present in every presentation. -->
      <div
        ref="topEl"
        class="tr__top"
      >
        <p
          class="tr__reading"
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
        <template v-if="nav.origin.value">
          <CdxButton
            size="small"
            class="tr__return"
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
          class="tr__mode"
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

      <!-- Phone: a close-up period with usable spacing, above the full ruler. -->
      <div
        v-if="narrow"
        class="tr__local"
        :style="{ height: px(localH) }"
        :inert="presentation !== 'explore' || undefined"
      >
        <div class="tr__local-head">
          <CdxButton
            size="small"
            weight="quiet"
            :aria-label="msg.trEarlier"
            @click="pan(-1)"
          >
            <CdxIcon
              :icon="cdxIconPrevious"
              size="small"
            />
          </CdxButton>
          <span class="tr__local-label">{{ msg.trLocal(yearLabel(Math.round(localDomain[0]), era), yearLabel(Math.round(localDomain[1]), era)) }}</span>
          <CdxButton
            size="small"
            weight="quiet"
            :aria-label="msg.trLater"
            @click="pan(1)"
          >
            <CdxIcon
              :icon="cdxIconNext"
              size="small"
            />
          </CdxButton>
        </div>
        <RulerScene
          v-if="width"
          class="tr__local-scene"
          :events="localEvents"
          :domain="localDomain"
          :width="width"
          :layout="localLayout"
          :min-gap="32"
          :era="era"
          :labels="localLabels"
          :selected-id="nav.selectedId.value"
          :reading-id="reading.id"
          :reading-state="reading.state"
          :range="range"
          draggable
          @pick="open"
          @cluster="openCluster"
          @commit="(r) => (range = r)"
        />
      </div>

      <!-- The persistent full-domain ruler. -->
      <RulerScene
        v-if="width"
        class="tr__scene"
        :events="events"
        :domain="domain"
        :width="width"
        :layout="fullLayout"
        :min-gap="narrow ? 28 : 24"
        :era="era"
        :labels="fullLabels"
        :selected-id="nav.selectedId.value"
        :reading-id="reading.id"
        :reading-state="reading.state"
        :range="range"
        :interactive="!fullLayout.compact"
        :draggable="!fullLayout.compact"
        :window-band="presentation === 'explore' && narrow ? localDomain : null"
        @pick="open"
        @cluster="openCluster"
        @commit="(r) => (range = r)"
        @tap="onFullTap"
      />

      <!-- Exploration controls: filter counts live here, not in the reading label. -->
      <div
        ref="controlsEl"
        class="tr__controls"
        :inert="compact || undefined"
      >
        <div class="tr__group">
          <CdxButton
            size="small"
            :disabled="!canPrev"
            :aria-label="msg.trPrev"
            @click="stepBy(-1)"
          >
            <CdxIcon
              :icon="cdxIconPrevious"
              size="small"
            /><span class="tr__btn-text">{{ msg.trPrev }}</span>
          </CdxButton>
          <CdxButton
            size="small"
            :disabled="!canNext"
            :aria-label="msg.trNext"
            @click="stepBy(1)"
          >
            <span class="tr__btn-text">{{ msg.trNext }}</span><CdxIcon
              :icon="cdxIconNext"
              size="small"
            />
          </CdxButton>
        </div>
        <div
          class="tr__group tr__range"
          role="group"
          :aria-label="msg.trLegendRange"
        >
          <label class="tr__field">
            <span :class="{ 'tn-visually-hidden': narrow }">{{ msg.trFrom }}</span>
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
            <span :class="{ 'tn-visually-hidden': narrow }">{{ msg.trTo }}</span>
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
            :class="{ 'tn-visually-hidden': narrow && !range }"
            aria-live="polite"
          >{{ msg.trRangeCount(matching.length, events.length) }}</span>
        </div>
        <CdxButton
          size="small"
          weight="quiet"
          class="tr__help"
          :aria-pressed="view === 'help' && exploring ? 'true' : 'false'"
          @click="view === 'help' && exploring ? (view = 'results') : ((view = 'help'), (exploring = true))"
        >
          <CdxIcon
            :icon="cdxIconInfo"
            size="small"
          /><span class="tr__btn-text">{{ msg.trHowToRead }}</span>
        </CdxButton>
      </div>

      <!-- One bounded region: results, a cluster, help, or one preview. -->
      <div
        class="tr__region"
        :style="{ height: px(regionH) }"
        :inert="presentation !== 'explore' || undefined"
      >
        <RulerRegion
          :view="view"
          :results="matching"
          :results-title="resultsTitle"
          :cluster="cluster?.events ?? []"
          :cluster-title="clusterTitle"
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
.tr {
  --tr-ease: var(--transition-timing-function-user, ease-out);
  position: relative;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  padding: 2px 0;
  overflow: hidden;
  border-block: var(--border-width-base) solid var(--border-color-base);
  background: var(--background-color-base);
  font-family: var(--font-family-base);
  font-size: var(--font-size-medium);
  transition:
    height var(--tr-motion) var(--tr-ease),
    box-shadow var(--tr-motion) linear;
}
.tr--stuck {
  box-shadow: 0 6px 6px -6px rgba(0, 0, 0, 0.2);
}
.tr > * {
  flex: none;
}

/* Top row: Reading · passage, Return, the mode button. */
.tr__top {
  display: flex;
  align-items: center;
  gap: var(--spacing-25) var(--spacing-50);
  min-height: 28px;
}
.mw-parser-output .tr__reading,
.tr__reading {
  display: flex;
  align-items: baseline;
  gap: var(--spacing-25);
  flex: 1;
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
.tr__mode,
.tr__return {
  flex: none;
}

/* Controls and the region: they fade first when contracting (0–70 ms) and last when expanding. */
.tr__controls,
.tr__region,
.tr__local {
  transition: opacity 100ms linear 140ms;
}
.tr__region,
.tr__local {
  overflow: hidden;
  transition:
    opacity 100ms linear 140ms,
    height var(--tr-motion) var(--tr-ease);
}
.tr--compact .tr__controls,
.tr:not(.tr--explore) .tr__region,
.tr:not(.tr--explore) .tr__local {
  opacity: 0;
  transition:
    opacity 70ms linear,
    height var(--tr-motion) var(--tr-ease);
}
.tr__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--spacing-25) var(--spacing-75);
  padding-block: var(--spacing-25);
}
.tr__group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--spacing-25) var(--spacing-50);
}
.tr__field {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-25);
  font-size: var(--font-size-small);
}
.tr__select {
  min-width: 0;
  min-height: 28px;
  padding-block: 0;
  font-size: var(--font-size-small);
}
.tr__count {
  color: var(--color-subtle);
  font-size: var(--font-size-small);
  font-variant-numeric: tabular-nums;
}
.tr__help {
  margin-inline-start: auto;
}
.tr__region {
  border-block-start: var(--border-width-base) solid var(--border-color-subtle);
}
.tr__local-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 34px;
  font-size: var(--font-size-small);
}
.tr__local-label {
  font-weight: var(--font-weight-bold);
  font-variant-numeric: tabular-nums;
}

/* Phones: icon-only stepping and help; the reading word gives way to the passage. */
.tr--narrow .tr__btn-text,
.tr--narrow .tr__reading-word {
  display: none;
}
.tr--narrow .tr__controls {
  gap: var(--spacing-25) var(--spacing-50);
}
.tr--narrow .tr__select {
  width: 5.5em;
  min-width: 0;
}
.tr--narrow .tr__field {
  gap: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .tr,
  .tr * {
    transition: none !important;
  }
}
</style>
