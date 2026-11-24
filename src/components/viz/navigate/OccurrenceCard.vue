<script setup lang="ts">
/**
 * The selected occurrence, without moving the article: its date, the
 * article's own words for what happened, its linked names (which follow
 * their links), and three separate actions:
 *   Read this passage   → the local source sentence (deliberate navigation)
 *   Also told in        → the other passages that tell the same event
 *   Follow mentions     → the same subject elsewhere: its other dated
 *                         appearances, and every prose mention linked to the
 *                         same page (a verified identity)
 */
import { computed, inject, ref, watch } from 'vue'
import { CdxButton, CdxIcon } from '@wikimedia/codex'
import { cdxIconArticle } from '@wikimedia/codex-icons'

import { NAV, type NavContext } from './context'
import { msg } from './messages'
import { CATEGORY_LABEL, type LinkRef, type Occurrence } from './occurrences'
import { locate, mentionsOf, type LinkMention } from './passages'
import { formatWhen, kindPhrase } from './time'
import UnresolvedNotice from './UnresolvedNotice.vue'
import WikiLink from './WikiLink.vue'

const props = withDefaults(defineProps<{ occurrence: Occurrence | null; compact?: boolean; hint?: string }>(), { compact: false, hint: undefined })
const ctx = inject(NAV) as NavContext
const nav = ctx.nav
const body = () => document.querySelector<HTMLElement>('.tn-body')

const o = computed(() => props.occurrence)
const STATUS = { planned: 'Planned', expected: 'Expected', occurred: '' } as const

// Follow mentions: one subject at a time.
const following = ref<LinkRef | null>(null)
watch(o, () => (following.value = null))
const mentionCount = (l: LinkRef) => (l.target && body() ? mentionsOf(body()!, l.target).length : 0)
const mentions = computed<LinkMention[]>(() =>
  following.value?.target && body() ? mentionsOf(body()!, following.value.target) : [],
)
const otherDated = computed(() =>
  following.value
    ? ctx.occurrences.filter((x) => x.id !== o.value?.id && x.links.some((l) => l.target === following.value!.target))
    : [],
)

function goMention(m: LinkMention) {
  void nav.jumpTo(m.link, m.range, `${m.text.slice(0, 80)}… In “${m.sectionTitle}”.`)
}
function goAlso(mentionId: string) {
  const el = body()?.querySelector<HTMLElement>(`[data-tl-id="${CSS.escape(mentionId)}"]`)
  const mention = ctx.article.mentions.find((m) => m.id === mentionId)
  if (!el || !mention) return
  const p = locate(body()!, mention.sentence.slice(0, 60))
  void nav.jumpTo(el, () => p?.range() ?? null, `${mention.sentence.slice(0, 80)}…`)
}
const alsoInfo = (id: string) => {
  const m = ctx.article.mentions.find((x) => x.id === id)
  return m ? { section: m.anchor.sectionTitle === 'Lead' ? 'Introduction' : m.anchor.sectionTitle, text: m.sentence } : null
}
</script>

