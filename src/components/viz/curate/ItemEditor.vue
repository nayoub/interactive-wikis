<script setup lang="ts">
/**
 * One curated item, whatever it is: a head (the kind's own — a date, a place
 * name) and optional details from the `head`/`details` slots, then what every
 * item has: an editable label, an image, the source sentence and a way back to
 * it. Reads as the item itself and becomes editable where you touch it; tools
 * appear on hover (always visible on touch).
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { CdxButton, CdxIcon } from '@wikimedia/codex'
import { cdxIconArrowNext, cdxIconClose, cdxIconImage, cdxIconTrash } from '@wikimedia/codex-icons'

import type { BaseItem } from '../model/types'

const props = defineProps<{ draftLabel?: string; noun: string }>()
const item = defineModel<BaseItem>({ required: true })
const emit = defineEmits<{ remove: []; chooseImage: []; showSource: [] }>()
defineSlots<{ head(): unknown; details(): unknown }>()

const sourceOpen = ref(false)

// Label: a borderless, self-sizing textarea.
const labelRef = ref<HTMLTextAreaElement | null>(null)
function fit() {
  const el = labelRef.value
  // Skip while hidden (collapsed sheet): scrollHeight is 0 there.
  if (!el || !el.offsetParent) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}
// Refit when the row first becomes visible or its width changes.
let ro: ResizeObserver | null = null
onMounted(() => {
  if (!labelRef.value) return
  ro = new ResizeObserver(fit)
  ro.observe(labelRef.value)
})
onBeforeUnmount(() => ro?.disconnect())
function onLabel(e: Event) {
  item.value.label = (e.target as HTMLTextAreaElement).value.replace(/\n/g, ' ')
  fit()
}
onMounted(fit)
watch(
  () => item.value.label,
  () => nextTick(fit),
)
const labelEdited = computed(() => !!props.draftLabel && props.draftLabel !== item.value.label)

const credit = computed(() => {
  const img = item.value.image
  return img?.source === 'commons' ? `${img.artist} · ${img.license}` : ''
})

/** Source sentence split around the matched text, so it can be marked. */
const sourceParts = computed(() => {
  const s = item.value.sourceText
  const d = item.value.sourceDateText
  const i = d ? s.indexOf(d) : -1
  if (i === -1) return [s, '', '']
  return [s.slice(0, i), d, s.slice(i + d.length)]
})
</script>

<template>
  <div class="ev">
    <div class="ev__head">
      <slot name="head" />
      <div class="ev__tools">
        <CdxButton
          weight="quiet"
          size="small"
          :aria-label="item.image ? 'Change image' : 'Add image'"
          @click="emit('chooseImage')"
        >
          <CdxIcon :icon="cdxIconImage" size="small" />
        </CdxButton>
        <CdxButton
          weight="quiet"
          size="small"
          :aria-label="`Remove ${noun}`"
          @click="emit('remove')"
        >
          <CdxIcon :icon="cdxIconTrash" size="small" />
        </CdxButton>
      </div>
    </div>

    <slot name="details" />

    <div class="ev__body">
      <div class="ev__text">
        <textarea
          ref="labelRef"
          class="ev__label"
          rows="1"
          :value="item.label"
          aria-label="Label"
          @input="onLabel"
        />
        <button
          v-if="labelEdited"
          type="button"
          class="ev__link ev__revert"
          @click="item.label = draftLabel!"
        >
          Use drafted label
        </button>
      </div>
      <div v-if="item.image" class="ev__image">
        <button
          type="button"
          class="ev__thumb"
          aria-label="Change image"
          @click="emit('chooseImage')"
        >
          <img :src="item.image.src" :alt="item.image.caption" :title="item.image.fileTitle" />
        </button>
        <button
          type="button"
          class="ev__unimage"
          aria-label="Remove image"
          @click="item.image = undefined"
        >
          <CdxIcon :icon="cdxIconClose" size="x-small" />
        </button>
      </div>
    </div>

    <small v-if="credit" class="ev__credit">
      Image: <a :href="item.image!.pageUrl" target="_blank" rel="noopener">{{ credit }}</a>
    </small>
    <template v-if="item.sourceAnchor">
      <small class="ev__source" :class="{ 'ev__source--open': sourceOpen }">
        <button
          type="button"
          class="ev__quote"
          :aria-expanded="sourceOpen"
          @click="sourceOpen = !sourceOpen"
        >
          {{ sourceParts[0] }}<mark>{{ sourceParts[1] }}</mark
          >{{ sourceParts[2] }}
        </button>
      </small>
      <small class="ev__where">
        {{ item.sourceAnchor.sectionTitle }}
        <button type="button" class="ev__link" @click="emit('showSource')">
          Show in article <CdxIcon :icon="cdxIconArrowNext" size="x-small" />
        </button>
      </small>
    </template>
    <small v-else class="ev__nosource">
      No source sentence: added by search, not picked from the article.
    </small>
  </div>
