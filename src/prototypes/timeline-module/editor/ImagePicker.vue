<script setup lang="ts">
/** Pick an image for an event — only from images already in the article. Suggests by caption overlap. */
import { computed } from 'vue'
import { CdxDialog } from '@wikimedia/codex'

import type { ArticleImage, TimelineEvent } from '../timeline/types'

const props = defineProps<{ images: ArticleImage[]; event: TimelineEvent | null }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ choose: [image: ArticleImage | undefined] }>()

const STOP = new Set([
  'the',
  'and',
  'of',
  'in',
  'at',
  'a',
  'an',
  'to',
  'his',
  'for',
  'by',
  'on',
  'with',
  'from',
  'gehry',
  'frank',
])
const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .split(/[^a-zà-ÿ0-9]+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  )

const ranked = computed(() => {
  if (!props.event) return { suggested: [], rest: props.images }
  const want = words(`${props.event.label} ${props.event.sourceText}`)
  const year = String(props.event.date.start.y)
  const scored = props.images.map((img) => {
    const have = words(img.caption)
    let score = 0
    have.forEach((w) => want.has(w) && score++)
    if (img.caption.includes(year)) score += 2
    return { img, score }
  })
  const suggested = scored
    .filter((s) => s.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((s) => s.img)
  return { suggested, rest: props.images.filter((i) => !suggested.includes(i)) }
})

function choose(img: ArticleImage | undefined) {
  emit('choose', img)
  open.value = false
}
</script>

<template>
  <CdxDialog
    v-model:open="open"
    title="Choose an image from the article"
    subtitle="A timeline can only use images that are already in the article."
    :use-close-button="true"
    class="ip"
  >
    <template v-if="ranked.suggested.length">
      <h4 class="ip__heading">Suggested</h4>
      <ul class="ip__grid">
        <li v-for="img in ranked.suggested" :key="img.id">
          <button
            type="button"
            class="ip__item"
            :class="{ 'ip__item--on': event?.image?.src === img.src }"
            @click="choose(img)"
          >
            <img :src="img.src" alt="" />
            <small>{{ img.caption }}</small>
          </button>
        </li>
      </ul>
      <h4 class="ip__heading">All images</h4>
    </template>
    <ul class="ip__grid">
      <li v-for="img in ranked.rest" :key="img.id">
        <button
          type="button"
          class="ip__item"
          :class="{ 'ip__item--on': event?.image?.src === img.src }"
          @click="choose(img)"
        >
          <img :src="img.src" alt="" loading="lazy" />
          <small>{{ img.caption }}</small>
        </button>
      </li>
    </ul>
  </CdxDialog>
</template>

<style scoped>
.ip__heading {
  margin: var(--spacing-75) 0 var(--spacing-50);
}
.ip__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: var(--spacing-75);
  list-style: none;
  margin: 0;
  padding: 0;
}
.ip__item {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-25);
  width: 100%;
  padding: var(--spacing-25);
  border: 1px solid transparent;
  border-radius: var(--border-radius-base, 2px);
  background: none;
  color: var(--color-base);
  font: inherit;
  text-align: start;
  cursor: pointer;
}
.ip__item:hover {
  background: var(--background-color-interactive-subtle--hover);
}
.ip__item--on {
  border-color: var(--border-color-progressive);
  background: var(--background-color-progressive-subtle);
}
.ip__item img {
  width: 100%;
  height: 96px;
  object-fit: cover;
  border-radius: var(--border-radius-base, 2px);
  background: var(--background-color-neutral-subtle);
}
.ip__item small {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  color: var(--color-subtle);
}
</style>
