<script setup lang="ts">
/**
 * What every module shows for its selected item, the same way everywhere:
 * below the figure (never over it), with the item's details, its source
 * sentence and citation, and "Show in article". The figure dims everything
 * else. Close with the button, Escape, tapping the item again or empty space.
 * Reads ../tokens.css only.
 */
import { CdxIcon } from '@wikimedia/codex'
import { cdxIconClose } from '@wikimedia/codex-icons'

import type { Citation, EventImage } from '../model/types'

defineProps<{
  title: string
  /** A second name (the label the editor gave, or the full name). */
  subtitle?: string
  /** Facts: date, country, seats… */
  meta?: string
  /** The sentence (or table row) the item came from. */
  quote?: string
  citation?: Citation
  /** Where the source is, when it is not a sentence ("Results table, “Results”"). */
  sourceNote?: string
  image?: EventImage
  /** "Show in article" (off in the editor's preview, or with no source). */
  canShowSource?: boolean
}>()
const emit = defineEmits<{ showSource: []; close: [] }>()
</script>

<template>
  <div class="sc" role="region" :aria-label="title">
    <button type="button" class="sc__close" aria-label="Close" @click="emit('close')">
      <CdxIcon :icon="cdxIconClose" size="x-small" />
    </button>
    <img
      v-if="image"
      class="sc__img"
      :src="image.src"
      :alt="image.caption"
      :title="image.fileTitle ?? image.caption"
    />
    <div class="sc__body">
      <div class="sc__title">{{ title }}</div>
      <small v-if="subtitle" class="sc__subtitle">{{ subtitle }}</small>
      <small v-if="meta" class="sc__meta">{{ meta }}</small>
      <slot />
      <small v-if="quote" class="sc__quote"
        >“{{ quote }}”<sup v-if="citation" class="reference"
          ><a :href="citation.href">{{ citation.label }}</a></sup
        ></small
      >
      <small v-if="sourceNote" class="sc__meta">{{ sourceNote }}</small>
      <div class="sc__actions">
        <button v-if="canShowSource" type="button" class="sc__link" @click="emit('showSource')">
          <small>Show in article</small>
        </button>
        <slot name="actions" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.sc {
  position: relative;
  display: flex;
  gap: var(--viz-space-m);
  margin-top: var(--viz-space-m);
  padding: var(--viz-space-s) var(--viz-space-xl) 0 0;
  border-top: var(--viz-line-width) solid var(--viz-rule-light);
  color: var(--viz-ink);
  font-family: var(--viz-font-family);
}
.sc__close {
  position: absolute;
  top: var(--viz-space-xs);
  right: 0;
  padding: var(--viz-space-xs);
  border: 0;
  background: none;
  color: var(--viz-ink-tertiary);
  cursor: pointer;
}
.sc__close:focus-visible,
.sc__link:focus-visible {
  outline: var(--viz-focus-width) solid var(--viz-accent);
}
.sc__img {
  flex: none;
  width: var(--viz-image-width);
  height: var(--viz-image-height);
  object-fit: var(--viz-image-fit);
  border-radius: var(--viz-radius);
  background: var(--viz-image-empty);
}
.sc__body {
  min-width: 0;
}
.sc__title {
  font-size: var(--viz-heading-size);
  font-weight: var(--viz-heading-weight);
  line-height: var(--viz-heading-line);
}
small {
  display: block;
  font-family: var(--viz-font-family);
  font-size: var(--viz-small-size);
  font-weight: var(--viz-small-weight);
  line-height: var(--viz-small-line);
}
.sc__subtitle,
.sc__quote {
  color: var(--viz-ink-secondary);
}
.sc__meta {
  color: var(--viz-ink-tertiary);
}
.sc__quote {
  margin-top: var(--viz-space-xs);
}
.sc__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0 var(--viz-space-l);
  margin-top: var(--viz-space-xs);
}
.sc__actions :deep(button),
.sc__link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--viz-accent);
  cursor: pointer;
}
.sc__actions :deep(button:hover),
.sc__link:hover {
  text-decoration: underline;
}
</style>
