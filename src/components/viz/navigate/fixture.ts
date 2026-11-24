/**
 * The edge-case test fixture: a synthetic page (public/snapshots/
 * timeline-test-fixture.html) and its events, for checking the navigators
 * against what the two articles do not have. Nothing here is article
 * content; the page says so at the top. Dates use the existing model
 * (../model/types.ts): BCE as negative years, centuries and decades as
 * year ranges, approximate dates as `circa`.
 */
import type { LoadedArticle } from '../host/loadArticle'
import type { TimelineDate } from '../model/types'
import { chronological, type Collection, type NavEvent } from './events'

export const FIXTURE_SOURCE = {
  slug: 'timeline-test-fixture',
  title: 'Timeline navigation test fixture',
  defaultSection: { id: 'Recent_cases', title: 'Recent cases' },
}

interface FixturePick {
  id: string
  section: [string, string]
  date: TimelineDate
  /** The sentence exactly as the page has it (the anchor is found by this text). */
  sentence: string
  label: string
  topic: string
  milestone?: boolean
  /** Point at a passage the page does not have. */
  mentionId?: string
}

const Y = (y: number): TimelineDate => ({ start: { y }, precision: 'year' })
const R = (a: number, b: number): TimelineDate => ({ start: { y: a }, end: { y: b }, precision: 'year' })
const RECENT: [string, string] = ['Recent_cases', 'Recent cases']
const ANCIENT: [string, string] = ['Ancient_cases', 'Ancient cases']
const MEDIEVAL: [string, string] = ['Medieval_cases', 'Medieval cases']
const REPEATED: [string, string] = ['Repeated_cases', 'Repeated cases']

const PICKS: FixturePick[] = [
  { id: 'fx-500bce', section: ANCIENT, date: Y(-500), sentence: 'Test sentence A1: a point event in 500 BCE.', label: 'Test point before the common era', topic: 'a', milestone: true },
  { id: 'fx-c1bce', section: ANCIENT, date: R(-100, -1), sentence: 'Test sentence A2: an approximate event in the 1st century BCE.', label: 'Test century before the common era', topic: 'a' },
  { id: 'fx-44bce', section: ANCIENT, date: Y(-44), sentence: 'Test sentence A3: a point event in 44 BCE.', label: 'Test point inside that century', topic: 'a' },
  { id: 'fx-c3', section: ANCIENT, date: R(201, 300), sentence: 'Test sentence A4: an approximate event in the 3rd century, written without an era.', label: 'Test century of the common era', topic: 'a' },
  { id: 'fx-c1200', section: MEDIEVAL, date: { ...Y(1200), circa: true }, sentence: 'Test sentence M1: an event dated around 1200.', label: 'Test approximate year', topic: 'b', milestone: true },
  { id: 'fx-1350', section: MEDIEVAL, date: R(1350, 1450), sentence: 'Test sentence M2: a duration from 1350 to 1450.', label: 'Test duration', topic: 'b' },
  { id: 'fx-1400', section: MEDIEVAL, date: R(1400, 1500), sentence: 'Test sentence M3: a second duration from 1400 to 1500, overlapping the first.', label: 'Test overlapping duration', topic: 'b' },
  { id: 'fx-1800a', section: REPEATED, date: Y(1800), sentence: 'Test sentence P1: something happens in 1800 in this section.', label: 'Test repeated year, first passage', topic: 'd' },
  { id: 'fx-1800b', section: REPEATED, date: Y(1800), sentence: 'Something else happens in 1800 here.', label: 'Test repeated year, second passage (collapsible section)', topic: 'd' },
  { id: 'fx-1900a', section: RECENT, date: { start: { y: 1900, m: 5, d: 1 }, precision: 'day' }, sentence: 'Test sentence R3: on 1 May 1900 the first of three same-day test events happens.', label: 'Test same day, first', topic: 'c', milestone: true },
  { id: 'fx-1900b', section: RECENT, date: { start: { y: 1900, m: 5, d: 1 }, precision: 'day' }, sentence: 'Test sentence R4: on 1 May 1900 the second same-day test event happens.', label: 'Test same day, second', topic: 'c' },
  { id: 'fx-1900c', section: RECENT, date: { start: { y: 1900, m: 5, d: 1 }, precision: 'day' }, sentence: 'Test sentence R5: on 1 May 1900 the third same-day test event happens.', label: 'Test same day, third', topic: 'c' },
  {
    id: 'fx-1950',
    section: RECENT,
    date: Y(1950),
    sentence: 'Test sentence R2: the label for 1950 is deliberately very long, so that every navigator has to wrap or truncate it without overlapping its neighbours or hiding its date.',
    label: 'Test label that is deliberately very long, so that every navigator has to wrap or truncate it without overlapping its neighbours or hiding its date',
    topic: 'c',
  },
  { id: 'fx-1960', section: RECENT, date: Y(1960), sentence: 'Test sentence R6: the year 1960 has a label in Arabic script, to test bidirectional text in a left-to-right page.', label: 'افتتاح المكتبة (test label in Arabic script)', topic: 'c' },
  { id: 'fx-2000', section: RECENT, date: R(2000, 2020), sentence: 'Test sentence R1: a span runs from 2000 to 2020 in this fixture.', label: 'Test twenty-year duration', topic: 'c', milestone: true },
  { id: 'fx-2010', section: REPEATED, date: Y(2010), sentence: 'This sentence is not in the page.', label: 'Test unresolved source passage', topic: 'd', mentionId: 'fx-gone' },
]

export function buildFixture(article: LoadedArticle): Collection {
  const events: NavEvent[] = PICKS.map((p, i) => ({
    id: p.id,
    label: p.label,
    date: p.date,
    sourceText: p.sentence,
    sourceDateText: '',
    sourceAnchor: {
      sectionId: p.section[0],
      sectionTitle: p.section[1],
      mentionId: p.mentionId ?? p.id,
      // Offsets left empty: the passage is found by its sentence text.
      sentenceStart: 0,
      sentenceEnd: 0,
    },
    topic: p.topic,
    milestone: !!p.milestone,
    order: i,
  }))
  void article
  return {
    id: 'test-fixture',
    source: FIXTURE_SOURCE,
    title: FIXTURE_SOURCE.title,
    events: chronological(events),
    topics: [
      { id: 'a', label: 'Ancient cases', sections: ['Ancient_cases'] },
      { id: 'b', label: 'Medieval cases', sections: ['Medieval_cases'] },
      { id: 'c', label: 'Recent cases', sections: ['Recent_cases'] },
      { id: 'd', label: 'Repeated cases', sections: ['Repeated_cases'] },
    ],
    topicNote: 'Test rows only: the fixture has no real topics.',
    missing: [],
    era: true,
  }
}
