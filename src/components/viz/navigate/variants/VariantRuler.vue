<script setup lang="ts">
/**
 * B · Time ruler: the article's authored timeline (ruler/authoring.ts),
 * read and edited in the same place.
 *
 * Reading. One persistent timeline in three presentations:
 *   overview   below the introduction, open: "Timeline", Edit timeline, and
 *              the even timeline (dates, short titles, occasional photographs)
 *   compact    docked under the wiki header: the same line and points with
 *              every visible date beside its point; one quiet chevron opens it
 *   explore    the same object opened where it is
 * The timeline is the control: scroll it sideways (a native scrollbar, arrow
 * keys); select an event (click, tap or Enter) to go straight to its passage.
 * The date being read is underlined. Docking and anchoring (the article
 * follows the panel's lower edge; ruler/useDock.ts) and the reading anchor
 * are unchanged.
 *
 * Editing (Edit timeline, or the article editor's Insert → Timeline): dates in
 * the article become chips; selecting one adds its event to the live timeline
 * in date order (focus stays in the article). Selecting an event shows its
 * Title field, its image (Add image, or the thumbnail to change it), View
 * source and Remove event. Undo, Cancel and Done are in one bar.
 */
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import { CdxButton, CdxIcon, CdxToggleButton } from '@wikimedia/codex'
import { cdxIconClose, cdxIconCollapse, cdxIconExpand, cdxIconListBullet } from '@wikimedia/codex-icons'

import { wikiTitleFromArticleHref } from '@/components/article/shared/wikiTitleFromArticleHref'
import ImagePicker from '../../curate/ImagePicker.vue'
import type { EventImage } from '../../model/types'
import { useSelectMode } from '../../pick/useSelectMode'
import { NAV, type NavContext } from '../context'
import type { NavEvent } from '../events'
import { msg } from '../messages'
import AuthorBar from '../ruler/AuthorBar.vue'
import EvenTrack from '../ruler/EvenTrack.vue'
import { AGE_LINE, blockFor, COMPACT, MOTION_MS, richLayout, sideLines, slotFor, slotsOf } from '../ruler/layout'
import RulerRegion from '../ruler/RulerRegion.vue'
import VerticalTimeline from '../ruler/VerticalTimeline.vue'
import { useDock } from '../ruler/useDock'
import { useReading } from '../ruler/useReading'

const ctx = inject(NAV) as NavContext & { leadMount: Ref<HTMLElement | null> }
const nav = ctx.nav
const era = ctx.era
const authoring = ctx.authoring
const editing = computed(() => authoring.editing.value)
/** The authored events, in date order (the saved timeline, or the draft being edited). */
const events = computed<NavEvent[]>(() => authoring.events.value)
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
const dock = useDock(ctx.leadMount, () => nav.jumping.value)
const bodyEl = ref<HTMLElement | null>(null)
const body = () => document.querySelector<HTMLElement>('.tn-body')
const { reading, update: updateReading, set: setReading } = useReading({
  body,
  events: () => events.value,
  resolve: nav.resolve,
  // The introduction (above the timeline) does not set the place: the timeline starts at its beginning.
  startAfter: () => ctx.leadMount.value,
})

// ── Presentation (docking ≠ expansion; editing keeps it open) ────────────
const exploring = ref(false)
/** Phones: the reader can turn the timeline to read top to bottom, in place (not while editing). */
const vertical = ref(false)
const presentation = computed<'overview' | 'compact' | 'explore' | 'vertical'>(() =>
  editing.value
    ? 'explore'
    : vertical.value && narrow.value
      ? 'vertical'
      : exploring.value
        ? 'explore'
        : dock.contracted.value
          ? 'compact'
          : 'overview',
)
const isVertical = computed(() => presentation.value === 'vertical')
const compact = computed(() => presentation.value === 'compact')
/**
 * Hidden: the reader closed the docked timeline. It stays out of the way
 * while they read on, and comes back (as the overview) once they scroll back
 * up to where it sits in the article.
 */
