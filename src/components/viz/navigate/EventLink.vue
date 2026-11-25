<script setup lang="ts">
/**
 * A passage link: a real link to the event's source sentence (it works
 * without script, opens in a new tab, copies), which the navigator turns
 * into a passage jump. Hover and focus may preview; only activation moves
 * the article.
 */
import { inject } from 'vue'

import type { NavEvent } from './events'
import { msg } from './messages'
import { formatWhen } from './time'
import { NAV, type NavContext } from './context'

const props = defineProps<{
  event: NavEvent
  /** Describe the link fully for assistive tech (when its visible text is only a date or an image). */
  describe?: boolean
  /** Do the jump another way (a dialog closes first). */
  jumpWith?: (e: NavEvent) => Promise<boolean>
}>()
const emit = defineEmits<{ jumped: [ok: boolean] }>()
const ctx = inject(NAV) as NavContext

async function onClick(e: MouseEvent) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
  e.preventDefault()
  emit('jumped', await (props.jumpWith ? props.jumpWith(props.event) : ctx.nav.jump(props.event)))
}
</script>

<template>
  <a
    class="tn-link"
    :href="`#tl-src-${event.sourceAnchor.mentionId}`"
    :aria-label="describe ? msg.sourceOf(formatWhen(event.date, ctx.era), event.label) : undefined"
    :aria-current="ctx.nav.selectedId.value === event.id ? 'true' : undefined"
    @click="onClick"
  ><slot>{{ event.label }}</slot></a>
</template>
