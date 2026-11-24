/**
 * B's authored timeline: one dataset per article, the general tool's `Item`
 * list (model/visual.ts), kept in the prototype store (host/store.ts,
 * localStorage) as a placed visual. The reader renders it through
 * `toNavEvents` (a thin equivalent of `toTimelineEvents` that keeps the
 * source occurrence and article order the ruler needs); editing works on a
 * draft copy of the same list.
 *
 *   startNew()   Insert → Timeline: an empty draft (replaces the saved one on Done)
 *   startEdit()  Edit timeline: a draft of the saved list
 *   toggle(id)   a date in the article: added as an event, or removed
 *   setTitle     the event's title, typed: an editorial label (`labelEdited`)
 *                that never follows the source span again; the sentence,
 *                anchor, citation and date stay as they were
 *   setImage     an article or Commons image, with its metadata; or none
 *   undo / done / cancel
 *
 * Identity is the source occurrence (the date mention's id), so two events in
 * the same year stay distinct. The first visit seeds the store once from the
 * article's curated picks; from then on the saved list is the only source.
 */
import { computed, ref, watch, type Ref } from 'vue'

import { setSpan } from '../../general/draft'
import type { LoadedArticle } from '../../host/loadArticle'
import { createStore } from '../../host/store'
import type { EventImage, SourceAnchor } from '../../model/types'
import type { Item } from '../../model/visual'
import { itemFromDate } from '../../pick/toItems'
import { chronological, type ArticleId, type Collection, type NavEvent } from '../events'

const store = createStore('protowiki-timeline-navigation:v1')
const keyOf = (id: ArticleId) => `ruler:${id}`
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T

/** The curated picks as authored items (labels: the pick's words where the sentence has them). */
export function seedItems(article: LoadedArticle, collection: Collection): Item[] {
  return collection.events.flatMap((e) => {
    const m = article.mentions.find((x) => x.id === e.sourceAnchor.mentionId)
    if (!m) return []
    const item = itemFromDate(m)
    const want = e.short ?? e.label
    const at = m.sentence.toLowerCase().indexOf(want.toLowerCase())
    if (at >= 0) setSpan(item, { start: at, end: at + want.length })
    else item.label = want
    // A title from here on: rendering never regenerates it from the span.
    item.labelEdited = true
    if (e.image) item.image = { ...e.image }
    return [item]
  })
}

/** Authored items as the ruler's events: chronological, ties in article order. */
export function toNavEvents(items: Item[], article: LoadedArticle): NavEvent[] {
  const order = new Map(article.mentions.map((m, i) => [m.id, i]))
  return chronological(
    items
      .filter((i) => i.components.time && !i.components.time.recurring)
      .map((i): NavEvent => {
        const m = article.mentions.find((x) => x.id === i.id)
        const anchor: SourceAnchor = i.source.anchor ?? {
          sectionId: 'Lead',
          sectionTitle: 'Lead',
          mentionId: i.id,
          sentenceStart: 0,
          sentenceEnd: 0,
        }
        return {
          id: i.id,
          label: i.label,
          date: i.components.time!,
          sourceText: i.source.text,
          sourceDateText: m?.text ?? '',
          sourceAnchor: anchor,
          sourceLinks: m?.links ?? [],
          citation: i.citation,
          image: i.image,
          topic: '',
          milestone: false,
          order: order.get(i.id) ?? 0,
        }
      }),
  )
}

