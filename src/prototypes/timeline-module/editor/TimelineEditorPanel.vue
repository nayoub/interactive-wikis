<script setup lang="ts">
/**
 * The timeline's curation panel: picked events (always date-sorted), each
 * editable; a live reader preview; where it goes; insert / done.
 */
import { computed, ref } from 'vue'
import {
  CdxButton,
  CdxDialog,
  CdxField,
  CdxIcon,
  CdxMessage,
  CdxSelect,
  CdxTab,
  CdxTabs,
  CdxTextInput,
} from '@wikimedia/codex'
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
      <CdxTab name="events" :label="`Events (${count})`">
        <div class="tp__pane">
          <CdxMessage v-if="!count" class="tp__intro">
            Every date in the article is now highlighted. Tap the ones that belong on the timeline;
            tap again to remove. Each one brings its sentence with it.
          </CdxMessage>
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
          <CdxField class="tp__title-field">
            <template #label>Timeline title</template>
            <CdxTextInput v-model="draft.title" placeholder="Timeline" />
          </CdxField>
          <TimelineView
            :events="draft.events"
            :title="draft.title"
            :spacing="spacing"
            :skin="skin"
            layout="vertical"
          />
          <CdxButton v-if="skin === 'desktop' && count" weight="quiet" @click="widePreview = true">
            <CdxIcon :icon="cdxIconFullscreen" /> Preview at article width
          </CdxButton>
        </div>
      </CdxTab>
    </CdxTabs>

    <template #footer>
      <CdxField v-if="!draft.editingPlaced" class="tp__placement">
        <template #label>Place it</template>
        <CdxSelect
          v-model:selected="placementValue"
          :menu-items="placementItems"
          :menu-config="{ visibleItemLimit: 6 }"
        />
      </CdxField>
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
  border-bottom: var(--border-width-base, 1px) solid var(--border-color-subtle);
}
.tp__item:first-child {
  padding-top: 0;
}
.tp__title-field {
  margin-bottom: var(--spacing-75);
}
.tp__placement {
  margin: 0;
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
