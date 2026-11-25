/**
 * Occurrences: dated events described in the article, each with the linked
 * names (works, places, people, concepts) the source sentence attaches to
 * it. The shared curated events (events.ts) are occurrences too; these
 * records add the article's other dated works and exhibitions.
 *
 * Rules (checked when built; failures are listed, never patched over):
 *   - the date is a date mention already in the article (found by its exact
 *     text and a snippet of its sentence) — no date comes from elsewhere;
 *   - every linked name is a real link in that sentence's paragraph, kept
 *     with its own href and classes (red links stay red because the source
 *     marks them `new`; redirects and external links keep their classes);
 *   - the qualifier is a verbatim span of the sentence;
 *   - one occurrence per event: other passages that tell the same event are
 *     kept as `also`, and never add a mark.
 */
import { eventFromMention } from '../curate/fromMention'
import type { LoadedArticle } from '../host/loadArticle'
import { chronological, type ArticleId, type Collection, type NavEvent } from './events'

export interface LinkRef {
  text: string
  href: string
  /** The source link's classes (minus picking marks): 'new' = red link, 'mw-redirect', 'external text'… */
  className: string
  title?: string
  /** Wiki page title, for following its other mentions. */
  target: string | null
}

export type Category = 'life' | 'work' | 'recognition' | 'city' | 'history'
export type Status = 'occurred' | 'planned' | 'expected'

export interface Occurrence extends NavEvent {
  links: LinkRef[]
  /** Verbatim span of the source sentence saying what happened. */
  qualifier: string
  category: Category
  /** Short name for a direct label on the time field, when the editor chose one. */
  direct?: string
  /** Other mentions of the same event (mention ids): one mark, several passages. */
  also: string[]
  /** Paired chronology: what the source says happened, was planned, or was expected. */
  status: Status
  /** Paired chronology stream, where the source supports one: a plan, or something built or opened. */
  pair?: 'plan' | 'built'
}

interface Rec {
  date: string
  sentence: string
  links?: string[]
  qualifier: string
  category: Category
  direct?: string
  /** [date text, sentence snippet] of other mentions of the same event. */
  also?: [string, string][]
  status?: Status
  /** A second event told by the same date mention ("two museums … opened"): its own mark, same passage. */
  sameMention?: boolean
  pair?: 'plan' | 'built'
  /** The article's own image of the same thing (caption or file name text). */
  image?: string
}

