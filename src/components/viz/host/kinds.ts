/**
 * What differs between module kinds, in one place. The host page, Pick and
 * Curate are the same for every kind; a kind says what is picked, how a
 * mention becomes an item, what counts as the same item, and how to order them.
 * (Which renderer and which item editor to use is decided in the host's template.)
 */
import type { Icon } from '@wikimedia/codex-icons'
import { cdxIconChart, cdxIconHistory, cdxIconMap } from '@wikimedia/codex-icons'

import { eventFromMention, placeFromMention } from '../curate/fromMention'
import { sameDate, sortEvents } from '../model/dates'
import { sortPlaces } from '../model/places'
import type { BaseItem, ModuleKind, Place, TimelineEvent } from '../model/types'
import { findDuplicate } from '../pick/duplicates'
import type { DateMention, Mention, PickKind, PlaceMention } from '../pick/types'
import type { LoadedArticle } from './loadArticle'

export interface KindSpec {
  kind: ModuleKind
  /** "Timeline", "Map". */
  title: string
  noun: [string, string]
  /** What lights up in the article. */
  picks: PickKind
  icon: Icon
  mentions(article: LoadedArticle): Mention<unknown>[]
  fromMention(m: Mention<unknown>): BaseItem
  /** The existing item a mention would duplicate, if any. */
  duplicateOf(m: Mention<unknown>, items: BaseItem[]): BaseItem | null
  sort(items: BaseItem[]): BaseItem[]
}

export const KINDS: Record<ModuleKind, KindSpec> = {
  timeline: {
    kind: 'timeline',
    title: 'Timeline',
    noun: ['event', 'events'],
    picks: 'date',
    icon: cdxIconHistory,
    mentions: (a) => a.mentions,
    fromMention: (m) => eventFromMention(m as DateMention),
    // Same date, and either a full date (identifies the event alone) or largely the same sentence.
    duplicateOf: (m, items) => {
      const dm = m as DateMention
      return findDuplicate(
        { id: dm.id, sentence: dm.sentence },
        (items as TimelineEvent[]).map((e) => ({ ...e, sentence: e.sourceText })),
        (e) => sameDate(e.date, dm.value),
        dm.value.precision === 'day',
      )
    },
    sort: (items) => sortEvents(items as TimelineEvent[]),
  },
  map: {
    kind: 'map',
    title: 'Map',
    noun: ['place', 'places'],
    picks: 'place',
    icon: cdxIconMap,
    mentions: (a) => a.places,
    fromMention: (m) => placeFromMention(m as PlaceMention),
    // The same Wikidata item is the same place, whichever sentence names it.
    duplicateOf: (m, items) => {
      const pm = m as PlaceMention
      return findDuplicate(
        { id: pm.id, sentence: pm.sentence },
        (items as Place[]).map((p) => ({ ...p, sentence: p.sourceText })),
        (p) => p.wikidataId === pm.value.wikidataId,
        true,
      )
    },
    sort: (items) => sortPlaces(items as Place[]),
  },
  // A table is picked whole (see the host's pickTable); its rows become the items.
  visual: {
    kind: 'visual',
    title: 'Visual',
    noun: ['party', 'parties'],
    picks: 'table',
    icon: cdxIconChart,
    mentions: (a) => a.tables,
    fromMention: () => {
      throw new Error('A table is picked whole')
    },
    duplicateOf: () => null,
    // The editor's order: no automatic sort.
    sort: (items) => items,
  },
}
