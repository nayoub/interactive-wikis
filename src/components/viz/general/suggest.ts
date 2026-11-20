/**
 * "Suggested visuals": what this article could have, from simple counts over
 * the snapshot and table detection. No model. Each suggestion opens pick mode
 * with its filter set and its things preselected.
 *
 *   - Timeline: dated sentences in the largest dated section group (History)
 *   - Map: distinct places (sites and settlements) in the section group with most
 *   - A chart per data table whose columns give a form
 *   - Annotated image: when the article has images
 */
import type { LoadedArticle } from '../host/loadArticle'
import { itemsFromTable, proposeGeneralRoles } from '../pick/toItems'
import { emptyDraft, pickTable, refreshForm, withLabels, type VisualDraft } from './draft'
import { formsFor } from './rules'
import { itemFromDate, itemFromPlace } from '../pick/toItems'

export interface Suggestion {
  id: string
  label: string
  build: () => VisualDraft
}

/** Each section's top-level (h2) section (from the article's own nesting). */
const groups = (a: LoadedArticle) => (sectionId: string) =>
  a.topSection[sectionId] ?? { id: sectionId, title: sectionId }

/** The group with the most of something. */
function busiest<T>(list: T[], group: (t: T) => { id: string; title: string }) {
  const count = new Map<string, { title: string; items: T[] }>()
  for (const t of list) {
    const g = group(t)
    if (!count.has(g.id)) count.set(g.id, { title: g.title, items: [] })
    count.get(g.id)!.items.push(t)
  }
  return [...count.values()].sort((x, y) => y.items.length - x.items.length)[0]
}

/**
 * A table's name for a suggestion: its caption when it has one (else its
 * section); a climate-style caption is cut before "data for"; a long table of
 * times reads "Population over time".
 */
function chartName(
  t: { caption: string; sectionTitle: string },
  measure: string,
  wide: boolean,
  overTime: boolean,
) {
  const titled = /[A-Za-z]{3}/.test(t.caption) ? t.caption : t.sectionTitle
  if (wide) return titled.split(/\s+data\s+for\b/i)[0].trim() || titled
  return overTime ? `${measure} over time` : titled
}

export function suggestions(a: LoadedArticle): Suggestion[] {
  const out: Suggestion[] = []
  const groupOf = groups(a)

  // Timeline: one date per sentence, in the section group with most of them.
  const seen = new Set<string>()
  // Prose only: a list of people with birth years is not a history.
  const perSentence = a.mentions.filter((m) => {
    if (m.inList || seen.has(m.sentence)) return false
    seen.add(m.sentence)
    return true
  })
  const dated = busiest(perSentence, (m) => groupOf(m.anchor.sectionId))
  if (dated && dated.items.length >= 3)
    out.push({
      id: 'timeline',
      label: `Timeline, from ${dated.items.length} dated sentences in “${dated.title}”`,
      build: () => {
        const d = emptyDraft('date')
        d.visual.title = dated.title
        d.visual.sets[0].items = dated.items.map(itemFromDate)
        refreshForm(d)
        return d
      },
    })

  // Map: distinct places (by Wikidata item) near the article's places' median (within about
  // 50 km: a city's sights, not its flight destinations), in the section group with most of them.
  const byItem = new Map<string, (typeof a.places)[number]>()
  for (const p of a.places)
    if (p.value.kind !== 'region' && !byItem.has(p.value.wikidataId))
      byItem.set(p.value.wikidataId, p)
  const median = (xs: number[]) => [...xs].sort((x, y) => x - y)[Math.floor(xs.length / 2)] ?? 0
  const all = [...byItem.values()]
  const lat = median(all.map((p) => p.value.coordinates.lat))
  const lon = median(all.map((p) => p.value.coordinates.lon))
  const near = all.filter(
    (p) => Math.hypot(p.value.coordinates.lat - lat, p.value.coordinates.lon - lon) < 0.5,
  )
  const placed = busiest(near, (p) => groupOf(p.anchor.sectionId))
  if (placed && placed.items.length >= 3)
    out.push({
      id: 'map',
      label: `Map, from ${placed.items.length} places in “${placed.title}”`,
      build: () => {
        const d = emptyDraft('place')
        d.visual.title = `Places in “${placed.title}”`
        d.visual.sets[0].items = placed.items.map((p) => withLabels(a, itemFromPlace(p)))
        d.visual.form = 'map'
        refreshForm(d)
        return d
      },
    })

  // A chart per table that some form fits.
  for (const tm of a.tables) {
    const t = tm.value
    const roles = proposeGeneralRoles(t).map((r) => r.role)
    const items = itemsFromTable(t, roles)
    const fits = formsFor(items)
    if (!fits.length || items.length < 3) continue
    const wide = roles.filter((r) => r === 'time').length > 1
    const measure = items[0].components.quantity?.measure ?? 'Values'
    const overTime = !!items[0].components.time && !items[0].components.category
    const name = chartName(t, measure, wide, overTime)
    const kind = (/[A-Za-z]{3}/.test(t.caption) ? t.caption : t.sectionTitle).split(
      /\s+(?:data|for|by|of)\b/i,
    )[0]
    const what = `the ${kind.toLowerCase()} table`
    out.push({
      id: `table-${t.id}`,
      label: `${name}, from ${what}`,
      build: () => {
        const d = emptyDraft('table')
        pickTable(d, a, t.id)
        d.visual.title = name
        return d
      },
    })
  }

  // Annotated image: there are images to annotate.
  const images = a.images.filter((i) => i.source === 'article')
  if (images.length)
    out.push({
      id: 'image',
      label: `Annotated image, from ${images.length} images`,
      build: () => emptyDraft('image'),
    })
  return out
}