const dismissed = ref(false)
const hidden = computed(() => dismissed.value && dock.stuck.value && !editing.value && !exploring.value)
watch(
  () => dock.contracted.value,
  (c) => {
    if (!c) dismissed.value = false
  },
)
function hide() {
  exploring.value = false
  dismissed.value = true
}
const vlist = ref<InstanceType<typeof VerticalTimeline> | null>(null)
/** The vertical list's natural height (reported by the list itself). */
const vlistNat = ref(0)
// Turned vertical: start at the date being read.
watch(isVertical, (v) => {
  if (v) nextTick(() => requestAnimationFrame(() => reading.value.id && vlist.value?.reveal(reading.value.id, false)))
})

// ── Measurements ─────────────────────────────────────────────────────────
const root = ref<HTMLElement | null>(null)
const ctrlEl = ref<HTMLElement | null>(null)
const track = ref<InstanceType<typeof EvenTrack> | null>(null)
const width = ref(0)
const ctrlW = ref(0)
let ro: ResizeObserver | null = null
watch([root, ctrlEl], () => {
  ro?.disconnect()
  ro = new ResizeObserver(() => {
    if (root.value) width.value = root.value.clientWidth
    ctrlW.value = ctrlEl.value?.offsetWidth ?? 0
  })
  for (const el of [root.value, ctrlEl.value]) if (el) ro.observe(el)
})
onBeforeUnmount(() => ro?.disconnect())

// ── Geometry ─────────────────────────────────────────────────────────────
const PADY = 2
const HEAD = 40
const editH = computed(() => (narrow.value ? 128 : 84))
/** The editing bar (Undo, Cancel, Done), inside the panel under the editor. */
const barH = computed(() => 48)
const slot = computed(() => slotFor(width.value, narrow.value))
const blockW = computed(() => blockFor(slot.value, narrow.value))
const sb = computed(() => track.value?.sb ?? 0)
const avail = computed(() => dock.viewH.value - dock.header.value)
/** The cap: the whole open panel stays within about 44% of the visible height below the header. */
const cap = computed(() => Math.round(avail.value * 0.44))
/** Editing on a phone is a deliberate mode: the panel may take a little more of the screen. */
const editCap = computed(() => (narrow.value ? Math.round(avail.value * 0.55) : cap.value))
/** Ages: the subject's birth year from the infobox (biographies only; none for a city). */
const birthYear = computed(() => ctx.article.subject.birth?.y ?? null)
const ageLine = computed(() => (birthYear.value !== null ? AGE_LINE : 0))
/** One slot per date (same-date events share a point, a date and an age). */
const slots = computed(() => slotsOf(events.value, era))
const maxLines = computed(() => sideLines(slots.value, blockW.value))
/** In flow (not docked), the timeline may be as rich as the reference figure. */
const richOverview = computed(() =>
  richLayout(slots.value, Math.max(cap.value, avail.value * 0.55) - 2 * PADY - HEAD - sb.value, maxLines.value, false, ageLine.value, narrow.value),
)
/** Docked and open (or editing): within the cap, the editing area included. */
const richDocked = computed(() =>
  editing.value
    ? richLayout(
        slots.value,
        editCap.value - 2 * PADY - HEAD - sb.value - editH.value - barH.value,
        maxLines.value,
        true,
        ageLine.value,
        narrow.value,
        // Editing may take up to 70% of the screen so the photographs being chosen show in the timeline.
        Math.round(avail.value * 0.7) - 2 * PADY - HEAD - sb.value - editH.value - barH.value,
      )
    : richLayout(slots.value, cap.value - 2 * PADY - HEAD - sb.value, maxLines.value, false, ageLine.value, narrow.value),
)
const rich = computed(() => (editing.value || (presentation.value === 'explore' && dock.stuck.value) ? richDocked.value : richOverview.value))
const trackMode = computed<'rich' | 'compact'>(() => (compact.value ? 'compact' : 'rich'))
const trackH = computed(() => (trackMode.value === 'rich' ? rich.value.height : COMPACT.height) + sb.value)
const headH = computed(() => (compact.value ? 0 : HEAD))
/** The event editor appears only with an event selected (no empty state); the track keeps its size either way. */
const regionH = computed(() => (editing.value && editEvent.value ? editH.value : 0))
/** Vertical: as tall as the list, up to most of the screen in the article, or half of it when docked. */
/**
 * Docked, the list is short by default: a window on the date being read (about one
 * row), with the chevron to open it to half the screen. In the article it is as tall
 * as it needs, up to most of the screen.
 */
