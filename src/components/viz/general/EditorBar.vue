<script setup lang="ts">
/**
 * The one bar while a visual is being made: docked at the bottom on every
 * screen. Kind and count, a miniature (tap: back to the block), Undo, More,
 * Cancel and Done. Above it, only when needed: the one question about a
 * table, or two or three forms to choose from.
 */
import { computed } from 'vue'
import { CdxButton, CdxIcon, CdxMenuButton } from '@wikimedia/codex'
import { cdxIconClose, cdxIconEllipsis, cdxIconUndo } from '@wikimedia/codex-icons'

import type { FormId, Item, Visual } from '../model/visual'
import { FORMS } from './forms'

const props = defineProps<{
  visual: Visual
  items: Item[]
  /** Forms that fit (thumbnails when more than one). */
  fits: FormId[]
  /** The one question about a table, if any. */
  question: { text: string; answers: { label: string; col: number }[]; chosen: number } | null
  canUndo: boolean
  /** Prompt when nothing is picked yet ("Tap a date in the text"). */
  prompt: string
  scoped: boolean
  canAddAll: boolean
  isTable: boolean
  narrow: boolean
}>()
const emit = defineEmits<{
  undo: []
  cancel: []
  done: []
  toBlock: []
  answer: [col: number]
  form: [form: FormId]
  more: [action: string]
}>()

const def = computed(() => FORMS[props.visual.form])
const n = computed(() => props.items.length)
const count = computed(
  () => `${def.value.label} · ${n.value} ${n.value === 1 ? def.value.noun[0] : def.value.noun[1]}`,
)
const thumb = computed(() => def.value.thumb(props.items))

const moreItems = computed(() => {
  const out: { value: string; label: string }[] = []
  out.push(
    props.scoped
      ? { value: 'whole', label: 'Whole article' }
      : { value: 'section', label: 'Only this section' },
  )
  if (props.canAddAll) out.push({ value: 'addAll', label: 'Add all in this section' })
  for (const s of def.value.settings ?? []) {
    const on = props.visual.options[s.key] !== undefined ? !!props.visual.options[s.key] : s.default
    out.push({ value: `setting:${s.key}`, label: `${s.label}: ${on ? 'on' : 'off'}` })
  }
  if (props.isTable) out.push({ value: 'columns', label: 'Adjust columns' })
  if (props.fits.length > 1)
    for (const f of props.fits)
      if (f !== props.visual.form)
        out.push({ value: `form:${f}`, label: `Change form: ${FORMS[f].label}` })
  return out
})
const showForms = computed(() => n.value > 0 && props.fits.length > 1 && !props.question)
</script>

<template>
  <div class="eb" role="region" aria-label="Making a visual">
    <!-- Only when needed: the one question, or the forms to choose from. -->
    <div v-if="question && n" class="eb__ask" role="group" :aria-label="question.text">
      <span class="eb__ask-text">{{ question.text }}</span>
      <CdxButton
        v-for="a in question.answers"
        :key="a.col"
        size="small"
        :action="a.col === question.chosen ? 'progressive' : 'default'"
        :aria-pressed="a.col === question.chosen"
        @click="emit('answer', a.col)"
        >{{ a.label }}</CdxButton
      >
    </div>
    <div v-else-if="showForms" class="eb__ask" role="radiogroup" aria-label="Show as">
      <button
        v-for="f in fits.slice(0, 3)"
        :key="f"
        type="button"
        role="radio"
        class="eb__form"
        :class="{ 'eb__form--on': visual.form === f }"
        :aria-checked="visual.form === f"
        :title="FORMS[f].label"
        @click="emit('form', f)"
      >
        <!-- eslint-disable-next-line vue/no-v-html -->
        <span class="viz eb__form-thumb" v-html="FORMS[f].thumb(items)" />
        <small>{{ FORMS[f].label }}</small>
      </button>
    </div>

    <div class="eb__main">
      <div class="eb__what" aria-live="polite">
        <strong v-if="n">{{ count }}</strong>
        <span v-else class="eb__prompt">{{ prompt }}</span>
      </div>
      <!-- eslint-disable vue/no-v-html -->
      <button
        v-if="n && !narrow"
        type="button"
        class="eb__mini viz"
        aria-label="Back to the visual"
        @click="emit('toBlock')"
        v-html="thumb"
      />
      <!-- eslint-enable vue/no-v-html -->
      <CdxButton weight="quiet" :disabled="!canUndo" aria-label="Undo" @click="emit('undo')">
        <CdxIcon :icon="cdxIconUndo" />
      </CdxButton>
      <CdxMenuButton
        :selected="null"
        :menu-items="moreItems"
        weight="quiet"
        aria-label="More"
        @update:selected="(v: string | null) => v && emit('more', v)"
      >
        <CdxIcon :icon="cdxIconEllipsis" />
      </CdxMenuButton>
      <span class="eb__end">
        <CdxButton
          weight="quiet"
          :aria-label="narrow ? 'Cancel' : undefined"
          @click="emit('cancel')"
        >
          <CdxIcon v-if="narrow" :icon="cdxIconClose" />
          <template v-else>Cancel</template>
        </CdxButton>
        <CdxButton action="progressive" weight="primary" :disabled="!n" @click="emit('done')"
          >Done</CdxButton
        >
      </span>
    </div>
  </div>
</template>

<style scoped>
.eb {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 120;
  background: var(--background-color-base);
  border-top: var(--border-width-base, 1px) solid var(--border-color-base);
  box-shadow: var(--box-shadow-medium, 0 -2px 8px rgba(0, 0, 0, 0.08));
  animation: eb-up 200ms ease-out;
}
@keyframes eb-up {
  from {
    transform: translateY(100%);
  }
}
@media (prefers-reduced-motion: reduce) {
  .eb {
    animation: none;
  }
}
.eb__main,
.eb__ask {
  display: flex;
  align-items: center;
  gap: var(--spacing-50);
  max-width: 1100px;
  margin: 0 auto;
  padding: var(--spacing-50) var(--spacing-100);
}
.eb__ask {
  flex-wrap: wrap;
  border-bottom: var(--border-width-base, 1px) solid var(--border-color-subtle);
}
.eb__ask-text {
  font-weight: var(--font-weight-bold);
  margin-inline-end: var(--spacing-25);
}
.eb__what {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.eb__prompt {
  color: var(--color-subtle);
}
.eb__mini {
  flex: none;
  padding: 0;
  border: var(--border-width-base, 1px) solid var(--border-color-subtle);
  border-radius: var(--border-radius-base, 2px);
  background: var(--background-color-base);
  line-height: 0;
  cursor: pointer;
}
.eb__mini :deep(svg) {
  width: 64px;
  height: 32px;
}
.eb__mini:focus-visible,
.eb__form:focus-visible {
  outline: var(--border-width-thick, 2px) solid var(--outline-color-progressive--focus, #36c);
}
.eb__end {
  display: flex;
  gap: var(--spacing-25);
}
.eb__form {
  display: flex;
  align-items: center;
  gap: var(--spacing-25);
  padding: 2px var(--spacing-50) 2px 2px;
  border: var(--border-width-base, 1px) solid var(--border-color-subtle);
  border-radius: var(--border-radius-base, 2px);
  background: var(--background-color-base);
  color: var(--color-base);
  cursor: pointer;
}
.eb__form--on {
  border-color: var(--border-color-progressive);
  box-shadow: inset 0 0 0 1px var(--border-color-progressive);
}
.eb__form-thumb {
  line-height: 0;
}
.eb__form-thumb :deep(svg) {
  width: 48px;
  height: 24px;
}
</style>
