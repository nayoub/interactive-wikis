<script setup lang="ts">
/**
 * The timeline's curation panel: picked events (always date-sorted), each
 * editable; a live reader preview; where it goes; insert / done.
 */
import { computed, ref } from 'vue'
import { CdxButton, CdxDialog, CdxIcon, CdxSelect, CdxTab, CdxTabs } from '@wikimedia/codex'
import { cdxIconFullscreen } from '@wikimedia/codex-icons'

import CurationPanel from '../selection/CurationPanel.vue'
import type { ArticleSection, DateMention } from '../article/loadArticle'
import TimelineView from '../timeline/TimelineView.vue'
import { sortEvents } from '../timeline/format'
import type { ArticleImage, Placement, TimelineEvent } from '../timeline/types'
import type { Draft } from '../store'
import EventEditor from './EventEditor.vue'
import ImagePicker from './ImagePicker.vue'

const props = defineProps<{
  skin: 'desktop' | 'mobile'
  images: ArticleImage[]
  sections: ArticleSection[]
  mentions: Map<string, DateMention>
  spacing: 'proportional' | 'even'
  /** Where the caret was when Insert was chosen (null: none). */
  cursorPlacement: Placement | null
}>()

const draft = defineModel<Draft>('draft', { required: true })
const placement = defineModel<Placement>('placement', { required: true })
const expanded = defineModel<boolean>('expanded', { default: false })

const emit = defineEmits<{
  close: []
  discard: []
  commit: []
  showSource: [event: TimelineEvent]
}>()

const tab = ref<'events' | 'preview'>('events')
const sorted = computed(() => sortEvents(draft.value.events))
const count = computed(() => draft.value.events.length)
const countLabel = computed(() => (count.value === 1 ? '1 event' : `${count.value} events`))

function eventRef(id: string) {
  return draft.value.events.find((e) => e.id === id)!
}
function remove(id: string) {
  draft.value.events = draft.value.events.filter((e) => e.id !== id)
}

// Image picking
const pickerOpen = ref(false)
const pickerFor = ref<string | null>(null)
const pickerEvent = computed(() => (pickerFor.value ? eventRef(pickerFor.value) : null))
function chooseImage(id: string) {
  pickerFor.value = id
  pickerOpen.value = true
}
function onImage(img: ArticleImage | undefined) {
  if (pickerEvent.value) pickerEvent.value.image = img
}

// Placement
const placementKey = (p: Placement | null) =>
  !p ? '' : p.kind === 'after' ? `after:${p.anchorId}` : `top:${p.sectionId}`
const placementItems = computed(() => {
  const items: { value: string; label: string; description?: string }[] = []
  if (props.cursorPlacement) {
    items.push({
      value: placementKey(props.cursorPlacement),
      label: 'At the cursor',
      description:
        props.cursorPlacement.kind === 'after'
          ? `After a paragraph in “${props.cursorPlacement.sectionTitle}”`
          : `Top of “${props.cursorPlacement.sectionTitle}”`,
    })
  }
  for (const s of props.sections) {
    const key = `top:${s.id}`
    if (items.some((i) => i.value === key)) continue
    items.push({
      value: key,
      label: `Top of “${s.title}”`,
      description: s.level === 3 ? 'Subsection' : undefined,
    })
  }
  return items
})
const placementValue = computed({
  get: () => placementKey(placement.value),
  set: (key: string) => {
    if (props.cursorPlacement && key === placementKey(props.cursorPlacement)) {
      placement.value = props.cursorPlacement
      return
    }
    const id = key.replace(/^top:/, '')
    const s = props.sections.find((x) => x.id === id)
    if (s) placement.value = { kind: 'sectionTop', sectionId: s.id, sectionTitle: s.title }
  },
})

const widePreview = ref(false)
const hint = computed(() =>
  count.value ? 'Tap more dates, or open to edit' : 'Tap any highlighted date in the article',
)
</script>