// ── Frank Gehry ────────────────────────────────────────────────────────────
// Links and qualifiers for the shared curated events (by their date + snippet).
const GEHRY_CURATED: Rec[] = [
  { date: 'February 28, 1929', sentence: 'Toronto General Hospital', links: ['Toronto General Hospital'], qualifier: 'born', category: 'life', direct: 'Born', also: [['February 28, 1929', 'Frank Owen Gehry']] },
  { date: '1937', sentence: 'Timmins', links: ['Timmins, Ontario'], qualifier: 'moved to the gold mining town of Timmins', category: 'life' },
  { date: '1947', sentence: 'immigrated to the United States', qualifier: 'immigrated to the United States', category: 'life' },
  { date: '1954', sentence: 'changed his surname', qualifier: 'changed his surname from Goldberg to Gehry', category: 'life' },
  { date: '1954', sentence: 'graduate from the University of Southern California', links: ['University of Southern California'], qualifier: 'graduate from', category: 'life' },
  { date: 'the fall of 1956', sentence: 'city planning at Harvard', links: ['Harvard University', 'Graduate School of Design'], qualifier: 'studied city planning', category: 'life' },
  { date: '1957', sentence: 'first private residence', qualifier: 'his first private residence', category: 'work' },
  { date: '1962', sentence: 'established a practice', qualifier: 'established a practice', category: 'work' },
  { date: '1965', sentence: 'Art Treasures of Japan', qualifier: 'exhibition display', category: 'work' },
  { date: 'from 1969 to 1973', sentence: 'Easy Edges', links: ['cardboard'], qualifier: 'first line of furniture', category: 'work' },
  { date: 'the 1970s', sentence: 'rose to prominence', qualifier: 'rose to prominence', category: 'recognition' },
  { date: '1977', sentence: 'purchased by Gehry', qualifier: 'purchased by Gehry', category: 'life' },
  { date: 'between 1984 and 1986', sentence: 'Fish Lamps', qualifier: 'the first Fish Lamps were fabricated', category: 'work' },
  { date: '1989', sentence: 'Pritzker Architecture Prize, where', links: ['Pritzker Architecture Prize'], qualifier: 'received', category: 'recognition', direct: 'Pritzker Prize', also: [['1989', 'including the Pritzker Architecture Prize in 1989']] },
  { date: 'From 1994 to 1996', sentence: 'public housing project', links: ['Frankfurt-Schwanheim'], qualifier: 'public housing project', category: 'work' },
  { date: '1997', sentence: 'Guggenheim Museum Bilbao opened', links: ['Guggenheim Museum Bilbao', 'Bilbao'], qualifier: 'opened', category: 'work', direct: 'Guggenheim Bilbao' },
  { date: '2002', sentence: 'Gehry Technologies that was established', qualifier: 'Gehry Technologies that was established', category: 'work' },
  { date: '2002', sentence: 'restored Gehry\'s Canadian citizenship', links: ['Jean Chrétien'], qualifier: 'restored Gehry\'s Canadian citizenship', category: 'life' },
  { date: '2003', sentence: 'Walt Disney Concert Hall (2003)', links: ['Walt Disney Concert Hall'], qualifier: 'centerpiece of the neighborhood\'s revitalization', category: 'work', direct: 'Disney Hall' },
  { date: 'December 5, 2025', sentence: 'died at the age of 96', qualifier: 'died', category: 'life', direct: 'Died', also: [['December 5, 2025', 'Frank Owen Gehry']] },
]
// The article's other dated works, exhibitions and honours.
const GEHRY_MORE: Rec[] = [
  { date: '1974', sentence: 'College of Fellows', links: ['American Institute of Architects'], qualifier: 'elected to the College of Fellows', category: 'recognition' },
  { date: '1980', sentence: 'Santa Monica Place (1980)', links: ['Santa Monica Place'], qualifier: 'commercial structures', category: 'work' },
  { date: '1981', sentence: 'Cabrillo Marine Aquarium (1981)', links: ['Cabrillo Marine Aquarium'], qualifier: 'completed during the 1980s', category: 'work' },
  { date: '1984', sentence: 'California Aerospace Museum (1984)', links: ['California Aerospace Museum'], qualifier: 'completed during the 1980s', category: 'work' },
  { date: '1986', sentence: 'Standing Glass Fish', links: ['Minneapolis Sculpture Garden'], qualifier: 'Standing Glass Fish', category: 'work' },
  { date: '1989', sentence: 'first European commission', links: ['Vitra International Furniture'], qualifier: 'first European commission', category: 'work' },
  { date: '1989–92', sentence: 'Fish Sculpture at La Vila', links: ['La Vila Olímpica del Poblenou'], qualifier: 'Fish Sculpture', category: 'work' },
  { date: '1991', sentence: 'Chiat/Day Building (1991)', links: ['Chiat/Day Building', 'Claes Oldenburg'], qualifier: 'notable buildings in California', category: 'work', direct: 'Chiat/Day' },
  { date: '1992', sentence: 'Museum of Modern Art (1992)', links: ['Museum of Modern Art'], qualifier: 'mounted exhibitions on Gehry\'s work', category: 'recognition' },
  { date: '1993', sentence: 'Frederick Weisman Museum of Art (1993)', links: ['Frederick Weisman Museum of Art'], qualifier: 'major commissions', category: 'work' },
  { date: '1994', sentence: 'Cinémathèque Française (1994)', links: ['Cinémathèque Française', 'American Center in Paris'], qualifier: 'originally the American Center in Paris', category: 'work' },
  { date: '1996', sentence: 'Dancing House in Prague (1996)', links: ['Dancing House'], qualifier: 'major commissions', category: 'work', direct: 'Dancing House' },
  { date: '2000', sentence: 'Museum of Pop Culture (2000)', links: ['Museum of Pop Culture'], qualifier: 'museums', category: 'work' },
  { date: '2001', sentence: 'Solomon R. Guggenheim Museum (2001)', links: ['Solomon R. Guggenheim Museum'], qualifier: 'mounted exhibitions on Gehry\'s work', category: 'recognition' },
  { date: '2002', sentence: 'the Guggenheim Museum Bilbao (2002', links: ['Guggenheim Museum Bilbao'], qualifier: 'mounted exhibitions on Gehry\'s work', category: 'recognition' },
  { date: '2004', sentence: 'Jay Pritzker Pavilion (2004)', links: ['Jay Pritzker Pavilion', 'Millennium Park'], qualifier: 'open-air', category: 'work' },
  { date: '2004', sentence: 'Stata Center (2004)', links: ['Stata Center', 'MIT'], qualifier: 'academic buildings', category: 'work' },
  { date: '2004', sentence: 'official trophy for the World Cup of Hockey', links: ['World Cup of Hockey'], qualifier: 'designed the official trophy', category: 'work', also: [['2004', 'he designed the trophy for the World Cup of Hockey']] },
  { date: '2005', sentence: 'The Seven-Beer Snitch', links: ['The Simpsons'], qualifier: 'voiced himself', category: 'recognition' },
  { date: '2006', sentence: 'Sketches of Frank Gehry', links: ['Sydney Pollack', 'Sketches of Frank Gehry'], qualifier: 'made a documentary about Gehry\'s work', category: 'recognition' },
  { date: '2007', sentence: 'IAC Building (2007)', links: ['IAC Building'], qualifier: 'commercial buildings', category: 'work' },
  { date: '2008', sentence: 'Peter B. Lewis Library (2008)', links: ['Library'], qualifier: 'academic buildings', category: 'work' },
  { date: '2011', sentence: 'New World Center (2011)', links: ['New World Center'], qualifier: 'understated', category: 'work' },
  { date: '2011', sentence: '8 Spruce', links: ['8 Spruce'], qualifier: 'first skyscraper', category: 'work' },
  { date: 'January 2011', sentence: 'Judge Widney Professor', links: ['Judge Widney'], qualifier: 'joined the University of Southern California (USC) faculty', category: 'life' },
  { date: '2014', sentence: 'two significant, long-awaited museums', links: ['Biomuseo'], qualifier: 'opened', category: 'work' },
  { date: '2014', sentence: 'two significant, long-awaited museums', links: ['Fondation Louis Vuitton'], qualifier: 'opened', category: 'work', sameMention: true },
  { date: 'late 2014', sentence: 'Dr Chau Chak Wing Building', links: ['Dr Chau Chak Wing Building'], qualifier: 'completed', category: 'work' },
  { date: 'February 2015', sentence: 'Dr Chau Chak Wing Building', links: ['Dr Chau Chak Wing Building'], qualifier: 'officially opened', category: 'work' },
  { date: 'October 2014', sentence: 'Centre Pompidou', links: ['Centre Pompidou'], qualifier: 'first major European exhibition', category: 'recognition' },
  { date: 'October 2015', sentence: '21 21 Design Sight', links: ['21 21 Design Sight'], qualifier: 'held the exhibition', category: 'recognition' },
  { date: '2021', sentence: 'Spinning Tales', links: ['Gagosian Gallery'], qualifier: 'an exhibition of new fish sculptures', category: 'recognition' },
]

