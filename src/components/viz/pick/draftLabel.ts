/**
 * Draft a short label by *trimming* the source sentence: never adds words.
 *
 * 1. "Name (1980)" right after a link → the link text ("Santa Monica Place").
 * 2. Otherwise take the ;-clause holding the mention, drop the date phrase
 *    itself ("In 1947, ", " in 1954"), drop other leading date phrases and
 *    parentheticals, then cut at the first clause boundary past ~28 chars,
 *    or at a word boundary with an ellipsis.
 */

const MAX = 72
const MIN_CLAUSE = 28

const PREP =
  '(?:[Aa]lso |[Tt]hen )?(?:[Ii]n|[Oo]n|[Bb]y|[Ff]rom|[Ss]ince|[Dd]uring|[Uu]ntil|[Aa]fter|[Bb]efore|[Aa]round|[Tt]hroughout|[Oo]f|[Aa]t)(?: the)?'

export interface LabelInput {
  sentence: string
  /** Mention offsets relative to the sentence. */
  start: number
  end: number
  /** Other date mentions in the same sentence (relative offsets). */
  others: { start: number; end: number }[]
  /** Links in the sentence (relative offsets). */
  links: { start: number; end: number; text: string }[]
}

export function draftLabel({ sentence, start, end, others, links }: LabelInput): string {
  // 1. Parenthetical year after a named thing.
  const before = sentence.slice(0, start)
  const after = sentence.slice(end)
  if (/\(\s*$/.test(before) && /^\s*\)/.test(after)) {
    const parenAt = before.lastIndexOf('(')
    const nameEnd = sentence.slice(0, parenAt).trimEnd().length
    const link = links.find((l) => l.end === nameEnd)
    if (link && link.text.length > 2) return tidy(link.text)
  }

  // 2. Mark the mention and the other dates with sentinels so we can delete
  // them together with the preposition in front of them.
  const marks = [{ start, end, self: true }, ...others.map((o) => ({ ...o, self: false }))].sort(
    (a, b) => b.start - a.start,
  )
  let marked = sentence
  for (const mk of marks) {
    marked = marked.slice(0, mk.start) + (mk.self ? '\u0001' : '\u0002') + marked.slice(mk.end)
  }
  // Parentheticals go first (a date inside one, like a lead's birth–death, then
  // labels the sentence it qualifies) — but "(1980)" goes with its preposition below.
  marked = marked.replace(/\s*\((?![\u0001\u0002]\))[^()]*\)/g, '')
  // Then the ;-clause that holds the mention (or the first one).
  const clauses = marked.split(';')
  let text = clauses.find((c) => c.includes('\u0001')) ?? clauses[0]

  // Leading "In 1962, " / "From 1994 to 1996 " / "On December 5, 2025, ".
  text = text.replace(
    new RegExp(`^\\s*(?:${PREP} )?[\\u0001\\u0002](?: to [\\u0001\\u0002])?,?\\s*`),
    '',
  )
  // Inline " in 1954" / " (1980)" for the mention and any other date.
  text = text.replace(new RegExp(`,?\\s*${PREP} [\\u0001\\u0002](?=\\s*[,.;:)]|\\s*$)`, 'g'), '')
  text = text.replace(new RegExp(`\\s*\\(\\s*[\\u0001\\u0002]\\s*\\)`, 'g'), '')
  text = text.replace(new RegExp(`\\s+${PREP} [\\u0001\\u0002]`, 'g'), '')
  // Anything left: keep a bare date word only if removing it would break the sentence.
  text = text.replace(/[\u0001\u0002],?\s*/g, '')
  // Parentheticals and quotes that run on.
  text = text.replace(/\s*\([^)]*\)/g, '')
  text = text
    .replace(/\s+,/g, ',')
    .replace(/,\s*,/g, ',')
    .replace(/\s{2,}/g, ' ')
    .trim()
  // "was born, at X" → "was born at X" when a removed date left a dangling comma.
  text = text.replace(/^(\S+(?: \S+){0,6}?),\s(?=(?:at|in|to|on|for|with)\b)/, '$1 ')

  text = cut(text)
  return tidy(text)
}

const BOUNDARIES = [
  ', ',
  ': ',
  ' – ',
  ' — ',
  ' where ',
  ' which ',
  ' who ',
  ' when ',
  ' while ',
  ' leaving ',
]

function cut(text: string): string {
  if (text.length <= MAX) return stripTrailing(text)
  let best = -1
  for (const b of BOUNDARIES) {
    const i = text.indexOf(b, MIN_CLAUSE)
    if (i !== -1 && i <= MAX && (best === -1 || i < best)) best = i
  }
  if (best !== -1) return stripTrailing(text.slice(0, best))
  const slice = text.slice(0, MAX)
  const space = slice.lastIndexOf(' ')
  return stripTrailing(slice.slice(0, space > MIN_CLAUSE ? space : MAX)) + '…'
}

function stripTrailing(s: string) {
  return s.replace(/[\s,.;:–—-]+$/, '').replace(/^["“]|["”]$/g, '')
}

function tidy(s: string) {
  const t = s.trim().replace(/^(?:and|but|then|also|so)\s+/i, '')
  return t.charAt(0).toUpperCase() + t.slice(1)
}
