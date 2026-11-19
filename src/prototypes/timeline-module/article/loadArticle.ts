/**
 * Load the frozen Frank Gehry snapshot (public/snapshots/frank-gehry.html,
 * written by scripts/snapshot.py) and pre-compute everything the prototype
 * needs from it, once per page load:
 *   - every date mention in the prose, wrapped in `<span data-tl-id>` in place
 *   - the sentence, section, citation and a trimmed draft label for each
 *   - the article's own images (the only images a timeline may use)
 */
import { draftLabel } from '../selection/draftLabel'
import { extractDates } from '../selection/extractDates'
import { indexBlock, proseBlocks, rangeFor, sentences } from '../selection/textIndex'
import type { ArticleImage, Citation, SourceAnchor, TimelineDate } from '../timeline/types'

export interface DateMention {
  id: string
  text: string
  date: TimelineDate
  sentence: string
  /** Mention offsets within `sentence`. */
  sentenceOffset: [number, number]
  anchor: SourceAnchor
  citation?: Citation
  draftLabel: string
}

export interface ArticleSection {
  id: string
  title: string
  level: 2 | 3
}

export interface LoadedArticle {
  html: string
  mentions: DateMention[]
  images: ArticleImage[]
  sections: ArticleSection[]
}

let cached: Promise<LoadedArticle> | null = null

export function loadArticle(): Promise<LoadedArticle> {
  cached ??= fetch(`${import.meta.env.BASE_URL}snapshots/frank-gehry.html`)
    .then((r) => {
      if (!r.ok) throw new Error(`Snapshot missing (${r.status})`)
      return r.text()
    })
    .then(process)
  return cached
}

function process(raw: string): LoadedArticle {
  const doc = new DOMParser().parseFromString(`<body>${raw}</body>`, 'text/html')
  const body = doc.body
  const base = import.meta.env.BASE_URL

  // Local images, relative to the app base so deploys under a sub-path work.
  body.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src') ?? ''
    if (src.startsWith('snapshots/')) img.setAttribute('src', base + src)
    img.removeAttribute('srcset')
  })
  // Parsoid's ./Page#cite_note links → same-document fragments.
  body
    .querySelectorAll<HTMLAnchorElement>('a[href*="#cite_note"], a[href*="#cite_ref"]')
    .forEach((a) => {
      const href = a.getAttribute('href') ?? ''
      a.setAttribute('href', href.slice(href.indexOf('#')))
    })

  // Other wiki pages aren't part of the prototype: open them on Wikipedia instead of a dead route.
  body.querySelectorAll<HTMLAnchorElement>('a[href^="./"]').forEach((a) => {
    const href = a.getAttribute('href') ?? ''
    if (href.startsWith('./Frank_Gehry#')) return
    a.setAttribute('href', `https://en.wikipedia.org/wiki/${href.slice(2)}`)
    a.setAttribute('target', '_blank')
    a.setAttribute('rel', 'noopener')
  })

  const mentions: DateMention[] = []
  let counter = 0

  for (const ctx of proseBlocks(body)) {
    const block = indexBlock(ctx.el)
    const found = extractDates(block.text)
    if (!found.length) continue
    const sents = sentences(block.text)
    const wraps: { range: Range; id: string }[] = []

    for (const match of found) {
      const sent = sents.find((s) => match.start >= s.start && match.start < s.end)
      if (!sent) continue
      const id = `d${++counter}`
      const others = found
        .filter((o) => o !== match && o.start >= sent.start && o.end <= sent.end)
        .map((o) => ({ start: o.start - sent.start, end: o.end - sent.start }))
      const links = block.links
        .filter((l) => l.start >= sent.start && l.end <= sent.end)
        .map((l) => ({ start: l.start - sent.start, end: l.end - sent.start, text: l.text }))
      const ref = block.refs.find((r) => r.offset > sent.start && r.offset <= sent.end + 1)
      const label = draftLabel({
        sentence: sent.text,
        start: match.start - sent.start,
        end: match.end - sent.start,
        others,
        links,
      })
      mentions.push({
        id,
        text: match.text,
        date: match.date,
        sentence: sent.text,
        sentenceOffset: [match.start - sent.start, match.end - sent.start],
        anchor: {
          sectionId: ctx.sectionId,
          sectionTitle: ctx.sectionTitle,
          mentionId: id,
          sentenceStart: sent.start,
          sentenceEnd: sent.end,
        },
        citation: ref ? { label: ref.label, href: ref.href } : undefined,
        draftLabel: label,
      })
      const range = rangeFor(block, match.start, match.end)
      if (range) wraps.push({ range, id })
    }

    // Wrap last-to-first so earlier ranges stay valid.
    for (const { range, id } of wraps.reverse()) {
      const span = doc.createElement('span')
      span.className = 'tl-mention'
      span.dataset.tlId = id
      span.id = `tl-src-${id}`
      try {
        range.surroundContents(span)
      } catch {
        span.appendChild(range.extractContents())
        range.insertNode(span)
      }
    }
  }

  const images: ArticleImage[] = []
  body.querySelectorAll<HTMLImageElement>('img').forEach((img, i) => {
    const width = Number(img.getAttribute('width') ?? 0)
    if (width && width < 100) return
    if (img.closest('.navbox, .sistersitebox, .side-box, .mw-references-wrap')) return
    const caption =
      img.closest('figure')?.querySelector('figcaption')?.textContent?.trim() ||
      img.closest('.gallerybox')?.querySelector('.gallerytext')?.textContent?.trim() ||
      img.closest('.infobox-image')?.querySelector('.infobox-caption')?.textContent?.trim() ||
      img.getAttribute('alt') ||
      ''
    images.push({ id: `img${i}`, src: img.getAttribute('src') ?? '', caption })
  })

  const sections: ArticleSection[] = []
  body.querySelectorAll<HTMLElement>('section > h2, section > h3').forEach((h) => {
    sections.push({
      id: h.id,
      title: h.textContent?.trim() ?? h.id,
      level: h.tagName === 'H2' ? 2 : 3,
    })
  })

  return { html: body.innerHTML, mentions, images, sections }
}
