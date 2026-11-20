<script setup lang="ts">
/**
 * Curate, for every form: the filter row (what pick mode lights), what was
 * picked (a table's columns, an image's markers), the forms that fit (small
 * previews, only valid ones), the chosen form's own settings, Compare when
 * the form takes a second set, and one row per item: label, source, citation,
 * "Show in article". Nothing here names a form; it reads FORMS.
 */
import { computed, ref } from 'vue'
import {
  CdxButton,
  CdxIcon,
  CdxSelect,
  CdxTextInput,
  CdxToggleButtonGroup,
  CdxToggleSwitch,
} from '@wikimedia/codex'
import {
  cdxIconArticle,
  cdxIconClose,
  cdxIconImage,
  cdxIconDownTriangle,
  cdxIconUpTriangle,
} from '@wikimedia/codex-icons'

import CurationPanel from '../curate/CurationPanel.vue'
import ImagePicker from '../curate/ImagePicker.vue'
import type { LoadedArticle } from '../host/loadArticle'
import type { ArticleSection, Placement } from '../model/types'
import type { Item } from '../model/visual'
import { proposeGeneralRoles, type GeneralRole } from '../pick/toItems'
import {
  addMarker,
  itemsOf,
  setCompare,
  setRole,
  tableOf,
  type PickFilter,
  type VisualDraft,
} from './draft'
import { defaultsOf, FORMS } from './forms'
import { formsFor } from './rules'
import VisualFrame from './VisualFrame.vue'

const props = defineProps<{
  article: LoadedArticle
  mode: 'side' | 'sheet'
  sections: ArticleSection[]
  cursorPlacement: Placement | null
  counts: Record<Exclude<PickFilter, 'all'>, number>
  lang?: string
}>()
const draft = defineModel<VisualDraft>('draft', { required: true })
const placement = defineModel<Placement>('placement', { required: true })
const expanded = defineModel<boolean>('expanded', { default: false })
const emit = defineEmits<{
  close: []
  discard: []
  commit: []
  showSource: [item: Item]
  showTable: []
}>()

const items = computed(() => itemsOf(draft.value))
const count = computed(() => items.value.length)
const def = computed(() => FORMS[draft.value.visual.form])

// ── Filter row ──────────────────────────────────────────────────────────────
const filterButtons = computed(() => [
  { value: 'all', label: 'All' },
  { value: 'date', label: `Dates ${props.counts.date}` },
  { value: 'place', label: `Places ${props.counts.place}` },
  { value: 'table', label: `Tables ${props.counts.table}` },
  { value: 'image', label: `Images ${props.counts.image}` },
])
const filter = computed({
  get: () => draft.value.filter,
  set: (v: PickFilter) => (draft.value.filter = v),
})

// ── What was picked ────────────────────────────────────────────────────────
const table = computed(() => tableOf(props.article, draft.value.tableId))
const reasons = computed(() =>
  table.value ? proposeGeneralRoles(table.value).map((r) => r.reason) : [],
)
const ROLE_LABEL: Record<GeneralRole, string> = {
  time: 'Time',
  category: 'Category',
  quantity: 'Quantity',
  ignore: 'Not used',
}
const roleItems = (Object.keys(ROLE_LABEL) as GeneralRole[]).map((r) => ({
  value: r,
  label: ROLE_LABEL[r],
}))
const image = computed(() => props.article.images.find((i) => i.id === draft.value.imageId) ?? null)
function onImageClick(e: MouseEvent) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  addMarker(
    draft.value,
    props.article,
    (e.clientX - r.left) / r.width,
    (e.clientY - r.top) / r.height,
  )
}

