<script setup lang="ts">
/**
 * The return affordance after a passage jump: Return to reading (the saved
 * origin) and Stay here (forget it). Fixed at the bottom, registered as an
 * obstruction so jumps keep their target clear of it. Variants add their
 * own way back to the navigator through the default slot.
 */
import { computed, inject } from 'vue'
import { CdxButton, CdxIcon } from '@wikimedia/codex'
import { cdxIconArrowPrevious, cdxIconClose } from '@wikimedia/codex-icons'

import { NAV, type NavContext } from './context'
import { msg } from './messages'

const props = withDefaults(defineProps<{ always?: boolean }>(), { always: false })
const ctx = inject(NAV) as NavContext
const origin = computed(() => ctx.nav.origin.value)
const shown = computed(() => props.always || !!origin.value)
</script>

<template>
  <div
    v-if="shown"
    class="tn-return"
    data-tn-obstruct="bottom"
    role="region"
    :aria-label="msg.returnToReading"
  >
    <div class="tn-return__inner">
      <slot />
      <template v-if="origin">
        <CdxButton
          class="tn-return__primary"
          :title="msg.returnFrom(origin.section)"
          @click="ctx.nav.returnToOrigin()"
        >
          <CdxIcon :icon="cdxIconArrowPrevious" />
          {{ msg.returnToReading }}
        </CdxButton>
        <CdxButton
          weight="quiet"
          :aria-label="msg.keepReadingHere"
          :title="msg.keepReadingHereHint"
          @click="ctx.nav.endExploration()"
        >
          <CdxIcon :icon="cdxIconClose" />
        </CdxButton>
      </template>
    </div>
  </div>
</template>

<style scoped>
.tn-return {
  position: fixed;
  inset-block-end: var(--spacing-100);
  inset-inline: 0;
  z-index: 20;
  display: flex;
  justify-content: center;
  pointer-events: none;
}
.tn-return__inner {
  display: flex;
  align-items: center;
  gap: var(--spacing-25);
  max-width: calc(100% - 2 * var(--spacing-50));
  padding: var(--spacing-25);
  background: var(--background-color-base);
  border: var(--border-width-base) solid var(--border-color-base);
  border-radius: var(--border-radius-base);
  box-shadow: var(--box-shadow-medium);
  pointer-events: auto;
}
</style>
