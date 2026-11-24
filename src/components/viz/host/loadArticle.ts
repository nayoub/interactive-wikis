/**
 * Load a frozen article snapshot and pre-compute what the modules pick from,
 * once per page load:
 *   - dates in the prose, wrapped in place as `<span class="tl-mention" data-kind="date">`
 *   - places: links whose target has a coordinate on Wikidata (from the committed
 *     build-time lookup, public/snapshots/<slug>.places.json), marked in place
 *     on the link itself (`data-kind="place"`)
 *   - data tables: each gets `data-pick-table` and, before it, a "Use this table"
 *     chip (`data-kind="table"`); party rows get ids so a module can point back
 *     at its source row
 *   - for series (elections): the earlier articles' tables and infoboxes, parsed
 *     but not shown
 *   - for each: its sentence, section, citation and a drafted label
 *   - the article's own images and sections, and the subject's birth date
 */
import { draftLabel } from '../pick/draftLabel'
import { extractDates, type DateMatch } from '../pick/extractDates'
import { proposeGeneralRoles } from '../pick/toItems'
import {
  parseTable,
  proposeRoles,
  readInfobox,
  type InfoboxElection,
  type ParsedTable,
} from '../pick/tables'
import { indexBlock, proseBlocks, rangeFor, sentences } from '../pick/textIndex'
import type { ArticleSection, EventImage, PartialDate, Seating, SourceAnchor } from '../model/types'
import type { DateMention, PlaceInfo, PlaceMention, TableMention } from '../pick/types'

export type { DateMention, PlaceMention, TableMention }

/** Which snapshot a page shows. */
export interface ArticleSource {
  /** public/snapshots/<slug>.html (and <slug>.places.json, if there is one). */
  slug: string
  title: string
  /** Where Insert puts a module when the caret is not in the article. */
  defaultSection: { id: string; title: string }
  /** Earlier articles in a series (previous elections), newest first: parsed for their tables. */
  previous?: { slug: string; title: string }[]
  /**
   * The general visual tool: every data table is pickable (not only results
   * tables), and so is every image.
   */
  general?: boolean
  /** Comparable articles (another city), parsed for their tables: the Compare operator's second set. */
  compare?: { slug: string; title: string }[]
}

export const GEHRY: ArticleSource = {
  slug: 'frank-gehry',
  title: 'Frank Gehry',
  defaultSection: { id: 'Career', title: 'Career' },
}

/** An earlier article of a series: its data tables and infobox only. */
export interface RelatedArticle {
  title: string
  tables: ParsedTable[]
  infobox: InfoboxElection
  seating?: Seating
}

/**
 * A quantity over time told in one sentence ("grew from 11,000 in 1880 to
 * 80,000 in 1900"): evidence for a chart, not events for a timeline (general tool).
 */
export interface SeriesMention {
  id: string
  sentence: string
  anchor: SourceAnchor
  inList: boolean
  /** What the numbers measure, from the sentence's subject ("Population"), else "Value". */
  measure: string
  points: { id: string; year: number; value: number; text: string }[]
}

export interface LoadedArticle {
  html: string
  /** Date mentions (timeline). */
  mentions: DateMention[]
  /** Place mentions (map). */
  places: PlaceMention[]
  /** Data tables (visual). */
  tables: TableMention[]
  /** Quantities over time told in a sentence (general tool). */
  series: SeriesMention[]
  /**
   * What the article is about, from its infobox type: a place (ib-settlement,
   * ib-country…) or anything else (biography, organisation, event, work), and
   * the place's own coordinates (the infobox's geo) when it has them.
   */
  subject: { name: string; birth?: PartialDate; kind: 'place' | 'other'; coords?: { lat: number; lon: number } }
  /** Election infobox: chamber size, majority, the article's party order. */
  infobox: InfoboxElection
  previous: RelatedArticle[]
  /** Comparable articles' tables (general tool). */
  compare: RelatedArticle[]
  /** Wikidata labels in other languages for the things the article links (general tool): QID → lang → label. */
  labels: Record<string, Record<string, string>>
  /** The languages those labels are in, for the user menu's Labels choice. */
  labelLanguages: { value: string; label: string }[]
  /** The article's own parliament diagram, if it has one. */
  seating?: Seating
  source: ArticleSource
  images: EventImage[]
  sections: ArticleSection[]
  /** Text length of each top-level section (h2 id → characters), for ranking suggestions. */
  sectionLength: Record<string, number>
  /** Every section's top-level (h2) section, any depth below it: id → { id, title }. */
  topSection: Record<string, { id: string; title: string }>
  /** {{Use dmy dates}}: write "6 May 2025", as the article does. */
  dayFirst: boolean
}

