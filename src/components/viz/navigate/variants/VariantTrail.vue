<script setup lang="ts">
/**
 * C · Chronological reading trail. "What happened next?" A reversible
 * sequence through the article's own passages in date order, even when the
 * next one is higher up or in another section. Nothing advances on its
 * own; scrolling away leaves the trail where it is and offers Resume.
 *
 * Wide screens: the controls sit in the margin beside the active passage
 * (its date in the article's serif heading style). Narrower: a compact bar
 * at the bottom, registered so jumps keep the passage clear of it.
 */
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import { CdxButton, CdxIcon, CdxSelect } from '@wikimedia/codex'
import { cdxIconArrowNext, cdxIconArrowPrevious, cdxIconClose, cdxIconUndo } from '@wikimedia/codex-icons'

import { NAV, type NavContext } from '../context'
import { msg } from '../messages'
import ReturnBar from '../ReturnBar.vue'
import UnresolvedNotice from '../UnresolvedNotice.vue'
import { sentenceRange } from '../../pick/passage'
import { obstructions } from '../useNavigator'
import { formatWhen } from '../time'

const ctx = inject(NAV) as NavContext & { leadMount: Ref<HTMLElement | null>; margin: Ref<'start' | 'end' | null> }
const nav = ctx.nav
const events = ctx.collection.events
const total = events.length
const inMargin = computed(() => ctx.margin.value === 'end')

const active = ref(false)
const index = ref(0)
/** Where the trail stopped when the reader returned or exited (offered as Continue). */
const paused = ref<number | null>(null)
const current = computed(() => events[index.value])
const prev = computed(() => (index.value > 0 ? events[index.value - 1] : null))
const next = computed(() => (index.value < total - 1 ? events[index.value + 1] : null))
const when = (i: number) => formatWhen(events[i].date, ctx.era)

// Start from a deliberately chosen event (the one selected elsewhere, if any).
const startId = ref<string | null>(nav.selectedId.value ?? null)
const startItems = events.map((e) => ({ value: e.id, label: `${formatWhen(e.date, ctx.era)} — ${e.label}` }))

const pending = ref(false)
async function goTo(i: number, keepFocus = true) {
  index.value = i
  active.value = true
  paused.value = null
  movedAway.value = false
  pending.value = true
  await nav.jump(events[i], { keepFocus })
  pending.value = false
  await nextTick()
  place()
}
function start(fromId?: string | null) {
  const i = fromId ? events.findIndex((e) => e.id === fromId) : 0
  void goTo(Math.max(0, i), false)
}
function exit() {
  active.value = false
  paused.value = index.value
  nav.announce(msg.exitTrail)
}
async function returnToStart() {
  paused.value = index.value
  active.value = false
  await nav.returnToOrigin()
}

// ── Has the reader scrolled away from the active passage? ────────────────
const movedAway = ref(false)
function activeBlock(): HTMLElement | null {
  const el = current.value ? nav.resolve(current.value) : null
  return el?.closest<HTMLElement>('p, li, td, dd') ?? el
}
let raf = 0
function check() {
  raf = 0
  if (!active.value || nav.jumping.value || pending.value) return
  const b = activeBlock()
  if (!b) return
  const { top, bottom } = obstructions()
  const r = b.getBoundingClientRect()
  movedAway.value = r.bottom < top + 8 || r.top > window.innerHeight - bottom - 8
}
const onScroll = () => {
  if (!raf) raf = requestAnimationFrame(check)
}
onMounted(() => window.addEventListener('scroll', onScroll, { passive: true }))
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  cancelAnimationFrame(raf)
})
watch(() => nav.jumping.value, (j) => !j && check())