// ── Bilbao ─────────────────────────────────────────────────────────────────
const BILBAO_CURATED: Rec[] = [
  { date: '15 June 1300', sentence: 'municipal charter', links: ['Diego López V de Haro', 'municipal charter'], qualifier: 'founded Bilbao through a municipal charter', category: 'history', direct: 'Founded' },
  { date: '1372', sentence: 'free port', links: ['John I of Castile', 'free port'], qualifier: 'naming Bilbao a free port', category: 'history' },
  { date: '21 June 1511', sentence: 'Consulate of the Sea', links: ['Joanna of Castile', 'Consulate of the Sea'], qualifier: 'ordered the creation of', category: 'history', direct: 'Consulate' },
  { date: '1571', sentence: 'walls were demolished', qualifier: 'the walls were demolished', category: 'city' },
  { date: '1602', sentence: 'capital of Biscay', links: ['Biscay', 'Bermeo'], qualifier: 'made the capital of Biscay', category: 'history' },
  { date: 'Around 1631', sentence: 'taxation on salt', qualifier: 'a series of revolts against the increased taxation on salt', category: 'history' },
  { date: '1857', sentence: 'Bank of Bilbao', qualifier: 'the establishment of the Bank of Bilbao', category: 'city' },
  { date: '1876', sentence: 'annexed', links: ['annexed'], qualifier: 'annexed (in several stages)', category: 'city' },
  { date: '1876', sentence: 'original tram network', qualifier: 'original tram network started operations', category: 'city', pair: 'built', },
  { date: 'Between 1890 and 1893', sentence: 'Puente Colgante', links: ['Puente Colgante', 'Alberto Palacio'], qualifier: 'was built', category: 'city', direct: 'Puente Colgante', pair: 'built', },
  { date: '21 July 1890', sentence: 'stock exchange', links: ['stock exchange'], qualifier: 'would not be realized until', category: 'city', pair: 'built', },
  { date: '31 August 1936', sentence: 'first bombing', qualifier: 'its first bombing', category: 'history' },
  { date: 'June 1968', sentence: 'University of Bilbao', qualifier: 'the first public university, was established', category: 'history' },
  { date: '26 August 1983', sentence: 'Aste Nagusia, the estuary', links: ['Aste Nagusia'], qualifier: 'the estuary', category: 'history' },
  { date: '26 August 1983', sentence: 'maximum precipitation', qualifier: 'maximum precipitation in a day', category: 'city' },
  { date: 'the mid-1990s', sentence: 'deindustrialization', qualifier: 'process of deindustrialization', category: 'history' },
  { date: '1995', sentence: 'The Bilbao Metro, established', links: ['Bilbao Metro'], qualifier: 'established', category: 'city', pair: 'built', },
  { date: '19 October 1997', sentence: 'was inaugurated', links: ['Guggenheim Museum Bilbao', 'Frank Gehry'], qualifier: 'was inaugurated', category: 'city', direct: 'Guggenheim', pair: 'built', },
  { date: '18 May 2010', sentence: 'Lee Kuan Yew', links: ['Lee Kuan Yew'], qualifier: 'awarded Bilbao', category: 'city' },
]
// Plans and completions: the paired chronology's two streams, in the source's own words.
const BILBAO_MORE: Rec[] = [
  { date: '1861', sentence: 'projected an ensanche', links: ['ensanche', 'Abando'], qualifier: 'projected an ensanche', category: 'city', status: 'planned', pair: 'plan' },
  { date: 'the 1890s', sentence: 'a new extension was planned', qualifier: 'a new extension was planned', category: 'city', status: 'planned', pair: 'plan' },
  { date: '1936', sentence: 'The Deusto Bridge', links: ['Deusto Bridge'], qualifier: 'opened', category: 'city', pair: 'built', },
  { date: 'September 1948', sentence: 'regular flight to Madrid', qualifier: 'opened to the public', category: 'city', pair: 'built', },
  { date: '1972', sentence: 'La Salve', links: ['Princes of Spain Bridge'], qualifier: 'opened', category: 'city', pair: 'built', },
  { date: '1997', sentence: 'the Zubizuri', links: ['Zubizuri', 'Santiago Calatrava'], qualifier: 'opened', category: 'city', pair: 'built', image: 'Zubizuri', },
  { date: '19 November 2000', sentence: 'new terminal building', links: ['Santiago Calatrava'], qualifier: 'a new terminal building was opened', category: 'city', pair: 'built', },
  { date: '18 December 2002', sentence: 'new tram system', qualifier: 'The new tram system was opened', category: 'city', pair: 'built', },
  { date: '2007', sentence: 'continue the canal', links: ['Zorrozaurre'], qualifier: 'a plan was approved', category: 'city', status: 'planned', pair: 'plan' },
  { date: '2007', sentence: '2007 master plan', links: ['Zorrozaurre', 'Zaha Hadid'], qualifier: 'master plan', category: 'city', status: 'planned', pair: 'plan' },
  { date: 'February 2009', sentence: 'double its capacity', qualifier: 'a project was approved to expand the current building', category: 'city', status: 'planned', pair: 'plan' },
  { date: '2010', sentence: 'redesigned in 2010', links: ['Azkuna Zentroa', 'Philippe Starck'], qualifier: 'redesigned', category: 'city', pair: 'built', image: 'Alh_ndiga', },
  { date: '2013', sentence: 'San Mamés stadium, which opened', links: ['San Mamés stadium'], qualifier: 'opened', category: 'city', pair: 'built', image: 'The San Mamés stadium', },
  { date: '2014', sentence: 'originally expected to be completed by 2014', links: ['2008 financial crisis'], qualifier: 'originally expected to be completed by', category: 'city', status: 'expected', pair: 'plan' },
  { date: '8 April 2017', sentence: 'third line of metro', qualifier: 'This third line of metro was inaugurated', category: 'city', pair: 'built', },
  { date: '2027', sentence: 'expected to begin in 2027', qualifier: 'The construction is expected to begin', category: 'city', status: 'expected', pair: 'plan' },
  { date: 'around 2038', sentence: 'Basque Y', links: ['Basque Y'], qualifier: 'will be connected to the Basque Y high-speed train network', category: 'city', status: 'expected', pair: 'plan' },
]

