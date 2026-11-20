<script setup lang="ts">
/**
 * A placed module as a block in the article. In read mode it is just its
 * renderer (default slot); in edit mode it is a selectable node (VE-style):
 * click to edit, with a small context bar to move or remove it.
 */
import { computed, ref } from 'vue'
import { CdxButton, CdxIcon, CdxMenuButton } from '@wikimedia/codex'
import { cdxIconEdit, cdxIconMove, cdxIconTrash } from '@wikimedia/codex-icons'

import type { ArticleSection } from '../model/types'

const props = defineProps<{
  /** "Timeline", "Map". */
  title: string
  editing: boolean
  /** Panel open on this block: show it as selected, live-updating. */
  active: boolean
  sections: ArticleSection[]
}>()

const emit = defineEmits<{ edit: []; remove: []; move: [sectionId: string] }>()

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
    class="mod-block"
    :class="{ 'mod-block--editing': editing, 'mod-block--active': active }"
    contenteditable="false"
  >
    <div v-if="editing" class="mod-block__context">
      <span class="mod-block__badge">{{ title }}</span>
      <CdxButton size="small" weight="quiet" @click.stop="emit('edit')">
        <CdxIcon :icon="cdxIconEdit" /> Edit
      </CdxButton>
      <CdxMenuButton
        v-model:selected="moveSelection"
        :menu-items="moveItems"
        :menu-config="{ visibleItemLimit: 8 }"
        size="small"
        weight="quiet"
        :aria-label="`Move ${title.toLowerCase()}`"
        @update:selected="onMove"
      >
        <CdxIcon :icon="cdxIconMove" /> Move
      </CdxMenuButton>
      <CdxButton
        size="small"
        weight="quiet"
        action="destructive"
        :aria-label="`Remove ${title.toLowerCase()}`"
        @click.stop="emit('remove')"
      >
        <CdxIcon :icon="cdxIconTrash" />
      </CdxButton>
    </div>
    <!-- eslint-disable-next-line vuejs-accessibility/click-events-have-key-events -->
    <div
      class="mod-block__body"
      @click.capture="editing && ($event.preventDefault(), $event.stopPropagation(), emit('edit'))"
      @pointerdown.capture="editing && $event.stopPropagation()"
    >
      <slot />
    </div>
  </div>
</template>

<style scoped>
.mod-block {
  display: flow-root;
  position: relative;
  user-select: none;
  -webkit-user-select: none;
}
.mod-block--editing {
  margin-top: var(--spacing-200);
}
.mod-block--editing .mod-block__body {
  cursor: pointer;
  border-radius: var(--border-radius-base, 2px);
  outline: 1px solid transparent;
  outline-offset: 6px;
  transition: outline-color 140ms;
}
.mod-block--editing:hover .mod-block__body {
  outline-color: var(--border-color-progressive);
}
.mod-block--active .mod-block__body {
  outline: 2px solid var(--border-color-progressive) !important;
}
.mod-block__context {
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
  z-index: 3;
}
@media (hover: hover) {
  .mod-block__context {
    opacity: 0;
    transform: translateY(4px);
    transition:
      opacity 140ms,
      transform 140ms;
  }
  .mod-block--editing:hover .mod-block__context,
  .mod-block--editing:focus-within .mod-block__context,
  .mod-block--active .mod-block__context {
    opacity: 1;
    transform: none;
  }
}
.mod-block__badge {
  padding-inline: var(--spacing-50);
  font-size: var(--font-size-small);
  line-height: var(--line-height-small);
  color: var(--color-subtle);
}
</style>
