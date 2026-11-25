<script setup lang="ts">
/**
 * 4 · Paired chronology. A central date spine with two source-grounded
 * streams: on one side what the article says was projected, approved or
 * expected; on the other what it says was built, opened or realised. Each
 * entry keeps the article's own words (the qualifier), its linked names,
 * the article's image where it shows the same thing, and a date that opens
 * the passage. Expected items say what the source expected, not what
 * happened. Only where the source supports it (Bilbao); otherwise it says so.
 */
import { computed, inject, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CdxButton, CdxMessage } from '@wikimedia/codex'

import { NAV, type NavContext } from '../context'
import { msg } from '../messages'
import type { Occurrence } from '../occurrences'
import ReturnBar from '../ReturnBar.vue'
import { formatWhen } from '../time'
import WikiLink from '../WikiLink.vue'

const ctx = inject(NAV) as NavContext & { leadMount: Ref<HTMLElement | null> }
const nav = ctx.nav
const route = useRoute()
const router = useRouter()
const items = ctx.occurrences.filter((o) => o.pair)
const supported = items.some((o) => o.pair === 'plan') && items.some((o) => o.pair === 'built')
const narrow = computed(() => ctx.width.value === 'narrow')
const STATUS: Record<Occurrence['status'], string> = { planned: 'Planned', expected: 'Expected (in the source’s words)', occurred: '' }
const openBilbao = () => void router.replace({ query: { ...route.query, article: 'bilbao', event: undefined } })
</script>

<template>
  <Teleport
    v-if="ctx.leadMount.value"
    :to="ctx.leadMount.value"
  >
    <section
      class="vp4"
      :class="{ 'vp4--narrow': narrow }"
      aria-labelledby="vp4-title"
    >
      <h2
        id="vp4-title"
        class="vp4__title"
      >
        {{ ctx.collection.title }}: {{ msg.pairedPlanned.toLowerCase() }} and {{ msg.pairedBuilt.toLowerCase() }}
      </h2>
      <template v-if="supported">
        <p class="vp4__note">
          {{ msg.pairedNote }}
        </p>
        <div
          class="vp4__heads"
          aria-hidden="true"
        >
          <span class="vp4__head vp4__head--plan">{{ msg.pairedPlanned }}</span>
          <span />
          <span class="vp4__head vp4__head--built">{{ msg.pairedBuilt }}</span>
        </div>
        <ol class="vp4__list">
          <li
            v-for="o in items"
            :key="o.id"
            class="vp4__row"
            :class="[`vp4__row--${o.pair}`, { 'vp4__row--selected': nav.selectedId.value === o.id }]"
          >
            <button
              type="button"
              class="vp4__date"
              :class="{ 'vp4__date--expected': o.status === 'expected' }"
              :aria-label="msg.readPassageOf(formatWhen(o.date, ctx.era), o.label)"
              :title="msg.readPassage"
              @click="nav.jump(o)"
            >
              {{ formatWhen(o.date, ctx.era) }}
            </button>
            <div class="vp4__entry">
              <span class="vp4__side">{{ o.pair === 'plan' ? STATUS[o.status] || msg.pairedPlanned : msg.pairedBuilt }}</span>
              <p class="vp4__links">
                <template
                  v-for="(l, i) in o.links"
                  :key="l.href + i"
                >
                  <WikiLink :link="l" /><span v-if="i < o.links.length - 1">, </span>
                </template>
              </p>
              <p class="vp4__words">
                “{{ o.qualifier }}”
              </p>
              <p class="vp4__section">
                {{ o.sourceAnchor.sectionTitle }}
              </p>
              <img
                v-if="o.image"
                class="vp4__img"
                :src="o.image.src"
                :alt="o.image.caption"
                loading="lazy"
              >
            </div>
          </li>
        </ol>
      </template>
      <template v-else>
        <CdxMessage
          type="notice"
          :inline="true"
        >
          {{ msg.pairedUnsupported }}
        </CdxMessage>
        <CdxButton
          v-if="ctx.articleId !== 'bilbao'"
          class="vp4__switch"
          @click="openBilbao"
        >
          {{ msg.openWithBilbao }}
        </CdxButton>
      </template>
      <p class="vp4__note vp4__calendar">
        {{ msg.calendarUnsupported }}
      </p>
    </section>
  </Teleport>
  <ReturnBar />
</template>

