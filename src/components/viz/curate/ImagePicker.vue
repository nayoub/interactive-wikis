<script setup lang="ts">
/**
 * Choose an image for an item: one already in the article (suggested by
 * caption overlap), or a file from Wikimedia Commons, searched from the entity
 * the source sentence links to. Commons files carry author and licence.
 */
import { computed, ref, watch } from 'vue'
import {
  CdxDialog,
  CdxMessage,
  CdxProgressBar,
  CdxSearchInput,
  CdxToggleButtonGroup,
} from '@wikimedia/codex'

import { overlap } from '../pick/duplicates'
import type { BaseItem, EventImage, TimelineDate } from '../model/types'
import { searchCommons, suggestQuery } from './commons'

const props = defineProps<{
  images: EventImage[]
  /** The item being illustrated (an event, a place). */
  event: (BaseItem & { date?: TimelineDate; name?: string }) | null
  subject: string
}>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ choose: [image: EventImage | undefined] }>()

const source = ref<'article' | 'commons'>('article')
const sources = [
  { value: 'article', label: 'In this article' },
  { value: 'commons', label: 'Wikimedia Commons' },
]

// ── In this article ────────────────────────────────────────────────────────
const ranked = computed(() => {
  const e = props.event
  if (!e) return { suggested: [] as EventImage[], rest: props.images }
  const year = e.date ? String(e.date.start.y) : '∅'
  const scored = props.images.map((img) => ({
    img,
    score:
      overlap(img.caption, `${e.label} ${e.sourceText}`) + (img.caption.includes(year) ? 0.5 : 0),
  }))
  const suggested = scored
    .filter((s) => s.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((s) => s.img)
  return { suggested, rest: props.images.filter((i) => !suggested.includes(i)) }
})

// ── Commons ────────────────────────────────────────────────────────────────
const query = ref('')
const results = ref<EventImage[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
let controller: AbortController | null = null
let timer: ReturnType<typeof setTimeout> | undefined

async function run(q: string) {
  controller?.abort()
  if (!q.trim()) return (results.value = [])
  controller = new AbortController()
  loading.value = true
  error.value = null
  try {
    results.value = await searchCommons(q.trim(), controller.signal)
  } catch (e) {
    if ((e as Error).name !== 'AbortError') error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}
function onInput(q: string) {
  query.value = q
  clearTimeout(timer)
  timer = setTimeout(() => run(q), 350)
}

// Fresh state per event; prefill Commons with the entity the sentence names.
watch(open, (isOpen) => {
  if (!isOpen || !props.event) return
  source.value = props.event.image?.source === 'commons' ? 'commons' : 'article'
  query.value =
    props.event.name ?? suggestQuery(props.event.sourceLinks, props.event.label, props.subject)
  results.value = []
  if (source.value === 'commons') run(query.value)
})
watch(source, (s) => {
  if (s === 'commons' && !results.value.length) run(query.value)
})

function choose(img: EventImage | undefined) {
  emit('choose', img ? { ...img } : undefined)
  open.value = false
}
const isChosen = (img: EventImage) => props.event?.image?.src === img.src
</script>

<template>
  <CdxDialog v-model:open="open" title="Image" :use-close-button="true" class="ip">
    <CdxToggleButtonGroup v-model="source" class="ip__source" :buttons="sources" />

    <template v-if="source === 'article'">
      <template v-if="ranked.suggested.length">
        <h4 class="ip__heading">Suggested</h4>
        <ul class="ip__grid">
          <li v-for="img in ranked.suggested" :key="img.id">
            <button
              type="button"
              class="ip__item"
              :class="{ 'ip__item--on': isChosen(img) }"
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
            :class="{ 'ip__item--on': isChosen(img) }"
            @click="choose(img)"
          >
            <img :src="img.src" alt="" loading="lazy" />
            <small>{{ img.caption }}</small>
          </button>
        </li>
      </ul>
    </template>

    <template v-else>
      <CdxSearchInput
        :model-value="query"
        class="ip__search"
        aria-label="Search Wikimedia Commons"
        placeholder="Search Wikimedia Commons"
        @update:model-value="onInput"
        @submit-click="run(query)"
      />
      <CdxProgressBar v-if="loading" inline aria-label="Searching Commons" />
      <CdxMessage v-if="error" type="error" inline>{{ error }}</CdxMessage>
      <p v-else-if="!loading && query && !results.length" class="ip__none">No images found.</p>
      <ul class="ip__grid">
        <li v-for="img in results" :key="img.id">
          <button
            type="button"
            class="ip__item"
            :class="{ 'ip__item--on': isChosen(img) }"
            :title="img.fileTitle"
            @click="choose(img)"
          >
            <img :src="img.src" alt="" loading="lazy" />
            <small>{{ img.caption }}</small>
            <small class="ip__credit">{{ img.artist }} · {{ img.license }}</small>
          </button>
        </li>
      </ul>
      <p class="ip__note">
        <small>Commons images keep their author and licence wherever the timeline is shown.</small>
      </p>
    </template>
  </CdxDialog>
</template>

<style scoped>
.ip__source {
  margin-bottom: var(--spacing-75);
}
.ip__search {
  margin-bottom: var(--spacing-75);
}
.ip__heading {
  margin: var(--spacing-75) 0 var(--spacing-50);
}
.ip__none,
.ip__note {
  color: var(--color-subtle);
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
  aspect-ratio: 3 / 2;
  object-fit: cover;
  background: var(--background-color-neutral-subtle);
}
.ip__item small {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  color: var(--color-subtle);
}
.ip__item .ip__credit {
  -webkit-line-clamp: 1;
  color: var(--color-placeholder);
}
</style>