<template>
  <div
    class="oc"
    :class="{ 'oc--compact': compact }"
    aria-live="polite"
  >
    <p
      v-if="!o"
      class="oc__hint"
    >
      {{ hint ?? msg.selectHint }}
    </p>
    <template v-else>
      <p class="oc__when">
        <b>{{ formatWhen(o.date, ctx.era) }}</b>
        <span v-if="kindPhrase(o.date)"> · {{ kindPhrase(o.date) }}</span>
        <span
          v-if="STATUS[o.status]"
          class="oc__status"
        > · {{ STATUS[o.status] }}</span>
        <span class="oc__cat"> · {{ CATEGORY_LABEL[o.category] }}</span>
      </p>
      <p class="oc__links">
        <template
          v-for="(l, i) in o.links"
          :key="l.href + i"
        >
          <WikiLink :link="l" /><span v-if="i < o.links.length - 1">, </span>
        </template>
        <span
          v-if="!o.links.length"
          class="oc__nolink"
        >{{ msg.noLinks }}</span>
      </p>
      <p class="oc__quote">
        “…{{ o.qualifier }}…” <span class="oc__section">{{ msg.inSection(o.sourceAnchor.sectionTitle === 'Lead' ? 'Introduction' : o.sourceAnchor.sectionTitle) }}</span>
      </p>
      <UnresolvedNotice />
      <div class="oc__actions">
        <CdxButton
          action="progressive"
          @click="nav.jump(o)"
        >
          <CdxIcon :icon="cdxIconArticle" />{{ msg.readPassage }}
        </CdxButton>
        <template
          v-for="l in o.links"
          :key="'f' + l.href"
        >
          <CdxButton
            v-if="mentionCount(l) > 1 || ctx.occurrences.some((x) => x.id !== o!.id && x.links.some((y) => y.target === l.target))"
            weight="quiet"
            :aria-pressed="following === l ? 'true' : 'false'"
            @click="following = following === l ? null : l"
          >
            {{ msg.followMentionsOf(l.text, mentionCount(l)) }}
          </CdxButton>
        </template>
      </div>
      <div
        v-if="o.also.length"
        class="oc__also"
      >
        <span class="oc__label">{{ msg.alsoTold }}</span>
        <button
          v-for="id in o.also"
          :key="id"
          type="button"
          class="oc__ref"
          @click="goAlso(id)"
        >
          {{ alsoInfo(id)?.section }}: “{{ alsoInfo(id)?.text.slice(0, 70) }}…”
        </button>
      </div>
      <div
        v-if="following"
        class="oc__follow"
      >
        <p class="oc__label">
          {{ following.text }} · {{ msg.mentionsIn(mentions.length) }}
        </p>
        <ol class="oc__mentions">
          <li
            v-for="(m, i) in mentions"
            :key="i"
          >
            <button
              type="button"
              class="oc__ref"
              @click="goMention(m)"
            >
              <span class="oc__ref-section">{{ m.sectionTitle }}</span> “{{ m.text.slice(0, 90) }}{{ m.text.length > 90 ? '…' : '' }}”
            </button>
          </li>
        </ol>
        <template v-if="otherDated.length">
          <p class="oc__label">
            {{ msg.otherDated }}
          </p>
          <ol class="oc__mentions">
            <li
              v-for="x in otherDated"
              :key="x.id"
            >
              <button
                type="button"
                class="oc__ref"
                @click="nav.selectedId.value = x.id"
              >
                <b>{{ formatWhen(x.date, ctx.era) }}</b> {{ x.qualifier }}
              </button>
            </li>
          </ol>
        </template>
      </div>
    </template>
  </div>
</template>

<style scoped>
.oc {
  font-family: var(--font-family-base);
  font-size: var(--font-size-small);
  line-height: var(--line-height-small);
}
.oc p {
  margin: 0 0 var(--spacing-25);
}
.oc__hint {
  color: var(--color-subtle);
}
.oc__when {
  font-variant-numeric: tabular-nums;
}
.oc__status {
  font-weight: var(--font-weight-bold);
}
.oc__cat,
.oc__section,
.oc__nolink,
.oc__label,
.oc__ref-section {
  color: var(--color-subtle);
}
.oc__links {
  font-size: var(--font-size-medium);
  line-height: var(--line-height-medium);
}
.oc__quote {
  font-style: italic;
}
.oc__quote .oc__section {
  font-style: normal;
}
.oc__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-25) var(--spacing-50);
  margin-block: var(--spacing-50);
}
.oc__actions :deep(.cdx-button) {
  max-width: 100%;
  height: auto;
  min-height: 32px;
  white-space: normal;
  text-align: start;
}
.oc__also,
.oc__follow {
  margin-block-start: var(--spacing-50);
  padding-block-start: var(--spacing-50);
  border-block-start: var(--border-width-base) solid var(--border-color-subtle);
}
.oc__mentions {
  margin: 0 0 var(--spacing-50);
  padding: 0;
  list-style: none;
}
.oc__ref {
  display: block;
  width: 100%;
  padding: var(--spacing-25) 0;
  border: 0;
  background: none;
  color: var(--color-base);
  font: inherit;
  text-align: start;
  cursor: pointer;
}
.oc__ref:hover {
  color: var(--color-progressive);
  text-decoration: underline;
}
.oc__ref:focus-visible {
  outline: var(--border-width-thick) solid var(--outline-color-progressive--focus);
  outline-offset: 1px;
}
.oc--compact .oc__links {
  font-size: var(--font-size-small);
}
</style>