<style scoped>
.vp4 {
  padding-block: var(--spacing-100);
  border-block: var(--border-width-base) solid var(--border-color-base);
  font-family: var(--font-family-base);
}
.mw-parser-output .vp4__title,
.vp4__title {
  margin: 0;
  padding: 0;
  border: 0;
  font-family: 'Linux Libertine', 'Georgia', 'Times', 'Source Serif Pro', serif;
  font-size: 1.4em;
  line-height: 1.3;
  font-weight: normal;
}
.vp4__note {
  margin: var(--spacing-25) 0 var(--spacing-100);
  color: var(--color-subtle);
  font-size: var(--font-size-small);
  line-height: var(--line-height-small);
}
.vp4__calendar {
  margin: var(--spacing-100) 0 0;
}
.vp4__heads,
.vp4__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 9em minmax(0, 1fr);
  column-gap: var(--spacing-100);
}
.vp4__heads {
  position: sticky;
  inset-block-start: 0;
  z-index: 2;
  padding-block: var(--spacing-25);
  background: var(--background-color-base);
  border-block-end: var(--border-width-base) solid var(--color-base);
  font-size: var(--font-size-small);
  font-weight: var(--font-weight-bold);
}
.vp4__head--plan {
  text-align: end;
}
.mw-parser-output .vp4__list,
.vp4__list {
  position: relative;
  margin: 0;
  padding: 0;
  list-style: none;
}
/* The spine */
.vp4__list::before {
  content: '';
  position: absolute;
  inset-block: 0;
  inset-inline-start: 50%;
  border-inline-start: var(--border-width-base) solid var(--color-base);
}
.mw-parser-output .vp4__row,
.vp4__row {
  position: relative;
  margin: 0;
  padding-block: var(--spacing-75);
}
.vp4__date {
  grid-column: 2;
  grid-row: 1;
  justify-self: center;
  align-self: start;
  z-index: 1;
  padding: 0 var(--spacing-25);
  border: 0;
  background: var(--background-color-base);
  color: var(--color-base);
  font-family: 'Linux Libertine', 'Georgia', 'Times', 'Source Serif Pro', serif;
  font-size: 1.05em;
  text-align: center;
  cursor: pointer;
  unicode-bidi: plaintext;
}
.vp4__date:hover {
  color: var(--color-progressive);
  text-decoration: underline;
}
.vp4__date:focus-visible {
  outline: var(--border-width-thick) solid var(--outline-color-progressive--focus);
  outline-offset: 1px;
}
.vp4__date--expected {
  font-style: italic;
}
.vp4__entry {
  grid-row: 1;
  min-width: 0;
}
.vp4__row--plan .vp4__entry {
  grid-column: 1;
  text-align: end;
}
.vp4__row--built .vp4__entry {
  grid-column: 3;
}
/* Plans are drawn open (dashed rule), completions solid: the side and the words say it too. */
.vp4__row--plan .vp4__entry {
  padding-inline-end: var(--spacing-50);
  border-inline-end: 2px dashed var(--border-color-base);
}
.vp4__row--built .vp4__entry {
  padding-inline-start: var(--spacing-50);
  border-inline-start: 2px solid var(--color-base);
}
.vp4__row--selected .vp4__entry {
  border-color: var(--color-progressive);
}
.vp4__side {
  display: block;
  color: var(--color-subtle);
  font-size: var(--font-size-x-small, 12px);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.mw-parser-output .vp4__links,
.vp4__links,
.mw-parser-output .vp4__words,
.vp4__words,
.mw-parser-output .vp4__section,
.vp4__section {
  margin: 0;
}
.vp4__links {
  font-size: var(--font-size-medium);
}
.vp4__words {
  font-size: var(--font-size-small);
  font-style: italic;
}
.vp4__section {
  color: var(--color-subtle);
  font-size: var(--font-size-x-small, 12px);
}
.vp4__img {
  display: inline-block;
  width: 120px;
  height: 80px;
  margin-block-start: var(--spacing-25);
  object-fit: cover;
  background: var(--background-color-neutral-subtle);
}
.vp4__switch {
  margin-block-start: var(--spacing-50);
}

/* Phones: one column; the side is named on every entry. */
.vp4--narrow .vp4__heads {
  display: none;
}
.vp4--narrow .vp4__list::before {
  inset-inline-start: 4.25em;
}
.vp4--narrow .vp4__row {
  grid-template-columns: 8.5em minmax(0, 1fr);
}
.vp4--narrow .vp4__date {
  grid-column: 1;
  justify-self: start;
  text-align: start;
}
.vp4--narrow .vp4__row--plan .vp4__entry,
.vp4--narrow .vp4__row--built .vp4__entry {
  grid-column: 2;
  text-align: start;
  padding-inline: var(--spacing-50) 0;
  border-inline-end: 0;
}
.vp4--narrow .vp4__row--plan .vp4__entry {
  border-inline-start: 2px dashed var(--border-color-base);
}
</style>