export function useAuthoredTimeline(o: {
  articleId: Ref<ArticleId>
  article: Ref<LoadedArticle | null>
  collection: Ref<Collection | null>
}) {
  const key = computed(() => keyOf(o.articleId.value))
  const placed = computed(() => store.state.visuals.find((v) => v.id === key.value) ?? null)

  function place(items: Item[]) {
    const visual = { form: 'timeline' as const, title: '', caption: '', sets: [{ label: '', items }], options: {} }
    const p = placed.value
    if (p) p.visual = visual
    else store.state.visuals.push({ id: key.value, visual, placement: { kind: 'sectionTop', sectionId: 'Lead', sectionTitle: 'Lead' } })
  }
  /** First visit to an article: its curated picks become the saved timeline (once). */
  function seed() {
    const a = o.article.value
    const c = o.collection.value
    if (a && c && !placed.value && !store.state.visuals.some((v) => v.id === `${key.value}:none`)) place(seedItems(a, c))
  }
  watch([o.article, o.collection], seed, { immediate: true })

  /** The article editor is on (Edit tab, or Edit timeline). */
  const ve = ref(false)
  const draft = ref<{ items: Item[]; isNew: boolean } | null>(null)
  const undoStack = ref<string[]>([])
  /** The event selected for editing (not the reader's preview). */
  const currentId = ref<string | null>(null)

  const savedItems = computed<Item[]>(() => placed.value?.visual.sets[0]?.items ?? [])
  const items = computed<Item[]>(() => draft.value?.items ?? savedItems.value)
  const events = computed<NavEvent[]>(() => (o.article.value ? toNavEvents(items.value, o.article.value) : []))
  const editing = computed(() => !!draft.value)
  const current = computed<Item | null>(() => draft.value?.items.find((i) => i.id === currentId.value) ?? null)
  const canUndo = computed(() => undoStack.value.length > 0)

  /** Before any change: a snapshot for Undo. */
  function begin() {
    if (draft.value) undoStack.value.push(JSON.stringify(draft.value.items))
  }
  function open(items: Item[], isNew: boolean) {
    ve.value = true
    draft.value = { items, isNew }
    undoStack.value = []
    currentId.value = null
  }
  const startEdit = () => open(clone(savedItems.value), false)
  const startNew = () => open([], true)

  /** A date in the article: add it as an event (selected for editing), or remove it. */
  function toggle(id: string): 'added' | 'removed' | null {
    const d = draft.value
    const a = o.article.value
    if (!d || !a) return null
    begin()
    const at = d.items.findIndex((i) => i.id === id)
    if (at >= 0) {
      d.items.splice(at, 1)
      if (currentId.value === id) currentId.value = null
      return 'removed'
    }
    const m = a.mentions.find((x) => x.id === id)
    if (!m) return null
    const item = itemFromDate(m)
    // A starting title to edit: the curated short label for this occurrence, else the mention's own short label.
    const curated = o.collection.value?.events.find((e) => e.sourceAnchor.mentionId === id)
    const start = curated?.short ?? curated?.label ?? m.draftLabel
    if (start && start !== item.label) {
      item.label = start
      item.labelEdited = true
    }
    d.items.push(item)
    currentId.value = id
    return 'added'
  }
  /** The label is the span of its sentence (trimming re-attaches a typed label to the text). */
  function setLabelSpan(id: string, span: { start: number; end: number }) {
    const it = draft.value?.items.find((i) => i.id === id)
    if (!it) return
    it.labelEdited = false
    setSpan(it, span)
  }
  /** Typing a title: one undo step per field session (`begin` on focus), not per keystroke. */
  function setTitle(id: string, title: string) {
    const it = draft.value?.items.find((i) => i.id === id)
    if (!it) return
    it.label = title
    it.labelEdited = true
  }
  function setImage(id: string, image: EventImage | undefined) {
    const it = draft.value?.items.find((i) => i.id === id)
    if (!it) return
    begin()
    if (image) it.image = { ...image }
    else delete it.image
  }
  function remove(id: string) {
    const d = draft.value
    if (!d) return
    begin()
    d.items = d.items.filter((i) => i.id !== id)
    if (currentId.value === id) currentId.value = null
  }
  function undo() {
    const s = undoStack.value.pop()
    if (s && draft.value) {
      draft.value.items = JSON.parse(s)
      if (currentId.value && !draft.value.items.some((i) => i.id === currentId.value)) currentId.value = null
    }
  }
  function close() {
    draft.value = null
    ve.value = false
    currentId.value = null
    undoStack.value = []
  }
  /** Done: the draft becomes the saved timeline (an emptied timeline is removed). */
  function done() {
    const d = draft.value
    if (!d) return close()
    if (d.items.length) place(clone(d.items))
    else {
      store.state.visuals = store.state.visuals.filter((v) => v.id !== key.value)
      // Remember the article's timeline was removed on purpose (no reseed).
      if (!store.state.visuals.some((v) => v.id === `${key.value}:none`))
        store.state.visuals.push({ id: `${key.value}:none`, visual: { form: 'timeline', title: '', caption: '', sets: [{ label: '', items: [] }], options: {} }, placement: { kind: 'sectionTop', sectionId: 'Lead', sectionTitle: 'Lead' } })
    }
    if (d.items.length) store.state.visuals = store.state.visuals.filter((v) => v.id !== `${key.value}:none`)
    close()
  }
  /** Cancel: the saved version is untouched. */
  const cancel = close
  /** Prototype menu: back to the article's curated starting set. */
  function reset() {
    store.state.visuals = store.state.visuals.filter((v) => v.id !== key.value && v.id !== `${key.value}:none`)
    close()
    seed()
  }

  return {
    ve,
    draft,
    editing,
    items,
    events,
    savedItems,
    currentId,
    current,
    canUndo,
    begin,
    startEdit,
    startNew,
    toggle,
    setLabelSpan,
    setTitle,
    setImage,
    remove,
    undo,
    done,
    cancel,
    reset,
  }
}

export type Authoring = ReturnType<typeof useAuthoredTimeline>
