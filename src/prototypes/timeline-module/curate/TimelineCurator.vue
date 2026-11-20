<script setup lang="ts">
/**
 * Curate: the panel that lists, edits and orders picked items (date-sorted),
 * says where the result goes, and inserts it. It does not draw the result —
 * the host passes a renderer through the `preview` slot, so the same panel can
 * curate a map or a chart.
 */
import { computed, ref } from 'vue'
import { CdxButton, CdxDialog, CdxIcon, CdxSelect, CdxToggleSwitch } from '@wikimedia/codex'
import { cdxIconFullscreen } from '@wikimedia/codex-icons'

import { sortEvents } from '../model/dates'
import type { ArticleSection, Draft, EventImage, Placement, TimelineEvent } from '../model/types'
import CurationPanel from './CurationPanel.vue'
import EventEditor from './EventEditor.vue'
import ImagePicker from './ImagePicker.vue'

const props = defineProps<{
  /** Sidebar beside the article, or a bottom sheet over it. */
  mode: 'side' | 'sheet'
  images: EventImage[]
  sections: ArticleSection[]
  /** Machine-drafted label per item id, so edits can be undone. */
  draftLabels: Map<string, string>
  subject: string
  /** Ages need a birth date; without one the switch is hidden. */
  canShowAge: boolean
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

defineSlots<{
  preview(props: { wide: boolean }): unknown
  notice(): unknown
}>()

const tab = ref<'events' | 'preview'>('events')
const tabs = [
  { id: 'events', label: 'Events' },
  { id: 'preview', label: 'Preview' },
] as const

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
function onImage(img: EventImage | undefined) {
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
    :mode="mode"
    title="Timeline"
    :count="count"
    :count-label="countLabel"
    :hint="hint"
    @close="emit('close')"
  >
    <template #notice><slot name="notice" /></template>

    <div class="tp__tabs" role="tablist" aria-label="Timeline panel">
      <button
        v-for="t in tabs"
        :id="`tp-tab-${t.id}`"
        :key="t.id"
        type="button"
        role="tab"
        class="tp__tab"
        :class="{ 'tp__tab--on': tab === t.id }"
        :aria-selected="tab === t.id"
        :aria-controls="`tp-panel-${t.id}`"
        @click="tab = t.id"
      >
        {{ t.label }}
      </button>
    </div>

    <div
      v-show="tab === 'events'"
      id="tp-panel-events"
      role="tabpanel"
      aria-labelledby="tp-tab-events"
      class="tp__pane"
    >
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
            :draft-label="draftLabels.get(event.id)"
            @remove="remove(event.id)"
            @choose-image="chooseImage(event.id)"
            @show-source="emit('showSource', event)"
          />
        </li>
      </ol>
    </div>

    <div
      v-show="tab === 'preview'"
      id="tp-panel-preview"
      role="tabpanel"
      aria-labelledby="tp-tab-preview"
      class="tp__pane"
    >
      <div class="tp__options">
        <CdxToggleSwitch v-if="canShowAge" v-model="draft.options.showAge" align-switch
          >Age at each event</CdxToggleSwitch
        >
        <CdxToggleSwitch v-model="draft.options.showGaps" align-switch
          >Time between events</CdxToggleSwitch
        >
      </div>
      <slot name="preview" :wide="false" />
      <CdxButton
        v-if="mode === 'side' && count"
        class="tp__wide-btn"
        weight="quiet"
        size="small"
        @click="widePreview = true"
      >
        <CdxIcon :icon="cdxIconFullscreen" size="small" /> At article width
      </CdxButton>
    </div>

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

  <ImagePicker
    v-model:open="pickerOpen"
    :images="images"
    :event="pickerEvent"
    :subject="subject"
    @choose="onImage"
  />

  <CdxDialog
    v-model:open="widePreview"
    class="tp__wide"
    title="Preview"
    subtitle="As readers will see it in the article on desktop"
    :use-close-button="true"
  >
    <slot name="preview" :wide="true" />
  </CdxDialog>
</template>

<style scoped>
/* Two plain tabs that always fit (no scrolling tab strip). */
.tp__tabs {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  gap: var(--spacing-150);
  padding: 0 var(--spacing-100);
  background: var(--background-color-base);
  border-bottom: var(--border-width-base, 1px) solid var(--border-color-subtle);
}
.tp__tab {
  flex: none;
  padding: var(--spacing-50) 0;
  margin-bottom: -1px;
  border: 0;
  border-bottom: var(--border-width-thick, 2px) solid transparent;
  background: none;
  color: var(--color-subtle);
  font-family: var(--font-family-base);
  font-size: var(--font-size-medium);
  font-weight: var(--font-weight-normal);
  line-height: var(--line-height-medium);
  cursor: pointer;
}
.tp__tab:hover {
  color: var(--color-base);
}
.tp__tab--on {
  color: var(--color-progressive);
  border-bottom-color: var(--border-color-progressive);
}
.tp__tab:focus-visible {
  outline: var(--border-width-thick, 2px) solid var(--outline-color-progressive--focus, #36c);
  outline-offset: 2px;
}
.tp__pane {
  padding: var(--spacing-75) var(--spacing-100) var(--spacing-150);
}
.tp__options {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-50);
  margin-bottom: var(--spacing-75);
}
.tp__options :deep(.cdx-toggle-switch) {
  margin: 0;
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