// ── Forms that fit ─────────────────────────────────────────────────────────
const fits = computed(() => formsFor(items.value))
function chooseForm(f: (typeof fits.value)[number]) {
  draft.value.visual.form = f
  draft.value.visual.options = { ...defaultsOf(f), ...draft.value.visual.options }
  if (!FORMS[f].compare) setCompare(draft.value, props.article, null)
}
const compareItems = computed(() => [
  { value: '', label: 'Nothing' },
  ...props.article.compare.map((c) => ({ value: c.title, label: c.title })),
])
const compareWith = computed({
  get: () => draft.value.compareWith ?? '',
  set: (v: string) => setCompare(draft.value, props.article, v || null),
})
const compareMissing = computed(
  () => !!draft.value.compareWith && draft.value.visual.sets.length < 2,
)

// ── Items ──────────────────────────────────────────────────────────────────
const listed = computed(() =>
  def.value.ordered || !def.value.order ? items.value : def.value.order(items.value),
)
const showAll = ref(false)
const shown = computed(() => (showAll.value ? listed.value : listed.value.slice(0, 30)))
function move(item: Item, delta: number) {
  const list = items.value
  const i = list.indexOf(item)
  const j = i + delta
  if (j < 0 || j >= list.length) return
  list.splice(i, 1)
  list.splice(j, 0, item)
}
// An optional image per item: from the article, or from Wikimedia Commons (the same picker as the timeline's).
const pickerFor = ref<Item | null>(null)
const pickerOpen = computed({
  get: () => !!pickerFor.value,
  set: (v: boolean) => {
    if (!v) pickerFor.value = null
  },
})
const pickerItem = computed(() =>
  pickerFor.value
    ? {
        id: pickerFor.value.id,
        label: pickerFor.value.label,
        sourceText: pickerFor.value.source.text,
        sourceDateText: '',
        image: pickerFor.value.image,
        date: pickerFor.value.components.time,
      }
    : null,
)
function onImage(img: Item['image']) {
  if (pickerFor.value) pickerFor.value.image = img
}

function remove(item: Item) {
  const list = items.value
  list.splice(list.indexOf(item), 1)
}

/** Tie a marker to a sentence: search the article's sentences that carry a date or a place. */
const tying = ref<string | null>(null)
const query = ref('')
const sentences = computed(() => {
  const all = [...props.article.mentions, ...props.article.places]
  const seen = new Set<string>()
  return all.filter((m) => (seen.has(m.sentence) ? false : (seen.add(m.sentence), true)))
})
const found = computed(() => {
  const words = query.value
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2)
  if (!words.length) return []
  return sentences.value
    .filter((m) => words.every((w) => m.sentence.toLowerCase().includes(w)))
    .slice(0, 5)
})
function tie(item: Item, m: (typeof sentences.value)[number]) {
  item.source = { kind: 'sentence', anchor: { ...m.anchor }, text: m.sentence }
  item.citation = m.citation ? { ...m.citation } : undefined
  tying.value = null
  query.value = ''
}

// ── Placement (as in the other modules' panel) ─────────────────────────────
const key = (p: Placement | null) =>
  !p ? '' : p.kind === 'after' ? `after:${p.anchorId}` : `top:${p.sectionId}`
const placementItems = computed(() => {
  const out: { value: string; label: string; description?: string }[] = []
  if (props.cursorPlacement)
    out.push({
      value: key(props.cursorPlacement),
      label: 'At the cursor',
      description: `In “${props.cursorPlacement.sectionTitle}”`,
    })
  for (const s of props.sections)
    if (!out.some((i) => i.value === `top:${s.id}`))
      out.push({ value: `top:${s.id}`, label: `Top of “${s.title}”` })
  return out
})
const placementValue = computed({
  get: () => key(placement.value),
  set: (k: string) => {
    if (props.cursorPlacement && k === key(props.cursorPlacement))
      return void (placement.value = props.cursorPlacement)
    const s = props.sections.find((x) => `top:${x.id}` === k)
    if (s) placement.value = { kind: 'sectionTop', sectionId: s.id, sectionTitle: s.title }
  },
})

const tab = ref<'items' | 'preview'>('items')
const hint = computed(() =>
  count.value ? `${def.value.label} · open to curate` : 'Tap anything highlighted in the article',
)
const sourceLabel = (i: Item) =>
  i.source.kind === 'tableRow'
    ? `Table row: ${i.source.text}`
    : i.source.kind === 'image'
      ? 'On the image'
      : i.source.text
