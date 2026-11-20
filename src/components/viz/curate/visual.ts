/**
 * A picked table → a Visual draft: roles proposed by the rules, parties read
 * from the rows, the same table found in the earlier elections' articles.
 * Re-applying roles (the editor changed one) keeps the editor's order and labels.
 */
import type { LoadedArticle } from '../host/loadArticle'
import type { ColumnRole, Party, VisualForm, VisualSpec } from '../model/types'
import { proposeRoles, type ParsedTable } from '../pick/tables'
import { buildParties, electionMeta, matchTable } from './fromTable'

export const emptySpec = (): VisualSpec => ({
  tableId: null,
  headers: [],
  roles: [],
  form: null,
  measure: 'seats',
  years: false,
  minSeats: 1,
  minShare: 1,
  election: { name: '', date: '' },
  previous: [],
})

const yearIn = (s: string) => s.match(/\d{4}/)?.[0] ?? ''

export function tableOf(article: LoadedArticle, id: string | null): ParsedTable | null {
  return article.tables.find((t) => t.id === id)?.value ?? null
}

/** The forms these roles allow, best first. */
export function formsFor(
  roles: ColumnRole[],
  hasPrevious: boolean,
): { form: VisualForm; years: boolean }[] {
  const has = (r: ColumnRole) => roles.includes(r)
  if (!has('category')) return []
  const out: { form: VisualForm; years: boolean }[] = []
  if (has('seats')) out.push({ form: 'seats', years: false })
  if (has('seats') && hasPrevious) out.push({ form: 'seats', years: true })
  if (has('seats') || has('share')) out.push({ form: 'bars', years: false })
  return out
}

/** Build (or rebuild) the draft's parties and spec from a table and roles. */
export function applyTable(
  article: LoadedArticle,
  table: ParsedTable,
  roles: ColumnRole[] | null,
  prev: { items: Party[]; spec: VisualSpec } | null,
): { items: Party[]; spec: VisualSpec } {
  const info = article.infobox
  const r = roles ?? proposeRoles(table, info.chamberSize).map((p) => p.role)
  const year = yearIn(info.date) || 'now'
  let items = buildParties(table, r, info, year, article.seating)

  const previous = article.previous.flatMap((rel) => {
    const m = matchTable(rel.tables, table.headers, r, rel.infobox.chamberSize)
    if (!m) return []
    const parties = buildParties(
      m.table,
      m.roles,
      rel.infobox,
      yearIn(rel.infobox.date),
      rel.seating,
    )
    return parties.length
      ? [{ election: electionMeta(rel.infobox, m.table, m.roles, rel.seating), parties }]
      : []
  })

  // Parties with no seats now sit where the earlier elections' diagrams seated them.
  if (article.seating) items = seatFromEarlier(items, previous)

  // Keep the editor's order and short names when only the roles changed.
  if (prev && prev.spec.tableId === table.id && prev.items.length) {
    const rank = new Map(prev.items.map((p, i) => [p.key, i]))
    const label = new Map(prev.items.map((p) => [p.key, p.label]))
    items = items
      .map((p) => ({
        ...p,
        label: label.get(p.key) ?? p.label,
        shortName: label.get(p.key) ?? p.shortName,
      }))
      .sort((a, b) => (rank.get(a.key) ?? 1e9) - (rank.get(b.key) ?? 1e9))
  }

  const base = prev?.spec.tableId === table.id ? prev.spec : emptySpec()
  const forms = formsFor(r, previous.length > 0)
  const keep = forms.find((f) => f.form === base.form && f.years === base.years)
  const choice = keep ?? forms[0] ?? null
  const spec: VisualSpec = {
    ...base,
    tableId: table.id,
    headers: [...table.headers],
    roles: r,
    form: choice?.form ?? null,
    years: choice?.years ?? false,
    measure: r.includes('seats') ? base.measure : 'share',
    election: electionMeta(info, table, r, article.seating),
    orderFrom: article.seating ? 'diagram' : 'table',
    previous,
  }
  return { items, spec }
}

const sameParty = (a: Party, b: Party) => a.key === b.key || a.name === b.name

/**
 * The default order is the article's own diagram, which only seats parties
 * that won seats this time. A party with no seats now (FDP in 2025) is placed
 * where the most recent earlier diagram seated it: before the first party that
 * followed it there and is already placed. So one order serves every year.
 */
export function seatFromEarlier(items: Party[], previous: { parties: Party[] }[]): Party[] {
  const out = [...items]
  const placed = new Set(out.filter((p) => (p.seats ?? 0) > 0).map((p) => p.key))
  for (const p of items) {
    if (placed.has(p.key)) continue
    for (const e of previous) {
      // Earlier parties are in their own diagram's order; seated ones first.
      const seated = e.parties.filter((x) => (x.seats ?? 0) > 0)
      const at = seated.findIndex((x) => sameParty(x, p))
      if (at === -1) continue
      const next = seated
        .slice(at + 1)
        .map((x) => out.find((q) => sameParty(q, x) && placed.has(q.key)))
        .find(Boolean)
      out.splice(out.indexOf(p), 1)
      out.splice(next ? out.indexOf(next) : out.filter((q) => placed.has(q.key)).length, 0, p)
      placed.add(p.key)
      break
    }
  }
  return out
}
