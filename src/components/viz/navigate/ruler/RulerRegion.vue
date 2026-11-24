<script setup lang="ts">
/**
 * The ruler's one bounded region, below the timeline while it is open.
 *
 *   reading  the selected event's source sentence (its date in bold), the
 *            image credit when it is a Commons file, and Read passage: the
 *            only control that moves the article. No repeated heading: the
 *            selected event stays visible on the line above.
 *   editing  the event being edited: its label is trimmed in the text (the
 *            underlined span), its image added, changed or removed, or the
 *            event removed. Nothing selected: what to do next.
 */
import { computed } from 'vue'
import { CdxButton, CdxIcon, CdxMessage } from '@wikimedia/codex'
import { cdxIconArticle, cdxIconImage, cdxIconTrash } from '@wikimedia/codex-icons'

import type { NavEvent } from '../events'
import { msg } from '../messages'
import { formatWhen } from '../time'

const props = defineProps<{
  mode: 'reading' | 'editing'
  event: NavEvent | null
  missing: boolean
  era: boolean
}>()
const emit = defineEmits<{ read: [e: NavEvent]; image: []; removeImage: []; remove: []; showInText: [] }>()

/** The source sentence, cut around its date when long; the date text in bold. */
const excerpt = computed(() => {
  const e = props.event
  if (!e?.sourceText) return null
  const text = e.sourceText.trim()
  const d = e.sourceDateText ? text.indexOf(e.sourceDateText) : -1
  let a = 0
  let b = text.length
  if (text.length > 320) {
    a = Math.max(0, (d >= 0 ? d : 0) - 140)
    b = Math.min(text.length, a + 300)
  }
  const cut = text.slice(a, b)
  const i = d >= 0 ? d - a : -1
  const len = e.sourceDateText.length
  return {
    pre: (a > 0 ? '…' : '') + (i >= 0 ? cut.slice(0, i) : cut),
    date: i >= 0 ? cut.slice(i, i + len) : '',
    post: (i >= 0 ? cut.slice(i + len) : '') + (b < text.length ? '…' : ''),
  }
})
const img = computed(() => props.event?.image ?? null)
</script>

<template>
  <div class="rr">
    <!-- Reading -->
    <template v-if="mode === 'reading'">
      <div
        v-if="event"
        class="rr__preview"
      >
        <p
          v-if="excerpt"
          class="rr__quote"
        >
          {{ excerpt.pre }}<b>{{ excerpt.date }}</b>{{ excerpt.post }}<sup
            v-if="event.citation"
            class="rr__cite"
          ><a
            :href="event.citation.href"
          >{{ event.citation.label }}</a></sup>
        </p>
        <p
          v-if="img?.source === 'commons'"
          class="rr__credit"
        >
          {{ msg.trImageCredit }}
          <a
            :href="img.pageUrl"
            target="_blank"
            rel="noopener"
          >{{ img.artist }}</a>, <a
            v-if="img.licenseUrl"
            :href="img.licenseUrl"
            target="_blank"
            rel="noopener"
          >{{ img.license }}</a><template v-else>
            {{ img.license }}
          </template>
        </p>
        <CdxMessage
          v-if="missing"
          type="warning"
          :inline="true"
        >
          {{ msg.trMissing }}
        </CdxMessage>
        <div class="rr__actions">
          <CdxButton
            action="progressive"
            :disabled="missing"
            @click="emit('read', event)"
          >
            <CdxIcon :icon="cdxIconArticle" />{{ msg.trReadPassage }}
          </CdxButton>
        </div>
      </div>
      <p
        v-else
        class="rr__hint"
      >
        {{ msg.trSelectHint }}
      </p>
    </template>

    <!-- Editing -->
    <template v-else>
      <div
        v-if="event"
        class="rr__edit"
      >
        <p class="rr__what">
          <b>{{ formatWhen(event.date, era) }}</b> · {{ event.label }}
        </p>
        <p class="rr__hint">
          {{ msg.trTrimHint }}
          <CdxButton
            weight="quiet"
            size="small"
            @click="emit('showInText')"
          >
            {{ msg.trShowInText }}
          </CdxButton>
        </p>
        <div class="rr__image">
          <template v-if="img">
            <img
              class="rr__thumb"
              :src="img.src"
              :alt="img.caption"
            >
            <span class="rr__img-meta">
              {{ img.caption }}
              <template v-if="img.source === 'commons'"> · {{ img.artist }}, {{ img.license }}</template>
            </span>
          </template>
          <div class="rr__actions">
            <CdxButton
              size="small"
              @click="emit('image')"
            >
              <CdxIcon
                :icon="cdxIconImage"
                size="small"
              />{{ img ? msg.trChangeImage : msg.trAddImage }}
            </CdxButton>
            <CdxButton
              v-if="img"
              size="small"
              weight="quiet"
              @click="emit('removeImage')"
            >
              {{ msg.trRemoveImage }}
            </CdxButton>
            <CdxButton
              size="small"
              weight="quiet"
              action="destructive"
              @click="emit('remove')"
            >
              <CdxIcon
                :icon="cdxIconTrash"
                size="small"
              />{{ msg.trRemoveEvent }}
            </CdxButton>
          </div>
        </div>
      </div>
      <p
        v-else
        class="rr__hint"
      >
        {{ msg.trEditHint }}
      </p>
    </template>
  </div>
</template>

<style scoped>
.rr {
  box-sizing: border-box;
  height: 100%;
  padding-block: var(--spacing-50) 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  font-size: var(--font-size-small);
  line-height: var(--line-height-small);
}
.mw-parser-output .rr p,
.rr p {
  margin: 0 0 var(--spacing-50);
}
.mw-parser-output .rr .rr__quote,
.rr__quote {
  max-width: 48em;
  color: var(--color-base);
  font-size: var(--font-size-medium);
  line-height: var(--line-height-medium);
}
.rr__cite {
  font-size: 0.75em;
}
.rr__credit,
.rr__hint,
.rr__img-meta {
  color: var(--color-subtle);
}
.rr__what {
  font-size: var(--font-size-medium);
}
.rr__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--spacing-50);
}
/* Read passage stays in reach however long the sentence (the sentence scrolls above it). */
.rr__preview .rr__actions {
  position: sticky;
  inset-block-end: 0;
  padding-block: var(--spacing-25) var(--spacing-50);
  background: var(--background-color-base);
}
.rr__image {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--spacing-50) var(--spacing-75);
}
.rr__thumb {
  width: 72px;
  height: 48px;
  object-fit: cover;
  background: var(--background-color-neutral-subtle);
}
.rr__img-meta {
  flex: 1 1 12em;
  min-width: 0;
}
</style>
