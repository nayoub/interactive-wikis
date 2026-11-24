<script setup lang="ts">
/**
 * While the timeline is being edited: one compact bar at the foot of the
 * timeline panel, right under the event editor (the general tool's
 * EditorBar pattern, without its form and scope controls). What to do or
 * how many events, Undo, Cancel, Done.
 */
import { CdxButton, CdxIcon } from '@wikimedia/codex'
import { cdxIconUndo } from '@wikimedia/codex-icons'

import { msg } from '../messages'

defineProps<{ count: number; isNew: boolean; canUndo: boolean }>()
const emit = defineEmits<{ undo: []; cancel: []; done: [] }>()
</script>

<template>
  <div
    class="ab"
    role="region"
    :aria-label="msg.trAuthorBar"
  >
    <div class="ab__inner">
      <p
        class="ab__what"
        aria-live="polite"
      >
        <strong v-if="count">{{ msg.trEventCount(count) }}</strong>
        <span v-else>{{ msg.trPickPrompt }}</span>
        <small v-if="isNew">{{ msg.trNewNote }}</small>
      </p>
      <CdxButton
        weight="quiet"
        :disabled="!canUndo"
        :aria-label="msg.trUndo"
        :title="msg.trUndo"
        @click="emit('undo')"
      >
        <CdxIcon :icon="cdxIconUndo" />
      </CdxButton>
      <CdxButton
        weight="quiet"
        @click="emit('cancel')"
      >
        {{ msg.trCancel }}
      </CdxButton>
      <CdxButton
        action="progressive"
        weight="primary"
        @click="emit('done')"
      >
        {{ msg.trDone }}
      </CdxButton>
    </div>
  </div>
</template>

<style scoped>
.ab {
  display: flex;
  align-items: center;
  box-sizing: border-box;
  border-block-start: var(--border-width-base) solid var(--border-color-subtle);
}
.ab__inner {
  display: flex;
  align-items: center;
  gap: var(--spacing-50);
  width: 100%;
}
.ab__what {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: var(--font-size-small);
  line-height: var(--line-height-small);
}
.ab__what small {
  color: var(--color-subtle);
}
</style>
