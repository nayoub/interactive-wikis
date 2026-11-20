/**
 * "Load example": an editor's finished picks for the Frank Gehry snapshot.
 * Each pick points at a real mention in the text; labels are the editor's
 * trims of the source sentence (no new claims); images are the article's own.
 */
import { eventFromMention, placeFromMention } from '../curate/fromMention'
import { applyTable } from '../curate/visual'
import type { MapData, ModuleKind, Placement, Timeline } from '../model/types'
import type { LoadedArticle } from './loadArticle'
import type { PlacedModule } from './store'

const findImage = (article: LoadedArticle, want: string) =>
  article.images.find(
    (img) =>
      img.src.toLowerCase().includes(want.toLowerCase()) ||
      img.caption.toLowerCase().includes(want.toLowerCase()),
  )

const top = (sectionId: string, sectionTitle: string): Placement => ({
  kind: 'sectionTop',
  sectionId,
  sectionTitle,
})

// ── Timeline: Early life and Career ────────────────────────────────────────
const EVENTS = [
  {
    date: 'February 28, 1929',
    sentence: 'Toronto General Hospital',
    label: 'Born at Toronto General Hospital',
  },
  { date: '1937', sentence: 'Timmins', label: 'Family moved to Timmins, Ontario' },
  {
    date: '1947',
    sentence: 'immigrated to the United States',
    label: 'Family immigrated to the United States, settling in California',
  },
  {
    date: '1954',
    sentence: 'graduate from the University of Southern California',
    label: 'Graduated from the USC School of Architecture',
  },
  {
    date: '1957',
    sentence: 'first private residence',
    label: 'Designed his first private residence, the David Cabin',
    image: 'David Cabin',
  },
  {
    date: '1962',
    sentence: 'established a practice',
    label: 'Established a practice in Los Angeles',
  },
  {
    date: '1977',
    sentence: 'purchased by Gehry',
    label: 'Purchased his Santa Monica residence',
    image: 'Gehry Residence',
  },
  {
    date: '1989',
    sentence: 'Pritzker Architecture Prize, where',
    label: 'Received the Pritzker Architecture Prize',
  },
  {
    date: '1997',
    sentence: 'Guggenheim Museum Bilbao opened',
    label: 'Guggenheim Museum Bilbao opened',
    image: 'Guggenheim Museum Bilbao',
  },
  {
    date: '2003',
    sentence: 'Walt Disney Concert Hall',
    label: 'Walt Disney Concert Hall, downtown Los Angeles',
    image: 'Walt Disney Concert Hall',
  },
]

export function buildTimeline(article: LoadedArticle): Timeline {
  const items = EVENTS.flatMap((pick) => {
    const m = article.mentions.find(
      (x) => x.text === pick.date && x.sentence.includes(pick.sentence),
    )
    if (!m) return []
    const e = eventFromMention(m)
    e.label = pick.label
    if (pick.image) e.image = findImage(article, pick.image)
    return [e]
  })
  return { title: 'Early life and career', items, options: { showAge: true, showGaps: true } }
}

// ── Map: buildings on three continents, a cluster in Los Angeles ───────────
const PLACES = [
  { title: 'Gehry_Residence' },
  { title: 'Santa_Monica_Place' },
  { title: 'Chiat/Day_Building' },
  { title: 'California_Aerospace_Museum' },
  { title: 'Walt_Disney_Concert_Hall', image: 'Walt Disney Concert Hall' },
  { title: 'Frederick_Weisman_Museum_of_Art' },
  { title: 'Jay_Pritzker_Pavilion' },
  { title: '8_Spruce_Street', image: '8 Spruce Street' },
  { title: 'Biomuseo', image: 'Biomuseo' },
  { title: 'Guggenheim_Museum_Bilbao', image: 'Guggenheim Museum Bilbao' },
  { title: 'Dancing_House', image: 'Dancing House' },
  { title: 'Dr_Chau_Chak_Wing_Building', image: 'Dr Chau Chak Wing' },
]

