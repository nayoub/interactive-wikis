<script setup lang="ts">
/**
 * The frame every visual sits in, whatever its form: title and a one-line
 * caption on how to read it, the figure, the card for the selected item
 * (below the figure, never over it), the list of items (numbered when the
 * figure numbers them), credits and the data's source, and the plain
 * fallback (a table of the items) when Plain list is on. Selection is owned
 * here, so it behaves the same in every form.
 */
import { computed, ref, useId, watch } from 'vue'

import { MONTH_NAMES, formatDate } from '../model/dates'
import { labelIn, type Item, type Visual } from '../model/visual'
import SelectionCard from '../render/SelectionCard.vue'
import { FORMS } from './forms'
import { fmt } from './forms/shared'

const props = withDefaults(
  defineProps<{
    visual: Visual
    fallback?: boolean
    lang?: string
    canShowSource?: boolean
    skin?: 'desktop' | 'mobile'
    spacing?: 'proportional' | 'even'
    /** Being made: the item card edits (label, image, remove, move), the empty block prompts. */
    editing?: boolean
    /** In the empty block while it is being made ("Tap a date in the text"). */
    prompt?: string
    /** The item to select from outside (the one just picked). */
    focusId?: string | null
  }>(),
  {
    fallback: false,
    lang: 'en',
    canShowSource: true,
    skin: 'desktop',
    spacing: 'proportional',
    editing: false,
    prompt: '',
    focusId: null,
  },
)
const emit = defineEmits<{
  show: [item: Item]
  /** Being made: */
  select: [id: string | null]
  rename: [id: string, label: string]
  remove: [id: string]
  image: [id: string]
  move: [id: string, delta: number]
  reorder: [ids: string[]]
}>()

const def = computed(() => FORMS[props.visual.form])
const titleId = useId()
const selectedId = ref<string | null>(null)
watch(
  () => props.visual.form,
  () => (selectedId.value = null),
)

const allItems = computed(() => props.visual.sets.flatMap((s) => s.items))
const listed = computed(() => {
  const items = props.visual.sets[0]?.items ?? []
  return def.value.order ? def.value.order(items) : items
})
const selected = computed(() => allItems.value.find((i) => i.id === selectedId.value) ?? null)
const setOf = (i: Item) => props.visual.sets.find((s) => s.items.includes(i))

watch(
  () => props.focusId,
  (id) => {
    if (props.editing && id !== undefined) selectedId.value = id
  },
)
watch(selectedId, (id) => props.editing && emit('select', id))
const draftLabel = ref('')
watch(
  () => [selectedId.value, props.visual] as const,
  () => (draftLabel.value = allItems.value.find((i) => i.id === selectedId.value)?.label ?? ''),
  { immediate: true, deep: true },
)
function commitLabel() {
  const t = draftLabel.value.replace(/\s+/g, ' ').trim()
  if (selected.value && t && t !== selected.value.label) emit('rename', selected.value.id, t)
}

function when(i: Item) {
  const t = i.components.time
  if (!t) return ''
  return t.recurring ? MONTH_NAMES[(t.start.m ?? 1) - 1] : formatDate(t)
}
function amount(i: Item) {
  const q = i.components.quantity
  return q ? `${fmt(q.value)}${q.unit ? ` ${q.unit}` : ''}` : ''
}
const facts = (i: Item) =>
  [
    props.visual.sets.length > 1 ? setOf(i)?.label : '',
    i.components.category && i.components.category !== i.label ? i.components.category : '',
    when(i),
    amount(i),
  ]
    .filter(Boolean)
    .join(' · ')

/** The fallback table's columns: only what the items have. */
const has = computed(() => ({
  time: listed.value.some((i) => i.components.time),
  category: listed.value.some((i) => i.components.category && i.components.category !== i.label),
  quantity: listed.value.some((i) => i.components.quantity),
}))

const credits = computed(() => {
  const imgs = [
    ...new Map(allItems.value.filter((i) => i.image).map((i) => [i.image!.id, i.image!])).values(),
  ]
  return imgs.map((img) => img.fileTitle ?? img.caption).filter(Boolean)
})
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && selectedId.value) selectedId.value = null
}
</script>