const LIST_SHORT = 104
const listOpen = ref(false)
const listShort = computed(() => dock.stuck.value && !listOpen.value)
const vlistH = computed(() =>
  listShort.value
    ? LIST_SHORT
    : Math.max(120, Math.min(vlistNat.value || 9999, Math.round(avail.value * (dock.stuck.value ? 0.5 : 0.7)) - 2 * PADY - HEAD)),
)
// The list's height changed: the date being read goes back to its middle once the panel has moved.
watch(vlistH, () => {
  if (!isVertical.value) return
  setTimeout(() => reading.value.id && vlist.value?.reveal(reading.value.id, !reduced()), MOTION_MS + 20)
})
// Leaving the dock folds the list again for next time.
watch(
  () => dock.stuck.value,
  (s) => {
    if (!s) listOpen.value = false
  },
)
const panelH = computed(() =>
  hidden.value
    ? 0
    : isVertical.value
      ? 2 * PADY + HEAD + vlistH.value
      : 2 * PADY + headH.value + trackH.value + regionH.value + (editing.value ? barH.value : 0),
)

// Every presentation change is a panel transition: hold native anchoring off until it lands.
const motion = ref<'expand' | 'collapse'>('expand')
watch(panelH, (h, old) => {
  motion.value = h >= (old ?? 0) ? 'expand' : 'collapse'
  dock.holdAnchoring(settledNow)
})

// ── Selecting an event: go to its passage, or (editing) edit it ──────────
/** Only while editing is an event "selected"; reading, selecting an event goes to it. */
const selectedId = computed(() => (editing.value ? authoring.currentId.value : null))
/**
 * The articles the edited event's sentence links to (its blue links, in order):
 * the image picker offers their pictures first (a single's cover, a building's photo).
 */
const linkedPages = computed<string[]>(() => {
  const e = editEvent.value
  if (!e || !pickerOpen.value) return []
  const mention = nav.resolve(e)
  const block = mention?.closest('p, li, dd, td, th, blockquote, figcaption')
  if (!mention || !block) return []
  const words = new Set((e.sourceLinks ?? []).map((t) => t.trim()))
  const subject = ctx.article.subject.name.toLowerCase()
  // Text offsets in the block: the link nearest the date comes first ("his 2020 single
  // "After Party"" → After Party before the 2019 single named earlier in the sentence).
  const offset = (el: Element) => {
    const r = document.createRange()
    r.setStart(block, 0)
    r.setEnd(el, 0)
    return r.toString().length
  }
  const at = offset(mention)
  const found: { title: string; d: number }[] = []
  block.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
    if (a.classList.contains('new') || a.closest('sup.reference')) return
    if (words.size && !words.has(a.textContent?.trim() ?? '')) return
    const t = wikiTitleFromArticleHref(a.dataset.protowikiWikiHref ?? a.getAttribute('href') ?? '', 'en.wikipedia.org')
    if (!t || t.toLowerCase() === subject || found.some((f) => f.title === t)) return
    found.push({ title: t, d: Math.abs(offset(a) - at) })
  })
  return found
    .sort((x, y) => x.d - y.d)
    .slice(0, 6)
    .map((f) => f.title)
})
const editEvent = computed(() => (authoring.currentId.value ? (events.value.find((e) => e.id === authoring.currentId.value) ?? null) : null))
function pick(id: string) {
  const e = events.value.find((v) => v.id === id)
  if (!e) return
  if (editing.value) {
    authoring.currentId.value = authoring.currentId.value === id ? null : id
    track.value?.reveal(id, { smooth: !reduced() })
    return
  }
  // Reading: straight to the passage.
  void read(e)
}