</script>

<template>
  <CurationPanel
    v-model:expanded="expanded"
    :mode="mode"
    title="Visual"
    :count="count"
    :count-label="`${count} ${count === 1 ? 'item' : 'items'}`"
    :hint="hint"
    @close="emit('close')"
  >
    <template #notice>
      <div class="gc__filter">
        <CdxToggleButtonGroup
          v-model="filter"
          :buttons="filterButtons"
          aria-label="What to light up in the article"
        />
      </div>
    </template>

    <div class="gc__tabs" role="tablist" aria-label="Visual panel">
      <button
        v-for="t in ['items', 'preview'] as const"
        :id="`gc-tab-${t}`"
        :key="t"
        type="button"
        role="tab"
        class="gc__tab"
        :class="{ 'gc__tab--on': tab === t }"
        :aria-selected="tab === t"
        @click="tab = t"
      >
        {{ t === 'items' ? 'Items' : 'Preview' }}
      </button>
    </div>

    <div v-show="tab === 'items'" class="gc__pane" role="tabpanel" aria-labelledby="gc-tab-items">
      <input
        v-model="draft.visual.title"
        class="gc__title"
        placeholder="Untitled visual"
        aria-label="Title"
      />
      <input
        v-model="draft.visual.caption"
        class="gc__caption"
        :placeholder="count ? def.caption(draft.visual) : 'Caption: how to read it'"
        aria-label="Caption"
      />

      <div v-if="!count && !image" class="gc__empty">
        <p>Tap anything highlighted in the article.</p>
        <small
          >Dates and places are chips in the text; a table or an image is picked whole. The filter
          above narrows what is lit.</small
        >
      </div>

      <!-- A table: what each column is -->
      <section v-if="table" class="gc__section">
        <div class="gc__h">
          Columns <small class="gc__muted">from the table in “{{ table.sectionTitle }}”</small>
        </div>
        <ol class="gc__cols">
          <li v-for="(h, i) in table.headers" :key="i" class="gc__col">
            <div class="gc__col-head">
              <span>{{ h || `Column ${i + 1}` }}</span>
              <small class="gc__muted">{{ reasons[i] }}</small>
            </div>
            <CdxSelect
              class="gc__role"
              :selected="draft.roles[i]"
              :menu-items="roleItems"
              :aria-label="`${h || `Column ${i + 1}`}: what it is`"
              @update:selected="setRole(draft, article, i, $event as GeneralRole)"
            />
          </li>
        </ol>
        <CdxButton size="small" weight="quiet" @click="emit('showTable')">Show the table</CdxButton>
      </section>

      <!-- An image: tap to drop markers -->
      <section v-if="image" class="gc__section">
        <div class="gc__h">Tap the image to drop a numbered point</div>
        <!-- eslint-disable-next-line vuejs-accessibility/click-events-have-key-events, vuejs-accessibility/no-static-element-interactions -->
        <div class="gc__image" @click="onImageClick">
          <img :src="image.src" :alt="image.caption" />
          <span
            v-for="(i, k) in items"
            :key="i.id"
            class="gc__marker"
            :style="{
              left: `${i.components.region!.x * 100}%`,
              top: `${i.components.region!.y * 100}%`,
            }"
            >{{ k + 1 }}</span
          >
        </div>
        <small class="gc__muted">{{ image.caption }}</small>
      </section>

      <!-- Forms that fit -->
      <section v-if="fits.length" class="gc__section">
        <div class="gc__h">Show as</div>
        <div class="gc__forms" role="radiogroup" aria-label="Show as">
          <button
            v-for="f in fits"
            :key="f"
            type="button"
            role="radio"
            class="gc__form"
            :class="{ 'gc__form--on': draft.visual.form === f }"
            :aria-checked="draft.visual.form === f"
            @click="chooseForm(f)"
          >
            <!-- eslint-disable-next-line vue/no-v-html -->
            <span class="gc__thumb viz" v-html="FORMS[f].thumb(items)" />
            <small>{{ FORMS[f].label }}</small>
          </button>
        </div>
        <div v-if="def.settings?.length" class="gc__settings">
          <CdxToggleSwitch
            v-for="s in def.settings"
            :key="s.key"
            :model-value="
              draft.visual.options[s.key] !== undefined ? !!draft.visual.options[s.key] : s.default
            "
            align-switch
            @update:model-value="draft.visual.options[s.key] = $event"
            >{{ s.label }}</CdxToggleSwitch
          >
        </div>
        <div v-if="def.compare && table && article.compare.length" class="gc__compare">
          <small>Compare with</small>
          <CdxSelect
            v-model:selected="compareWith"
            :menu-items="compareItems"
            aria-label="Compare with"
          />
        </div>
        <small v-if="compareMissing" class="gc__muted"
          >No table with the same columns in {{ draft.compareWith }}.</small
        >
      </section>
      <p v-else-if="count" class="gc__muted">
        <small>No form fits these items together. Remove some, or pick from one kind.</small>
      </p>

      <!-- One row per item -->
      <section v-if="count" class="gc__section">
        <div class="gc__h">
          {{ count }} {{ count === 1 ? 'item' : 'items' }}
          <small class="gc__muted">{{ def.ordered ? 'in your order' : '' }}</small>
        </div>
        <ol class="gc__items">
          <li v-for="(i, k) in shown" :key="i.id" class="gc__item">
            <span v-if="def.numbered" class="gc__num">{{ k + 1 }}</span>
            <div class="gc__item-main">
              <input v-model="i.label" class="gc__label" :aria-label="`Label for item ${k + 1}`" />
              <small class="gc__muted gc__src"
                >{{ sourceLabel(i) }}<sup v-if="i.citation"> {{ i.citation.label }}</sup></small
              >
              <img
                v-if="i.image && !i.components.region"
                class="gc__thumb-img"
                :src="i.image.src"
                :alt="i.image.caption"
              />
              <template v-if="i.components.region">
                <CdxButton v-if="tying !== i.id" size="small" weight="quiet" @click="tying = i.id">
                  {{
                    i.source.kind === 'sentence' ? 'Tie to another sentence' : 'Tie to a sentence'
                  }}
                </CdxButton>
                <div v-else class="gc__tie">
                  <CdxTextInput
                    v-model="query"
                    placeholder="Words from the sentence"
                    aria-label="Find a sentence"
                  />
                  <button
                    v-for="m in found"
                    :key="m.id"
                    type="button"
                    class="gc__found"
                    @click="tie(i, m)"
                  >
                    <small>{{ m.sentence }}</small>
                  </button>
                </div>
              </template>
            </div>
            <span v-if="def.ordered" class="gc__order">
              <button
                type="button"
                class="gc__icon"
                :aria-label="`Move ${i.label} up`"
                @click="move(i, -1)"
              >
                <CdxIcon :icon="cdxIconUpTriangle" size="x-small" />
              </button>
              <button
                type="button"
                class="gc__icon"
                :aria-label="`Move ${i.label} down`"
                @click="move(i, 1)"
              >
                <CdxIcon :icon="cdxIconDownTriangle" size="x-small" />
              </button>
            </span>
            <button
              v-if="!i.components.region"
              type="button"
              class="gc__icon"
              :class="{ 'gc__icon--on': !!i.image }"
              :aria-label="
                i.image ? `Change the image for ${i.label}` : `Add an image to ${i.label}`
              "
              @click="pickerFor = i"
            >
              <CdxIcon :icon="cdxIconImage" size="small" />
            </button>
            <button
              v-if="i.source.anchor"
              type="button"
              class="gc__icon"
              :aria-label="`Show ${i.label} in the article`"
              @click="emit('showSource', i)"
            >
              <CdxIcon :icon="cdxIconArticle" size="small" />
            </button>
            <button
              type="button"
              class="gc__icon"
              :aria-label="`Remove ${i.label}`"
              @click="remove(i)"
            >
              <CdxIcon :icon="cdxIconClose" size="x-small" />
            </button>
          </li>
        </ol>
        <CdxButton
          v-if="listed.length > 30 && !showAll"
          size="small"
          weight="quiet"
          @click="showAll = true"
          >Show all {{ listed.length }}</CdxButton
        >
      </section>
    </div>

    <div
      v-show="tab === 'preview'"
      class="gc__pane"
      role="tabpanel"
      aria-labelledby="gc-tab-preview"
    >
      <VisualFrame
        v-if="count && fits.length"
        :visual="draft.visual"
        :can-show-source="false"
        :lang="lang"
        skin="mobile"
      />
      <p v-else class="gc__muted"><small>Pick something first.</small></p>
    </div>

    <template #footer>
      <CdxSelect
        v-if="!draft.editingId"
        v-model:selected="placementValue"
        class="gc__placement"
        aria-label="Where to insert"
        :menu-items="placementItems"
        :menu-config="{ visibleItemLimit: 6 }"
      />
      <div class="gc__actions">
        <CdxButton weight="quiet" @click="emit('discard')">{{
          draft.editingId ? 'Cancel' : 'Discard'
        }}</CdxButton>
        <CdxButton
          action="progressive"
          weight="primary"
          :disabled="!count || !fits.length"
          @click="emit('commit')"
        >
          {{ draft.editingId ? 'Done' : 'Insert' }}
        </CdxButton>
      </div>
    </template>
  </CurationPanel>

  <ImagePicker
    v-model:open="pickerOpen"
    :images="article.images"
    :event="pickerItem"
    :subject="article.source.title"
    @choose="onImage"
  />
