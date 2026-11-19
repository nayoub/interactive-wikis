/**
 * Text indexing for article blocks: flattens a block's visible prose into a
 * "clean" string (citation markers removed) and maps offsets in that string
 * back to DOM positions, so extractors can work on plain text and still wrap,
 * scroll to and highlight the exact passage.
 *
 * Generic over what is being picked (dates today, places next).
 */

export interface TextPiece {
  node: Text
  start: number
  end: number
}

export interface IndexedBlock {
  el: HTMLElement
  text: string
  pieces: TextPiece[]
  /** Clean-text offsets where a citation marker sat, with its label and target. */
  refs: { offset: number; label: string; href: string }[]
  /** Clean-text ranges covered by in-article links (for "name before (1980)" labels). */
  links: { start: number; end: number; text: string }[]
}

const SKIP_SELECTOR = 'sup.reference, sup.mw-ref, .mw-ref, style, script, .noprint, .mw-editsection'

export function indexBlock(el: HTMLElement): IndexedBlock {
  const pieces: TextPiece[] = []
  const refs: IndexedBlock['refs'] = []
  const links: IndexedBlock['links'] = []
  let text = ''

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = (node as Text).data
      if (!value) return
      pieces.push({ node: node as Text, start: text.length, end: text.length + value.length })
      text += value
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const element = node as HTMLElement
    if (element.matches(SKIP_SELECTOR)) {
      if (element.matches('sup.reference, sup.mw-ref')) {
        const a = element.querySelector('a')
        const href = a?.getAttribute('href') ?? ''
        const hash = href.includes('#') ? href.slice(href.indexOf('#')) : ''
        refs.push({ offset: text.length, label: (element.textContent ?? '').trim(), href: hash })
      }
      return
    }
    const isLink = element.tagName === 'A'
    const start = text.length
    element.childNodes.forEach(walk)
    if (isLink && text.length > start)
      links.push({ start, end: text.length, text: text.slice(start) })
  }
  el.childNodes.forEach(walk)
  return { el, text, pieces, refs, links }
}

/** Map a clean-text offset to a DOM position. `preferEnd` keeps range ends inside the previous node. */
export function domPosition(block: IndexedBlock, offset: number, preferEnd = false) {
  for (const piece of block.pieces) {
    const inside = preferEnd
      ? offset > piece.start && offset <= piece.end
      : offset >= piece.start && offset < piece.end
    if (inside) return { node: piece.node, offset: offset - piece.start }
  }
  const last = block.pieces[block.pieces.length - 1]
  return last ? { node: last.node, offset: last.node.data.length } : null
}

export function rangeFor(block: IndexedBlock, start: number, end: number): Range | null {
  const a = domPosition(block, start)
  const b = domPosition(block, end, true)
  if (!a || !b) return null
  const range = block.el.ownerDocument.createRange()
  range.setStart(a.node, a.offset)
  range.setEnd(b.node, b.offset)
  return range
}

export interface SentenceSpan {
  start: number
  /** Trimmed end (no trailing whitespace). */
  end: number
  text: string
}

// A segment ending in one of these is an abbreviation, not a sentence end.
const ABBREVIATION_END =
  /(?:\b[A-Z]|\bU\.S|\bD\.C|\bDr|\bSt|\bMr|\bMrs|\bJr|\bSr|\bInc|\bCo|\bNo|\bvs|\bc|\bca|\bLtd)\.\s*$/

export function sentences(text: string): SentenceSpan[] {
  const raw: { start: number; end: number }[] = []
  const Segmenter = (Intl as any).Segmenter
  if (Segmenter) {
    const seg = new Segmenter('en', { granularity: 'sentence' })
    for (const s of seg.segment(text)) raw.push({ start: s.index, end: s.index + s.segment.length })
  } else {
    const re = /[^.!?]+(?:[.!?]+["”’)]*\s*|$)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) && m[0]) raw.push({ start: m.index, end: m.index + m[0].length })
  }
  const merged: { start: number; end: number }[] = []
  for (const r of raw) {
    const prev = merged[merged.length - 1]
    if (prev && ABBREVIATION_END.test(text.slice(prev.start, prev.end))) prev.end = r.end
    else merged.push({ ...r })
  }
  return merged
    .map((r) => {
      const slice = text.slice(r.start, r.end)
      const lead = slice.length - slice.trimStart().length
      const trimmed = slice.trim()
      return { start: r.start + lead, end: r.start + lead + trimmed.length, text: trimmed }
    })
    .filter((s) => s.text.length > 0)
}

/** Prose blocks worth picking from: paragraphs and list items outside boxes and end matter. */
export const END_MATTER = new Set([
  'See_also',
  'References',
  'Notes',
  'Bibliography',
  'Further_reading',
  'External_links',
  'Gallery',
])

const EXCLUDED_CONTAINERS =
  'table, figure, .infobox, .navbox, .sidebar, .gallery, .reflist, .references, .hatnote, .thumb, .mw-references-wrap, .side-box, .sistersitebox, blockquote'

export interface BlockContext {
  el: HTMLElement
  sectionId: string
  sectionTitle: string
}

export function proseBlocks(root: ParentNode): BlockContext[] {
  const out: BlockContext[] = []
  root.querySelectorAll<HTMLElement>('section').forEach((section) => {
    const heading = section.querySelector<HTMLElement>(':scope > h2, :scope > h3, :scope > h4')
    const sectionId = heading?.id || 'Lead'
    const sectionTitle = heading?.textContent?.trim() || 'Lead'
    // Skip end matter, including subsections of an end-matter h2.
    const top = topLevelSectionId(section)
    if (END_MATTER.has(sectionId) || END_MATTER.has(top)) return
    section
      .querySelectorAll<HTMLElement>(':scope > p, :scope > ul > li, :scope > ol > li')
      .forEach((el) => {
        if (el.closest(EXCLUDED_CONTAINERS)) return
        if (!(el.textContent ?? '').trim()) return
        out.push({ el, sectionId, sectionTitle })
      })
  })
  return out
}

function topLevelSectionId(section: Element): string {
  let s: Element | null = section
  let id = ''
  while (s && s.tagName === 'SECTION') {
    const h = s.querySelector(':scope > h2, :scope > h3')
    if (h?.id) id = h.id
    s = s.parentElement?.closest('section') ?? null
  }
  return id
}
