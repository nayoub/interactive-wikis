/**
 * Load the frozen Frank Gehry snapshot and pre-compute what the modules pick
 * from, once per page load:
 *   - dates in the prose, wrapped in place as `<span class="tl-mention" data-kind="date">`
 *   - places: links whose target has a coordinate on Wikidata (from the committed
 *     build-time lookup, public/snapshots/frank-gehry.places.json), marked in place
 *     on the link itself (`data-kind="place"`)
 *   - for each: its sentence, section, citation and a drafted label
 *   - the article's own images and sections, and the subject's birth date
 */
import { draftLabel } from '../pick/draftLabel'
import { extractDates, type DateMatch } from '../pick/extractDates'
import { indexBlock, proseBlocks, rangeFor, sentences } from '../pick/textIndex'
import type { ArticleSection, EventImage, PartialDate } from '../model/types'
import type { DateMention, PlaceInfo, PlaceMention } from '../pick/types'

export type { DateMention, PlaceMention }

export interface LoadedArticle {
  html: string
  /** Date mentions (timeline). */
  mentions: DateMention[]
  /** Place mentions (map). */
  places: PlaceMention[]
  images: EventImage[]
  sections: ArticleSection[]
  /** The article's subject; `birth` from the infobox when it has one. */
  subject: { name: string; birth?: PartialDate }
}

let cached: Promise<LoadedArticle> | null = null

export function loadArticle(): Promise<LoadedArticle> {
  const base = import.meta.env.BASE_URL
  const text = (url: string) =>
    fetch(url).then((r) => {
      if (!r.ok) throw new Error(`Snapshot missing: ${url} (${r.status})`)
      return r.text()
    })
  cached ??= Promise.all([
    text(`${base}snapshots/frank-gehry.html`),
    text(`${base}snapshots/frank-gehry.places.json`).then((t) => JSON.parse(t).places),
  ]).then(([html, places]) => process(html, places))
  return cached
}

/** The page title a Parsoid link points to ("./Walt_Disney_Concert_Hall" → "Walt_Disney_Concert_Hall"). */
function linkTitle(a: HTMLAnchorElement): string | null {
  const href = a.getAttribute('href') ?? ''
  if (!href.startsWith('./')) return null
  try {
    return decodeURIComponent(href.slice(2).split('#')[0].split('?')[0])
  } catch {
    return href.slice(2).split('#')[0]
  }
}