<template>
  <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
  <div class="viz vf" role="group" :aria-labelledby="titleId" @keydown="onKeydown">
    <div class="vf__header">
      <div :id="titleId" class="vf__title">{{ visual.title || def.label }}</div>
    </div>
    <small class="vf__caption">{{ visual.caption || def.caption(visual) }}</small>

    <!-- Being made, nothing picked yet: the block says what to do. -->
    <p v-if="editing && !allItems.length" class="vf__prompt">{{ prompt }}</p>

    <div v-else-if="!fallback" class="vf__figure">
      <component
        :is="def.component"
        :visual="visual"
        :selected-id="selectedId"
        :lang="lang"
        :skin="skin"
        :spacing="spacing"
        :editing="editing"
        @select="selectedId = $event"
        @rename="(id: string, label: string) => emit('rename', id, label)"
        @reorder="(ids: string[]) => emit('reorder', ids)"
      />
    </div>

    <!-- Plain list: the items as a table (also the print rendering). -->
    <table v-if="fallback" class="vf__table">
      <thead>
        <tr>
          <th scope="col">
            <small>{{ def.numbered ? '#' : 'Item' }}</small>
          </th>
          <th v-if="has.time" scope="col"><small>When</small></th>
          <th v-if="has.category" scope="col"><small>Of</small></th>
          <th v-for="s in has.quantity ? visual.sets : []" :key="s.label" scope="col" class="vf__n">
            <small>{{ visual.sets.length > 1 ? s.label : 'Value' }}</small>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(i, k) in listed" :key="i.id">
          <th scope="row">
            <a
              v-if="i.source.anchor && canShowSource"
              :href="`#${i.source.anchor.mentionId}`"
              @click.prevent="emit('show', i)"
              ><template v-if="def.numbered">{{ k + 1 }}. </template>{{ labelIn(i, lang) }}</a
            ><template v-else
              ><template v-if="def.numbered">{{ k + 1 }}. </template
              >{{ labelIn(i, lang) }}</template
            >
          </th>
          <td v-if="has.time">{{ when(i) }}</td>
          <td v-if="has.category">{{ i.components.category }}</td>
          <td v-for="s in has.quantity ? visual.sets : []" :key="s.label" class="vf__n">
            {{ amount(s === visual.sets[0] ? i : (s.items.find((x) => x.label === i.label) ?? i)) }}
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Being made: the selected item's card edits it (below the figure, never over it). -->
    <div
      v-if="editing && selected && !fallback"
      class="vf__edit"
      role="group"
      aria-label="Edit this item"
    >
      <input
        v-model="draftLabel"
        class="vf__edit-label"
        :aria-label="`Label for ${selected.label}`"
        @blur="commitLabel"
        @keydown.enter.prevent="commitLabel"
      />
      <small class="vf__edit-facts">{{ facts(selected) }}</small>
      <small v-if="selected.labelEdited" class="vf__edit-facts"
        >Your own words; still linked to its sentence.</small
      >
      <div class="vf__edit-actions">
        <button v-if="selected.source.anchor" type="button" @click="emit('show', selected)">
          <small>Show source</small>
        </button>
        <button
          v-if="!selected.components.region"
          type="button"
          @click="emit('image', selected.id)"
        >
          <small>{{ selected.image ? 'Change image' : 'Add image' }}</small>
        </button>
        <template v-if="def.ordered || def.numbered">
          <button type="button" @click="emit('move', selected.id, -1)">
            <small>Move up</small>
          </button>
          <button type="button" @click="emit('move', selected.id, 1)">
            <small>Move down</small>
          </button>
        </template>
        <button
          type="button"
          class="vf__remove"
          @click="
            emit('remove', selected.id)
            selectedId = null
          "
        >
          <small>Remove</small>
        </button>
      </div>
    </div>

    <SelectionCard
      v-else-if="selected && !fallback"
      :title="labelIn(selected, lang)"
      :meta="facts(selected)"
      :quote="selected.source.kind === 'sentence' ? selected.source.text : undefined"
      :source-note="
        selected.source.kind === 'tableRow'
          ? `Row of the table in “${selected.source.anchor?.sectionTitle}”: ${selected.source.text}`
          : selected.source.kind === 'image'
            ? `On the image: ${selected.source.text}`
            : undefined
      "
      :citation="selected.citation"
      :image="selected.components.region ? undefined : selected.image"
      :can-show-source="!!selected.source.anchor && canShowSource"
      @show-source="emit('show', selected)"
      @close="selectedId = null"
    />

    <!-- The items: always listed when the figure numbers them; otherwise folded away. -->
    <ol v-if="def.numbered && !fallback" class="vf__list vf__list--numbered">
      <li
        v-for="(i, k) in listed"
        :key="i.id"
        :class="{ 'vf--dim': selectedId && selectedId !== i.id }"
      >
        <button
          type="button"
          :aria-pressed="selectedId === i.id"
          @click="selectedId = selectedId === i.id ? null : i.id"
        >
          <span class="vf__num">{{ k + 1 }}</span
          ><small>{{ labelIn(i, lang) }}</small>
        </button>
      </li>
    </ol>
    <details v-else-if="!fallback && allItems.length" class="vf__more">
      <summary>
        <small>All {{ allItems.length }} items</small>
      </summary>
      <ul class="vf__list">
        <li v-for="i in listed" :key="i.id">
          <button type="button" @click="selectedId = i.id">
            <small
              >{{ labelIn(i, lang)
              }}<span v-if="facts(i)" class="vf__facts"> · {{ facts(i) }}</span></small
            >
          </button>
        </li>
      </ul>
    </details>

    <small v-if="visual.sourceNote || credits.length" class="vf__credits">
      <template v-if="visual.sourceNote">{{ visual.sourceNote }}</template
      ><template v-if="credits.length"> Image: {{ credits.join('; ') }}.</template>
    </small>
  </div>
