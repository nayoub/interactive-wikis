/**
 * Election results as the reader sees them: the curated parties, in the
 * editor's order, for one election of the series. Every figure is a table
 * figure; the only arithmetic is the "Others" sum when the editor groups.
 */
import type { ElectionMeta, Party, VisualSpec } from './types'

export interface Bloc {
  key: string
  /** Short name (the editor's label). */
  label: string
  name: string
  seats: number
  voteShare?: number
  change?: number
  color?: string
  colorSource?: string
  /** The party this bloc is, in the shown election (for "Show in article"). */
  party?: Party
  /** "Others": the parties merged into it. */
  members?: Party[]
}

export interface Election {
  year: string
  election: ElectionMeta
  parties: Party[]
}

export const yearOf = (e: ElectionMeta) => e.date.match(/\d{4}/)?.[0] ?? e.name

/** The picked election and the earlier ones, oldest first. */
export function electionsOf(items: Party[], spec: VisualSpec): Election[] {
  const now = { year: yearOf(spec.election), election: spec.election, parties: items }
  const before = spec.previous.map((p) => ({
    year: yearOf(p.election),
    election: p.election,
    parties: p.parties,
  }))
  return [...before.reverse(), now]
}

const same = (a: Party, b: Party) =>
  a.key === b.key || a.name === b.name || (!!a.shortName && a.shortName === b.shortName)

/**
 * The curated order applied to one election: each curated party is found in
 * that election by its link (or name); parties the editor didn't list, and
 * those under the threshold, become "Others", always last.
 */
export function blocsFor(
  order: Party[],
  parties: Party[],
  spec: Pick<VisualSpec, 'minSeats' | 'minShare'>,
  measure: 'seats' | 'share',
): Bloc[] {
  const out: Bloc[] = []
  const others: Party[] = []
  const used = new Set<Party>()
  for (const curated of order) {
    const p = parties.find((x) => !used.has(x) && same(curated, x))
    if (!p) continue
    used.add(p)
    const under =
      measure === 'share' ? (p.voteShare ?? 0) < spec.minShare : (p.seats ?? 0) < spec.minSeats
    if (under) {
      others.push(p)
      continue
    }
    out.push({
      key: curated.key,
      label: curated.label || curated.shortName,
      name: curated.name,
      seats: p.seats ?? 0,
      voteShare: p.voteShare,
      change: p.change,
      color: curated.color ?? p.color,
      colorSource: curated.colorSource ?? p.colorSource,
      party: p,
    })
  }
  for (const p of parties) if (!used.has(p)) others.push(p)
  const seats = others.reduce((s, p) => s + (p.seats ?? 0), 0)
  const share = others.reduce((s, p) => s + (p.voteShare ?? 0), 0)
  if (others.length && (measure === 'share' ? share > 0 : seats > 0))
    out.push({
      key: 'others',
      label: 'Others',
      name: `Others (${others.length} ${others.length === 1 ? 'party' : 'parties'})`,
      seats,
      voteShare: Math.round(share * 10) / 10,
      members: others,
    })
  return out
}

/** Parties of the picked election that fall under the threshold (shown grouped in the editor). */
export function groupedOut(order: Party[], spec: VisualSpec, measure: 'seats' | 'share') {
  return order.filter((p) =>
    measure === 'share' ? (p.voteShare ?? 0) < spec.minShare : (p.seats ?? 0) < spec.minSeats,
  )
}

/**
 * Do the parties' seats add up to what the article states? Checked against the
 * infobox ("All N seats"), the results table's Total row and the parliament
 * diagram. Null when they agree; else a sentence naming every number.
 */
export function totalsIssue(e: ElectionMeta, parties: Party[]): string | null {
  const sum = parties.reduce((s, p) => s + (p.seats ?? 0), 0)
  if (!sum) return null
  const stated: [string, number | undefined][] = [
    ['the infobox', e.chamberSize],
    ['the results table’s total', e.tableTotal],
    ['the parliament diagram', e.diagramTotal],
  ]
  const off = stated.filter(([, n]) => n !== undefined && n !== sum)
  if (!off.length) return null
  const agree = stated.filter(([, n]) => n === sum).map(([w]) => w)
  return (
    `Party seats add up to ${sum}${agree.length ? ` (as ${agree.join(' and ')})` : ''}, ` +
    `but ${off.map(([w, n]) => `${w} shows ${n}`).join(' and ')}.`
  )
}