<template>
  <CurationPanel
    v-model:expanded="expanded"
    :skin="skin"
    title="Timeline"
    :count="count"
    :count-label="countLabel"
    :hint="hint"
    @close="emit('close')"
  >
    <CdxTabs v-model:active="tab" class="tp__tabs" :framed="false">
      <CdxTab name="events" label="Events">
        <div class="tp__pane">
          <input
            v-model="draft.title"
            class="tp__title"
            placeholder="Untitled timeline"
            aria-label="Timeline title"
          />
          <div v-if="!count" class="tp__empty">
            <p>Tap any highlighted date in the article.</p>
            <small>Each date brings its sentence with it. Tap again to remove it.</small>
          </div>
          <ol v-else class="tp__list">
            <li v-for="event in sorted" :key="event.id" class="tp__item">
              <EventEditor
                :model-value="eventRef(event.id)"
                :draft-label="mentions.get(event.id)?.draftLabel"
                @update:model-value="Object.assign(eventRef(event.id), $event)"
                @remove="remove(event.id)"
                @choose-image="chooseImage(event.id)"
                @show-source="emit('showSource', event)"
              />
            </li>
          </ol>
        </div>
      </CdxTab>
      <CdxTab name="preview" label="Preview">
        <div class="tp__pane">
          <TimelineView
            :events="draft.events"
            :title="draft.title"
            :spacing="spacing"
            :skin="skin"
            layout="vertical"
          />
          <CdxButton
            v-if="skin === 'desktop' && count"
            class="tp__wide-btn"
            weight="quiet"
            size="small"
            @click="widePreview = true"
          >
            <CdxIcon :icon="cdxIconFullscreen" size="small" /> At article width
          </CdxButton>
        </div>
      </CdxTab>
    </CdxTabs>

    <template #footer>
      <CdxSelect
        v-if="!draft.editingPlaced"
        v-model:selected="placementValue"
        class="tp__placement"
        aria-label="Where to insert"
        :menu-items="placementItems"
        :menu-config="{ visibleItemLimit: 6 }"
      />
      <div class="tp__actions">
        <CdxButton weight="quiet" @click="emit('discard')">{{
          draft.editingPlaced ? 'Cancel' : 'Discard'
        }}</CdxButton>
        <CdxButton action="progressive" weight="primary" :disabled="!count" @click="emit('commit')">
          {{ draft.editingPlaced ? 'Done' : 'Insert' }}
        </CdxButton>
      </div>
    </template>
  </CurationPanel>

  <ImagePicker v-model:open="pickerOpen" :images="images" :event="pickerEvent" @choose="onImage" />

  <CdxDialog
    v-model:open="widePreview"
    class="tp__wide"
    title="Preview"
    subtitle="As readers will see it in the article on desktop"
    :use-close-button="true"
  >
    <TimelineView
      :events="draft.events"
      :title="draft.title"
      :spacing="spacing"
      skin="desktop"
      layout="horizontal"
    />
  </CdxDialog>
</template>

<style scoped>
.tp__tabs {
  min-height: 100%;
}
.tp__tabs :deep(.cdx-tabs__header) {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--background-color-base);
}
.tp__pane {
  padding: var(--spacing-75) var(--spacing-100) var(--spacing-150);
}
.tp__list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.tp__item {
  margin: 0;
  padding-block: var(--spacing-100);
}
.tp__item + .tp__item {
  border-top: var(--border-width-base, 1px) solid var(--border-color-subtle);
}
/* Heading 4, editable in place. */
.tp__title {
  display: block;
  box-sizing: border-box;
  width: calc(100% + var(--spacing-50));
  margin: 0 0 var(--spacing-50) calc(-1 * var(--spacing-50));
  padding: 2px var(--spacing-50);
  border: 0;
  border-radius: var(--border-radius-base, 2px);
  background: transparent;
  color: var(--color-base);
  font-family: var(--font-family-base);
  font-size: var(--font-size-large);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-large);
}
.tp__title::placeholder {
  color: var(--color-placeholder);
}
.tp__title:hover {
  background: var(--background-color-interactive-subtle);
}
.tp__title:focus {
  outline: none;
  background: var(--background-color-base);
  box-shadow: inset 0 0 0 1px var(--border-color-progressive);
}
.tp__empty {
  padding-block: var(--spacing-200);
  color: var(--color-subtle);
}
.tp__empty p {
  margin: 0 0 var(--spacing-25);
  color: var(--color-base);
}
.tp__wide-btn {
  margin-top: var(--spacing-75);
}
.tp__placement {
  width: 100%;
}
.tp__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-50);
}
</style>

<style>
.cdx-dialog.tp__wide {
  max-width: min(1040px, calc(100vw - 32px));
  width: 100%;
}
</style>
