<script setup lang="ts">
/**
 * E · Illustrated milestones. "Which moment do I want to explore?" An
 * editor's selection of moments below the introduction, in date order, set
 * like a printed illustrated encyclopedia: a date gutter, a concise label,
 * the article's own image where the article shows that moment, and equally
 * readable text-only moments. Spacing is editorial; there is no axis. The
 * selection is labelled as such and the complete event list is one button
 * away. After a jump, a compact way back stays at the bottom.
 */
import { computed, inject, nextTick, ref, type Ref } from 'vue'
import { CdxButton, CdxDialog, CdxIcon } from '@wikimedia/codex'
import { cdxIconListBullet, cdxIconLinkExternal } from '@wikimedia/codex-icons'

import { NAV, type NavContext } from '../context'
import EventLink from '../EventLink.vue'
import EventList from '../EventList.vue'
import type { NavEvent } from '../events'
import { msg } from '../messages'
import ReturnBar from '../ReturnBar.vue'
import UnresolvedNotice from '../UnresolvedNotice.vue'
import { formatWhen } from '../time'

const ctx = inject(NAV) as NavContext & { leadMount: Ref<HTMLElement | null> }
const nav = ctx.nav
const all = ctx.collection.events
const milestones = all.filter((e) => e.milestone)
const milestoneIds = new Set(milestones.map((e) => e.id))
const narrow = computed(() => ctx.width.value === 'narrow')

/** The image's file page, from the article's own link around it (attribution and licence live there). */
function fileHref(e: NavEvent): string | null {
  const img = e.image
  if (!img) return null
  const name = img.src.split('/').pop() ?? ''
  const bare = name.replace(/^\d+px-/, '')
  const el = [...document.querySelectorAll<HTMLImageElement>('.tn-body img')].find(
    (i) => !i.closest('.tn-mount') && (i.getAttribute('src') ?? '').endsWith(bare),
  )
  const href = el?.closest('a')?.getAttribute('href') ?? ''
  if (/File:/.test(href)) return href
  const resource = el?.getAttribute('resource') ?? ''
  return resource.startsWith('./File:') ? `https://en.wikipedia.org/wiki/${resource.slice(2)}` : null
}
const alt = (e: NavEvent) => e.image?.caption || e.label

const dialogOpen = ref(false)
async function jumpFromDialog(e: NavEvent) {
  dialogOpen.value = false
  await nextTick()
  await new Promise((r) => setTimeout(r, 60))
  const ok = await nav.jump(e)
  if (!ok) dialogOpen.value = true
  return ok
}

const sectionEl = ref<HTMLElement | null>(null)
function backToMilestones() {
  const el = sectionEl.value
  if (!el) return
  el.scrollIntoView({ block: 'start', behavior: 'instant' as ScrollBehavior })
  const sel = el.querySelector<HTMLElement>('.vm__item--selected .vm__label a, .vm__title')
  sel?.focus()
}
</script>

<template>
  <Teleport
    v-if="ctx.leadMount.value"
    :to="ctx.leadMount.value"
  >
    <section
      ref="sectionEl"
      class="vm"
      :class="{ 'vm--narrow': narrow }"
      aria-labelledby="vm-title"
    >
      <header class="vm__head">
        <h2
          id="vm-title"
          class="vm__title"
          tabindex="-1"
        >
          {{ msg.milestonesTitle }}
        </h2>
        <p class="vm__note">
          {{ msg.milestonesNote(milestones.length, all.length) }}
        </p>
        <CdxButton
          class="vm__all"
          aria-haspopup="dialog"
          @click="dialogOpen = true"
        >
          <CdxIcon :icon="cdxIconListBullet" />
          {{ msg.allEventsCount(all.length) }}
        </CdxButton>
      </header>
      <UnresolvedNotice />

      <ol class="vm__list">
        <li
          v-for="e in milestones"
          :key="e.id"
          class="vm__item"
          :class="{ 'vm__item--selected': nav.selectedId.value === e.id, 'vm__item--image': !!e.image }"
        >
          <div class="vm__date">
            <EventLink
              :event="e"
              describe
            >
              {{ formatWhen(e.date, ctx.era) }}
            </EventLink>
          </div>
          <div class="vm__body">
            <p class="vm__label">
              <EventLink :event="e" />
            </p>
            <p class="vm__section">
              {{ e.sourceAnchor.sectionTitle }}
              <span v-if="nav.inView.value.includes(e.id)"> · {{ msg.inView }}</span>
              <span
                v-if="nav.selectedId.value === e.id"
                class="tn-visually-hidden"
              > · {{ msg.selected }}</span>
            </p>
          </div>
          <figure
            v-if="e.image"
            class="vm__figure"
          >
            <EventLink
              :event="e"
              describe
              class="vm__image-link"
            >
              <img
                class="vm__image"
                :src="e.image.src"
                :alt="alt(e)"
                loading="lazy"
              >
            </EventLink>
            <figcaption class="vm__caption">
              {{ e.image.caption }}
              <a
                v-if="fileHref(e)"
                class="vm__details"
                :href="fileHref(e)!"
                target="_blank"
                rel="noopener"
              >{{ msg.imageDetails }}<CdxIcon
                :icon="cdxIconLinkExternal"
                size="x-small"
              /></a>
            </figcaption>
          </figure>
        </li>
      </ol>
    </section>
  </Teleport>

  <CdxDialog
    v-model:open="dialogOpen"
    :title="msg.allEvents"
    :subtitle="msg.milestonesNote(milestones.length, all.length)"
    :use-close-button="true"
    :close-button-label="msg.close"
  >
    <UnresolvedNotice />
    <EventList
      :events="all"
      open="all"
      :marked="milestoneIds"
      :marked-label="msg.milestonesTitle"
      :jump-with="jumpFromDialog"
    />
  </CdxDialog>

  <ReturnBar>
    <CdxButton
      weight="quiet"
      @click="backToMilestones"
    >
      {{ msg.backToMilestones }}
    </CdxButton>
  </ReturnBar>