function process(raw: string, placeIndex: Record<string, Omit<PlaceInfo, 'title'>>): LoadedArticle {
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

  const mentions: DateMention[] = []
  const places: PlaceMention[] = []
  let dateCount = 0
  let placeCount = 0

  for (const ctx of proseBlocks(body)) {
    const block = indexBlock(ctx.el)
    const found = extractDates(block.text)
    const sents = sentences(block.text)
    const sentenceAt = (offset: number) => sents.find((s) => offset >= s.start && offset < s.end)
    const anchorFor = (id: string, sent: { start: number; end: number }) => ({
      sectionId: ctx.sectionId,
      sectionTitle: ctx.sectionTitle,
      mentionId: id,
      sentenceStart: sent.start,
      sentenceEnd: sent.end,
    })
    const citationIn = (sent: { start: number; end: number }) => {
      const ref = block.refs.find((r) => r.offset > sent.start && r.offset <= sent.end + 1)
      return ref ? { label: ref.label, href: ref.href } : undefined
    }
    const linksIn = (sent: { start: number; end: number }) =>
      block.links
        .filter((l) => l.start >= sent.start && l.end <= sent.end)
        .map((l) => ({ start: l.start - sent.start, end: l.end - sent.start, text: l.text }))

    // Places: links to things with a coordinate. Marked on the link itself (no DOM change).
    for (const link of block.links) {
      const title = linkTitle(link.el)
      const info = title ? placeIndex[title] : undefined
      if (!title || !info || info.kind === 'region') continue
      const sent = sentenceAt(link.start)
      if (!sent) continue
      const id = `p${++placeCount}`
      // "Walt Disney Concert Hall (2003)": a date right after the name belongs to it.
      const after = block.text.slice(link.end, link.end + 4)
      const own: DateMatch | undefined = /^\s*\(/.test(after)
        ? found.find((d) => d.start > link.end && d.start <= link.end + 3)
        : undefined
      link.el.classList.add('tl-mention')
      link.el.dataset.kind = 'place'
      link.el.dataset.tlId = id
      link.el.id = `tl-src-${id}`
      places.push({
        id,
        text: link.text,
        value: {
          title,
          ...info,
          sentenceDate: own?.date,
          sentenceDateText: own?.text,
        },
        sentence: sent.text,
        sentenceOffset: [link.start - sent.start, link.end - sent.start],
        anchor: anchorFor(id, sent),
        links: linksIn(sent).map((l) => l.text),
        citation: citationIn(sent),
        // The article's own wording when the link reads as a name ("Chiat/Day Building"); the
        // item's name when the link is a phrase ("his private residence" → "Gehry Residence").
        draftLabel:
          /^\p{Lu}|^\d/u.test(link.text) || /^Q\d+$/.test(info.name) ? link.text : info.name,
      })
    }

    // Dates: wrapped in spans.
    const wraps: { range: Range; id: string }[] = []
    for (const match of found) {
      const sent = sentenceAt(match.start)
      if (!sent) continue
      const id = `d${++dateCount}`
      const others = found
        .filter((o) => o !== match && o.start >= sent.start && o.end <= sent.end)
        .map((o) => ({ start: o.start - sent.start, end: o.end - sent.start }))
      const links = linksIn(sent)
      mentions.push({
        id,
        text: match.text,
        value: match.date,
        links: links.map((l) => l.text),
        sentence: sent.text,
        sentenceOffset: [match.start - sent.start, match.end - sent.start],
        anchor: anchorFor(id, sent),
        citation: citationIn(sent),
        draftLabel: draftLabel({
          sentence: sent.text,
          start: match.start - sent.start,
          end: match.end - sent.start,
          others,
          links,
        }),
      })
      const range = rangeFor(block, match.start, match.end)
      if (range) wraps.push({ range, id })
    }
    // Wrap last-to-first so earlier ranges stay valid.
    for (const { range, id } of wraps.reverse()) {
      const span = doc.createElement('span')
      span.className = 'tl-mention'
      span.dataset.kind = 'date'
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

  // Other wiki pages aren't part of the prototype: open them on Wikipedia instead of a dead route.
  body.querySelectorAll<HTMLAnchorElement>('a[href^="./"]').forEach((a) => {
    const href = a.getAttribute('href') ?? ''
    if (href.startsWith('./Frank_Gehry#')) return
    a.setAttribute('href', `https://en.wikipedia.org/wiki/${href.slice(2)}`)
    a.setAttribute('target', '_blank')
    a.setAttribute('rel', 'noopener')
  })

  const images: EventImage[] = []
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
    images.push({ id: `img${i}`, src: img.getAttribute('src') ?? '', caption, source: 'article' })
  })

  const sections: ArticleSection[] = []
  body.querySelectorAll<HTMLElement>('section > h2, section > h3').forEach((h) => {
    sections.push({
      id: h.id,
      title: h.textContent?.trim() ?? h.id,
      level: h.tagName === 'H2' ? 2 : 3,
    })
  })

  // Infobox birth date (hCard `bday`, ISO).
  const bday = body.querySelector('.infobox .bday')?.textContent?.trim() ?? ''
  const bm = bday.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/)
  const birth = bm
    ? { y: +bm[1], m: bm[2] ? +bm[2] : undefined, d: bm[3] ? +bm[3] : undefined }
    : undefined

  return {
    html: body.innerHTML,
    mentions,
    places,
    images,
    sections,
    subject: { name: 'Frank Gehry', birth },
  }
}