// ── Margin placement: the panel sits beside the active passage ────────────
const panelTop = ref(0)
function place() {
  if (!inMargin.value) return
  const col = document.getElementById('tn-margin-end')
  const b = activeBlock()
  if (!col || !b) return
  const c = col.getBoundingClientRect()
  const body = document.querySelector<HTMLElement>('.tn-body')
  const e = current.value
  const sentence = body && e ? sentenceRange(body, e.sourceAnchor, e.sourceText || undefined) : null
  const r = (sentence ?? b).getBoundingClientRect()
  panelTop.value = Math.max(0, r.top - c.top - 4)
}
let ro: ResizeObserver | null = null
onMounted(() => {
  const body = document.querySelector('.tn-body')
  if (body) {
    ro = new ResizeObserver(() => place())
    ro.observe(body)
  }
  window.addEventListener('resize', place)
})
onBeforeUnmount(() => {
  ro?.disconnect()
  window.removeEventListener('resize', place)
})

const n = computed(() => index.value + 1)
const unresolvedHere = computed(() => nav.unresolved.value === current.value?.id)
</script>

<template>
  <!-- Near the introduction: the way in. -->
  <Teleport
    v-if="ctx.leadMount.value"
    :to="ctx.leadMount.value"
  >
    <section
      class="vt-intro"
      aria-labelledby="vt-intro-title"
    >
      <h2
        id="vt-intro-title"
        class="vt-intro__title"
      >
        {{ msg.trailLabel }}
      </h2>
      <p class="vt-intro__text">
        {{ msg.trailIntro(total) }}
      </p>
      <div class="vt-intro__actions">
        <CdxButton
          action="progressive"
          weight="primary"
          @click="start(null)"
        >
          {{ msg.readChronologically }}
        </CdxButton>
        <CdxButton
          v-if="paused !== null && !active"
          @click="goTo(paused!, false)"
        >
          {{ msg.resumeAt(when(paused!)) }}
        </CdxButton>
      </div>
      <div class="vt-intro__from">
        <span
          id="vt-from-label"
          class="vt-intro__from-label"
        >{{ msg.startFrom }}</span>
        <CdxSelect
          v-model:selected="startId"
          class="vt-intro__select"
          :menu-items="startItems"
          :default-label="msg.startFromPlaceholder"
          aria-labelledby="vt-from-label"
        />
        <CdxButton
          :disabled="!startId"
          @click="start(startId)"
        >
          {{ msg.startHere }}
        </CdxButton>
      </div>
    </section>
  </Teleport>

  <!-- Wide: in the margin beside the passage. -->
  <Teleport
    v-if="active && inMargin"
    to="#tn-margin-end"
    defer
  >
    <div
      v-if="movedAway"
      class="vt-resume"
    >
      <CdxButton
        action="progressive"
        @click="goTo(index)"
      >
        {{ msg.resumeAt(when(index)) }}
      </CdxButton>
    </div>
    <section
      class="vt-panel"
      :style="{ insetBlockStart: `${panelTop}px` }"
      :aria-label="msg.trailLabel"
    >
      <p class="vt-panel__n">
        {{ msg.eventNofN(n, total) }}
      </p>
      <p class="vt-panel__date">
        {{ when(index) }}
      </p>
      <p class="vt-panel__label">
        {{ current.label }}
      </p>
      <p class="vt-panel__section">
        {{ msg.inSection(current.sourceAnchor.sectionTitle) }}
      </p>
      <UnresolvedNotice v-if="unresolvedHere" />
      <div class="vt-steps">
        <button
          type="button"
          class="vt-step"
          :disabled="!prev"
          @click="goTo(index - 1)"
        >
          <span class="vt-step__dir"><CdxIcon
            :icon="cdxIconArrowPrevious"
            size="small"
          /> {{ msg.previousEvent }}</span>
          <span
            v-if="prev"
            class="vt-step__to"
          ><b>{{ when(index - 1) }}</b> {{ prev.label }}</span>
          <span
            v-else
            class="vt-step__to"
          >{{ msg.firstEvent }}</span>
        </button>
        <button
          type="button"
          class="vt-step"
          :disabled="!next"
          @click="goTo(index + 1)"
        >
          <span class="vt-step__dir">{{ msg.nextEvent }} <CdxIcon
            :icon="cdxIconArrowNext"
            size="small"
          /></span>
          <span
            v-if="next"
            class="vt-step__to"
          ><b>{{ when(index + 1) }}</b> {{ next.label }}</span>
          <span
            v-else
            class="vt-step__to"
          >{{ msg.lastEvent }}</span>
        </button>
      </div>
      <div class="vt-panel__end">
        <CdxButton
          weight="quiet"
          size="small"
          @click="exit"
        >
          <CdxIcon
            :icon="cdxIconClose"
            size="small"
          />{{ msg.exitTrail }}
        </CdxButton>
        <CdxButton
          v-if="nav.origin.value"
          weight="quiet"
          size="small"
          @click="returnToStart"
        >
          <CdxIcon
            :icon="cdxIconUndo"
            size="small"
          />{{ msg.returnToStart }}
        </CdxButton>
      </div>
    </section>
  </Teleport>

  <!-- Narrower: a compact bar. -->
  <div
    v-if="active && !inMargin"
    class="vt-bar"
    data-tn-obstruct="bottom"
    role="region"
    :aria-label="msg.trailLabel"
  >
    <div class="vt-bar__now">
      <template v-if="movedAway">
        <CdxButton
          action="progressive"
          size="small"
          @click="goTo(index)"
        >
          {{ msg.resumeAt(when(index)) }}
        </CdxButton>
      </template>
      <template v-else>
        <b class="vt-bar__date">{{ when(index) }}</b>
        <span class="vt-bar__section">{{ current.sourceAnchor.sectionTitle }}</span>
      </template>
      <span class="vt-bar__n">{{ msg.eventNofN(n, total) }}</span>
    </div>
    <UnresolvedNotice v-if="unresolvedHere" />
    <div class="vt-bar__steps">
      <button
        type="button"
        class="vt-step"
        :disabled="!prev"
        @click="goTo(index - 1)"
      >
        <span class="vt-step__dir"><CdxIcon
          :icon="cdxIconArrowPrevious"
          size="small"
        /> {{ msg.previousEvent }}</span>
        <span class="vt-step__to vt-step__to--clip">
          <template v-if="prev"><b>{{ when(index - 1) }}</b> {{ prev.label }}</template>
          <template v-else>{{ msg.firstEvent }}</template>
        </span>
      </button>
      <button
        type="button"
        class="vt-step vt-step--next"
        :disabled="!next"
        @click="goTo(index + 1)"
      >
        <span class="vt-step__dir">{{ msg.nextEvent }} <CdxIcon
          :icon="cdxIconArrowNext"
          size="small"
        /></span>
        <span class="vt-step__to vt-step__to--clip">
          <template v-if="next"><b>{{ when(index + 1) }}</b> {{ next.label }}</template>
          <template v-else>{{ msg.lastEvent }}</template>
        </span>
      </button>
    </div>
    <div class="vt-bar__end">
      <CdxButton
        weight="quiet"
        size="small"
        @click="exit"
      >
        {{ msg.exitTrail }}
      </CdxButton>
      <CdxButton
        v-if="nav.origin.value"
        weight="quiet"
        size="small"
        @click="returnToStart"
      >
        {{ msg.returnToStart }}
      </CdxButton>
    </div>
  </div>

  <!-- After exiting: the shared return affordance. -->
  <ReturnBar v-if="!active" />
