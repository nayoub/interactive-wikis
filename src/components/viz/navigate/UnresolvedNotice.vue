<script setup lang="ts">
/** Says so when a source passage cannot be found; never jumps somewhere else instead. */
import { computed, inject } from 'vue'
import { CdxMessage } from '@wikimedia/codex'

import { NAV, type NavContext } from './context'
import { msg } from './messages'

const ctx = inject(NAV) as NavContext
const event = computed(() =>
  ctx.nav.unresolved.value ? ctx.nav.byId.value.get(ctx.nav.unresolved.value) : null,
)
</script>

<template>
  <CdxMessage
    v-if="event"
    class="tn-unresolved"
    type="warning"
    :inline="true"
    allow-user-dismiss
    :dismiss-button-label="msg.dismiss"
    @user-dismissed="ctx.nav.unresolved.value = null"
  >
    {{ msg.unresolved(event.label) }}
  </CdxMessage>
</template>

<style scoped>
.tn-unresolved {
  margin-block: var(--spacing-50);
}
</style>