/** "11,000 in 1880": a number, an optional unit word, then "in <year>". */
const PAIR = /(\d[\d,.]*)(?:\s+(?:inhabitants|people|residents|workers|tonnes|tons|visitors|students))?\s+in\s+(1\d{3}|20[0-3]\d)\b/g
/** The subject before "grew/rose/fell from": "the population grew from" → "population". */
const SUBJECT = /(?:the\s+)?([a-z][a-z ]{2,30}?)\s+(?:of\s+[A-Z]\w+\s+)?(?:grew|rose|increased|fell|declined|dropped|went|doubled|tripled)\b[^.]*$/i

/** A place or not, from the infobox's type class; its coordinates from the infobox's geo. */
function subjectOf(body: HTMLElement): { kind: 'place' | 'other'; coords?: { lat: number; lon: number } } {
  const box = body.querySelector('table.infobox')
  const place = /\bib-(settlement|country|island|region|river|mountain|lake|body-of-water|protected-area|park|city|state)\b|\bgeography\b/.test(box?.className ?? '')
  const geo = body.querySelector('.geo')?.textContent?.match(/(-?\d+(?:\.\d+)?)\s*;\s*(-?\d+(?:\.\d+)?)/)
  return { kind: place ? 'place' : 'other', coords: geo ? { lat: Number(geo[1]), lon: Number(geo[2]) } : undefined }
}

const cache = new Map<string, Promise<LoadedArticle>>()

export function loadArticle(source: ArticleSource = GEHRY): Promise<LoadedArticle> {
  const base = import.meta.env.BASE_URL
  const text = (url: string) =>
    fetch(url).then((r) => {
      if (!r.ok) throw new Error(`Snapshot missing: ${url} (${r.status})`)
      return r.text()
    })
  // The general tool processes the same snapshot differently (pickable images, table chips).
  const key = `${source.slug}${source.general ? ':general' : ''}`
  if (!cache.has(key))
    cache.set(
      key,
      Promise.all([
        text(`${base}snapshots/${source.slug}.html`),
        // No lookup for this article: no places.
        text(`${base}snapshots/${source.slug}.places.json`)
          .then((t) => JSON.parse(t).places)
          .catch(() => ({})),
        Promise.all(
          (source.previous ?? []).map((p) =>
            Promise.all([text(`${base}snapshots/${p.slug}.html`), seatingOf(p.slug)]).then(
              ([html, seating]) => ({ ...related(html, p.title), seating }),
            ),
          ),
        ),
        seatingOf(source.slug),
        Promise.all(
          (source.compare ?? []).map((p) =>
            text(`${base}snapshots/${p.slug}.html`).then((html) => {
              const body = parse(html).body
              return { title: p.title, infobox: readInfobox(body, p.title), tables: generalTables(body, 'c') }
            }),
          ),
        ),
        text(`${base}snapshots/${source.slug}.labels.json`)
          .then((t) => JSON.parse(t))
          .catch(() => null),
      ]).then(([html, places, previous, seating, compare, labels]) => ({
        ...process(html, places, source, previous),
        seating,
        compare,
        labels: labels?.labels ?? {},
        labelLanguages: labels?.languages ?? [],
      })),
    )
  return cache.get(key)!
}

/** <slug>.seating.json, when the article has a parliament diagram. */
const seatingOf = (slug: string): Promise<Seating | undefined> =>
  fetch(`${import.meta.env.BASE_URL}snapshots/${slug}.seating.json`)
    .then((r) => (r.ok ? r.json() : undefined))
    .catch(() => undefined)

const parse = (raw: string) => new DOMParser().parseFromString(`<body>${raw}</body>`, 'text/html')

/** Section id and title around an element. */
function sectionOf(el: Element) {
  const h = el
    .closest('section')
    ?.querySelector<HTMLElement>(':scope > h2, :scope > h3, :scope > .mw-heading > :is(h2, h3)')
  return { id: h?.id || 'Lead', title: h?.textContent?.trim() || 'Lead' }
}

/**
 * Data tables: wikitables with a column of names and at least one column of
 * seats, votes or shares. Layout tables, navboxes and the infobox are not.
 */