// ── Open, close, read, return ────────────────────────────────────────────
const modeBtn = ref<InstanceType<typeof CdxButton> | null>(null)
const focusModeButton = () => ((modeBtn.value?.$el as HTMLElement | undefined) ?? null)?.focus({ preventScroll: true })
/** If closing would hide the focused control, focus moves to the chevron (without scrolling). */
watch(
  presentation,
  (p) => {
    const a = document.activeElement as HTMLElement | null
    if (!a || !root.value?.contains(a)) return
    if (p === 'compact' && a.closest('.tr__top')) nextTick(focusModeButton)
  },
  { flush: 'pre' },
)
function explore() {
  exploring.value = true
}
function resume() {
  exploring.value = false
}
/** The one chevron, once the timeline has docked (or is open beyond the overview). */
const showToggle = computed(() => !editing.value && presentation.value !== 'overview' && !isVertical.value)
const toggle = computed(() =>
  presentation.value === 'explore'
    ? { label: msg.trCloseTimeline, icon: cdxIconCollapse, run: resume, expanded: true }
    : { label: msg.trOpenTimeline, icon: cdxIconExpand, run: explore, expanded: false },
)

let jumpTarget: string | null = null
/** Read passage: resolve first, settle the compact geometry, then place the passage below it. */
async function read(e: NavEvent) {
  const el = nav.resolve(e)
  if (!el) {
    nav.unresolved.value = e.id
    nav.announce(msg.trMissing)
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

// ── Keyboard inside the ruler (no global handlers) ───────────────────────
function onKeydown(ev: KeyboardEvent) {
  if (ev.key !== 'Escape') return
  if (editing.value) {
    if (authoring.currentId.value) {
      ev.preventDefault()
      authoring.currentId.value = null
    }
    return
  }
  if (exploring.value) {
    ev.preventDefault()
    resume()
  }
}

// ── Editing: dates in the article, the title, the image ──────────────────
const picked = computed(() => new Set(authoring.items.value.map((i) => i.id)))
useSelectMode({
  root: bodyEl,
  active: editing,
  kind: ref('date'),
  picked: picked as unknown as Ref<Set<string>>,
  describe: (id) => {
    const m = ctx.article.mentions.find((x) => x.id === id)
    return picked.value.has(id) ? `${m?.text ?? id}: on the timeline; select to remove` : `${m?.text ?? id}: add to the timeline`
  },
  toggle: (id) => {
    if (authoring.toggle(id) === 'added') nextTick(() => track.value?.reveal(id, { smooth: !reduced() }))
  },
  sentenceOf: (id) => {
    const m = ctx.article.mentions.find((x) => x.id === id)
    return m ? { start: m.anchor.sentenceStart, end: m.anchor.sentenceEnd } : null
  },
})
function viewSource() {
  const e = editEvent.value
  const el = e ? nav.resolve(e) : null
  el?.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' })
}
function setTitle(text: string) {
  const id = authoring.currentId.value
  if (id) authoring.setTitle(id, text)
}
const pickerOpen = ref(false)
function chooseImage(img: EventImage | undefined) {
  const id = authoring.currentId.value
  if (id) authoring.setImage(id, img)
}
function startEdit() {
  authoring.startEdit()
}
// The article editor's toolbar comes and goes with editing: dock below it (phones pin it to the top).
watch(
  () => authoring.ve.value,
  () => nextTick(() => requestAnimationFrame(() => dock.check())),
)
watch(editing, (on) => {
  if (!on) {
    exploring.value = false
    pickerOpen.value = false
  }
})

// While reading (open or docked, not editing), the timeline brings the date being read to its
// centre, unless the reader has just moved it sideways themselves.
watch(
  () => reading.value.id,
  (rid) => {
    if (editing.value) return
    // Back in the introduction (nothing read yet): the timeline returns to its beginning.
    const id = rid ?? events.value[0]?.id
    if (!id) return
    if (isVertical.value) vlist.value?.reveal(id, !reduced())
    else track.value?.reveal(id, { center: true, smooth: !reduced(), follow: true })
  },
)

// ── Scroll: docking and the reading anchor (genuine scrolling only) ──────
const readingLine = () => {
  const top = dock.header.value + 2 * PADY + COMPACT.height + sb.value
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
// The timeline changed (an edit): the reading anchor is recomputed against it.
watch(
  () => events.value.map((e) => e.id).join(),
  () => nextTick(() => updateReading(readingLine())),
)
const onResize = () => dock.check()
onMounted(() => {
  bodyEl.value = body()
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onResize)
  const first = () => {
    bodyEl.value = body()
    dock.check()
    updateReading(readingLine())
    if (reading.value.id) track.value?.reveal(reading.value.id, { center: true })
  }
  nextTick(first)
  // The mount is placed after the skin settles.
  setTimeout(first, 200)
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', onResize)
})

/** Where the full-bleed surface lives: the page wrapper, outside the clipped text column (keeps theme tokens). */
const bleedTo = computed<HTMLElement | null>(() => (root.value?.closest('.tn-page') as HTMLElement | null) ?? null)
const shown = computed(() => events.value.length > 0 || editing.value)
const px = (n: number) => `${Math.round(n)}px`
</script>

<template>
  <Teleport
    v-if="ctx.leadMount.value && shown"
    :to="ctx.leadMount.value"
  >
    <section
      ref="root"
      class="tr"
      :class="[`tr--${presentation}`, `tr--${motion}`, { 'tr--stuck': dock.stuck.value, 'tr--narrow': narrow, 'tr--editing': editing, 'tr--hidden': hidden }]"
      :inert="hidden || undefined"
      :style="{ height: px(panelH), '--tr-motion': `${MOTION_MS}ms`, '--tr-ctrl': px(ctrlW) }"
      aria-labelledby="tr-title"
      @keydown="onKeydown"
    >
      <!-- Header (open only): the title and Edit timeline. -->
      <div
        class="tr__top"
        :style="{ height: px(headH) }"
        :inert="compact || undefined"
      >
        <h2
          id="tr-title"
          class="tr__title"
        >
          {{ editing ? msg.trEditingTitle : msg.trTitle }}
        </h2>
        <button
          v-if="!editing"
          type="button"
          class="tr__link tr__edit"
          @click="startEdit"
        >
          {{ msg.trEditTimeline }}
        </button>
      </div>

      <!-- The chevron: in the header when open, at the strip's end when docked. -->
      <div
        ref="ctrlEl"
        class="tr__ctrl"
      >
        <CdxButton
          v-if="showToggle"
          ref="modeBtn"
          size="small"
          weight="quiet"
          class="tr__mode"
          :aria-label="toggle.label"
          :title="toggle.label"
          :aria-expanded="toggle.expanded ? 'true' : 'false'"
          @click="toggle.run"
        >
          <CdxIcon :icon="toggle.icon" />
        </CdxButton>
        <CdxButton
          v-if="isVertical && dock.stuck.value"
          size="small"
          weight="quiet"
          class="tr__mode"
          :aria-label="listOpen ? msg.trCloseTimeline : msg.trOpenTimeline"
          :title="listOpen ? msg.trCloseTimeline : msg.trOpenTimeline"
          :aria-expanded="listOpen ? 'true' : 'false'"
          @click="listOpen = !listOpen"
        >
          <CdxIcon :icon="listOpen ? cdxIconCollapse : cdxIconExpand" />
        </CdxButton>
        <CdxToggleButton
          v-if="narrow && !editing"
          v-model="vertical"
          quiet
          class="tr__mode tr__orient"
          :aria-label="msg.trVertical"
          :title="msg.trVertical"
        >
          <CdxIcon :icon="cdxIconListBullet" />
        </CdxToggleButton>
        <CdxButton
          v-if="dock.stuck.value && !editing"
          size="small"
          weight="quiet"
          class="tr__mode"
          :aria-label="msg.trHideTimeline"
          :title="msg.trHideTimeline"
          @click="hide"
        >
          <CdxIcon :icon="cdxIconClose" />
        </CdxButton>
      </div>

      <!-- The timeline: one surface, dates always visible. -->
      <!-- Phones, turned: the same events top to bottom. -->
      <div
        v-if="isVertical"
        class="tr__vlist"
        :style="{ height: px(vlistH) }"
      >
        <VerticalTimeline
          ref="vlist"
          :events="events"
          :era="era"
          :reading-id="reading.id"
          :birth-year="birthYear"
          @pick="pick"
          @size="(h) => (vlistNat = h)"
        />
      </div>
      <EvenTrack
        v-else
        ref="track"
        class="tr__track"
        :events="events"
        :slot-w="slot"
        :block-w="blockW"
        :mode="trackMode"
        :geom="rich"
        :era="era"
        :selected-id="selectedId"
        :reading-id="editing ? null : reading.id"
        :birth-year="birthYear"
        :description="msg.trFigure"
        @pick="pick"
        @tap="explore"
      />

      <!-- Editing: the selected event's title, image and quiet actions. -->
      <div
        v-if="editing && editEvent"
        class="tr__region"
        :style="{ height: px(regionH) }"
      >
        <RulerRegion
          :event="editEvent"
          :era="era"
          @title-start="authoring.begin()"
          @title="setTitle"
          @image="pickerOpen = true"
          @view-source="viewSource"
          @remove="authoring.currentId.value && authoring.remove(authoring.currentId.value)"
        />
      </div>
      <!-- Editing: Undo, Cancel and Done, right under what is being edited. -->
      <AuthorBar
        v-if="editing"
        class="tr__bar"
        :style="{ height: px(barH) }"
        :count="authoring.items.value.length"
        :is-new="!!authoring.draft.value?.isNew"
        :can-undo="authoring.canUndo.value"
        @undo="authoring.undo()"
        @cancel="authoring.cancel()"
        @done="authoring.done()"
      />
    </section>
  </Teleport>
  <!-- Phones, docked: the strip's surface, full bleed (outside the clipped text column). -->
  <Teleport
    v-if="bleedTo"
    :to="bleedTo"
  >
    <div
      v-if="narrow && dock.stuck.value && !hidden"
      class="tr-bleed"
      :class="{ 'tr-bleed--editing': editing }"
      aria-hidden="true"
      :style="{ top: px(dock.header.value), height: px(panelH), '--tr-motion': `${MOTION_MS}ms` }"
    />
  </Teleport>
  <ImagePicker
    v-model:open="pickerOpen"
    :images="ctx.article.images"
    :event="editEvent"
    :subject="ctx.article.subject.name"
    :linked-pages="linkedPages"
    host="en.wikipedia.org"
    removable
    @choose="chooseImage"
  />
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
  /* Hairlines, not rules: the figure belongs to the page. */
  border-block-start: var(--border-width-base) solid var(--border-color-subtle);
  border-block-end: var(--border-width-base) solid var(--border-color-subtle);
  background: var(--background-color-base);
  font-family: var(--font-family-base);
  font-size: var(--font-size-medium);
  transition:
    height var(--tr-motion) var(--tr-ease),
    box-shadow var(--tr-motion) linear,
    background-color var(--tr-motion) linear;
}
/* Docked: a frosted surface the article passes under, with a soft shadow and a hairline. */
.tr--stuck {
  border-block-start-color: transparent;
  background: color-mix(in srgb, var(--background-color-base) 92%, transparent);
  -webkit-backdrop-filter: saturate(180%) blur(16px);
  backdrop-filter: saturate(180%) blur(16px);
  box-shadow:
    0 1px 0 var(--border-color-subtle),
    0 8px 24px -16px rgba(0, 0, 0, 0.35);
}
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .tr--stuck {
    background: var(--background-color-base);
  }
}
/*
 * Phones, docked: full bleed. The panel lives in the text column, which clips
 * anything wider (.mw-parser-output), so its surface (frosted background, rule and
 * shadow) is a separate layer the width of the screen, right behind it (.tr-bleed),
 * and the panel itself is transparent.
 */
