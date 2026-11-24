<script setup lang="ts">
/**
 * While editing, below the timeline: the selected event's few controls.
 *
 *   Title         a text field holding the current title; typing updates the
 *                 live timeline at once. Enter finishes the field; Escape puts
 *                 back the value from before this edit (the timeline stays).
 *   Image         Add image, or the thumbnail itself to change it (removal is
 *                 in the picker, beside the full attribution)
 *   View source   scrolls to the sentence (nothing to drag)
 *   Remove event  quiet; Undo brings it back
 *
 * Nothing selected: one line on how to add events.
 */
import { computed, ref, watch } from 'vue'

import type { NavEvent } from '../events'
import { msg } from '../messages'
import { formatWhen } from '../time'

const props = defineProps<{ event: NavEvent | null; era: boolean }>()
const emit = defineEmits<{
  /** A field session starts (one undo step). */
  titleStart: []
  title: [text: string]
  image: []
  viewSource: []
  remove: []
}>()

const field = ref<HTMLInputElement | null>(null)
const value = ref('')
let before = ''
let editing = false
watch(
  () => [props.event?.id, props.event?.label],
  () => {
    if (!editing) value.value = props.event?.label ?? ''
  },
  { immediate: true },
)
// A different event: its own title, and the field is a new session.
watch(
  () => props.event?.id,
  () => {
    editing = false
    value.value = props.event?.label ?? ''
  },
)
/** A field session: the title before it (for Escape) and one undo step. */
function startSession() {
  if (editing) return
  before = props.event?.label ?? ''
  editing = true
  emit('titleStart')
}
const onFocus = startSession
function onInput(e: Event) {
  // The first keystroke opens the session too (focus events are not guaranteed, e.g. a programmatic focus).
  startSession()
  value.value = (e.target as HTMLInputElement).value
  if (value.value.trim()) emit('title', value.value)
}
/** End a field session: an emptied field keeps the title it had. */
function endSession() {
  if (!editing) return
  editing = false
  if (!value.value.trim()) {
    value.value = before
    emit('title', before)
  }
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    endSession()
    field.value?.blur()
  } else if (e.key === 'Escape') {
    // Back to the title from before this edit; the timeline itself stays as it is.
    e.preventDefault()
    e.stopPropagation()
    value.value = before
    emit('title', before)
    editing = false
    field.value?.blur()
  }
}
const onBlur = endSession
const img = computed(() => props.event?.image ?? null)
const credit = computed(() => {
  const i = img.value
  if (!i) return ''
  return i.source === 'commons' ? [i.caption, i.artist, i.license].filter(Boolean).join(' · ') : i.caption
})
</script>

<template>
  <div class="rr">
    <div
      v-if="event"
      class="rr__edit"
    >
      <div class="cdx-field rr__title">
        <div class="cdx-label">
          <label
            class="cdx-label__label"
            for="rr-title-input"
          >
            <span class="cdx-label__label__text">{{ msg.trTitleField }}</span>
            <span class="cdx-label__label__optional-flag rr__when"> · {{ formatWhen(event.date, era) }}</span>
          </label>
        </div>
        <div class="cdx-field__control">
          <div class="cdx-text-input">
            <input
              id="rr-title-input"
              ref="field"
              class="cdx-text-input__input"
              type="text"
              :value="value"
              autocomplete="off"
              @focus="onFocus"
              @input="onInput"
              @keydown="onKeydown"
              @blur="onBlur"
            >
          </div>
        </div>
      </div>
      <div class="rr__side">
        <button
          v-if="img"
          type="button"
          class="rr__thumb"
          :aria-label="msg.trChangeImageFor(event.label)"
          :title="credit"
          @click="emit('image')"
        >
          <img
            :src="img.src"
            :alt="img.caption"
          >
        </button>
        <button
          v-else
          type="button"
          class="rr__link"
          @click="emit('image')"
        >
          {{ msg.trAddImage }}
        </button>
        <button
          type="button"
          class="rr__link"
          @click="emit('viewSource')"
        >
          {{ msg.trViewSource }}
        </button>
        <button
          type="button"
          class="rr__link rr__link--destructive"
          @click="emit('remove')"
        >
          {{ msg.trRemoveEvent }}
        </button>
      </div>
    </div>
    <p
      v-else
      class="rr__hint"
    >
      {{ msg.trEditHint }}
    </p>
  </div>
</template>

<style scoped>
.rr {
  box-sizing: border-box;
  height: 100%;
  padding-block: var(--spacing-50);
  overflow-y: auto;
  overscroll-behavior: contain;
  font-size: var(--font-size-small);
  line-height: var(--line-height-small);
}
.rr__edit {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--spacing-50) var(--spacing-100);
}
.rr__title {
  flex: 1 1 18em;
  min-width: 0;
  max-width: 32em;
}
.rr__when {
  font-variant-numeric: tabular-nums;
}
.rr__side {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--spacing-50) var(--spacing-75);
}
.rr__thumb {
  display: block;
  padding: 0;
  border: var(--border-width-base) solid var(--border-color-subtle);
  border-radius: var(--border-radius-base);
  background: none;
  cursor: pointer;
}
.rr__thumb img {
  display: block;
  width: 60px;
  height: 40px;
  object-fit: cover;
}
.rr__thumb:hover {
  border-color: var(--border-color-progressive--hover, var(--color-progressive));
}
.rr__thumb:focus-visible,
.rr__link:focus-visible {
  outline: var(--border-width-thick) solid var(--outline-color-progressive--focus);
  outline-offset: 1px;
}
/* Quiet text actions, as links. */
.rr__link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-progressive);
  font: inherit;
  cursor: pointer;
}
.rr__link:hover {
  text-decoration: underline;
}
.rr__link--destructive {
  color: var(--color-destructive);
}
.mw-parser-output .rr p,
.rr p {
  margin: 0;
}
.rr__hint {
  color: var(--color-subtle);
}
</style>
