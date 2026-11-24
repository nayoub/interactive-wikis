/**
 * The shared event collections the five navigators compare. One collection
 * per article, identical across variants. Every event is an editor's pick of
 * a date mention already in the article (found by its date text and a
 * snippet of its sentence), with a label trimmed from that sentence: no new
 * claims, no generated dates. Images are the article's own, attached only
 * where the source sentence and the image caption name the same thing.
 *
 * Also curated here, explicitly per article:
 *   - `topics`: rows for Parallel histories (D), each grounded in named
 *     top-level sections of the article;
 *   - `milestone`: the editor's smaller selection for Illustrated milestones (E).
 */
import { eventFromMention } from '../curate/fromMention'
import type { ArticleSource, LoadedArticle } from '../host/loadArticle'
import { dateYears } from '../model/dates'
import type { EventImage, TimelineEvent } from '../model/types'

export interface NavEvent extends TimelineEvent {
  /** Row in Parallel histories (D): a `Topic.id`. */
  topic: string
  /** In the editor's milestone selection (E). */
  milestone: boolean
  /** Document order of the source passage (ties in chronology keep article order). */
  order: number
  /** A concise label for compact event blocks (B's even timeline); falls back to `label`. */
  short?: string
}

export interface Topic {
  id: string
  label: string
  /** Top-level section ids this row draws from (the mapping, stated). */
  sections: string[]
}

export interface Collection {
  id: ArticleId
  source: ArticleSource
  title: string
  events: NavEvent[]
  topics: Topic[]
  /** Picks that did not match a mention in this revision (should be none). */
  missing: string[]
  /** Shown in Parallel histories when the topics are a weak fit. */
  topicNote?: string
  /** The fixture: dates before the common era need an era on every label. */
  era?: boolean
}

export type ArticleId = 'frank-gehry' | 'bilbao' | 'test-fixture'

interface Pick {
  /** The mention's text exactly as the article has it. */
  date: string
  /** A snippet of the source sentence (disambiguates repeated dates). */
  sentence: string
  label: string
  /** A concise label for the timeline's event blocks, in the sentence's own words (the full label stays for previews and lists). */
  short?: string
  topic: string
  milestone?: boolean
  /** Text in the image's file name or caption; only when the sentence names the same subject. */
  image?: string
}

