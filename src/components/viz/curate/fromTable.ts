/**
 * A picked table becomes curated parties: the machine's draft, from the
 * editor's column roles. Every figure is read from the table; nothing is
 * computed except sums used to recognise columns.
 *
 *   - order: the article's own parliament diagram, left to right (a half
 *     circle implies real seating), matched by colour, then name, then seats;
 *     without a diagram, the results table's order. No left–right political
 *     order is inferred.
 *   - short name: the infobox's link text for the same link; else a
 *     combined infobox entry ("CDU/CSU") split by initials; else the infobox
 *     entry with the same seats won (a renamed article: "Die Linke" →
 *     The_Left_(Germany)); else the name
 *   - colour: the row's colour cell (Template:Party color in the table)
 */
import type { ColumnRole, ElectionMeta, Party, Seating } from '../model/types'
import {
  parseNumber,
  partyRows,
  proposeRoles,
  type InfoboxElection,
  type ParsedTable,
} from '../pick/tables'

const SMALL = new Set(['of', 'the', 'and', 'for', 'in', 'de', 'der', 'die', 'für'])
/** "Christian Democratic Union" → "CDU". */
export const initials = (name: string) =>
  name
    .split(/[\s-]+/)
    .filter((w) => w && !SMALL.has(w.toLowerCase()) && /^\p{Lu}/u.test(w))
    .map((w) => w[0])
    .join('')

export function buildParties(
  table: ParsedTable,
  roles: ColumnRole[],
  infobox: InfoboxElection,
  year: string,
  seating?: Seating,
): Party[] {
  const col = (r: ColumnRole) => roles.indexOf(r)
  const cat = col('category')
  if (cat === -1) return []
  const num = (texts: string[], r: ColumnRole) => {
    const c = col(r)
    if (c === -1) return undefined
    const v = parseNumber(texts[c] ?? '')
    return v === null ? undefined : v
  }

  const rows = partyRows(table, cat)
  const parties: Party[] = rows.map((row, i) => {
    const name = row.texts[cat]
    const key = row.linkTitle ?? name
    const rowId = row.el.dataset.tlId ?? `${table.id}-r${i}`
    return {
      id: `${year}:${key}`,
      name,
      shortName: name,
      label: name,
      seats: num(row.texts, 'seats'),
      votes: num(row.texts, 'votes'),
      voteShare: num(row.texts, 'share'),
      change: num(row.texts, 'change'),
      color: row.color,
      colorSource: row.color
        ? `Results table colour cell (Template:Party color), ${year} article`
        : undefined,
      key,
      sourceText: row.texts.filter(Boolean).join(' · '),
      sourceDateText: name,
      sourceAnchor: {
        sectionId: table.sectionId,
        sectionTitle: table.sectionTitle,
        mentionId: rowId,
        sentenceStart: 0,
        sentenceEnd: 0,
      },
    }
  })

  // Short names from the infobox.
  const slot = new Map<string, number>()
  infobox.order.forEach((o, i) => {
    const byLink = parties.find((p) => p.key === o.linkTitle)
    if (byLink) {
      byLink.shortName = o.shortName
      slot.set(byLink.id, i)
      return
    }
    // A combined entry ("CDU/CSU"): each part matched by the initials of a party's name.
    const parts = o.shortName.split('/').map((s) => s.trim())
    if (parts.length > 1) {
      parts.forEach((part, k) => {
        const p = parties.find((x) => initials(x.name) === part && !slot.has(x.id))
        if (p) {
          p.shortName = part
          slot.set(p.id, i + k / 10)
        }
      })
      return
    }
    // The link differs (a renamed or redirected article): the one party with the same seats won.
    if (o.seats !== undefined) {
      const same = parties.filter((x) => !slot.has(x.id) && x.seats === o.seats)
      if (same.length === 1) {
        same[0].shortName = o.shortName
        slot.set(same[0].id, i)
      }
    }
  })
  for (const p of parties) {
    if (p.shortName === p.name && p.name.length > 14) p.shortName = initials(p.name) || p.name
    p.label = p.shortName
  }
  if (!seating) return parties // the table's order
  const rank = seatingRanks(parties, seating)
  const tableIndex = new Map(parties.map((p, i) => [p.id, i]))
  // Parties in the diagram, left to right; the rest (no seats) after, in table order.
  return [...parties].sort(
    (a, b) =>
      (rank.get(a.id) ?? 1e6 + tableIndex.get(a.id)!) -
      (rank.get(b.id) ?? 1e6 + tableIndex.get(b.id)!),
  )
}

