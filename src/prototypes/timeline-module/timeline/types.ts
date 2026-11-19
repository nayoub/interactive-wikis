/** Timeline data model. The timeline stores its own events; it links to passages but is not a live view of them. */

export type Precision = 'year' | 'month' | 'day'

export interface PartialDate {
  y: number
  m?: number
  d?: number
}

export interface TimelineDate {
  start: PartialDate
  end?: PartialDate
  precision: Precision
  circa?: boolean
}

export interface SourceAnchor {
  /** Heading id of the section the passage sits in ("Lead" for the lead). */
  sectionId: string
  sectionTitle: string
  /** Id of the date mention in the article (`[data-tl-id]`); the passage is that mention's sentence. */
  mentionId: string
  /** Sentence offsets within the block's clean text, for highlighting. */
  sentenceStart: number
  sentenceEnd: number
}

export interface Citation {
  label: string
  href: string
}

export interface ArticleImage {
  id: string
  src: string
  caption: string
}

export interface TimelineEvent {
  id: string
  date: TimelineDate
  label: string
  sourceText: string
  /** The matched date text inside `sourceText`, for emphasis when showing the source. */
  sourceDateText: string
  sourceAnchor: SourceAnchor
  citation?: Citation
  image?: ArticleImage
}

export interface Timeline {
  title: string
  events: TimelineEvent[]
}

export type Placement =
  | { kind: 'after'; anchorId: string; sectionId: string; sectionTitle: string }
  | { kind: 'sectionTop'; sectionId: string; sectionTitle: string }
