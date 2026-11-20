/** Picked mentions become curated items: the machine's draft, for the editor to trim. */
import type { Place, TimelineEvent } from '../model/types'
import type { DateMention, PlaceMention } from '../pick/types'

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

export function placeFromMention(m: PlaceMention): Place {
  const v = m.value
  const year = v.opened ?? v.inception
  // Wikidata labels are sometimes missing ("Q1117704"): the link text is the better name then.
  const name = /^Q\d+$/.test(v.name) ? m.text : v.name
  return {
    id: m.id,
    name,
    label: m.draftLabel,
    coordinates: { ...v.coordinates },
    country: v.country ?? undefined,
    date: v.sentenceDate
      ? structuredClone(v.sentenceDate)
      : year
        ? { start: { y: year }, precision: 'year' }
        : undefined,
    dateFrom: v.sentenceDate ? 'sentence' : year ? 'wikidata' : undefined,
    wikidataId: v.wikidataId,
    linkTitle: v.title,
    sourceText: m.sentence,
    sourceDateText: m.text,
    sourceAnchor: { ...m.anchor },
    sourceLinks: [...m.links],
    citation: m.citation ? { ...m.citation } : undefined,
  }
}
