/**
 * Plain, deterministic date extraction. No model, no network: regexes over the
 * clean text of each prose block, run once on the frozen snapshot.
 *
 * Recognised (longest match wins, no overlaps):
 *   - Full dates: "February 28, 1929", "28 February 1929"
 *   - Month + year: "November 2016", "October 2013"
 *   - Year ranges: "1947–1952", "1947–52", "from 1994 to 1996", "between 1994 and 1996"
 *   - Decades: "the 1970s", "the 2020s"
 *   - Seasons / qualifiers: "fall of 1956", "late 2014", "early 1990"
 *   - Bare years 1800–2039, unless they look like money, measures or big numbers
 */
import type { PartialDate, TimelineDate } from '../timeline/types'

export interface DateMatch {
  start: number
  end: number
  text: string
  date: TimelineDate
}

const MONTHS = [
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
const MONTH = `(${MONTHS.join('|')})`
const YEAR = '(1[89]\\d{2}|20[0-3]\\d)'

interface Rule {
  re: RegExp
  build: (m: RegExpExecArray) => TimelineDate | null
}

const month = (name: string) => MONTHS.indexOf(name) + 1

const RULES: Rule[] = [
  {
    // February 28, 1929
    re: new RegExp(`\\b${MONTH} (\\d{1,2}),? ${YEAR}\\b`, 'g'),
    build: (m) => ({ start: { y: +m[3], m: month(m[1]), d: +m[2] }, precision: 'day' }),
  },
  {
    // 28 February 1929
    re: new RegExp(`\\b(\\d{1,2}) ${MONTH},? ${YEAR}\\b`, 'g'),
    build: (m) => ({ start: { y: +m[3], m: month(m[2]), d: +m[1] }, precision: 'day' }),
  },
  {
    // from 1994 to 1996 / between 1994 and 1996
    re: new RegExp(`\\b(?:[Ff]rom|[Bb]etween) ${YEAR} (?:to|and|until) ${YEAR}\\b`, 'g'),
    build: (m) => range(+m[1], +m[2]),
  },
  {
    // 1947–1952, 1947-52
    re: new RegExp(`\\b${YEAR} ?[–—-] ?(\\d{4}|\\d{2})\\b(?![,.]?\\d)`, 'g'),
    build: (m) => {
      const a = +m[1]
      let b = +m[2]
      if (m[2].length === 2) b = Math.floor(a / 100) * 100 + b
      return range(a, b)
    },
  },
  {
    // November 2016
    re: new RegExp(`\\b(?:(?:early|mid|late)[ -])?${MONTH},? ${YEAR}\\b`, 'g'),
    build: (m) => ({ start: { y: +m[2], m: month(m[1]) }, precision: 'month' }),
  },
  {
    // the 1970s, the early 1990s
    re: /\b(?:the )?(?:(early|mid|late)[ -])?(1[89]\d0|20[0-3]0)s\b/g,
    build: (m) => ({
      start: { y: +m[2] },
      end: { y: +m[2] + 9 },
      precision: 'year',
      circa: !!m[1],
    }),
  },
  {
    // fall of 1956, the spring of 2001
    re: new RegExp(`\\b(?:the )?(?:spring|summer|fall|autumn|winter) of ${YEAR}\\b`, 'gi'),
    build: (m) => ({ start: { y: +m[1] }, precision: 'year' }),
  },
  {
    // late 2014, early 1990, mid-2008
    re: new RegExp(`\\b(?:early|late|mid)[ -]${YEAR}\\b`, 'gi'),
    build: (m) => ({ start: { y: +m[1] }, precision: 'year', circa: true }),
  },
  {
    // bare year
    re: new RegExp(
      `(?<![$£€\\d,.\\/-])\\b${YEAR}\\b(?![,.]\\d|\\s?(?:sq|m\\b|km|ft|%|kg|AD\\b))`,
      'g',
    ),
    build: (m) => ({ start: { y: +m[1] }, precision: 'year' }),
  },
]

function range(a: number, b: number): TimelineDate | null {
  if (b <= a || b - a > 80) return null
  return { start: { y: a }, end: { y: b }, precision: 'year' }
}

export function extractDates(text: string): DateMatch[] {
  const taken: [number, number][] = []
  const out: DateMatch[] = []
  for (const rule of RULES) {
    rule.re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = rule.re.exec(text))) {
      const start = m.index
      const end = start + m[0].length
      if (taken.some(([a, b]) => start < b && end > a)) continue
      const date = rule.build(m)
      if (!date) continue
      taken.push([start, end])
      out.push({ start, end, text: m[0], date })
    }
  }
  return out.sort((a, b) => a.start - b.start)
}

export function sameDay(a: PartialDate, b: PartialDate) {
  return a.y === b.y && a.m === b.m && a.d === b.d
}