// ── Frank Gehry ────────────────────────────────────────────────────────────
// Life events live in "Early life" and "Personal life"; buildings in "Career";
// furniture, exhibitions and software in "Academia and design career". The
// order of sections is thematic, so chronology jumps between them.
const GEHRY_TOPICS: Topic[] = [
  { id: 'life', label: 'Life', sections: ['Early_life', 'Personal_life_and_death'] },
  { id: 'buildings', label: 'Buildings and practice', sections: ['Lead', 'Career'] },
  { id: 'design', label: 'Design beyond buildings', sections: ['Academia_and_design_career'] },
]
const GEHRY: Pick[] = [
  { date: 'February 28, 1929', sentence: 'Toronto General Hospital', label: 'Born at Toronto General Hospital', short: 'Born in Toronto', topic: 'life', milestone: true },
  { date: '1937', sentence: 'Timmins', label: 'Family moved to Timmins, Ontario', short: 'Moved to Timmins, Ontario', topic: 'life' },
  { date: '1947', sentence: 'immigrated to the United States', label: 'Family immigrated to the United States', short: 'Immigrated to the United States', topic: 'life' },
  { date: '1954', sentence: 'changed his surname', label: 'Changed his surname from Goldberg to Gehry', short: 'Changed his surname to Gehry', topic: 'life' },
  { date: '1954', sentence: 'graduate from the University of Southern California', label: 'Graduated from the USC School of Architecture', short: 'Graduated from USC', topic: 'life' },
  { date: 'the fall of 1956', sentence: 'city planning at Harvard', label: 'Studied city planning at Harvard', short: 'City planning at Harvard', topic: 'life' },
  { date: '1957', sentence: 'first private residence', label: 'Designed his first private residence, the David Cabin', short: 'David Cabin, his first residence', topic: 'buildings', milestone: true, image: 'David Cabin' },
  { date: '1962', sentence: 'established a practice', label: 'Established a practice in Los Angeles', short: 'Practice in Los Angeles', topic: 'buildings', milestone: true },
  { date: '1965', sentence: 'Art Treasures of Japan', label: 'Exhibition display for “Art Treasures of Japan” at LACMA', short: '“Art Treasures of Japan” display', topic: 'design' },
  { date: 'from 1969 to 1973', sentence: 'Easy Edges', label: '“Easy Edges” cardboard furniture produced', short: '“Easy Edges” furniture', topic: 'design' },
  { date: 'the 1970s', sentence: 'rose to prominence', label: 'Rose to prominence', short: 'Rose to prominence', topic: 'buildings' },
  { date: '1977', sentence: 'purchased by Gehry', label: 'Purchased his Santa Monica residence', short: 'Santa Monica residence', topic: 'buildings', milestone: true, image: 'Gehry Residence' },
  { date: 'between 1984 and 1986', sentence: 'Fish Lamps', label: 'First Fish Lamps fabricated', short: 'First Fish Lamps', topic: 'design' },
  { date: '1989', sentence: 'Pritzker Architecture Prize, where', label: 'Received the Pritzker Architecture Prize', short: 'Pritzker Architecture Prize', topic: 'buildings', milestone: true },
  { date: 'From 1994 to 1996', sentence: 'public housing project', label: 'Public housing buildings realized in Goldstein, Frankfurt', short: 'Public housing in Goldstein', topic: 'buildings' },
  { date: '1997', sentence: 'Guggenheim Museum Bilbao opened', label: 'Guggenheim Museum Bilbao opened', short: 'Guggenheim Museum Bilbao opened', topic: 'buildings', milestone: true, image: 'Guggenheim Museum Bilbao' },
  { date: '2002', sentence: 'Gehry Technologies that was established', label: 'Gehry Technologies established', short: 'Gehry Technologies', topic: 'design' },
  { date: '2002', sentence: 'restored Gehry\'s Canadian citizenship', label: 'Canadian citizenship restored', short: 'Canadian citizenship restored', topic: 'life' },
  { date: '2003', sentence: 'Walt Disney Concert Hall (2003)', label: 'Walt Disney Concert Hall, downtown Los Angeles', short: 'Walt Disney Concert Hall', topic: 'buildings', image: 'Walt Disney Concert Hall' },
  { date: 'December 5, 2025', sentence: 'died at the age of 96', label: 'Died at his home in Santa Monica', short: 'Died in Santa Monica', topic: 'life', milestone: true },
]