.tr--narrow.tr--stuck {
  border-block-end-color: transparent;
  background: transparent;
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
  box-shadow: none;
}
.tr-bleed {
  position: fixed;
  inset-inline: 0;
  z-index: 9;
  background: color-mix(in srgb, var(--background-color-base) 92%, transparent);
  -webkit-backdrop-filter: saturate(180%) blur(16px);
  backdrop-filter: saturate(180%) blur(16px);
  box-shadow:
    0 1px 0 var(--border-color-subtle),
    0 8px 24px -16px rgba(0, 0, 0, 0.35);
  pointer-events: none;
  transition: height var(--tr-motion, 240ms) var(--transition-timing-function-user, ease-out);
}
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .tr-bleed {
    background: var(--background-color-base);
  }
}
@media (prefers-reduced-motion: reduce) {
  .tr-bleed {
    transition: none;
  }
}
.tr--editing {
  border-block-start: var(--border-width-thick) solid var(--border-color-progressive);
}
/* Phones, docked, editing: the blue rule runs edge to edge too (on the surface layer). */
.tr--narrow.tr--stuck.tr--editing {
  border-block-start-color: transparent;
}
.tr-bleed--editing {
  border-block-start: var(--border-width-thick) solid var(--border-color-progressive);
  box-sizing: border-box;
}
.tr > * {
  flex: none;
}

