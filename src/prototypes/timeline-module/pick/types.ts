/**
 * What Pick produces: a mention of something in the article text, tied to its
 * sentence. Generic over the kind of thing (`value`): a date for timelines,
 * a place for maps, a quantity for charts.
 */
import type { Citation, SourceAnchor, TimelineDate } from '../model/types'

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
