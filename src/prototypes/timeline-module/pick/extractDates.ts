/**
 * Plain, deterministic date extraction. No model, no network: regexes over the
 * clean text of each prose block, run once on the frozen snapshot. Keeps the
 * precision the text used — a season stays a season, a decade a decade.
 *
 * Recognised (earlier rules win, no overlaps):
 *   - Full dates: "February 28, 1929", "28 February 1929"
 *   - Month + year: "November 2016", "early October 2013"
 *   - Year spans: "1947–1952", "1947–52", "from 1994 to 1996", "between 1994 and 1996"
 *   - Decades: "the 1970s", "the early 1990s"
 *   - Seasons: "the fall of 1956", "spring 2001"
 *   - Qualified years: "late 2014", "early 1990", "mid-2008"
 *   - Approximate: "c. 1956", "circa 1956", "around 1956"
 *   - Bare years 1800–2039, unless they look like money, measures or big numbers
 * Not recognised: dates without a year ("In December"), ages ("at age 28").
 */
import type { Qualifier, TimelineDate } from '../model/types'

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
const PART = '(early|mid|late)'

interface Rule {
  re: RegExp
  build: (m: RegExpExecArray) => TimelineDate | null
}

const month = (name: string) => MONTHS.indexOf(name) + 1
const qual = (s?: string) =>
  s ? (s.toLowerCase().replace('autumn', 'fall') as Qualifier) : undefined

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
    // November 2016 (an "early"/"late" before a month is kept in the text, not the date)
    re: new RegExp(`\\b(?:(?:early|mid|late)[ -])?${MONTH},? ${YEAR}\\b`, 'gi'),
    build: (m) => ({
      start: { y: +m[2], m: month(m[1][0].toUpperCase() + m[1].slice(1).toLowerCase()) },
      precision: 'month',
    }),
  },
  {
    // the 1970s, the early 1990s, the mid-2000s
    re: new RegExp(`\\b(?:the )?(?:${PART}[ -])?(1[89]\\d0|20[0-3]0)s\\b`, 'gi'),
    build: (m) => ({
      start: { y: +m[2] },
      end: { y: +m[2] + 9 },
      precision: 'year',
      qualifier: qual(m[1]),
    }),
  },
  {
    // the fall of 1956, spring 2001
    re: new RegExp(`\\b(?:the )?(spring|summer|fall|autumn|winter)(?: of)? ${YEAR}\\b`, 'gi'),
    build: (m) => ({ start: { y: +m[2] }, precision: 'year', qualifier: qual(m[1]) }),
  },
  {
    // late 2014, early 1990, mid-2008
    re: new RegExp(`\\b${PART}[ -]${YEAR}\\b`, 'gi'),
    build: (m) => ({ start: { y: +m[2] }, precision: 'year', qualifier: qual(m[1]) }),
  },
  {
    // c. 1956, circa 1956, around 1956
    re: new RegExp(`(?:\\bc\\.|\\bca\\.|\\bcirca|\\baround|\\babout) ${YEAR}\\b`, 'gi'),
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
