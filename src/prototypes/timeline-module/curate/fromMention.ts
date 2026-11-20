import type { TimelineEvent } from '../model/types'
import type { DateMention } from '../pick/types'

/** A picked date mention becomes a timeline event: the machine's draft, for the editor to trim. */
export function eventFromMention(m: DateMention): TimelineEvent {
  return {
    id: m.id,
    date: structuredClone(m.value),
    label: m.draftLabel,
    sourceText: m.sentence,
    sourceDateText: m.text,
    sourceAnchor: { ...m.anchor },
    sourceLinks: [...m.links],
    citation: m.citation ? { ...m.citation } : undefined,
  }
}
