/**
 * What Pick produces: a mention of something in the article text, tied to its
 * sentence. Generic over the kind of thing (`value`): a date for timelines,
 * a place for maps, a quantity for charts.
 */
import type { Citation, SourceAnchor, TimelineDate } from '../model/types'
import type { ParsedTable } from './tables'

export interface Mention<T> {
  id: string
  /** The matched text as it appears in the article. */
  text: string
  value: T
  sentence: string
  /** Mention offsets within `sentence`. */
  sentenceOffset: [number, number]
  anchor: SourceAnchor
  /** Link texts in the sentence (the entities it names). */
  links: string[]
  citation?: Citation
  /** A short label trimmed from the sentence. */
  draftLabel: string
}

export type DateMention = Mention<TimelineDate>

/** A place, as the build-time Wikidata lookup describes the link's target. */
export interface PlaceInfo {
  title: string
  wikidataId: string
  name: string
  coordinates: { lat: number; lon: number }
  country: string | null
  opened: number | null
  inception: number | null
  kind: 'site' | 'settlement' | 'region'
}

export interface PlaceValue extends PlaceInfo {
  /** A date in the same sentence that belongs to this place ("Name (2003)"), if any. */
  sentenceDate?: TimelineDate
  sentenceDateText?: string
}

export type PlaceMention = Mention<PlaceValue>
/** A data table: its id is the table's `data-pick-table`; text is its caption or section. */
export type TableMention = Mention<ParsedTable>
export type PickKind = 'date' | 'place' | 'table'
