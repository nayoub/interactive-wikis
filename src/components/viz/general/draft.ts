/**
 * The general tool's draft: what is picked, and the visual it makes. Plain
 * functions over plain data; none names a form (forms come from rules.ts).
 */
import type { LoadedArticle } from '../host/loadArticle'
import type { Placement } from '../model/types'
import type { Item, Visual } from '../model/visual'
import type { ParsedTable } from '../pick/tables'
import {
  itemFromDate,
  itemFromMarker,
  itemFromPlace,
  itemsFromTable,
  proposeGeneralRoles,
  type GeneralRole,
} from '../pick/toItems'
import { defaultsOf, FORMS } from './forms'
import { formsFor } from './rules'

export type PickFilter = 'all' | 'date' | 'place' | 'table' | 'image'

export interface VisualDraft {
  visual: Visual
  /** The picked table and the editor's column roles. */
  tableId: string | null
  roles: GeneralRole[]
  /** The picked image (an annotated image). */
  imageId: string | null
  /** The compared article (Compare operator), by title. */
  compareWith: string | null
  /** What pick mode lights up. */
  filter: PickFilter
  /** Re-editing a placed visual (its id), or inserting a new one. */
  editingId: string | null
}

export interface PlacedVisual {
  id: string
  visual: Visual
  placement: Placement
}

export const emptyDraft = (filter: PickFilter = 'all'): VisualDraft => ({
  visual: {
    form: 'timeline',
    title: '',
    caption: '',
    sets: [{ label: '', items: [] }],
    options: {},
  },
  tableId: null,
  roles: [],
  imageId: null,
  compareWith: null,
  filter,
  editingId: null,
})

export const itemsOf = (d: VisualDraft) => d.visual.sets[0].items

/** An item's name in the other languages the snapshot has (from Wikidata, at build time). */
export function withLabels(a: LoadedArticle, item: Item): Item {
  const l = item.wikidataId ? a.labels[item.wikidataId] : undefined
  return l ? { ...item, labels: { ...l } } : item
}

/** After any pick: keep the form if it still fits, else the first that does. */
export function refreshForm(d: VisualDraft) {
  const fits = formsFor(itemsOf(d))
  if (fits.length && !fits.includes(d.visual.form)) {
    d.visual.form = fits[0]
    d.visual.options = { ...defaultsOf(fits[0]), ...d.visual.options }
  }
  if (d.visual.sets.length > 1 && !FORMS[d.visual.form].compare)
    d.visual.sets = d.visual.sets.slice(0, 1)
}

/** The first thing picked sets the filter to its kind. */
function firstPick(d: VisualDraft, kind: PickFilter) {
  if (!itemsOf(d).length && d.filter === 'all') d.filter = kind
}

export function toggleMention(d: VisualDraft, a: LoadedArticle, id: string) {
  const items = itemsOf(d)
  const at = items.findIndex((i) => i.id === id)
  if (at !== -1) {
    items.splice(at, 1)
    return refreshForm(d)
  }
  // Dates and places mix (place + time); a table or an image starts over.
  if (d.tableId || d.imageId) clearPicks(d)
  const date = a.mentions.find((m) => m.id === id)
  const place = a.places.find((m) => m.id === id)
  firstPick(d, date ? 'date' : 'place')
  if (date) itemsOf(d).push(itemFromDate(date))
  else if (place) itemsOf(d).push(withLabels(a, itemFromPlace(place)))
  refreshForm(d)
}

export function clearPicks(d: VisualDraft) {
  d.visual.sets = [{ label: d.visual.sets[0].label, items: [] }]
  d.tableId = null
  d.roles = []
  d.imageId = null
  d.compareWith = null
}

export const tableOf = (a: LoadedArticle, id: string | null): ParsedTable | null =>
  a.tables.find((t) => t.id === id)?.value ?? null

export function pickTable(d: VisualDraft, a: LoadedArticle, id: string) {
  if (d.tableId === id) {
    clearPicks(d)
    return refreshForm(d)
  }
  const t = tableOf(a, id)
  if (!t) return
  firstPick(d, 'table')
  clearPicks(d)
  d.tableId = id
  d.roles = proposeGeneralRoles(t).map((r) => r.role)
  d.visual.sets[0].items = itemsFromTable(t, d.roles)
  d.visual.sets[0].label = a.source.title
  d.visual.title ||= t.caption || t.sectionTitle
  d.visual.sourceNote = `Data: the table in “${t.sectionTitle}”, ${a.source.title}.`
  refreshForm(d)
}

/** The editor changed a column's role: rebuild the items, keeping edited labels. */
export function setRole(d: VisualDraft, a: LoadedArticle, col: number, role: GeneralRole) {
  const t = tableOf(a, d.tableId)
  if (!t) return
  d.roles = d.roles.map((r, i) =>
    i === col ? role : r === role && role === 'category' ? 'ignore' : r,
  )
  const labels = new Map(itemsOf(d).map((i) => [i.id, i.label]))
  d.visual.sets[0].items = itemsFromTable(t, d.roles).map((i) => ({
    ...i,
    label: labels.get(i.id) ?? i.label,
  }))
  if (d.compareWith) setCompare(d, a, d.compareWith)
  refreshForm(d)
}

export function pickImage(d: VisualDraft, a: LoadedArticle, id: string) {
  if (d.imageId === id) {
    clearPicks(d)
    return refreshForm(d)
  }
  firstPick(d, 'image')
  clearPicks(d)
  d.imageId = id
  const img = a.images.find((i) => i.id === id)
  d.visual.title ||= img?.caption.split(/[.,;]/)[0] ?? ''
  d.visual.sourceNote = 'Points placed by the editor.'
  refreshForm(d)
}

export function addMarker(d: VisualDraft, a: LoadedArticle, x: number, y: number) {
  const img = a.images.find((i) => i.id === d.imageId)
  if (!img) return
  itemsOf(d).push(itemFromMarker(img, x, y, itemsOf(d).length + 1))
  refreshForm(d)
}

/** Header text without punctuation, for finding the same table in another article. */
const norm = (h: string) => h.toLowerCase().replace(/[^a-z%]/g, '')

/**
 * Compare: the same table in a comparable article (the table whose headers
 * match), read with the same roles, as a second set.
 */
export function setCompare(d: VisualDraft, a: LoadedArticle, title: string | null) {
  d.compareWith = title
  if (!title) {
    d.visual.sets = d.visual.sets.slice(0, 1)
    return
  }
  const here = tableOf(a, d.tableId)
  const other = a.compare.find((c) => c.title === title)
  if (!here || !other) return
  const want = here.headers.map(norm).join('|')
  const match = other.tables.find((t) => t.headers.map(norm).join('|') === want)
  if (!match) {
    d.visual.sets = d.visual.sets.slice(0, 1)
    return
  }
  const items: Item[] = itemsFromTable(match, d.roles).map((i) => ({
    ...i,
    id: `${title}:${i.id}`,
    // Not in this article: no "Show in article" for the compared set.
    source: { ...i.source, anchor: undefined, text: `${title}: ${i.source.text}` },
  }))
  d.visual.sets = [d.visual.sets[0], { label: title, items }]
  d.visual.sourceNote = `Data: the tables in “${here.sectionTitle}” of ${a.source.title} and of ${title}.`
}