// ── Bilbao ─────────────────────────────────────────────────────────────────
// "History" is chronological on its own; the same city's banks, bridges,
// trams, floods and museums are told in Economy, Cityscape, Geography,
// Culture and Transport.
const BILBAO_TOPICS: Topic[] = [
  { id: 'history', label: 'History', sections: ['History'] },
  { id: 'city', label: 'Economy and cityscape', sections: ['Economy', 'Cityscape'] },
  { id: 'life', label: 'Geography, culture and transport', sections: ['Geography', 'Culture', 'Transport'] },
]
const BILBAO: Pick[] = [
  { date: '15 June 1300', sentence: 'municipal charter', label: 'Founded by municipal charter of Diego López V de Haro', short: 'Founded by municipal charter', topic: 'history', milestone: true, image: 'Don_Diego' },
  { date: '1372', sentence: 'free port', label: 'Named a free port by John I of Castile', short: 'Named a free port', topic: 'history' },
  { date: '21 June 1511', sentence: 'Consulate of the Sea', label: 'Consulate of the Sea of Bilbao created', short: 'Consulate of the Sea', topic: 'history', milestone: true },
  { date: '1571', sentence: 'walls were demolished', label: 'City walls demolished', short: 'City walls demolished', topic: 'city' },
  { date: '1602', sentence: 'capital of Biscay', label: 'Made the capital of Biscay', short: 'Capital of Biscay', topic: 'history' },
  { date: 'Around 1631', sentence: 'taxation on salt', label: 'Revolts against the salt tax', short: 'Salt tax revolts', topic: 'history' },
  { date: '1857', sentence: 'Bank of Bilbao', label: 'Bank of Bilbao established', short: 'Bank of Bilbao', topic: 'city' },
  { date: '1876', sentence: 'annexed', label: 'Annexed the neighbouring municipality of Abando', short: 'Abando annexed', topic: 'city' },
  { date: '1876', sentence: 'original tram network', label: 'Original tram network started operations', short: 'First tram network', topic: 'life' },
  { date: 'Between 1890 and 1893', sentence: 'Puente Colgante', label: 'Puente Colgante transporter bridge built', short: 'Puente Colgante built', topic: 'city', milestone: true },
  { date: '21 July 1890', sentence: 'stock exchange', label: 'Stock exchange market realized', short: 'Stock exchange', topic: 'city' },
  { date: '31 August 1936', sentence: 'first bombing', label: 'First bombing of the city', short: 'First bombing', topic: 'history', milestone: true },
  { date: 'June 1968', sentence: 'University of Bilbao', label: 'University of Bilbao established', short: 'University of Bilbao', topic: 'history' },
  { date: '26 August 1983', sentence: 'Aste Nagusia, the estuary', label: 'Estuary flooded during Aste Nagusia', short: 'Estuary flood', topic: 'history', milestone: true },
  { date: '26 August 1983', sentence: 'maximum precipitation', label: 'Record rainfall in a day: 225.6 mm', short: 'Record rainfall', topic: 'life' },
  { date: 'the mid-1990s', sentence: 'deindustrialization', label: 'Deindustrialization and transition to services', short: 'Deindustrialization', topic: 'history' },
  { date: '1995', sentence: 'The Bilbao Metro, established', label: 'Bilbao Metro established', short: 'Bilbao Metro', topic: 'life', image: 'Bilbao_Metro_05_2012_2406' },
  { date: '19 October 1997', sentence: 'was inaugurated', label: 'Guggenheim Museum Bilbao inaugurated', short: 'Guggenheim Museum Bilbao', topic: 'life', milestone: true, image: 'Guggenheim_Museum__Bilbao__26311230864_' },
  { date: '18 May 2010', sentence: 'Lee Kuan Yew', label: 'Awarded the Lee Kuan Yew World City Prize', short: 'World City Prize', topic: 'city' },
]

export const ARTICLES: Record<Exclude<ArticleId, 'test-fixture'>, { source: ArticleSource; picks: Pick[]; topics: Topic[] }> = {
  'frank-gehry': {
    source: { slug: 'frank-gehry', title: 'Frank Gehry', defaultSection: { id: 'Career', title: 'Career' } },
    picks: GEHRY,
    topics: GEHRY_TOPICS,
  },
  bilbao: {
    source: { slug: 'bilbao', title: 'Bilbao', defaultSection: { id: 'History', title: 'History' } },
    picks: BILBAO,
    topics: BILBAO_TOPICS,
  },
}

const findImage = (article: LoadedArticle, want: string): EventImage | undefined =>
  article.images.find(
    (img) =>
      img.src.toLowerCase().includes(want.toLowerCase()) ||
      img.caption.toLowerCase().includes(want.toLowerCase()),
  )

/** Chronological, ties in article order. */
export function chronological<T extends NavEvent>(events: T[]): T[] {
  return [...events].sort((a, b) => dateYears(a.date) - dateYears(b.date) || a.order - b.order)
}

export function buildCollection(id: Exclude<ArticleId, 'test-fixture'>, article: LoadedArticle): Collection {
  const def = ARTICLES[id]
  const missing: string[] = []
  const used = new Set<string>()
  const order = new Map(article.mentions.map((m, i) => [m.id, i]))
  const events = def.picks.flatMap((pick) => {
    const m = article.mentions.find(
      (x) => !used.has(x.id) && x.text === pick.date && x.sentence.includes(pick.sentence),
    )
    if (!m) {
      missing.push(`${pick.date} — ${pick.label}`)
      return []
    }
    used.add(m.id)
    const e = eventFromMention(m)
    const nav: NavEvent = {
      ...e,
      label: pick.label,
      topic: pick.topic,
      milestone: !!pick.milestone,
      order: order.get(m.id) ?? 0,
      short: pick.short,
    }
    if (pick.image) nav.image = findImage(article, pick.image)
    return [nav]
  })
  return {
    id,
    source: def.source,
    title: def.source.title,
    events: chronological(events),
    topics: def.topics,
    missing,
  }
}