</template>

<style scoped>
.ev {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-25);
}
.ev__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 32px;
}

/* Heading 4 */
.ev__date {
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-base);
  font-family: var(--font-family-base);
  font-size: var(--font-size-large);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-large);
  text-decoration: underline dotted transparent;
  text-underline-offset: 4px;
  cursor: pointer;
}
.ev__date:hover,
.ev__date[aria-expanded='true'] {
  text-decoration-color: var(--border-color-base);
}

.ev__tools {
  display: flex;
  gap: 2px;
  color: var(--color-subtle);
}
@media (hover: hover) {
  .ev__tools {
    opacity: 0;
    transition: opacity 120ms;
  }
  .ev:hover .ev__tools,
  .ev:focus-within .ev__tools {
    opacity: 1;
  }
}

.ev__dates {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--spacing-50);
  padding-block: var(--spacing-50);
}
.ev__dates :deep(.cdx-select-vue) {
  min-width: 0;
}
.ev__precision {
  width: 96px;
}
.ev__month {
  width: 132px;
}
.ev__num {
  width: 80px;
  min-width: 0;
}
.ev__num--day {
  width: 60px;
}
.ev__until {
  color: var(--color-subtle);
}
.ev__flags {
  display: flex;
  gap: var(--spacing-75);
}
.ev__flags :deep(.cdx-checkbox) {
  margin: 0;
}

.ev__body {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-75);
}
.ev__text {
  flex: 1;
  min-width: 0;
}

/* Body: the label reads as text until you touch it. */
.ev__label {
  display: block;
  box-sizing: border-box;
  margin: 0 0 0 calc(-1 * var(--spacing-50));
  padding: 2px var(--spacing-50);
  width: calc(100% + var(--spacing-50));
  overflow: hidden;
  resize: none;
  border: 0;
  border-radius: var(--border-radius-base, 2px);
  background: transparent;
  color: var(--color-base);
  font-family: var(--font-family-base);
  font-size: var(--font-size-medium);
  font-weight: var(--font-weight-normal);
  line-height: var(--line-height-medium);
  transition:
    background-color 120ms,
    box-shadow 120ms;
}
.ev__label:hover {
  background: var(--background-color-interactive-subtle);
}
.ev__label:focus {
  outline: none;
  background: var(--background-color-base);
  box-shadow: inset 0 0 0 1px var(--border-color-progressive);
}
.ev .ev__revert {
  margin-top: 2px;
  font-size: var(--font-size-small);
  line-height: var(--line-height-small);
  display: none;
}
.ev:focus-within .ev__link.ev__revert {
  display: inline-flex;
}
@media (hover: hover) {
  .ev:hover .ev__link.ev__revert {
    display: inline-flex;
  }
}

.ev__image {
  position: relative;
  flex: none;
}
.ev__thumb {
  display: block;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
}
.ev__thumb img {
  display: block;
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: var(--border-radius-base, 2px);
}
.ev__unimage {
  position: absolute;
  top: -6px;
  right: -6px;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--background-color-base);
  box-shadow: var(--box-shadow-small, 0 1px 2px rgba(0, 0, 0, 0.2));
  color: var(--color-subtle);
  cursor: pointer;
}
@media (hover: hover) {
  .ev__unimage {
    opacity: 0;
  }
  .ev__image:hover .ev__unimage,
  .ev__unimage:focus-visible {
    opacity: 1;
  }
}

/* Small: the source, folded to two lines until opened. */
.ev__source {
  color: var(--color-subtle);
}
.ev__quote {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}
.ev__source--open .ev__quote {
  -webkit-line-clamp: unset;
}
.ev__quote mark {
  background: none;
  color: var(--color-base);
  font-weight: inherit;
  text-decoration: underline;
  text-decoration-color: var(--border-color-progressive);
  text-underline-offset: 3px;
}
.ev__credit {
  color: var(--color-placeholder);
}
.ev__credit a {
  color: inherit;
}
.ev__nosource {
  color: var(--color-placeholder);
  font-style: italic;
}
.ev__where {
  display: flex;
  justify-content: space-between;
  color: var(--color-placeholder);
}
.ev__link {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-progressive);
  font: inherit;
  cursor: pointer;
}
.ev__link:hover {
  text-decoration: underline;
}
.ev__link .cdx-icon {
  color: inherit;
}
</style>
