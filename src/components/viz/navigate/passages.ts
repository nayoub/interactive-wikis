/**
 * Finding passages in the rendered article, fresh each time (the DOM changes:
 * Minerva's accordion, mounts). A passage is one sentence of a prose block.
 * Used by the link timelines (Follow mentions) and the connections views.
 */
import { END_MATTER, indexBlock, rangeFor, sentences, type IndexedBlock } from '../pick/textIndex'

export interface Passage {
  block: HTMLElement
  /** The sentence (fresh Range; measure it, don't keep it across layout changes). */
  range: () => Range | null
  text: string
  sectionTitle: string
  /** The sentence's first citation, if any (label like "[110]", href "#cite_note-…"). */
  citation?: { label: string; href: string }
}

const outsideProse = (el: Element) => !!el.closest('.tn-mount, .infobox, .navbox, .reflist, .mw-references-wrap, figure, .gallery, table')

/**
 * Prose blocks (paragraphs, list items) in reading order, wherever the skin
 * put them (Minerva wraps a section's content in a div), without end matter.
 */
function proseBlocks(body: HTMLElement): { el: HTMLElement }[] {
  const out: { el: HTMLElement }[] = []
  body.querySelectorAll<HTMLElement>('section p, section li').forEach((el) => {
    if (outsideProse(el) || el.closest('.reflist, ol.references, .refbegin, .hatnote, .sidebar, .side-box, .shortdescription')) return
    if (el.tagName === 'LI' && el.querySelector('p')) return
    const top = el.closest('section')
    let s: Element | null = top
    let topId = ''
    while (s) {
      const h = s.querySelector(':scope > h2')
      if (h?.id) topId = h.id
      s = s.parentElement?.closest('section') ?? null
    }
    if (END_MATTER.has(topId)) return
    if (!(el.textContent ?? '').trim()) return
    out.push({ el })
  })
  return out
}

function sectionTitleOf(el: Element): string {
  const h = el
    .closest('section')
    ?.querySelector(':scope > h2, :scope > h3, :scope > h4, :scope > .mw-heading > :is(h2, h3, h4)')
  return h?.textContent?.trim() || 'Introduction'
}

function passageAt(block: IndexedBlock, start: number, end: number, sectionTitle: string): Passage {
  const text = block.text.slice(start, end)
  const ref = block.refs.find((r) => r.offset > start && r.offset <= end + 1)
  return {
    block: block.el,
    // Re-index on demand: offsets stay valid while the paragraph's text does.
    range: () => rangeFor(indexBlock(block.el), start, end),
    text,
    sectionTitle,
    citation: ref ? { label: ref.label, href: ref.href } : undefined,
  }
}

/** The sentence that contains `snippet` (exact text), or null. */
export function locate(body: HTMLElement, snippet: string): Passage | null {
  for (const ctx of proseBlocks(body)) {
    if (outsideProse(ctx.el)) continue
    const b = indexBlock(ctx.el)
    const at = b.text.indexOf(snippet)
    if (at === -1) continue
    const s = sentences(b.text).find((x) => at >= x.start && at < x.end)
    if (!s) continue
    return passageAt(b, s.start, s.end, sectionTitleOf(ctx.el))
  }
  return null
}

/** The span `snippet` inside a passage's block (for highlighting the exact words). */
export function spanIn(p: Passage, snippet: string): Range | null {
  const b = indexBlock(p.block)
  const at = b.text.indexOf(snippet)
  return at === -1 ? null : rangeFor(b, at, at + snippet.length)
}

/** Wiki page title a link points to (after loadArticle rewrote it to en.wikipedia.org). */
export function targetOf(a: HTMLAnchorElement): string | null {
  const href = a.getAttribute('href') ?? ''
  const m = href.match(/\/wiki\/([^#?]+)/)
  if (!m || a.closest('sup')) return null
  try {
    return decodeURIComponent(m[1])
  } catch {
    return m[1]
  }
}

export interface LinkMention extends Passage {
  link: HTMLAnchorElement
}

/**
 * Every prose mention linked to the same page: a verified identity (same
 * link target), not a guess from matching words.
 */
export function mentionsOf(body: HTMLElement, target: string): LinkMention[] {
  const out: LinkMention[] = []
  for (const ctx of proseBlocks(body)) {
    if (outsideProse(ctx.el)) continue
    const b = indexBlock(ctx.el)
    for (const l of b.links) {
      if (targetOf(l.el) !== target) continue
      const s = sentences(b.text).find((x) => l.start >= x.start && l.start < x.end)
      if (!s) continue
      out.push({ ...passageAt(b, s.start, s.end, sectionTitleOf(ctx.el)), link: l.el })
    }
  }
  return out
}

/** Link targets mentioned at least `min` times in prose, most mentioned first. */
export function repeatedTargets(body: HTMLElement, min = 2): { target: string; text: string; count: number }[] {
  const seen = new Map<string, { text: string; count: number }>()
  for (const ctx of proseBlocks(body)) {
    if (outsideProse(ctx.el)) continue
    for (const l of indexBlock(ctx.el).links) {
      const t = targetOf(l.el)
      if (!t || /^(ISBN|Doi|Wayback)/i.test(t)) continue
      const v = seen.get(t) ?? { text: l.text, count: 0 }
      v.count++
      seen.set(t, v)
    }
  }
  return [...seen.entries()]
    .filter(([, v]) => v.count >= min)
    .map(([target, v]) => ({ target, ...v }))
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text))
}
