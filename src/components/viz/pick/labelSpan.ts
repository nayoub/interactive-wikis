/**
 * Labels are a span of the sentence, never generated text. The tool proposes
 * a span; the editor drags its ends; the label is exactly the span with light
 * cleanup (first letter capitalised, trailing punctuation and footnote
 * markers dropped).
 *
 * Default span (no language model), for a date:
 *   1. Cut the sentence into clauses at commas, semicolons, colons and dashes,
 *      then at coordinating words (and, but, while, whereas).
 *   2. Take the clause holding the date.
 *   3. Take the date phrase out of it: the date with a preposition just
 *      before it ("on 15 June 1300", "in 1310"). If the date sits in the
 *      middle, keep the longer side.
 *   4. Drop a leading connective ("and", "which", "then").
 *   5. Fewer than three words left: join the clause before (or after) and go again.
 *   6. Only a name left ("María Díaz I de Haro", every word capitalised), or
 *      only a lead-in ("During the celebration of …"): join the clauses after
 *      it until there is a verb-like word (was, became, …ed, …s).
 * For a place, the default span is the link text itself.
 */
export interface Span {
  start: number
  end: number
}

export interface Word {
  start: number
  end: number
  text: string
}

export function words(text: string): Word[] {
  const out: Word[] = []
  for (const m of text.matchAll(/\S+/g))
    out.push({ start: m.index!, end: m.index! + m[0].length, text: m[0] })
  return out
}

/** The label a span reads as: capitalised, without footnote markers or trailing punctuation. */
export function cleanLabel(text: string): string {
  const t = text
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[,;:–—-]\s*/, '')
    .replace(/[\s,;:.–—-]+$/, '')
  return t ? t[0].toUpperCase() + t.slice(1) : t
}

const PREPOSITION =
  /\b(on|in|by|from|until|till|since|during|of|at|around|circa|c\.|between|before|after|about)\s+(the\s+)?(early\s+|late\s+|mid-?)?$/i
const CONNECTIVE = /^(and|but|which|while|whereas|then|that|when|where|so)\b\s*/i
const COORDINATING = /\s(?:and|but|while|whereas)\s/g

/** Clause boundaries: [start, end) pieces of the sentence. */
function clauses(s: string): Span[] {
  const cuts = new Set<number>([0, s.length])
  for (const m of s.matchAll(/[,;:]\s|\s[–—]\s/g)) {
    cuts.add(m.index!)
    cuts.add(m.index! + m[0].length)
  }
  // "and" joins two predicates ("founded … and confirmed by …") only when a verb-like word follows;
  // "labour demands and the arrival of …" is one subject.
  for (const m of s.matchAll(COORDINATING)) {
    const next = s.slice(m.index! + m[0].length).match(/^\S+/)?.[0] ?? ''
    if (!/^[a-z]+(ed|s)$|^(was|were|is|are|had|has|became|made|took|grew)$/.test(next)) continue
    cuts.add(m.index!)
    cuts.add(m.index! + 1)
  }
  const at = [...cuts].sort((a, b) => a - b)
  const out: Span[] = []
  for (let i = 0; i < at.length - 1; i++) {
    const piece = s.slice(at[i], at[i + 1])
    if (/[A-Za-z0-9]/.test(piece)) out.push({ start: at[i], end: at[i + 1] })
  }
  return out
}

/** Trim a span to its words (no spaces or connective at its edges). */
function tidy(s: string, sp: Span): Span {
  let { start, end } = sp
  while (start < end && /[\s,;:–—]/.test(s[start])) start++
  while (end > start && /[\s,;:–—.]/.test(s[end - 1])) end--
  // No dangling connective at the end ("…the bridges and").
  const tail = s.slice(start, end).match(/\s(and|or|but|the|of|to|with)$/i)
  if (tail && s.slice(start, end).length > tail[0].length) end -= tail[0].length
  const lead = s.slice(start, end).match(CONNECTIVE)
  if (lead && s.slice(start, end).length > lead[0].length) start += lead[0].length
  return { start, end }
}

const wordCount = (s: string, sp: Span) => words(s.slice(sp.start, sp.end)).length
const PARTICLE = /^(de|del|la|of|the|and|von|van|y|I|II|III|IV|V|VI|VII|VIII|IX|X)$/
/** Every word a capitalised name or a particle: a subject with no predicate yet. */
const nameOnly = (t: string) => {
  const ws = words(t)
    .map((w) => w.text.replace(/[^\p{L}]/gu, ''))
    .filter(Boolean)
  return ws.length > 0 && ws.every((w) => /^\p{Lu}/u.test(w) || PARTICLE.test(w))
}
const LEAD_IN = /^(with|during|after|before|following|despite|under|amid|by|upon)\b/i
const VERBISH =
  /\b(is|are|was|were|has|had|have|became|become|grew|made|took|began|[a-z]{3,}ed|[a-z]{3,}s)\b/

export function defaultSpan(sentence: string, dateStart: number, dateEnd: number): Span {
  const s = sentence
  const parts = clauses(s)
  let k = Math.max(
    0,
    parts.findIndex((p) => dateStart >= p.start && dateStart < p.end),
  )
  let piece = parts[k] ?? { start: 0, end: s.length }
  // The date phrase: the date with a preposition (and "the", "early"…) just before it.
  const before = s.slice(piece.start, dateStart).match(PREPOSITION)
  const phraseStart = before ? dateStart - before[0].length : dateStart
  const phraseEnd = dateEnd
  const without = (p: Span): Span => {
    if (phraseEnd <= p.start || phraseStart >= p.end) return tidy(s, p)
    const left = tidy(s, { start: p.start, end: Math.max(p.start, phraseStart) })
    const right = tidy(s, { start: Math.min(p.end, phraseEnd), end: p.end })
    return wordCount(s, left) >= wordCount(s, right) ? left : right
  }
  let span = without(piece)
  // Too short to say anything: join the neighbouring clause, before first.
  for (let guard = 0; guard < 3 && wordCount(s, span) < 3; guard++) {
    if (k > 0) {
      k--
      piece = { start: parts[k].start, end: piece.end }
    } else if (parts.length > 1 && piece.end < s.length) {
      const next = parts.find((p) => p.start >= piece.end)
      if (!next) break
      piece = { start: piece.start, end: next.end }
    } else break
    span = without(piece)
  }
  // A name with no predicate, or a lead-in phrase: carry on to the clause with the verb.
  const first = s.slice(span.start, span.end)
  if (nameOnly(first) || LEAD_IN.test(first)) {
    for (let guard = 0; guard < 4; guard++) {
      const t = s.slice(span.start, span.end)
      const next = parts.find((p) => p.start >= span.end)
      if (VERBISH.test(t.replace(/^\S+\s*/, '')) || !next) break
      span = tidy(s, { start: span.start, end: next.end })
    }
  }
  return span.end > span.start ? span : tidy(s, { start: 0, end: s.length })
}

/** The span snapped to whole words. */
export function snap(sentence: string, sp: Span): Span {
  const ws = words(sentence)
  const first = ws.find((w) => w.end > sp.start) ?? ws[0]
  const last = [...ws].reverse().find((w) => w.start < sp.end) ?? ws[ws.length - 1]
  if (!first || !last) return sp
  return { start: Math.min(first.start, last.start), end: Math.max(first.end, last.end) }
}
