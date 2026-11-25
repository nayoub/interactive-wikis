<script setup lang="ts">
/**
 * Suggestion cards, presented like the Visual Editor's own suggestions (the
 * same card body, FindingBody, with its reason form on dismiss). Desktop with
 * room in the right margin: a card beside the section it concerns. Otherwise
 * (and on a phone): a small chip at the section heading that opens the card
 * (a bottom sheet on a phone).
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { CdxIcon, CdxPopover } from '@wikimedia/codex'
import { cdxIconLightbulb } from '@wikimedia/codex-icons'

import FindingBody from '@/components/visual-editor/FindingBody.vue'
import type { Finding } from '@/components/visual-editor/engine/checks'
import { DISMISS_REASONS, type Card } from './cards'

const props = defineProps<{
  cards: Card[]
  /** The article body (to find section headings). */
  root: HTMLElement | null
  /** The page element the layer is positioned in. */
  page: HTMLElement | null
  skin: 'desktop' | 'mobile'
}>()
const emit = defineEmits<{ start: [card: Card]; dismiss: [card: Card, reason: string] }>()

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const findingOf = (c: Card): Finding =>
  ({
    id: c.id,
    type: 'vizSuggestion',
    mode: 'suggestion',
    title: c.title,
    descriptionHtml: `<p>${esc(c.evidence)}.</p><details class="sl__why"><summary>Why am I seeing this?</summary><p>${esc(c.why)}</p></details>`,
    choices: [
      { action: 'start', label: 'Start', flags: ['primary', 'progressive'] },
      { action: 'dismiss', label: 'Dismiss' },
    ],
    ranges: [],
    data: {
      dismissForm: {
        description: 'Why dismiss this suggestion? It will stay dismissed.',
        options: DISMISS_REASONS,
      },
    },
  }) as unknown as Finding
function act(c: Card, action: string, reason?: string) {
  if (action === 'start') emit('start', c)
  else if (action === 'dismiss' && reason) emit('dismiss', c, reason)
}

// Where each card goes: beside its section heading, in the right margin when there is room.
const pos = ref<Record<string, { top: number; left: number; chipLeft: number; chipTop: number }>>(
  {},
)
const margin = ref(0)
const CARD = 300
function measure() {
  const page = props.page
  const root = props.root
  if (!page || !root) return
  const pr = page.getBoundingClientRect()
  const content = root.getBoundingClientRect()
  margin.value = pr.right - content.right
  const out: typeof pos.value = {}
  root.querySelectorAll('.sl-chip-room').forEach((el) => el.classList.remove('sl-chip-room'))
  for (const c of props.cards) {
    const h = root.querySelector<HTMLElement>(`#${CSS.escape(c.section.id)}`)
    if (!h) continue
    // Phone: make room under the heading so the chip covers no text.
    if (props.skin === 'mobile') h.classList.add('sl-chip-room')
    const r = h.getBoundingClientRect()
    // Phone: the chip sits under the heading, at the start (the heading's own tools are at its end).
    const phone = props.skin === 'mobile'
    out[c.id] = {
      top: r.top - pr.top,
      left: content.right - pr.left + 24,
      chipLeft: phone ? content.left - pr.left : Math.min(r.right, content.right) - pr.left,
      chipTop: phone ? r.bottom - pr.top + 6 : r.top - pr.top,
    }
  }
  pos.value = out
}
const inMargin = computed(() => props.skin === 'desktop' && margin.value >= CARD + 48)
let ro: ResizeObserver | null = null
onMounted(() => {
  window.addEventListener('resize', measure)
  ro = new ResizeObserver(() => measure())
})
onBeforeUnmount(() => {
  props.root?.querySelectorAll('.sl-chip-room').forEach((el) => el.classList.remove('sl-chip-room'))
  window.removeEventListener('resize', measure)
  ro?.disconnect()
})
watch(
  () => [props.root, props.page, props.cards] as const,
  ([root]) => {
    ro?.disconnect()
    if (root) ro?.observe(root)
    nextTick(measure)
  },
  { immediate: true, deep: true },
)

const openId = ref<string | null>(null)
const chipEls = ref<Record<string, HTMLElement | null>>({})
</script>