</template>

<style scoped>
/* Intro: standard UI text, restrained. */
.vt-intro {
  padding-block: var(--spacing-75);
  border-block: var(--border-width-base) solid var(--border-color-subtle);
  font-family: var(--font-family-base);
}
.mw-parser-output .vt-intro__title,
.vt-intro__title {
  margin: 0;
  padding: 0;
  border: 0;
  font-family: var(--font-family-base);
  font-size: var(--font-size-medium);
  line-height: var(--line-height-medium);
  font-weight: var(--font-weight-bold);
}
.vt-intro__text {
  margin: var(--spacing-25) 0 var(--spacing-75);
  color: var(--color-subtle);
  font-size: var(--font-size-small);
}
.vt-intro__actions,
.vt-intro__from {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--spacing-50);
}
.vt-intro__from {
  margin-block-start: var(--spacing-75);
  font-size: var(--font-size-small);
}
.vt-intro__select {
  flex: 1 1 16em;
  min-width: 0;
  max-width: 32em;
}

/* Margin panel: the date in the article's serif heading style, controls in UI text. */
.vt-panel {
  position: absolute;
  inset-inline: 0;
  padding-inline-start: var(--spacing-75);
  border-inline-start: 3px solid var(--color-progressive);
  font-size: var(--font-size-small);
  line-height: var(--line-height-small);
}
.vt-panel p {
  margin: 0;
}
.vt-panel__n,
.vt-panel__section {
  color: var(--color-subtle);
}
.vt-panel__date {
  margin-block: var(--spacing-25) !important;
  font-family: 'Linux Libertine', 'Georgia', 'Times', 'Source Serif Pro', serif;
  font-size: 1.5em;
  line-height: 1.25;
  font-weight: normal;
  color: var(--color-emphasized, var(--color-base));
}
.vt-panel__label {
  font-size: var(--font-size-medium);
  line-height: var(--line-height-medium);
}
.vt-panel__section {
  margin-block-end: var(--spacing-75) !important;
}
.vt-steps {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-50);
}
.vt-step {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  min-height: 44px;
  padding: var(--spacing-50) var(--spacing-75);
  border: var(--border-width-base) solid var(--border-color-interactive);
  border-radius: var(--border-radius-base);
  background: var(--background-color-interactive-subtle);
  color: var(--color-base);
  font: inherit;
  font-size: var(--font-size-small);
  line-height: var(--line-height-small);
  text-align: start;
  cursor: pointer;
}
.vt-step:hover:not(:disabled) {
  background: var(--background-color-interactive-subtle--hover);
}
.vt-step:focus-visible {
  outline: var(--border-width-thick) solid var(--outline-color-progressive--focus);
  outline-offset: 1px;
}
.vt-step:disabled {
  cursor: default;
  color: var(--color-disabled);
  background: transparent;
  border-color: var(--border-color-disabled);
}
.vt-step__dir {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-25);
  color: var(--color-progressive);
  font-weight: var(--font-weight-bold);
}
.vt-step:disabled .vt-step__dir {
  color: var(--color-disabled);
}
.vt-step__to {
  overflow-wrap: anywhere;
}
.vt-panel__end {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  margin-block-start: var(--spacing-50);
}
.vt-resume {
  position: sticky;
  inset-block-start: var(--spacing-100);
  z-index: 2;
  margin-block-end: var(--spacing-50);
}

