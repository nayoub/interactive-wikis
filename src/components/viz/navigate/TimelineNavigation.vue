<script setup lang="ts">
/**
 * Timeline navigation: one article, one shared event collection, five ways
 * to navigate it by time. The article is the reading surface and stays
 * complete and in its own order; a variant only adds a navigator (beside
 * it, below the introduction, or as a bar) and uses the shared navigation
 * contract (useNavigator.ts) to move to a passage.
 *
 * URL: ?variant=contents|ruler|trail|parallel|milestones
 *              |field|field-margin|link-columns|link-chronology|connect-brackets|connect-paths|paired
 *      &article=frank-gehry|bilbao|test-fixture  &event=<id>  &dir=rtl  &motion=reduce
 * Changing the variant keeps the selected event.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter, type LocationQuery } from 'vue-router'
import { CdxMessage, CdxProgressBar } from '@wikimedia/codex'

import ArticleRenderer from '@/components/article/ArticleRenderer.vue'
import ArticleWrapper from '@/components/article/ArticleWrapper.vue'
import ChromeWrapper from '@/components/chrome/ChromeWrapper.vue'
import { globalSkin } from '@/theme'

import '../tokens.css'
import { loadArticle, type LoadedArticle } from '../host/loadArticle'
import { rememberPath } from '../host/hub'
import { setDayFirst } from '../model/dates'
import { NAV, type NavContext } from './context'
import { ARTICLES, buildCollection, type ArticleId, type Collection } from './events'
import { buildFixture, FIXTURE_SOURCE } from './fixture'
import { OCCURRENCE_VARIANTS, VARIANTS, type VariantId } from './messages'
import { buildOccurrences, type Occurrences } from './occurrences'
import NavMenu from './NavMenu.vue'
import { createNavigator } from './useNavigator'
import VariantContents from './variants/VariantContents.vue'
import VariantMilestones from './variants/VariantMilestones.vue'
import VariantParallel from './variants/VariantParallel.vue'
import VariantRuler from './variants/VariantRuler.vue'
import VariantTrail from './variants/VariantTrail.vue'
import VariantConnections from './variants/VariantConnections.vue'
import VariantField from './variants/VariantField.vue'
import VariantLinks from './variants/VariantLinks.vue'
import VariantPaired from './variants/VariantPaired.vue'

const route = useRoute()
const router = useRouter()
const one = (q: LocationQuery, k: string) => {
  const v = q[k]
  return ((Array.isArray(v) ? v[0] : v) ?? null) as string | null
}

const variant = computed<VariantId>(() => {
  const v = one(route.query, 'variant')
  return (VARIANTS.find((x) => x.id === v)?.id ?? 'contents') as VariantId
})
const articleId = computed<ArticleId>(() => {
  const a = one(route.query, 'article')
  return a === 'bilbao' || a === 'test-fixture' ? a : 'frank-gehry'
})
const dir = computed(() => (one(route.query, 'dir') === 'rtl' ? 'rtl' : 'ltr'))
/** `?motion=reduce`: behave as with the reduced-motion setting (no smooth scrolling or fades). */
watch(
  () => one(route.query, 'motion'),
  (m) => {
    if (m === 'reduce') document.documentElement.dataset.tnMotion = 'reduce'
    else delete document.documentElement.dataset.tnMotion
  },
  { immediate: true },
)
onBeforeUnmount(() => delete document.documentElement.dataset.tnMotion)

const VARIANT_COMPONENTS = {
  contents: VariantContents,
  ruler: VariantRuler,
  trail: VariantTrail,
  parallel: VariantParallel,
  milestones: VariantMilestones,
  field: VariantField,
  'field-margin': VariantField,
  'link-columns': VariantLinks,
  'link-chronology': VariantLinks,
  'connect-brackets': VariantConnections,
  'connect-paths': VariantConnections,
  paired: VariantPaired,
}

// ── Layout ─────────────────────────────────────────────────────────────────
const vw = ref(typeof window === 'undefined' ? 1440 : window.innerWidth)
const onResize = () => (vw.value = window.innerWidth)
onMounted(() => window.addEventListener('resize', onResize))
onBeforeUnmount(() => window.removeEventListener('resize', onResize))
/** The desktop article column is 1016px; a margin column needs 248px more beside it. */
const width = computed<'narrow' | 'medium' | 'wide'>(() =>
  vw.value < 640 ? 'narrow' : vw.value < 1300 ? 'medium' : 'wide',
)
const skin = computed(() => globalSkin.value)
/** Which margin column the variant uses when wide. */
const margin = computed<'start' | 'end' | null>(() => {
  if (width.value !== 'wide') return null
  if (variant.value === 'contents' || variant.value === 'field-margin') return 'start'
  if (variant.value === 'trail' || variant.value.startsWith('connect-')) return 'end'
  return null
})

// ── Article and collection ────────────────────────────────────────────────
const article = shallowRef<LoadedArticle | null>(null)
const collection = shallowRef<Collection | null>(null)
const occurrences = shallowRef<Occurrences | null>(null)
const loadError = ref<string | null>(null)
async function load(id: ArticleId) {
  article.value = null
  collection.value = null
  occurrences.value = null
  loadError.value = null
  try {
    const source = id === 'test-fixture' ? FIXTURE_SOURCE : ARTICLES[id].source
    const a = await loadArticle(source)
    if (articleId.value !== id) return
    setDayFirst(a.dayFirst)
    collection.value = id === 'test-fixture' ? buildFixture(a) : buildCollection(id, a)
    occurrences.value = buildOccurrences(id, a, collection.value)
    article.value = a
  } catch (e) {
    loadError.value = String((e as Error)?.message ?? e)
  }
}
watch(articleId, load, { immediate: true })