<template>
  <div class="sl" aria-label="Suggested visuals">
    <template v-for="c in cards" :key="c.id">
      <template v-if="pos[c.id]">
        <!-- A card in the margin, beside its section. -->
        <div
          v-if="inMargin"
          class="sl__card"
          role="region"
          :aria-label="`${c.title}: ${c.section.title}`"
          :style="{ top: `${pos[c.id].top}px`, left: `${pos[c.id].left}px`, width: `${CARD}px` }"
        >
          <div class="sl__head">
            <CdxIcon :icon="cdxIconLightbulb" class="sl__icon" />
            <span class="sl__title">{{ c.title }}</span>
          </div>
          <div class="sl__body">
            <FindingBody :finding="findingOf(c)" :skin="skin" @act="(a, r) => act(c, a, r)" />
          </div>
        </div>
        <!-- No room (or a phone): a chip at the heading, opening the card. -->
        <template v-else>
          <button
            :ref="(el) => (chipEls[c.id] = el as HTMLElement | null)"
            type="button"
            class="sl__chip"
            :class="{ 'sl__chip--below': skin === 'mobile' }"
            :style="{ top: `${pos[c.id].chipTop}px`, left: `${pos[c.id].chipLeft}px` }"
            :aria-expanded="openId === c.id"
            @click="openId = openId === c.id ? null : c.id"
          >
            <CdxIcon :icon="cdxIconLightbulb" size="small" /><span>{{ c.title }}</span>
          </button>
          <CdxPopover
            :open="openId === c.id"
            :anchor="chipEls[c.id] ?? null"
            placement="bottom-end"
            :title="c.title"
            :use-close-button="true"
            use-bottom-sheet="responsive"
            @update:open="(v: boolean) => (openId = v ? c.id : null)"
          >
            <FindingBody :finding="findingOf(c)" :skin="skin" @act="(a, r) => act(c, a, r)" />
          </CdxPopover>
        </template>
      </template>
    </template>
  </div>
</template>

<style scoped>
.sl__card {
  position: absolute;
  z-index: 5;
  background: var(--background-color-base);
  border: var(--border-width-base, 1px) solid var(--border-color-progressive--focus, #6485d1);
  border-radius: var(--border-radius-base, 2px);
  box-shadow: var(--box-shadow-medium, 0 4px 8px rgba(0, 0, 0, 0.06));
  animation: sl-in 200ms ease-out;
}
.sl__head {
  display: flex;
  align-items: center;
  gap: var(--spacing-50);
  padding: var(--spacing-75) var(--spacing-100);
  background: var(--background-color-progressive-subtle);
}
.sl__icon {
  color: var(--color-progressive);
}
.sl__title {
  font-weight: var(--font-weight-bold);
}
.sl__body {
  padding: var(--spacing-75) var(--spacing-100) var(--spacing-100);
}
.sl__chip {
  position: absolute;
  z-index: 5;
  transform: translate(-100%, 0);
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-25);
  padding: 2px var(--spacing-50);
  border: var(--border-width-base, 1px) solid var(--border-color-progressive);
  border-radius: 999px;
  background: var(--background-color-progressive-subtle);
  color: var(--color-progressive);
  font-family: var(--font-family-base);
  font-size: var(--font-size-small);
  line-height: var(--line-height-small);
  white-space: nowrap;
  cursor: pointer;
}
.sl__chip--below {
  transform: none;
}
.sl__chip .cdx-icon {
  color: inherit;
}
.sl__chip:focus-visible {
  outline: var(--border-width-thick, 2px) solid var(--outline-color-progressive--focus, #36c);
}
:deep(.sl__why) {
  margin-top: var(--spacing-50);
}
:deep(.sl__why summary) {
  color: var(--color-progressive);
  cursor: pointer;
}
@keyframes sl-in {
  from {
    opacity: 0;
    transform: translateX(8px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .sl__card {
    animation: none;
  }
}
</style>

<style>
/* Room under a heading for its suggestion chip (phone). */
.mw-parser-output .sl-chip-room {
  margin-bottom: 36px !important;
}
</style>