</template>

<style scoped>
/* Everything here reads ../tokens.css: the same frame as the timeline, map and seat diagram. */
.vf {
  display: flow-root;
  min-width: 0;
  margin-block: var(--viz-space-xxl);
  padding-block: var(--viz-space-l) var(--viz-space-xl);
  border-top: var(--viz-line-width) solid var(--viz-rule);
  border-bottom: var(--viz-line-width) solid var(--viz-rule-light);
  color: var(--viz-ink);
  font-family: var(--viz-font-family);
}
.vf__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--viz-space-m);
}
.vf__title {
  font-size: var(--viz-heading-size);
  font-weight: var(--viz-heading-weight);
  line-height: var(--viz-heading-line);
}
small {
  font-family: var(--viz-font-family);
  font-size: var(--viz-small-size);
  font-weight: var(--viz-small-weight);
  line-height: var(--viz-small-line);
}
.vf__prompt {
  margin: 0;
  padding: var(--viz-space-xl) var(--viz-space-l);
  border: var(--viz-line-width) dashed var(--viz-rule);
  color: var(--viz-ink-secondary);
  text-align: center;
  font-size: var(--viz-small-size);
}
.vf__edit {
  margin-top: var(--viz-space-m);
  padding-top: var(--viz-space-s);
  border-top: var(--viz-line-width) solid var(--viz-rule-light);
}
.vf__edit-label {
  box-sizing: border-box;
  width: 100%;
  padding: 2px var(--viz-space-xs);
  border: 0;
  border-radius: var(--viz-radius);
  background: transparent;
  color: var(--viz-ink);
  font-family: var(--viz-font-family);
  font-size: var(--viz-heading-size);
  font-weight: var(--viz-heading-weight);
  line-height: var(--viz-heading-line);
}
.vf__edit-label:hover {
  box-shadow: inset 0 -1px 0 var(--viz-rule);
}
.vf__edit-label:focus {
  outline: none;
  box-shadow: inset 0 0 0 var(--viz-line-width) var(--viz-accent);
}
.vf__edit-facts {
  display: block;
  color: var(--viz-ink-tertiary);
}
.vf__edit-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0 var(--viz-space-l);
  margin-top: var(--viz-space-xs);
}
.vf__edit-actions button {
  padding: 0;
  border: 0;
  background: none;
  color: var(--viz-accent);
  cursor: pointer;
}
.vf__edit-actions button:hover {
  text-decoration: underline;
}
.vf__edit-actions .vf__remove {
  color: var(--color-destructive, #d33);
}
.vf__caption {
  display: block;
  margin-block: var(--viz-space-xs) var(--viz-space-l);
  color: var(--viz-ink-secondary);
}
.vf__figure {
  min-width: 0;
}
.vf .vf__list,
.vf .vf__list > li {
  list-style: none;
  list-style-image: none;
  margin: 0;
  padding: 0;
}
.vf__list button {
  display: flex;
  align-items: baseline;
  gap: var(--viz-space-s);
  padding: var(--viz-space-xs) 0;
  border: 0;
  background: none;
  color: inherit;
  text-align: start;
  cursor: pointer;
}
.vf__list button:hover small {
  color: var(--viz-accent);
}
.vf__list--numbered {
  margin-top: var(--viz-space-m);
  columns: 2 16em;
  column-gap: var(--viz-space-xl);
}
.vf__list--numbered > li {
  break-inside: avoid;
  transition: opacity var(--viz-transition);
}
.vf__num {
  flex: none;
  display: grid;
  place-items: center;
  width: var(--viz-marker-size);
  height: var(--viz-marker-size);
  border-radius: 50%;
  background: var(--viz-strong);
  color: var(--viz-paper);
  font-size: var(--viz-small-size);
  font-weight: var(--viz-heading-weight);
}
.vf--dim {
  opacity: var(--viz-dim);
}
.vf__more {
  margin-top: var(--viz-space-m);
}
.vf__more summary {
  color: var(--viz-ink-tertiary);
  cursor: pointer;
}
.vf__facts {
  color: var(--viz-ink-tertiary);
}
.vf__credits {
  display: block;
  margin-top: var(--viz-space-m);
  color: var(--viz-ink-tertiary);
}
.vf .vf__table.vf__table {
  display: table;
  width: 100%;
  margin: 0;
  border: 0;
  border-collapse: collapse;
  background: none;
}
.vf .vf__table th,
.vf .vf__table td {
  padding: var(--viz-space-xs) var(--viz-space-s);
  border: 0;
  border-bottom: var(--viz-line-width) solid var(--viz-rule-light);
  background: none;
  text-align: start;
  font-weight: var(--viz-small-weight);
  font-variant-numeric: tabular-nums;
}
.vf .vf__table .vf__n {
  text-align: end;
}
</style>
