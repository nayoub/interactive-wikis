/**
 * Suggestion cards: what a section could have, from counts over the
 * snapshot. No model.
 *
 *   Timeline  at least six dated sentences (prose, not lists) in the section
 *   Map       at least five distinct linked places with coordinates. Which count
 *             depends on the subject (its infobox type): for a place, those within
 *             about 50 km of it (not its flight destinations); for a person, an
 *             organisation or a work, every one.
 *   Tables and sentences that tell a quantity over time get their own chips
 *   (InlineChips), outside this ranking.
 *   Never     an annotated image; the lead (no heading to sit by); a kind
 *             already made in that section; a dismissed one
 *
 * At most one per section and three per article, ranked by how much of the
 * section's text the visual would draw on (the dated sentences, the
 * sentences naming the places, the table's cells, over the section's length);
 * ties: timeline, map, table.
 * Dismissals and their reasons are kept in local storage.
 */
import type { LoadedArticle } from '../host/loadArticle'
import { proposeGeneralRoles } from '../pick/toItems'
import type { PickFilter, PlacedVisual } from './draft'

/** A suggestion attached to its source (a table, a sentence): see InlineChips.vue. */
export interface InlineChip {
  id: string
  label: string
  /** The element it is attached to. */
  anchor: HTMLElement
}

/**
 * The sources that get a chip of their own (not ranked, not counted toward
 * the three cards):
 *   Table     a data table with a time or category column and a number column
 *             → "Show as a figure"
 *   Sentence  "from 11,000 in 1880 to 80,000 in 1900": two or more number–year
 *             pairs in one prose sentence → "Show as a chart" (a line)
 * Never one already made into a visual, or dismissed.
 */
export function chipSources(
  a: LoadedArticle,
  visuals: PlacedVisual[],
  gone: Record<string, unknown>,
): { id: string; kind: 'table' | 'series'; ref: string; label: string }[] {
  const out: { id: string; kind: 'table' | 'series'; ref: string; label: string }[] = []
  const usedTables = new Set(visuals.map((v) => v.pick?.tableId).filter(Boolean))
  const usedSeries = new Set(visuals.map((v) => v.pick?.seriesId).filter(Boolean))
  for (const tm of a.tables) {
    const id = `table:${tm.id}`
    if (gone[id] || usedTables.has(tm.id)) continue
    const roles = proposeGeneralRoles(tm.value).map((r) => r.role)
    const hasKey = roles.includes('time') || roles.includes('category')
    const hasNumber = roles.includes('quantity') || roles.filter((r) => r === 'time').length > 1
    if (hasKey && hasNumber) out.push({ id, kind: 'table', ref: tm.id, label: 'Show as a figure' })
  }
  for (const s of a.series) {
    const id = `series:${s.id}`
    if (gone[id] || s.inList || usedSeries.has(s.id)) continue
    out.push({ id, kind: 'series', ref: s.id, label: 'Show as a chart' })
  }
  return out
}

export interface Card {
  id: string
  kind: 'date' | 'place'
  section: { id: string; title: string }
  title: string
  evidence: string
  why: string
  score: number
}

const ORDER: Card['kind'][] = ['date', 'place']
const KEY = 'protowiki-visual:dismissed'

export const DISMISS_REASONS = [
  { value: 'not-useful', label: 'Not useful here' },
  { value: 'covered', label: 'Already covered in the article' },
  { value: 'wrong', label: 'The suggestion is wrong' },
  { value: 'other', label: 'Other' },
] as const

export function dismissed(): Record<string, { reason: string; at: string }> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}')
  } catch {
    return {}
  }
}
export function dismiss(id: string, reason: string) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ ...dismissed(), [id]: { reason, at: new Date().toISOString() } }),
    )
  } catch {
    /* private mode */
  }
}
export function resetDismissed() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

export function cards(
  a: LoadedArticle,
  placed: PlacedVisual[],
  gone: Record<string, unknown>,
): Card[] {
  const top = (sectionId: string) => a.topSection[sectionId] ?? { id: sectionId, title: sectionId }
  const per = new Map<string, Card[]>()
  const add = (c: Card) => {
    if (gone[c.id] || c.section.id === 'Lead') return
    if (placed.some((v) => v.pick?.scope === c.section.id && v.pick?.kind === c.kind)) return
    if (!per.has(c.section.id)) per.set(c.section.id, [])
    per.get(c.section.id)!.push(c)
  }
  const len = (id: string) => Math.max(1, a.sectionLength[id] ?? 1)
  const share = (sentences: Set<string>, id: string) =>
    [...sentences].reduce((n, x) => n + x.length, 0) / len(id)

  // Timeline: dated prose sentences.
  const dated = new Map<string, Set<string>>()
  for (const m of a.mentions) {
    if (m.inList) continue
    const s = top(m.anchor.sectionId)
    if (!dated.has(s.id)) dated.set(s.id, new Set())
    dated.get(s.id)!.add(m.sentence)
  }
  for (const [id, set] of dated) {
    if (set.size < 6) continue
    const section = top(id)
    add({
      id: `date:${id}`,
      kind: 'date',
      section,
      title: 'Add a timeline',
      evidence: `${set.size} dated events in this section`,
      why: 'Suggested because this section has six or more sentences with a date in them; a timeline shows them in order.',
      score: share(set, id),
    })
  }

  // Map: distinct linked places with coordinates.
  const places = new Map<string, Set<string>>()
  const placeSentences = new Map<string, Set<string>>()
  const median = (xs: number[]) => [...xs].sort((x, y) => x - y)[Math.floor(xs.length / 2)] ?? 0
  const pts = a.places.filter((p) => p.value.kind !== 'region')
  const near = a.subject.kind === 'place'
  const lat = a.subject.coords?.lat ?? median(pts.map((p) => p.value.coordinates.lat))
  const lon = a.subject.coords?.lon ?? median(pts.map((p) => p.value.coordinates.lon))
  for (const p of pts) {
    if (near && Math.hypot(p.value.coordinates.lat - lat, p.value.coordinates.lon - lon) > 0.5) continue
    const s = top(p.anchor.sectionId)
    if (!places.has(s.id)) places.set(s.id, new Set())
    places.get(s.id)!.add(p.value.wikidataId)
    if (!placeSentences.has(s.id)) placeSentences.set(s.id, new Set())
    placeSentences.get(s.id)!.add(p.sentence)
  }
  for (const [id, set] of places) {
    if (set.size < 5) continue
    add({
      id: `place:${id}`,
      kind: 'place',
      section: top(id),
      title: 'Add a map',
      evidence: `${set.size} places with coordinates in this section`,
      why: 'Suggested because this section links five or more places that have coordinates on Wikidata.',
      score: share(placeSentences.get(id) ?? new Set(), id),
    })
  }

  // One per section: most material, then timeline, map, table. Three in all.
  const best = [...per.values()].map(
    (list) =>
      list.sort((x, y) => y.score - x.score || ORDER.indexOf(x.kind) - ORDER.indexOf(y.kind))[0],
  )
  return best
    .sort((x, y) => y.score - x.score || ORDER.indexOf(x.kind) - ORDER.indexOf(y.kind))
    .slice(0, 3)
}