</template>

<style scoped>
.gc__filter {
  padding: var(--spacing-50) var(--spacing-100) 0;
  overflow-x: auto;
}
.gc__filter :deep(.cdx-toggle-button-group) {
  flex-wrap: nowrap;
}
.gc__filter :deep(.cdx-toggle-button) {
  white-space: nowrap;
}
.gc__tabs {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  gap: var(--spacing-150);
  padding: 0 var(--spacing-100);
  background: var(--background-color-base);
  border-bottom: var(--border-width-base, 1px) solid var(--border-color-subtle);
}
.gc__tab {
  padding: var(--spacing-50) 0;
  margin-bottom: -1px;
  border: 0;
  border-bottom: var(--border-width-thick, 2px) solid transparent;
  background: none;
  color: var(--color-subtle);
  font: inherit;
  cursor: pointer;
}
.gc__tab--on {
  color: var(--color-progressive);
  border-bottom-color: var(--border-color-progressive);
}
.gc__pane {
  padding: var(--spacing-75) var(--spacing-100) var(--spacing-150);
}
.gc__title,
.gc__caption,
.gc__label {
  display: block;
  box-sizing: border-box;
  width: 100%;
  padding: 2px var(--spacing-25);
  border: 0;
  border-radius: var(--border-radius-base, 2px);
  background: transparent;
  color: var(--color-base);
  font-family: var(--font-family-base);
}
.gc__title {
  font-size: var(--font-size-large);
  font-weight: var(--font-weight-bold);
}
.gc__caption {
  margin-bottom: var(--spacing-50);
  font-size: var(--font-size-small);
  color: var(--color-subtle);
}
.gc__label {
  font-weight: var(--font-weight-bold);
}
.gc__title:hover,
.gc__caption:hover,
.gc__label:hover {
  background: var(--background-color-interactive-subtle);
}
.gc__title:focus,
.gc__caption:focus,
.gc__label:focus {
  outline: none;
  box-shadow: inset 0 0 0 1px var(--border-color-progressive);
}
.gc__empty {
  padding-block: var(--spacing-150);
  color: var(--color-subtle);
}
.gc__empty p {
  margin: 0 0 var(--spacing-25);
  color: var(--color-base);
}
.gc__section {
  padding-block: var(--spacing-75);
  border-top: var(--border-width-base, 1px) solid var(--border-color-subtle);
}
.gc__h {
  margin-bottom: var(--spacing-50);
  font-weight: var(--font-weight-bold);
}
.gc__muted {
  color: var(--color-subtle);
  font-weight: var(--font-weight-normal);
}
.gc__cols,
.gc__items {
  list-style: none;
  margin: 0;
  padding: 0;
}
.gc__col {
  display: flex;
  align-items: center;
  gap: var(--spacing-75);
  padding-block: var(--spacing-25);
}
.gc__col-head {
  flex: 1;
  min-width: 0;
}
.gc__col-head > * {
  display: block;
  overflow-wrap: anywhere;
}
.gc__role {
  flex: none;
  width: 9.5em;
  min-width: 0;
}
.gc__role :deep(.cdx-select-vue__handle) {
  min-width: 0;
}
.gc__image {
  position: relative;
  cursor: crosshair;
  line-height: 0;
}
.gc__image img {
  width: 100%;
  height: auto;
}
.gc__marker {
  position: absolute;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  transform: translate(-50%, -50%);
  border: 2px solid var(--background-color-base);
  border-radius: 50%;
  background: var(--color-progressive);
  color: var(--color-inverted-fixed, #fff);
  font-size: var(--font-size-small);
  font-weight: var(--font-weight-bold);
  line-height: 1;
  pointer-events: none;
}
.gc__forms {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(7.5em, 1fr));
  gap: var(--spacing-50);
}
.gc__form {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-25);
  padding: var(--spacing-50);
  border: var(--border-width-base, 1px) solid var(--border-color-subtle);
  border-radius: var(--border-radius-base, 2px);
  background: var(--background-color-base);
  color: var(--color-base);
  cursor: pointer;
}
.gc__form--on {
  border-color: var(--border-color-progressive);
  box-shadow: inset 0 0 0 1px var(--border-color-progressive);
}
.gc__form:focus-visible {
  outline: var(--border-width-thick, 2px) solid var(--outline-color-progressive--focus, #36c);
}
.gc__thumb {
  display: block;
  line-height: 0;
}
.gc__settings {
  margin-top: var(--spacing-75);
}
.gc__settings :deep(.cdx-toggle-switch) {
  margin: 0 0 var(--spacing-25);
}
.gc__compare {
  display: flex;
  align-items: center;
  gap: var(--spacing-50);
  margin-top: var(--spacing-75);
  color: var(--color-subtle);
}
.gc__item {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-25);
  padding-block: var(--spacing-25);
  border-bottom: var(--border-width-base, 1px) solid var(--border-color-subtle);
}
.gc__num {
  flex: none;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  margin-top: 2px;
  border-radius: 50%;
  background: var(--color-progressive);
  color: var(--color-inverted-fixed, #fff);
  font-size: var(--font-size-small);
  font-weight: var(--font-weight-bold);
}
.gc__item-main {
  flex: 1;
  min-width: 0;
}
.gc__src {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  padding-inline: var(--spacing-25);
}
.gc__order {
  display: flex;
  flex-direction: column;
}
.gc__icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-subtle);
  cursor: pointer;
}
.gc__icon--on {
  color: var(--color-progressive);
}
.gc__thumb-img {
  display: block;
  width: 64px;
  height: 43px;
  margin: var(--spacing-25) var(--spacing-25) 0;
  object-fit: cover;
  border-radius: var(--border-radius-base, 2px);
}
.gc__icon:hover {
  color: var(--color-progressive);
}
.gc__icon:focus-visible {
  outline: var(--border-width-thick, 2px) solid var(--outline-color-progressive--focus, #36c);
}
.gc__tie {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-25);
  margin-top: var(--spacing-25);
}
.gc__found {
  padding: var(--spacing-25);
  border: 0;
  background: var(--background-color-interactive-subtle);
  color: var(--color-base);
  text-align: start;
  cursor: pointer;
}
.gc__placement {
  width: 100%;
}
.gc__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-50);
}
</style>