const RECORDS: Partial<Record<ArticleId, Rec[]>> = {
  'frank-gehry': [...GEHRY_CURATED, ...GEHRY_MORE],
  bilbao: [...BILBAO_CURATED, ...BILBAO_MORE],
}

// ── Building ──────────────────────────────────────────────────────────────
const parsed = new WeakMap<LoadedArticle, Document>()
const docOf = (a: LoadedArticle) => {
  if (!parsed.has(a)) parsed.set(a, new DOMParser().parseFromString(`<body>${a.html}</body>`, 'text/html'))
  return parsed.get(a)!
}

function linkRefs(a: LoadedArticle, mentionId: string, sentence: string, texts: string[], problems: string[]): LinkRef[] {
  const span = docOf(a).querySelector(`[data-tl-id="${mentionId}"]`)
  const block = span?.closest('p, li')
  const anchors = block ? [...block.querySelectorAll<HTMLAnchorElement>('a')].filter((x) => !x.closest('sup')) : []
  return texts.flatMap((t) => {
    const el = sentence.includes(t) ? anchors.find((x) => x.textContent?.trim() === t) : undefined
    if (!el) {
      problems.push(`link “${t}” not in the passage of ${mentionId}`)
      return []
    }
    const href = el.getAttribute('href') ?? ''
    const m = href.match(/\/wiki\/([^#?]+)/)
    let target: string | null = null
    try {
      target = m ? decodeURIComponent(m[1]) : null
    } catch {
      target = m?.[1] ?? null
    }
    return [
      {
        text: t,
        href,
        className: el.className.replace(/\btl-mention\b/g, '').trim(),
        title: el.getAttribute('title') ?? undefined,
        target,
      },
    ]
  })
}

export interface Occurrences {
  items: Occurrence[]
  problems: string[]
}

/** Occurrences for an article: the collection's events (same ids) plus the article's other dated records. */
export function buildOccurrences(id: ArticleId, a: LoadedArticle, c: Collection): Occurrences {
  const problems: string[] = []
  if (id === 'test-fixture')
    return {
      items: c.events.map((e) => ({ ...e, links: [], qualifier: '', category: 'history', also: [], status: 'occurred' })),
      problems,
    }
  const find = (date: string, snippet: string, skip: Set<string>) =>
    a.mentions.find((m) => !skip.has(m.id) && m.text === date && m.sentence.includes(snippet))
  const used = new Set<string>()
  const order = new Map(a.mentions.map((m, i) => [m.id, i]))
  const byMention = new Map(c.events.map((e) => [e.sourceAnchor.mentionId, e]))
  const items: Occurrence[] = []
  for (const r of RECORDS[id] ?? []) {
    const m = r.sameMention
      ? a.mentions.find((x) => x.text === r.date && x.sentence.includes(r.sentence))
      : find(r.date, r.sentence, used)
    if (!m) {
      problems.push(`no mention “${r.date}” with “${r.sentence}”`)
      continue
    }
    used.add(m.id)
    if (!m.sentence.includes(r.qualifier)) problems.push(`qualifier “${r.qualifier}” is not in the sentence of ${m.id}`)
    const also = (r.also ?? []).flatMap(([d, s]) => {
      const x = find(d, s, used)
      if (!x) problems.push(`no other mention “${d}” with “${s}”`)
      else used.add(x.id)
      return x ? [x.id] : []
    })
    const base: NavEvent = byMention.get(m.id) ?? {
      ...eventFromMention(m),
      label: [...(r.links ?? []).slice(0, 1), r.qualifier].join(' — '),
      topic: '',
      milestone: false,
      order: order.get(m.id) ?? 0,
    }
    items.push({
      ...base,
      ...(r.sameMention ? { id: `${m.id}-${items.filter((x) => x.sourceAnchor.mentionId === m.id).length + 1}` } : {}),
      links: linkRefs(a, m.id, m.sentence, r.links ?? [], problems),
      qualifier: r.qualifier,
      category: r.category,
      direct: r.direct,
      also,
      status: r.status ?? 'occurred',
      pair: r.pair,
      ...(r.image ? { image: a.images.find((im) => im.src.includes(r.image!) || im.caption.includes(r.image!)) ?? base.image } : {}),
    })
  }
  // Every shared event is here (the collection is a subset of the occurrences).
  for (const e of c.events)
    if (!items.some((o) => o.id === e.id)) problems.push(`shared event ${e.id} has no occurrence record`)
  return { items: chronological(items), problems }
}

export const CATEGORY_LABEL: Record<Category, string> = {
  life: 'Life',
  work: 'Works and projects',
  recognition: 'Recognition and exhibitions',
  city: 'City and economy',
  history: 'Events',
}