function dataTables(body: HTMLElement, chamberSize: number | undefined, prefix: string) {
  const out: ParsedTable[] = []
  body.querySelectorAll<HTMLTableElement>('table.wikitable').forEach((el) => {
    if (el.closest('.infobox, .navbox, .sidebar')) return
    const s = sectionOf(el)
    const t = parseTable(el, `${prefix}${out.length + 1}`, s.id, s.title)
    const roles = proposeRoles(t, chamberSize).map((r) => r.role)
    if (
      !roles.includes('category') ||
      !roles.some((r) => r === 'seats' || r === 'votes' || r === 'share')
    )
      return
    out.push(t)
  })
  return out
}

/**
 * Any data table (general tool): a wikitable or a "Historical population"
 * box with numbers and either names or times (rules in pick/toItems.ts).
 */
function generalTables(body: HTMLElement, prefix: string) {
  const out: ParsedTable[] = []
  body.querySelectorAll<HTMLTableElement>('table.wikitable, table.table-pale').forEach((el) => {
    if (el.closest('.infobox, .navbox, .sidebar')) return
    const s = sectionOf(el)
    const t = parseTable(el, `${prefix}${out.length + 1}`, s.id, s.title)
    const roles = proposeGeneralRoles(t).map((r) => r.role)
    if (!roles.includes('quantity') && !(roles.includes('time') && roles.filter((r) => r === 'time').length > 1)) return
    if (!roles.includes('category') && !roles.includes('time')) return
    out.push(t)
  })
  return out
}

