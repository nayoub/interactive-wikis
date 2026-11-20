/**
 * "Load example": an editor's finished picks from Early life and Career.
 * Each pick points at a real date mention in the snapshot; labels are the
 * editor's trims of the source sentence (no new claims), images are the
 * article's own.
 */
import type { DateMention, LoadedArticle } from './article/loadArticle'
import { eventFromMention } from './curate/fromMention'
import type { Timeline } from './model/types'

interface Pick {
  date: string
  /** Distinctive words from the source sentence. */
  sentence: string
  label: string
  image?: string
}

const PICKS: Pick[] = [
  {
    date: 'February 28, 1929',
    sentence: 'Toronto General Hospital',
    label: 'Born at Toronto General Hospital',
  },
  { date: '1937', sentence: 'Timmins', label: 'Family moved to Timmins, Ontario' },
  {
    date: '1947',
    sentence: 'immigrated to the United States',
    label: 'Family immigrated to the United States, settling in California',
  },
  {
    date: '1954',
    sentence: 'graduate from the University of Southern California',
    label: 'Graduated from the USC School of Architecture',
  },
  {
    date: '1957',
    sentence: 'first private residence',
    label: 'Designed his first private residence, the David Cabin',
    image: 'David Cabin',
  },
  {
    date: '1962',
    sentence: 'established a practice',
    label: 'Established a practice in Los Angeles',
  },
  {
    date: '1977',
    sentence: 'purchased by Gehry',
    label: 'Purchased his Santa Monica residence',
    image: 'Gehry Residence',
  },
  {
    date: '1989',
    sentence: 'Pritzker Architecture Prize, where',
    label: 'Received the Pritzker Architecture Prize',
  },
  {
    date: '1997',
    sentence: 'Guggenheim Museum Bilbao opened',
    label: 'Guggenheim Museum Bilbao opened',
    image: 'Guggenheim Museum Bilbao',
  },
  {
    date: '2003',
    sentence: 'Walt Disney Concert Hall',
    label: 'Walt Disney Concert Hall, downtown Los Angeles',
    image: 'Walt Disney Concert Hall',
  },
]

export function buildExample(article: LoadedArticle): Timeline {
  const events = PICKS.map((pick) => {
    const mention = article.mentions.find(
      (m: DateMention) => m.text === pick.date && m.sentence.includes(pick.sentence),
    )
    if (!mention) return null
    const event = eventFromMention(mention)
    event.label = pick.label
    if (pick.image) {
      const want = pick.image.toLowerCase()
      event.image = article.images.find(
        (img) => img.src.toLowerCase().includes(want) || img.caption.toLowerCase().includes(want),
      )
    }
    return event
  }).filter((e) => e !== null)
  return { title: 'Early life and career', events, options: { showAge: true, showGaps: true } }
}
