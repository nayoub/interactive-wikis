<script setup lang="ts">
/**
 * The timeline as a block in the article. In read mode it is just the reader
 * view; in edit mode it is a selectable node (VE-style): click to edit, with
 * a small context bar to move or remove it.
 */
import { computed, ref } from 'vue'
import { CdxButton, CdxIcon, CdxMenuButton } from '@wikimedia/codex'
import { cdxIconEdit, cdxIconMove, cdxIconTrash } from '@wikimedia/codex-icons'

import type { ArticleSection } from '../article/loadArticle'
import TimelineView from '../timeline/TimelineView.vue'
import type { Timeline, TimelineEvent } from '../timeline/types'

const props = defineProps<{
  timeline: Timeline
  editing: boolean
  /** Panel open on this block: show it as selected, live-updating. */
  active: boolean
  skin: 'desktop' | 'mobile'
  spacing: 'proportional' | 'even'
  fallback: boolean
  sections: ArticleSection[]
  activeEventId?: string | null
}>()

const emit = defineEmits<{
  edit: []
  remove: []
  move: [sectionId: string]
  select: [event: TimelineEvent]
}>()

const viewRef = ref<InstanceType<typeof TimelineView> | null>(null)
defineExpose({ focusEvent: (id: string) => viewRef.value?.focusEvent(id) })

const moveItems = computed(() =>
  props.sections.map((s) => ({ value: s.id, label: `Top of “${s.title}”` })),
)
const moveSelection = ref<string | null>(null)
function onMove(id: string) {
  emit('move', id)
  moveSelection.value = null
}
</script>

<template>
  <div
    class="tl-block"
    :class="{ 'tl-block--editing': editing, 'tl-block--active': active }"
    contenteditable="false"
  >
    <div v-if="editing" class="tl-block__context">
      <span class="tl-block__badge">Timeline</span>
      <CdxButton size="small" weight="quiet" @click.stop="emit('edit')">
        <CdxIcon :icon="cdxIconEdit" /> Edit
      </CdxButton>
      <CdxMenuButton
        v-model:selected="moveSelection"
        :menu-items="moveItems"
        :menu-config="{ visibleItemLimit: 8 }"
        size="small"
        weight="quiet"
        aria-label="Move timeline"
        @update:selected="onMove"
      >
        <CdxIcon :icon="cdxIconMove" /> Move
      </CdxMenuButton>
      <CdxButton
        size="small"
        weight="quiet"
        action="destructive"
        aria-label="Remove timeline"
        @click.stop="emit('remove')"
      >
        <CdxIcon :icon="cdxIconTrash" />
      </CdxButton>
    </div>
    <!-- eslint-disable-next-line vuejs-accessibility/click-events-have-key-events -->
    <div
      class="tl-block__body"
      @click.capture="editing && ($event.preventDefault(), $event.stopPropagation(), emit('edit'))"
    >
      <TimelineView
        ref="viewRef"
        :events="timeline.events"
        :title="timeline.title"
        :spacing="spacing"
        :fallback="fallback"
        :skin="skin"
        :active-id="activeEventId"
        @select="emit('select', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.tl-block {
  display: flow-root;
  position: relative;
  user-select: none;
  -webkit-user-select: none;
}
.tl-block--editing {
  margin-top: var(--spacing-200);
}
.tl-block--editing .tl-block__body {
  cursor: pointer;
  border-radius: var(--border-radius-base, 2px);
  outline: 1px dashed transparent;
  outline-offset: 4px;
}
.tl-block--editing:hover .tl-block__body {
  outline-color: var(--border-color-progressive);
}
.tl-block--active .tl-block__body {
  outline: 2px solid var(--border-color-progressive) !important;
}
.tl-block__context {
  position: absolute;
  top: calc(-1 * var(--spacing-150));
  inset-inline-end: 0;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  background: var(--background-color-base);
  border: var(--border-width-base, 1px) solid var(--border-color-subtle);
  border-radius: var(--border-radius-base, 2px);
  box-shadow: var(--box-shadow-small, 0 1px 1px rgba(0, 0, 0, 0.1));
  z-index: 3;
}
.tl-block__badge {
  padding-inline: var(--spacing-50);
  font-size: var(--font-size-small);
  line-height: var(--line-height-small);
  color: var(--color-subtle);
}
</style>