const hex = (c?: string) => {
  const h = c
    ?.trim()
    .toLowerCase()
    .match(/^#([0-9a-f]{3}|[0-9a-f]{6})/)?.[1]
  return h ? (h.length === 3 ? [...h].map((x) => x + x).join('') : h) : ''
}
const word = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')

/** Each diagram group's party: same colour, else same name, else the one party with the same seats. */
export function seatingRanks(parties: Party[], seating: Seating): Map<string, number> {
  const rank = new Map<string, number>()
  const free = (p: Party) => !rank.has(p.id) && (p.seats ?? 0) > 0
  seating.parties.forEach((g, i) => {
    const byColour = parties.filter((p) => free(p) && hex(p.color) && hex(p.color) === hex(g.color))
    const label = word(g.label)
    const byName = parties.filter(
      (p) =>
        free(p) &&
        [p.shortName, initials(p.name), p.name].some((n) => {
          const w = word(n)
          return w === label || (label.length > 3 && w.includes(label))
        }),
    )
    const bySeats = parties.filter((p) => free(p) && p.seats === g.seats)
    const p =
      (byColour.length === 1 && byColour[0]) ||
      (byName.length === 1 && byName[0]) ||
      (bySeats.length === 1 && bySeats[0]) ||
      null
    if (p) rank.set(p.id, i)
  })
  return rank
}

export function electionMeta(
  infobox: InfoboxElection,
  table: ParsedTable,
  roles: ColumnRole[],
  seating?: Seating,
): ElectionMeta {
  // Chamber size from the infobox; the table's Total row is the cross-check.
  const seatsCol = roles.indexOf('seats')
  const total = table.rows.find((r) => /^total$/i.test(r.texts.find(Boolean) ?? ''))
  const tableTotal =
    seatsCol >= 0 && total ? (parseNumber(total.texts[seatsCol]) ?? undefined) : undefined
  return {
    name: infobox.name,
    date: infobox.date,
    chamberSize: infobox.chamberSize ?? tableTotal,
    majority: infobox.majority,
    tableTotal,
    diagramFile: seating?.file,
    diagramTotal: seating?.total,
  }
}

/** Header text without punctuation or spacing, for matching columns across articles. */
const norm = (h: string) => h.toLowerCase().replace(/[^a-z%+]/g, '')

/**
 * The same results table in an earlier article: the table whose headers best
 * match the picked one's. Roles carry over by header; anything new is proposed by the rules.
 */
export function matchTable(
  tables: ParsedTable[],
  headers: string[],
  roles: ColumnRole[],
  chamberSize?: number,
): { table: ParsedTable; roles: ColumnRole[] } | null {
  const want = headers.map(norm)
  let best: ParsedTable | null = null
  let score = 0
  for (const t of tables) {
    const have = t.headers.map(norm)
    const s = have.filter((h, i) => h && h === want[i]).length
    if (s > score) {
      score = s
      best = t
    }
  }
  if (!best || score < Math.ceil(want.filter(Boolean).length / 2)) return null
  const proposed = proposeRoles(best, chamberSize).map((p) => p.role)
  // Same header in the same place carries its role; else the first unused column with that header.
  // (Merged headers repeat: "Party" over the colour cell and the name.)
  const taken = new Set<number>()
  const carried = best.headers.map((h, i) => {
    const n = norm(h)
    if (!n) return proposed[i]
    const j =
      want[i] === n && !taken.has(i) ? i : want.findIndex((w, k) => w === n && !taken.has(k))
    if (j === -1) return proposed[i]
    taken.add(j)
    return roles[j]
  })
  return { table: best, roles: carried }
}