const bodyEl = ref<HTMLElement | null>(null)
/** What the navigator indexes: the shared collection, or the richer occurrence records (pass 2). */
const events = computed(() =>
  OCCURRENCE_VARIANTS.has(variant.value)
    ? (occurrences.value?.items ?? [])
    : (collection.value?.events ?? []),
)
const nav = createNavigator({ body: bodyEl, events })

// ── Mount below the introduction (before the first section heading) ───────
const leadMount = ref<HTMLElement | null>(null)
function placeLeadMount() {
  const body = bodyEl.value
  if (!body) return
  let mount = leadMount.value
  if (!mount || !body.contains(mount)) {
    mount = document.createElement('div')
    mount.className = 'tn-mount'
  }
  const lead = body.querySelector(':scope > section[data-mw-section-id="0"]')
  if (lead) {
    if (lead.nextElementSibling !== mount) lead.after(mount)
  } else if (body.firstElementChild !== mount) body.prepend(mount)
  leadMount.value = mount
}
watch(bodyEl, (el) => {
  leadMount.value = null
  if (!el) return
  // After the skin has restructured headings.
  nextTick(() => setTimeout(placeLeadMount, 60))
})

// ── URL ⇄ selected event (replace: never adds history) ─────────────────────
watch(
  () => nav.selectedId.value,
  (id) => {
    if ((one(route.query, 'event') ?? null) === id) return
    const q = { ...route.query }
    if (id) q.event = id
    else delete q.event
    void router.replace({ query: q, hash: route.hash })
  },
)
watch(
  [events, () => one(route.query, 'event')],
  ([list, id]) => {
    if (!list.length) return
    nav.selectedId.value = id && list.some((e) => e.id === id) ? id : null
  },
  { immediate: true },
)
watch(articleId, () => {
  nav.origin.value = null
  nav.unresolved.value = null
  nav.range.value = null
})
onMounted(() => rememberPath('/timeline-navigation'))

const ctx = computed<NavContext | null>(() =>
  collection.value && article.value
    ? {
        collection: collection.value,
        article: article.value,
        nav,
        era: !!collection.value.era,
        occurrences: occurrences.value?.items ?? [],
        articleId: articleId.value,
        variant: variant.value,
        width,
        skin,
      }
    : null,
)
// Variants inject a stable object; its fields are refreshed when the article changes.
const provided = {} as NavContext & { leadMount: typeof leadMount; margin: typeof margin }
watch(
  ctx,
  (c) => {
    if (c) Object.assign(provided, c, { leadMount, margin })
  },
  { immediate: true },
)
provide(NAV, provided)
</script>

<template>
  <ChromeWrapper
    :last-edited-notice="false"
    tag="Prototype"
    :dir="dir"
  >
    <template #user-menu>
      <NavMenu
        :variant="variant"
        :article="articleId"
        :dir="dir"
      />
    </template>

    <div
      class="tn-page"
      :class="[`tn-page--${variant}`, margin && `tn-page--margin-${margin}`]"
      :data-variant="variant"
    >
      <aside
        v-if="margin === 'start'"
        id="tn-margin-start"
        class="tn-page__margin"
      />
      <div class="tn-page__main">
        <ArticleWrapper
          :title="collection?.title ?? ''"
          :dir="dir"
        >
          <CdxProgressBar
            v-if="!article && !loadError"
            inline
            aria-label="Loading article"
          />
          <CdxMessage
            v-if="loadError"
            type="error"
          >
            Could not load the article snapshot: {{ loadError }}
          </CdxMessage>
          <CdxMessage
            v-if="collection?.missing.length"
            type="warning"
          >
            Some curated events were not found in this revision: {{ collection.missing.join('; ') }}
          </CdxMessage>
          <ArticleRenderer
            v-if="article"
            :key="articleId"
            :dir="dir"
          >
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div
              :ref="(el) => (bodyEl = el as HTMLElement | null)"
              class="tn-body"
              v-html="article.html"
            />
          </ArticleRenderer>
        </ArticleWrapper>
      </div>
      <aside
        v-if="margin === 'end'"
        id="tn-margin-end"
        class="tn-page__margin"
      />
    </div>

    <component
      :is="VARIANT_COMPONENTS[variant]"
      v-if="ctx"
      :key="`${variant}:${articleId}`"
    />

    <div
      class="tn-visually-hidden"
      aria-live="polite"
      role="status"
    >
      {{ nav.announcement.value }}
    </div>
  </ChromeWrapper>
</template>

<style scoped>
.tn-page {
  position: relative;
  /* Room for the bars fixed at the bottom, so they never cover the article's last lines. */
  padding-block-end: 96px;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  justify-content: center;
}
.tn-page--margin-start {
  grid-template-columns: 232px minmax(0, 1016px);
  column-gap: var(--spacing-100);
}
.tn-page--margin-end {
  grid-template-columns: minmax(0, 1016px) 248px;
  column-gap: var(--spacing-100);
}
.tn-page__main {
  min-width: 0;
}
.tn-page__margin {
  position: relative;
  min-width: 0;
  padding-block-start: var(--spacing-150);
}
</style>

<style>
@import './navigate.css';
</style>
