<script setup lang="ts">
/**
 * A · Chronological contents. "Where does the article discuss this event or
 * period?" Chronology as another index into the article: a compact list in
 * the margin beside the article when there is room for it next to the full
 * reading width (there is no contents component to share the space with, so
 * it is a local margin); otherwise a Timeline button that opens the same
 * list in a dialog. Expanding a group never moves the article.
 */
import { inject, nextTick, ref } from 'vue'
import { CdxButton, CdxDialog, CdxIcon } from '@wikimedia/codex'
import { cdxIconHistory } from '@wikimedia/codex-icons'

import { NAV, type NavContext } from '../context'
import EventList from '../EventList.vue'
import { msg } from '../messages'
import ReturnBar from '../ReturnBar.vue'
import UnresolvedNotice from '../UnresolvedNotice.vue'
import type { NavEvent } from '../events'

const ctx = inject(NAV) as NavContext & { margin: { value: 'start' | 'end' | null } }
const events = ctx.collection.events
const dialogOpen = ref(false)

/** In the dialog: close first, then jump, so focus lands on the passage, not the trigger. */
async function jumpFromDialog(e: NavEvent) {
  dialogOpen.value = false
  await nextTick()
  await new Promise((r) => setTimeout(r, 60))
  const ok = await ctx.nav.jump(e)
  if (!ok) dialogOpen.value = true
  return ok
}
</script>

<template>
  <Teleport
    v-if="ctx.margin.value === 'start'"
    to="#tn-margin-start"
    defer
  >
    <nav
      class="vc"
      :aria-label="msg.contentsTitle"
    >
      <h2 class="vc__title">
        {{ msg.contentsTitle }}
      </h2>
      <p class="vc__note">
        {{ msg.contentsNote(events.length) }}
      </p>
      <UnresolvedNotice />
      <EventList
        :events="events"
        open="relevant"
      />
    </nav>
  </Teleport>

  <template v-else>
    <ReturnBar always>
      <CdxButton
        aria-haspopup="dialog"
        @click="dialogOpen = true"
      >
        <CdxIcon :icon="cdxIconHistory" />
        {{ msg.openTimeline }}
      </CdxButton>
    </ReturnBar>
    <CdxDialog
      v-model:open="dialogOpen"
      class="vc-dialog"
      :title="msg.timelineDialogTitle"
      :subtitle="msg.contentsNote(events.length)"
      :use-close-button="true"
      :close-button-label="msg.close"
    >
      <UnresolvedNotice />
      <EventList
        :events="events"
        open="relevant"
        :level="3"
        :jump-with="jumpFromDialog"
      />
    </CdxDialog>
  </template>

  <ReturnBar v-if="ctx.margin.value === 'start'" />
</template>

<style scoped>
.vc {
  position: sticky;
  inset-block-start: var(--spacing-100);
  max-height: calc(100vh - 2 * var(--spacing-100));
  overflow-y: auto;
  padding-inline-end: var(--spacing-50);
  overscroll-behavior: contain;
}
.vc__title {
  margin: 0 0 var(--spacing-25);
  padding: 0;
  border: 0;
  font-family: var(--font-family-base);
  font-size: var(--font-size-medium);
  line-height: var(--line-height-medium);
  font-weight: var(--font-weight-bold);
}
.vc__note {
  margin: 0 0 var(--spacing-75);
  color: var(--color-subtle);
  font-size: var(--font-size-small);
  line-height: var(--line-height-small);
}
</style>