/* Header: open only; it folds away (height and opacity) when the strip docks. */
.tr__top {
  display: flex;
  align-items: baseline;
  gap: var(--spacing-50) var(--spacing-75);
  padding-block-start: var(--spacing-50);
  box-sizing: border-box;
  padding-inline-end: calc(var(--tr-ctrl) + var(--spacing-50));
  overflow: hidden;
  white-space: nowrap;
  transition:
    height var(--tr-motion) var(--tr-ease),
    opacity 100ms linear 140ms;
}
.tr--compact .tr__top {
  padding-block-start: 0;
  opacity: 0;
  transition:
    height var(--tr-motion) var(--tr-ease),
    opacity 60ms linear;
}
.mw-parser-output .tr__title,
.tr__title {
  flex: none;
  margin: 0;
  padding: 0;
  border: 0;
  font-family: var(--font-family-base);
  font-size: var(--font-size-medium);
  line-height: var(--line-height-medium);
  font-weight: var(--font-weight-bold);
}
/* Quiet text actions, as links. */
.tr__link {
  flex: none;
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-progressive);
  font: inherit;
  font-size: var(--font-size-small);
  cursor: pointer;
}
.tr__link:hover {
  text-decoration: underline;
}
.tr__link:focus-visible {
  outline: var(--border-width-thick) solid var(--outline-color-progressive--focus);
  outline-offset: 1px;
}
/* Controls: at the header's end when open, at the strip's end when docked. */
.tr__vlist {
  flex: none;
  overflow: hidden;
}
/* The orientation toggle, as small as the other controls. */
.tr__orient {
  min-width: 32px;
  min-height: 32px;
  padding: 0 var(--spacing-25);
}
/* Closed while scrolled away: nothing left in the page until the reader scrolls back up. */
.tr--hidden {
  padding: 0;
  border-color: transparent;
  box-shadow: none;
  visibility: hidden;
  transition:
    height var(--tr-motion) var(--tr-ease),
    visibility 0s linear var(--tr-motion);
}
.tr__ctrl {
  position: absolute;
  inset-block-start: 8px;
  inset-inline-end: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: var(--spacing-25);
}
.tr--compact .tr__ctrl {
  inset-block-start: 50%;
  transform: translateY(-60%);
}
.tr__track {
  transition: margin var(--tr-motion) var(--tr-ease);
}
/* Docked: the dates end before the controls, so none is hidden under them. */
.tr--compact .tr__track {
  margin-inline-end: calc(var(--tr-ctrl) + var(--spacing-25));
}
.tr__region {
  overflow: hidden;
  border-block-start: var(--border-width-base) solid var(--border-color-subtle);
}

@media (prefers-reduced-motion: reduce) {
  .tr,
  .tr * {
    transition: none !important;
  }
}
</style>