/* Bar: compact, at the bottom, clear of the passage. */
.vt-bar {
  position: fixed;
  inset-inline: 0;
  inset-block-end: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-50);
  padding: var(--spacing-50) var(--spacing-75) calc(var(--spacing-50) + env(safe-area-inset-bottom, 0px));
  background: var(--background-color-base);
  border-block-start: var(--border-width-base) solid var(--border-color-base);
  box-shadow: 0 -2px 6px rgba(0, 0, 0, 0.08);
  font-size: var(--font-size-small);
  line-height: var(--line-height-small);
}
.vt-bar__now {
  display: flex;
  align-items: baseline;
  gap: var(--spacing-50);
  min-height: 24px;
}
.vt-bar__date {
  font-family: 'Linux Libertine', 'Georgia', 'Times', 'Source Serif Pro', serif;
  font-size: 1.25em;
  font-weight: normal;
}
.vt-bar__section {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-subtle);
}
.vt-bar__n {
  margin-inline-start: auto;
  flex: none;
  color: var(--color-subtle);
}
.vt-bar__steps {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-50);
}
.vt-bar .vt-step {
  min-width: 0;
}
.vt-step--next {
  align-items: flex-end;
  text-align: end;
}
.vt-step__to--clip {
  display: block;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.vt-bar__end {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
}
</style>
