<script setup lang="ts">
/**
 * Suggestions attached to their source, in edit mode: "Show as a figure" on a
 * data table, "Show as a chart" on a sentence that tells a quantity over time.
 * One tap makes the visual (right after its source). They do not count toward
 * the three suggestion cards. × asks for a reason and the chip stays dismissed.
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { CdxButton, CdxIcon, CdxPopover, CdxRadio } from '@wikimedia/codex'
import { cdxIconChart, cdxIconClose } from '@wikimedia/codex-icons'

import { DISMISS_REASONS, type InlineChip } from './cards'


const props = defineProps<{ chips: InlineChip[]; page: HTMLElement | null }>()
const emit = defineEmits<{ use: [id: string]; dismiss: [id: string, reason: string] }>()

const pos = ref<Record<string, { top: number; left: number }>>({})
function measure() {
  const page = props.page
  if (!page) return
  const pr = page.getBoundingClientRect()
  document.querySelectorAll('.gm-chip-room').forEach((el) => el.classList.remove('gm-chip-room'))
  const out: typeof pos.value = {}
  for (const c of props.chips) {
    // Room above the source so the chip covers nothing.
    c.anchor.classList.add('gm-chip-room')
    const r = c.anchor.getBoundingClientRect()
    out[c.id] = { top: r.top - pr.top - 30, left: r.left - pr.left }
  }
  pos.value = out
}
let ro: ResizeObserver | null = null
onMounted(() => {
  window.addEventListener('resize', measure)
  ro = new ResizeObserver(() => measure())
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', measure)
  ro?.disconnect()
  document.querySelectorAll('.gm-chip-room').forEach((el) => el.classList.remove('gm-chip-room'))
})
watch(
  () => [props.chips, props.page] as const,
  () => {
    ro?.disconnect()
    if (props.page) ro?.observe(props.page)
    nextTick(measure)
  },
  { immediate: true, deep: true },
)

const asking = ref<string | null>(null)
const reason = ref('')
const closeEls = ref<Record<string, HTMLElement | null>>({})
function submit(id: string) {
  if (!reason.value) return
  emit('dismiss', id, reason.value)
  asking.value = null
  reason.value = ''
}
</script>

<template>
  <template v-for="c in chips" :key="c.id">
    <span v-if="pos[c.id]" class="ic" :style="{ top: `${pos[c.id].top}px`, left: `${pos[c.id].left}px` }">
      <button type="button" class="ic__use" @click="emit('use', c.id)">
        <CdxIcon :icon="cdxIconChart" size="small" /><span>{{ c.label }}</span>
      </button>
      <button
        :ref="(el) => (closeEls[c.id] = el as HTMLElement | null)"
        type="button"
        class="ic__x"
        :aria-label="`Dismiss “${c.label}”`"
        :aria-expanded="asking === c.id"
        @click="asking = asking === c.id ? null : c.id"
      >
        <CdxIcon :icon="cdxIconClose" size="x-small" />
      </button>
    </span>
    <CdxPopover
      :open="asking === c.id"
      :anchor="closeEls[c.id] ?? null"
      placement="bottom-start"
      title="Why dismiss this suggestion?"
      :use-close-button="true"
      use-bottom-sheet="responsive"
      @update:open="(v: boolean) => (asking = v ? c.id : null)"
    >
      <p class="ic__note">It will stay dismissed.</p>
      <div class="ic__reasons" role="radiogroup">
        <CdxRadio v-for="r in DISMISS_REASONS" :key="r.value" v-model="reason" :name="`ic-${c.id}`" :input-value="r.value">
          {{ r.label }}
        </CdxRadio>
      </div>
      <CdxButton action="progressive" weight="primary" :disabled="!reason" @click="submit(c.id)">Submit</CdxButton>
    </CdxPopover>
  </template>
</template>

<style scoped>
.ic {
  position: absolute;
  z-index: 5;
  display: inline-flex;
  align-items: stretch;
  border: var(--border-width-base, 1px) solid var(--border-color-progressive);
  border-radius: 999px;
  background: var(--background-color-progressive-subtle);
  overflow: hidden;
}
.ic button {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-25);
  border: 0;
  background: none;
  color: var(--color-progressive);
  font-family: var(--font-family-base);
  font-size: var(--font-size-small);
  line-height: var(--line-height-small);
  white-space: nowrap;
  cursor: pointer;
}
.ic .cdx-icon {
  color: inherit;
}
.ic__use {
  padding: 2px var(--spacing-50);
}
.ic__x {
  padding: 2px var(--spacing-50) 2px var(--spacing-25);
  border-inline-start: var(--border-width-base, 1px) solid var(--border-color-progressive) !important;
}
.ic button:hover {
  background: var(--background-color-progressive-subtle--hover);
}
.ic button:focus-visible {
  outline: var(--border-width-thick, 2px) solid var(--outline-color-progressive--focus, #36c);
}
.ic__note {
  margin: 0 0 var(--spacing-50);
  color: var(--color-subtle);
}
.ic__reasons {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-25);
  margin-bottom: var(--spacing-75);
}
</style>

<style>
/* Room above a table or sentence for its chip. */
.mw-parser-output .gm-chip-room {
  margin-top: 40px !important;
}
</style>