</template>

<style scoped>
.vm {
  padding-block: var(--spacing-100);
  border-block: var(--border-width-base) solid var(--border-color-base);
}
.vm__head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--spacing-25) var(--spacing-100);
  align-items: end;
  margin-block-end: var(--spacing-100);
}
.vm--narrow .vm__head {
  grid-template-columns: minmax(0, 1fr);
}
.mw-parser-output .vm__title,
.vm__title {
  grid-column: 1;
  margin: 0;
  padding: 0;
  border: 0;
  /* The article's own serif heading style. */
  font-family: 'Linux Libertine', 'Georgia', 'Times', 'Source Serif Pro', serif;
  font-size: 1.5em;
  line-height: 1.3;
  font-weight: normal;
}
.vm__note {
  grid-column: 1;
  margin: 0;
  color: var(--color-subtle);
  font-size: var(--font-size-small);
  line-height: var(--line-height-small);
}
.vm__all {
  grid-column: 2;
  grid-row: 1 / span 2;
}
.vm--narrow .vm__all {
  grid-column: 1;
  grid-row: auto;
  justify-self: start;
}
.mw-parser-output .vm__list,
.vm__list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.mw-parser-output .vm__item,
.vm__item {
  display: grid;
  grid-template-columns: 9rem minmax(0, 1fr) 200px;
  grid-template-areas: 'date body figure';
  gap: var(--spacing-100);
  align-items: start;
  margin: 0;
  padding-block: var(--spacing-100);
  /* Room for the selection bar, always reserved: selecting never shifts the layout. */
  padding-inline-start: var(--spacing-75);
  border-block-start: var(--border-width-base) solid var(--border-color-subtle);
}
.vm__item:not(.vm__item--image) {
  grid-template-areas: 'date body body';
}
.vm--narrow .vm__item {
  grid-template-columns: minmax(0, 1fr);
  grid-template-areas: 'date' 'body' 'figure';
  gap: var(--spacing-25);
}
.vm--narrow .vm__item:not(.vm__item--image) {
  grid-template-areas: 'date' 'body';
}
.vm__date {
  grid-area: date;
  font-family: 'Linux Libertine', 'Georgia', 'Times', 'Source Serif Pro', serif;
  font-size: 1.6em;
  line-height: 1.15;
  font-variant-numeric: lining-nums;
}
.vm__date :deep(.tn-link) {
  color: var(--color-base);
}
.vm__date :deep(.tn-link:hover) {
  color: var(--color-progressive);
}
.vm__body {
  grid-area: body;
  min-width: 0;
}
.mw-parser-output .vm__label,
.vm__label {
  margin: 0;
  font-size: 1.125em;
  line-height: 1.4;
}
.mw-parser-output .vm__section,
.vm__section {
  margin: var(--spacing-25) 0 0;
  color: var(--color-subtle);
  font-family: var(--font-family-base);
  font-size: var(--font-size-small);
}
.vm__item--selected {
  box-shadow: inset 3px 0 0 var(--color-progressive);
}
[dir='rtl'] .vm__item--selected {
  box-shadow: inset -3px 0 0 var(--color-progressive);
}
.vm__item--selected .vm__label :deep(.tn-link) {
  font-weight: var(--font-weight-bold);
}
.mw-parser-output .vm__figure,
.vm__figure {
  grid-area: figure;
  margin: 0;
}
.vm__image-link {
  display: block;
}
.vm__image {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  background: var(--background-color-neutral-subtle);
}
.vm--narrow .vm__image {
  aspect-ratio: 16 / 9;
}
.vm__caption {
  margin-block-start: var(--spacing-25);
  color: var(--color-subtle);
  font-size: var(--font-size-x-small, 12px);
  line-height: var(--line-height-x-small, 1.4);
}
.vm__details {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-inline-start: var(--spacing-25);
}
</style>