export function buildMap(article: LoadedArticle): MapData {
  const items = PLACES.flatMap((pick) => {
    // The first mention in Career, else the first anywhere.
    const all = article.places.filter((m) => m.value.title === pick.title)
    const m = all.find((x) => x.anchor.sectionId === 'Career') ?? all[0]
    if (!m) return []
    const p = placeFromMention(m)
    if (pick.image) p.image = findImage(article, pick.image)
    return [p]
  })
  return { title: 'Buildings', items, options: { shadeByDate: false } }
}

export function timelineExample(article: LoadedArticle): Partial<Record<'timeline', PlacedModule>> {
  return { timeline: { data: buildTimeline(article), placement: top('Career', 'Career') } }
}

export function bothExamples(
  article: LoadedArticle,
): Partial<Record<'timeline' | 'map', PlacedModule>> {
  return {
    timeline: { data: buildTimeline(article), placement: top('Career', 'Career') },
    map: { data: buildMap(article), placement: top('Architectural_style', 'Architectural style') },
  }
}

// ── 2025 German federal election: results, the run-up, places ──────────────
const ELECTION_EVENTS = [
  {
    date: '6 November 2024',
    sentence: 'dismissed FDP leader',
    label: 'Scholz dismissed FDP leader Christian Lindner from the government',
  },
  {
    date: '11 December 2024',
    sentence: 'motion of confidence',
    label: 'Scholz submitted a motion of confidence to the Bundestag',
  },
  {
    date: '23 February 2025',
    sentence: 'to elect the 630 members',
    label: 'Federal election held for the 630 members of the 21st Bundestag',
  },
  {
    date: '9 April 2025',
    sentence: 'secured a ruling coalition',
    label: 'CDU/CSU and SPD secured a coalition agreement',
  },
  {
    date: '6 May 2025',
    sentence: 'Friedrich Merz was elected',
    label: 'Friedrich Merz elected chancellor',
  },
]
const ELECTION_PLACES = [
  'Berlin-Treptow_–_Köpenick',
  'Berlin-Lichtenberg_(electoral_district)',
  'Berlin-Marzahn_–_Hellersdorf',
  'Leipzig_II',
  'Erfurt_–_Weimar_–_Weimarer_Land_II',
  'Rostock_–_Landkreis_Rostock_II',
  'Bremen_II_–_Bremerhaven',
  'Rottal-Inn_(electoral_district)',
]

export function electionExample(article: LoadedArticle): Partial<Record<ModuleKind, PlacedModule>> {
  const out: Partial<Record<ModuleKind, PlacedModule>> = {}
  const events = ELECTION_EVENTS.flatMap((pick) => {
    const m = article.mentions.find(
      (x) => x.text === pick.date && x.sentence.includes(pick.sentence),
    )
    if (!m) return []
    const e = eventFromMention(m)
    e.label = pick.label
    return [e]
  })
  if (events.length)
    out.timeline = {
      data: {
        title: 'From the coalition collapse to a new government',
        items: events,
        options: { showAge: false, showGaps: true },
      },
      placement: top('Snap_election', 'Snap election'),
    }
  const results = article.tables.find((t) => t.anchor.sectionId === 'Results')
  if (results) {
    const { items, spec } = applyTable(article, results.value, null, null)
    out.visual = {
      data: {
        title: 'Seats in the Bundestag',
        items,
        options: {},
        spec: { ...spec, form: 'seats', years: true },
      },
      placement: top('Results', 'Results'),
    }
  }
  const places = ELECTION_PLACES.flatMap((title) => {
    const m = article.places.find((x) => x.value.title === title)
    return m ? [placeFromMention(m)] : []
  })
  if (places.length)
    out.map = {
      data: {
        title: 'Constituencies named in the article',
        items: places,
        options: { shadeByDate: false },
      },
      placement: top('Results_by_state', 'Results by state'),
    }
  return out
}
