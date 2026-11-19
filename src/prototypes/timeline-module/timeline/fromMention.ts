import type { DateMention } from '../article/loadArticle'
import type { TimelineEvent } from './types'

/** A picked date mention becomes a timeline event: the machine's draft, for the editor to trim. */
export function eventFromMention(m: DateMention): TimelineEvent {
  return {
    id: m.id,
    date: structuredClone(m.date),
    label: m.draftLabel,
    sourceText: m.sentence,
    sourceDateText: m.text,
    sourceAnchor: { ...m.anchor },
    citation: m.citation ? { ...m.citation } : undefined,
  }
}
