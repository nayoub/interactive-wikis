/** Formatting and arithmetic on the timeline's date model. Keeps what the text said. */
import type { PartialDate, Qualifier, TimelineDate, TimelineEvent } from './types'

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const QUALIFIER_LABEL: Record<Qualifier, string> = {
  early: 'Early',
  mid: 'Mid',
  late: 'Late',
  spring: 'Spring',
  summer: 'Summer',
  fall: 'Fall',
  winter: 'Winter',
}

function part(p: PartialDate, precision: TimelineDate['precision']): string {
  if (precision === 'day' && p.m && p.d) return `${MONTH_NAMES[p.m - 1]} ${p.d}, ${p.y}`
  if ((precision === 'day' || precision === 'month') && p.m) return `${MONTH_NAMES[p.m - 1]} ${p.y}`
  return String(p.y)
}

export const isDecade = (date: TimelineDate) =>
  !!date.end &&
  date.precision === 'year' &&
  date.start.y % 10 === 0 &&
  date.end.y === date.start.y + 9

/** The date as the text put it: "Fall 1956", "Late 2014", "the 1970s" → "1970s", "c. 1956". */
export function formatDate(date: TimelineDate): string {
  const c = date.circa ? 'c. ' : ''
  const q = date.qualifier ? QUALIFIER_LABEL[date.qualifier] + ' ' : ''
  const { start, end } = date
  if (isDecade(date)) return `${c}${q}${start.y}s`
  if (end) {
    if (date.precision === 'year') return `${c}${q}${start.y}–${end.y}`
    return `${c}${part(start, date.precision)} – ${part(end, date.precision)}`
  }
  return c + q + part(start, date.precision)
}

export function isoDate(date: TimelineDate): string {
  const p = date.start
  const pad = (n: number) => String(n).padStart(2, '0')
  if (date.precision === 'day' && p.m && p.d) return `${p.y}-${pad(p.m)}-${pad(p.d)}`
  if (date.precision !== 'year' && p.m) return `${p.y}-${pad(p.m)}`
  return String(p.y)
}

/** Decimal year of a partial date (missing month/day = start of the period). */
export function toYears(p: PartialDate): number {
  return p.y + ((p.m ?? 1) - 1) / 12 + ((p.d ?? 1) - 1) / 365
}

/** Month estimate (1–12) for a qualifier within a single year. */
const QUALIFIER_MONTH: Record<Qualifier, number> = {
  early: 2,
  mid: 6,
  late: 10,
  spring: 4,
  summer: 7,
  fall: 10,
  winter: 1,
}

/**
 * Best numeric estimate of when it happened, for placing on an axis and sorting.
 * Labels keep the original precision; only the position is estimated.
 */
export function dateYears(date: TimelineDate): number {
  const { start, qualifier } = date
  if (isDecade(date)) {
    const offset = qualifier === 'early' ? 2 : qualifier === 'late' ? 8 : 5 // unqualified: mid-decade
    return start.y + offset
  }
  if (qualifier && date.precision === 'year' && !date.end) {
    return start.y + (QUALIFIER_MONTH[qualifier] - 1) / 12
  }
  return toYears(start)
}

export function sortEvents(events: TimelineEvent[]): TimelineEvent[] {
  return [...events].sort((a, b) => dateYears(a.date) - dateYears(b.date))
}

export function sameDate(a: TimelineDate, b: TimelineDate): boolean {
  const s = (x: PartialDate) => `${x.y}-${x.m ?? ''}-${x.d ?? ''}`
  return (
    a.precision === b.precision &&
    s(a.start) === s(b.start) &&
    (a.end ? s(a.end) : '') === (b.end ? s(b.end) : '') &&
    (a.qualifier ?? '') === (b.qualifier ?? '')
  )
}

/**
 * Age at an event, as precisely as both dates allow: "aged 18", or "aged 17–18"
 * when the event's date is too coarse to tell whether the birthday had passed.
 * Null before the subject's first birthday.
 */
export function ageAt(birth: PartialDate, date: TimelineDate): string | null {
  const d = date.start
  const base = d.y - birth.y
  let lo = base - 1
  let hi = base
  if (birth.m && d.m && date.precision !== 'year') {
    if (d.m > birth.m) lo = hi
    else if (d.m < birth.m) hi = lo
    else if (birth.d && d.d && date.precision === 'day') {
      if (d.d >= birth.d) lo = hi
      else hi = lo
    }
  } else if (birth.m === 1 && (birth.d ?? 1) === 1) {
    lo = hi
  }
  if (hi < 1) return null
  lo = Math.max(lo, 0)
  return lo === hi ? `aged ${hi}` : `aged ${lo}–${hi}`
}
