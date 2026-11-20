/**
 * Plain data shared by Pick, Curate and Render. No behaviour, no Vue.
 * A module (timeline, map) stores its own items; they link to passages but are
 * not a live view of them.
 */

export type ModuleKind = 'timeline' | 'map' | 'visual'

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

/** A party in an election result (one row of the results table). */
export interface Party extends BaseItem {
  /** Full name as the table gives it. */
  name: string
  /** Short name for labels: the infobox's, else derived (editable as the item's label). */
  shortName: string
  seats?: number
  votes?: number
  /** Percent of the vote, as in the table. */
  voteShare?: number
  /** Seat change against the previous election, as in the table's +/– column. */
  change?: number
  /** The party's colour, and where it came from. */
  color?: string
  colorSource?: string
  /** Identity across elections: the link target of the party's name. */
  key: string
  wikidataId?: string
}

export interface ElectionMeta {
  name: string
  date: string
  /** "All N seats" in the infobox. */
  chamberSize?: number
  majority?: number
  /** The results table's Total row, in the seats column. */
  tableTotal?: number
  /** The article's parliament diagram: its file and its number of seats. */
  diagramFile?: string
  diagramTotal?: number
}

/** An article's parliament diagram, read at build time (election/scripts/seating.py): parties left to right. */
export interface Seating {
  file: string
  total: number
  parties: { label: string; color: string; seats: number }[]
}

export type ColumnRole = 'category' | 'seats' | 'votes' | 'share' | 'change' | 'ignore'
export type VisualForm = 'seats' | 'bars'

/** Everything about a "Visual" module besides its curated items. */
export interface VisualSpec {
  /** The picked table (`data-pick-table`), and the editor's column roles for it. */
  tableId: string | null
  headers: string[]
  roles: ColumnRole[]
  form: VisualForm | null
  /** What bars measure. */
  measure: 'seats' | 'share'
  /** Offer the year control (needs earlier elections). */
  years: boolean
  /** Grouping: parties under this many seats (seat diagram, seat bars)… */
  minSeats: number
  /** …or under this share of the vote (share bars) are merged into "Others". */
  minShare: number
  election: ElectionMeta
  /** Where the default party order came from: the article's parliament diagram, or the table. */
  orderFrom?: 'diagram' | 'table'
  /** Earlier elections, oldest last, read from their own snapshotted articles. */
  previous: { election: ElectionMeta; parties: Party[] }[]
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
  /** Kind-specific settings (a Visual's table, roles, form…). */
  spec?: VisualSpec
}

export type Timeline = ModuleData<TimelineEvent, TimelineOptions>
export type MapData = ModuleData<Place, MapOptions>
export type VisualData = ModuleData<Party, Record<string, boolean>> & { spec: VisualSpec }

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
