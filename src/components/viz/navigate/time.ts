/**
 * Time for navigation: the intervals, kinds and periods the five navigators
 * need, on top of the existing date model (../model/dates.ts). Nothing here
 * invents a date: an interval is exactly what the date says, and what is
 * approximate stays marked as approximate.
 *
 * Years are numbers on one line: 1929 is 1929 CE; -500 is 500 BCE (there is
 * no year 0 in the labels, so arithmetic across the era boundary is off by
 * one year, which the axis never needs to resolve).
 */
import { dateYears, formatDate, isDecade, toYears } from '../model/dates'
import type { TimelineDate } from '../model/types'

/** What kind of time a date is, which decides how it is drawn. */
export type TimeKind =
  /** One moment at the date's precision (a year, a month, a day). */
  | 'point'
  /** A duration the text states: "from 1969 to 1973", "1994–1996". */
  | 'span'
  /** Uncertainty about when: "the 1970s", "around 1631", "the 3rd century". */
  | 'approximate'

export const isCentury = (d: TimelineDate) =>
  !!d.end &&
  d.precision === 'year' &&
  ((d.start.y > 0 && d.start.y % 100 === 1 && d.end.y === d.start.y + 99) ||
    (d.start.y < 0 && d.start.y % 100 === 0 && d.end.y === d.start.y + 99))

export function timeKind(d: TimelineDate): TimeKind {
  if (d.circa || isDecade(d) || isCentury(d)) return 'approximate'
  if (d.end) return 'span'
  return 'point'
}

/** Half-open interval [start, end) in decimal years: exactly the period the date names. */
export function interval(d: TimelineDate): [number, number] {
  const start = toYears(d.start)
  if (isDecade(d)) {
    // "the early/mid/late 1990s": the part of the decade the text names.
    const y = d.start.y
    if (d.qualifier === 'early') return [y, y + 4]
    if (d.qualifier === 'mid') return [y + 3, y + 7]
    if (d.qualifier === 'late') return [y + 6, y + 10]
    return [y, y + 10]
  }
  const endOf = (p: { y: number; m?: number; d?: number }, precision: TimelineDate['precision']) => {
    if (precision === 'day' && p.m && p.d) return toYears(p) + 1 / 365
    if (precision !== 'year' && p.m) return toYears({ y: p.y, m: p.m }) + 1 / 12
    return p.y + 1
  }
  if (d.end) return [start, endOf(d.end, d.precision)]
  return [start, endOf(d.start, d.precision)]
}

/** Intervals overlap: a range matches a period when any part of it falls inside. */
export const overlaps = (a: [number, number], b: [number, number]) => a[0] < b[1] && b[0] < a[1]

export const midpoint = (d: TimelineDate) => dateYears(d)

// ── Labels ────────────────────────────────────────────────────────────────

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

/** A year for display: "500 BCE" for negatives; "CE" only when the set needs it. */
export function yearLabel(y: number, era = false): string {
  if (y < 0) return `${-y} BCE`
  return era ? `${y} CE` : String(y)
}

/**
 * The date as the article put it (the existing formatter), with centuries
 * and BCE years, which the formatter does not name.
 */
export function formatWhen(d: TimelineDate, era = false): string {
  const c = d.circa ? 'c. ' : ''
  if (isCentury(d)) {
    const n = d.start.y > 0 ? Math.ceil(d.start.y / 100) : Math.ceil(-d.start.y / 100)
    return `${c}${ordinal(n)} century${d.start.y < 0 ? ' BCE' : era ? ' CE' : ''}`
  }
  if (d.start.y < 0 || (d.end && d.end.y < 0)) {
    const s = yearLabel(d.start.y)
    if (!d.end) return c + s
    const e = yearLabel(d.end.y)
    return `${c}${s} – ${e}`
  }
  const out = formatDate(d)
  return era ? `${out} CE` : out
}

/** "Approximate" / "Duration" in words, for screen readers and legends. */
export function kindPhrase(d: TimelineDate): string {
  const k = timeKind(d)
  if (k === 'approximate') return 'approximate date'
  if (k === 'span') return 'duration'
  return ''
}

// ── Periods ───────────────────────────────────────────────────────────────

export interface Period {
  id: string
  label: string
  /** [start, end) in decimal years. */
  range: [number, number]
}

/** Neutral calendar periods: decades for a lifetime, centuries for a city, millennia beyond. */
export function periodSize(min: number, max: number): 10 | 100 | 1000 {
  const span = max - min
  if (span <= 160) return 10
  if (span <= 1600) return 100
  return 1000
}

export function periodOf(year: number, size: 10 | 100 | 1000, era = false): Period {
  const floor = Math.floor(year / size) * size
  if (size === 10) {
    const label = floor < 0 ? `${-floor - 9}s BCE` : `${floor}s`
    return { id: `p${floor}`, label, range: [floor, floor + 10] }
  }
  if (size === 100) {
    // Calendar centuries by convention: "the 14th century" = 1301–1400; floor(1350/100)=13 → 14th.
    const n = floor >= 0 ? floor / 100 + 1 : -floor / 100
    const label = `${ordinal(n)} century${floor < 0 ? ' BCE' : era ? ' CE' : ''}`
    return { id: `p${floor}`, label, range: [floor, floor + 100] }
  }
  const n = floor >= 0 ? floor / 1000 + 1 : -floor / 1000
  return {
    id: `p${floor}`,
    label: `${ordinal(n)} millennium${floor < 0 ? ' BCE' : ''}`,
    range: [floor, floor + 1000],
  }
}

/** Every period between the first and last event, including empty ones. */
export function periodsBetween(min: number, max: number, era = false): Period[] {
  const size = periodSize(min, max)
  const out: Period[] = []
  for (let y = Math.floor(min / size) * size; y < max; y += size) out.push(periodOf(y, size, era))
  return out
}

// ── Axis ──────────────────────────────────────────────────────────────────

/** A tick step that gives at most `max` labelled ticks. */
export function tickStep(span: number, max: number): number {
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000]
  return steps.find((s) => span / s <= max) ?? 10000
}

export function ticks(min: number, max: number, maxTicks: number): number[] {
  const step = tickStep(max - min, maxTicks)
  const out: number[] = []
  for (let y = Math.ceil(min / step) * step; y <= max; y += step) out.push(y)
  return out
}

/** The axis domain for a set of events: their full extent, rounded out to a tick step. */
export function domainOf(intervals: [number, number][]): [number, number] {
  const a = Math.min(...intervals.map((i) => i[0]))
  const b = Math.max(...intervals.map((i) => i[1]))
  const step = tickStep(b - a, 10) / 2
  return [Math.floor(a / step) * step, Math.ceil(b / step) * step]
}

/** x position of a year on a track `width` px wide (same padding as RulerTrack/RulerAxis). */
export function xOf(y: number, domain: [number, number], width: number, pad = 12): number {
  const [a, b] = domain
  return pad + ((y - a) / (b - a || 1)) * Math.max(1, width - 2 * pad)
}