function related(raw: string, title: string): RelatedArticle {
  const body = parse(raw).body
  const infobox = readInfobox(body, title)
  return { title, infobox, tables: dataTables(body, infobox.chamberSize, 'x') }
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

function process(
  raw: string,
  placeIndex: Record<string, Omit<PlaceInfo, 'title'>>,
  source: ArticleSource,
  previous: RelatedArticle[],
): LoadedArticle {
  const doc = parse(raw)
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
  const series: SeriesMention[] = []
  let seriesCount = 0
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
        inList: ctx.el.tagName === 'LI',
        draftLabel:
          /^\p{Lu}|^\d/u.test(link.text) || /^Q\d+$/.test(info.name) ? link.text : info.name,
      })
    }

    // Non-events (general tool only; the earlier prototypes keep their rules):
    //   - a year inside a link's text (not at its start), or right after a capitalised
    //     multi-word name ("Bilbao Ría 2000"), is part of a name: no date chip
    //   - a sentence with two or more "<number> in <year>" pairs ("from 11,000 in 1880 to
    //     80,000 in 1900") is a quantity over time: its years are chart evidence, not dates
    const seriesYears = new Map<number, { id: string }>()
    if (source.general) {
      for (const sent of sents) {
        const pairs = [...sent.text.matchAll(PAIR)]
        if (pairs.length < 2) continue
        const id = `s${++seriesCount}`
        const subject = sent.text.slice(0, pairs[0].index).match(SUBJECT)
        const points = pairs.map((m, k) => {
          const yearAt = sent.start + m.index! + m[0].lastIndexOf(m[2])
          const pid = `${id}-y${k}`
          seriesYears.set(yearAt, { id: pid })
          return { id: pid, year: Number(m[2]), value: Number(m[1].replace(/,/g, '')), text: m[0].trim() }
        })
        series.push({
          id,
          sentence: sent.text,
          anchor: anchorFor(points[0].id, sent),
          inList: ctx.el.tagName === 'LI',
          measure: subject ? subject[1][0].toUpperCase() + subject[1].slice(1) : 'Value',
          points,
        })
      }
    }
    const inName = (m: DateMatch) =>
      m.date.precision === 'year' &&
      /^\d{4}$/.test(m.text) &&
      // In a link, but not leading it ("the 2018 MTV Europe Music Awards" is an event; "Bilbao Ría 2000" a name).
      (block.links.some((l) => l.start < m.start && l.end >= m.end) ||
        /(?:\p{Lu}[\p{L}’'-]*\s+){2,}$/u.test(block.text.slice(Math.max(0, m.start - 60), m.start)))

    // Dates: wrapped in spans.
    const wraps: { range: Range; id: string; kind?: string }[] = []
    for (const match of found) {
      const sent = sentenceAt(match.start)
      if (!sent) continue
      if (source.general && inName(match)) continue
      const yearOf = seriesYears.get(match.start)
      if (yearOf) {
        // Kept in the text as an anchor for the chart's points, never a chip.
        const range = rangeFor(block, match.start, match.end)
        if (range) wraps.push({ range, id: yearOf.id, kind: 'series' })
        continue
      }
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
        inList: ctx.el.tagName === 'LI',
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
    for (const { range, id, kind } of wraps.reverse()) {
      const span = doc.createElement('span')
      span.className = kind === 'series' ? 'tl-series-year' : 'tl-mention'
      span.dataset.kind = kind ?? 'date'
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

  // Data tables: marked for Pick, with a chip before each and an id on every row.
  const infobox = readInfobox(body, source.title)
  const found = source.general ? generalTables(body, 't') : dataTables(body, infobox.chamberSize, 't')
  const tables: TableMention[] = found.map((t) => {
    t.el.dataset.pickTable = t.id
    t.el.id ||= `tl-src-${t.id}`
    t.rows.forEach((r, i) => (r.el.dataset.tlId = `${t.id}-r${i}`))
    const pick = doc.createElement('div')
    pick.className = 'tl-table-pick'
    pick.setAttribute('contenteditable', 'false')
    pick.innerHTML =
      `<button type="button" class="tl-mention tl-table-chip" data-kind="table" data-tl-id="${t.id}">` +
      (source.general
        ? '<span class="tl-table-chip__use">Use this</span><span class="tl-table-chip__using">In use</span></button>'
        : '<span class="tl-table-chip__use">Use this table</span><span class="tl-table-chip__using">Using this table</span></button>')
    t.el.before(pick)
    const label = t.caption || t.sectionTitle
    return {
      id: t.id,
      text: label,
      value: t,
      sentence: '',
      sentenceOffset: [0, 0],
      anchor: {
        sectionId: t.sectionId,
        sectionTitle: t.sectionTitle,
        mentionId: t.id,
        sentenceStart: 0,
        sentenceEnd: 0,
      },
      links: [],
      draftLabel: label,
    }
  })

  // Other wiki pages aren't part of the prototype: open them on Wikipedia instead of a dead route.
  const self = `./${source.title.replace(/ /g, '_')}#`
  body.querySelectorAll<HTMLAnchorElement>('a[href^="./"]').forEach((a) => {
    const href = a.getAttribute('href') ?? ''
    if (href.startsWith(self)) return
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
    // General tool: the image itself is pickable (its figure, gallery box or infobox cell).
    if (source.general) {
      const box = img.closest<HTMLElement>('figure, .gallerybox, .infobox-image') ?? img
      box.classList.add('tl-mention', 'tl-pick-image')
      box.id ||= `tl-img-${i}`
      box.dataset.kind = 'image'
      box.dataset.tlId = `img${i}`
      box.setAttribute('contenteditable', 'false')
    }
  })

  const topSection: Record<string, { id: string; title: string }> = { Lead: { id: 'Lead', title: 'Lead' } }
  body.querySelectorAll<HTMLElement>('h2, h3, h4, h5, h6').forEach((h) => {
    if (!h.id) return
    let s = h.closest('section')
    let top: HTMLElement | null = null
    while (s) {
      const own = s.querySelector<HTMLElement>(':scope > h2, :scope > .mw-heading > h2')
      if (own) top = own
      s = s.parentElement?.closest('section') ?? null
    }
    topSection[h.id] = top ? { id: top.id, title: top.textContent?.trim() ?? top.id } : { id: h.id, title: h.textContent?.trim() ?? h.id }
  })

  // The same file at several sizes (thumbnail in the text, larger in a gallery): give every
  // use the largest copy the snapshot has, so a figure drawn wide is not upscaled from a thumbnail.
  const fileOf = (src: string) => src.split('/').pop()?.replace(/^\d+px-/, '') ?? src
  const pxOf = (src: string) => Number(src.split('/').pop()?.match(/^(\d+)px-/)?.[1] ?? 0)
  const largest = new Map<string, string>()
  for (const im of images) {
    const k = fileOf(im.src)
    if (!largest.has(k) || pxOf(im.src) > pxOf(largest.get(k)!)) largest.set(k, im.src)
  }
  for (const im of images) im.src = largest.get(fileOf(im.src)) ?? im.src

  const sectionLength: Record<string, number> = {}
  body.querySelectorAll<HTMLElement>('section').forEach((sec) => {
    const h = sec.querySelector<HTMLElement>(':scope > h2, :scope > .mw-heading > h2')
    if (h?.id) sectionLength[h.id] = (sec.textContent ?? '').length
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
    tables,
    series,
    infobox,
    previous,
    compare: [],
    labels: {},
    labelLanguages: [],
    source,
    dayFirst: /Template:Use_dmy_dates/.test(raw),
    topSection,
    sectionLength,
    images,
    sections,
    subject: { name: source.title, birth, ...subjectOf(body) },
  }
}
