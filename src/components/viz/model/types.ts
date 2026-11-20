/**
 * Plain data shared by Pick, Curate and Render. No behaviour, no Vue.
 * A module (timeline, map) stores its own items; they link to passages but are
 * not a live view of them.
 */

export type ModuleKind = 'timeline' | 'map'

export type Precision = 'year' | 'month' | 'day'

/** What the text said beyond the bare number: "fall of 1956", "late 2014", "the early 1990s". */
export type Qualifier = 'early' | 'mid' | 'late' | 'spring' | 'summer' | 'fall' | 'winter'

export interface PartialDate {
  y: number
  m?: number
  d?: number
}

export interface TimelineDate {
  start: PartialDate
  /** Spans and decades ("1994–1996", "the 1970s" = 1970–1979). */
  end?: PartialDate
  precision: Precision
  circa?: boolean
  qualifier?: Qualifier
}

export interface SourceAnchor {
  /** Heading id of the section the passage sits in ("Lead" for the lead). */
  sectionId: string
  sectionTitle: string
  /** Id of the mention in the article (`[data-tl-id]`); the passage is that mention's sentence. */
  mentionId: string
  /** Sentence offsets within the block's clean text, for highlighting. */
  sentenceStart: number
  sentenceEnd: number
}

export interface Citation {
  label: string
  href: string
}

/** An image an event may show: one already in the article, or a file from Wikimedia Commons. */
export interface EventImage {
  id: string
  src: string
  caption: string
  source: 'article' | 'commons'
  /** Commons file title ("File:…"), author, licence: carried with the image wherever it goes. */
  fileTitle?: string
  artist?: string
  license?: string
  licenseUrl?: string
  pageUrl?: string
}
/** @deprecated name kept for older call sites */
export type ArticleImage = EventImage

/** What every curated item has, whatever it is a picture of. */
export interface BaseItem {
  id: string
  /** Short, editor-editable. */
  label: string
  /** The sentence it was picked from ('' when added without one). */
  sourceText: string
  /** The matched text inside `sourceText`, for emphasis when showing the source. */
  sourceDateText: string
  /** Where the sentence is; absent for items added by search. */
  sourceAnchor?: SourceAnchor
  /** Link texts in the source sentence (entities), e.g. for an image search. */
  sourceLinks?: string[]
  citation?: Citation
  image?: EventImage
}

export interface TimelineEvent extends BaseItem {
  date: TimelineDate
  sourceAnchor: SourceAnchor
}

export interface Place extends BaseItem {
  name: string
  coordinates: { lat: number; lon: number }
  country?: string
  /** Completion or opening, from the sentence when it says, else from Wikidata. */
  date?: TimelineDate
  dateFrom?: 'sentence' | 'wikidata'
  wikidataId: string
  /** The article title the link pointed to (absent for searched places). */
  linkTitle?: string
}

export interface TimelineOptions {
  /** "aged 18" under each date (biographies with a known birth date). */
  showAge: boolean
  /** "14 yrs" between events when the gap is significant. */
  showGaps: boolean
}

export interface MapOptions {
  /** Dots take one of four lightness steps by period, oldest lightest. */
  shadeByDate: boolean
}

export const DEFAULT_OPTIONS: TimelineOptions = { showAge: false, showGaps: true }
export const DEFAULT_MAP_OPTIONS: MapOptions = { shadeByDate: false }

export interface ModuleData<T extends BaseItem = BaseItem, O = Record<string, boolean>> {
  title: string
  items: T[]
  options: O
}

export type Timeline = ModuleData<TimelineEvent, TimelineOptions>
export type MapData = ModuleData<Place, MapOptions>

export interface Draft extends ModuleData {
  kind: ModuleKind
  /** True when re-editing the placed module rather than inserting a new one. */
  editingPlaced: boolean
}

export interface ArticleSection {
  id: string
  title: string
  level: 2 | 3
}

export type Placement =
  | { kind: 'after'; anchorId: string; sectionId: string; sectionTitle: string }
  | { kind: 'sectionTop'; sectionId: string; sectionTitle: string }
