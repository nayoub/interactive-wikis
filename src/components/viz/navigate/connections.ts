/**
 * Connections within the text, four kinds that must look different:
 *
 *   thread    same verified entity: prose mentions linked to the same page
 *             (found from link targets at run time, not curated, undirected)
 *   topic     editor-curated: a labelled group of passages with roles
 *             (definition, example, discussion)
 *   relation  stated in the source: two endpoint passages plus the span whose
 *             own words state the relationship; directed only when they say so
 *   together  mere co-mention: names in one sentence, highlighted locally,
 *             no relationship inferred
 *
 * Passages are found by exact text (passages.ts); a record whose text is
 * not found is reported, never moved elsewhere.
 */
import type { ArticleId } from './events'

export type Role = 'definition' | 'example' | 'discussion'

export interface TopicRec {
  kind: 'topic'
  id: string
  label: string
  members: { snippet: string; role: Role }[]
}

export interface RelationRec {
  kind: 'relation'
  id: string
  /** The source's own relationship words (verbatim, possibly elided with …). */
  words: string
  from: { snippet: string; label: string }
  to: { snippet: string; label: string }
  /** The sentence that states the relationship, and the exact span in it. */
  support: { snippet: string; span: string }
  directed: boolean
  /** When the editor matched an endpoint to the source by judgement, say how. */
  note?: string
}

export interface TogetherRec {
  kind: 'together'
  id: string
  snippet: string
  names: string[]
}

export type ConnectionRec = TopicRec | RelationRec | TogetherRec

const GEHRY: ConnectionRec[] = [
  {
    kind: 'topic',
    id: 'fish',
    label: 'Fish as a motif',
    members: [
      { snippet: 'In many of his designs, Gehry was inspired by fish.', role: 'definition' },
      { snippet: 'As a result of his fascination, the first Fish Lamps were fabricated', role: 'example' },
      { snippet: 'the fish has become a recurrent motif in Gehry\'s work', role: 'discussion' },
      { snippet: 'creating six distinct jewelry collections', role: 'example' },
      { snippet: 'held Spinning Tales, an exhibition of new fish sculptures', role: 'example' },
    ],
  },
  {
    kind: 'topic',
    id: 'bilbao-effect',
    label: 'The “Bilbao effect”',
    members: [
      { snippet: 'The term "Bilbao effect" emerged in urban planning', role: 'definition' },
      { snippet: 'In 1997, Gehry vaulted to a new level of international acclaim', role: 'example' },
      { snippet: 'In the first 12 months after the museum was opened', role: 'discussion' },
      { snippet: 'In subsequent years there have been many attempts to replicate this effect', role: 'example' },
      { snippet: 'He was also the progenitor of the "Bilbao effect"', role: 'discussion' },
    ],
  },
  {
    kind: 'topic',
    id: 'starchitect',
    label: '“Starchitect”, a label he rejected',
    members: [
      { snippet: 'Though he was often referred to as a "starchitect"', role: 'discussion' },
      { snippet: 'Though some link the concept of the Bilbao effect to the notion of starchitecture', role: 'discussion' },
    ],
  },
  {
    kind: 'relation',
    id: 'fish-lamps',
    words: 'As a result of his fascination',
    from: { snippet: 'In many of his designs, Gehry was inspired by fish.', label: 'Inspired by fish' },
    to: { snippet: 'As a result of his fascination, the first Fish Lamps were fabricated', label: 'The first Fish Lamps' },
    support: { snippet: 'As a result of his fascination, the first Fish Lamps were fabricated', span: 'As a result of his fascination' },
    directed: true,
  },
  {
    kind: 'relation',
    id: 'spun-off',
    words: 'spun off',
    from: { snippet: 'In 1962, he established a practice in Los Angeles', label: 'Gehry’s firm, established 1962' },
    to: { snippet: 'His firm spun off another firm called Gehry Technologies', label: 'Gehry Technologies' },
    support: { snippet: 'His firm spun off another firm called Gehry Technologies', span: 'His firm spun off another firm called Gehry Technologies' },
    directed: true,
    note: 'The editor matched “his firm” to the practice founded in 1962 (Career).',
  },
  {
    kind: 'relation',
    id: 'acquired',
    words: 'was acquired by',
    from: { snippet: 'His firm spun off another firm called Gehry Technologies', label: 'Gehry Technologies' },
    to: { snippet: 'Gehry Technologies was acquired by software company Trimble Navigation', label: 'Trimble Navigation' },
    support: { snippet: 'Gehry Technologies was acquired by software company Trimble Navigation', span: 'Gehry Technologies was acquired by software company Trimble Navigation' },
    directed: true,
  },
  {
    kind: 'relation',
    id: 'under-budget',
    words: 'For example … completed for $3M less than its budget',
    from: { snippet: 'The 3D modelling and project management features of this software were effective', label: 'Software kept designs under budget' },
    to: { snippet: 'In 1997, Gehry vaulted to a new level of international acclaim', label: 'Guggenheim Museum Bilbao' },
    support: { snippet: 'For example, the Guggenheim Museum Bilbao was completed for $3M less', span: 'For example, the Guggenheim Museum Bilbao was completed for $3M less than its budget of $100M.' },
    directed: true,
  },
  {
    kind: 'relation',
    id: 'named-effect',
    words: 'After the phenomenal success of … critics began referring to … as the “Bilbao effect”',
    from: { snippet: 'In 1997, Gehry vaulted to a new level of international acclaim', label: 'Guggenheim Museum Bilbao opens' },
    to: { snippet: 'The term "Bilbao effect" emerged in urban planning', label: 'The term “Bilbao effect”' },
    support: { snippet: 'After the phenomenal success of Gehry\'s design', span: 'After the phenomenal success of Gehry\'s design for the Guggenheim Museum in Bilbao, critics began referring to' },
    directed: true,
  },
  {
    kind: 'relation',
    id: 'replicate',
    words: 'attempts to replicate this effect … such as … the Walt Disney Concert Hall',
    from: { snippet: 'The boisterous, curvaceous Walt Disney Concert Hall (2003)', label: 'Walt Disney Concert Hall' },
    to: { snippet: 'The term "Bilbao effect" emerged in urban planning', label: 'The “Bilbao effect”' },
    support: { snippet: 'In subsequent years there have been many attempts to replicate this effect', span: 'many attempts to replicate this effect' },
    directed: true,
  },
  {
    kind: 'relation',
    id: 'oldenburg',
    words: 'in collaboration with',
    from: { snippet: 'such as the Chiat/Day Building (1991)', label: 'Chiat/Day Building' },
    to: { snippet: 'such as the Chiat/Day Building (1991)', label: 'Claes Oldenburg' },
    support: { snippet: 'such as the Chiat/Day Building (1991)', span: 'in collaboration with Claes Oldenburg' },
    directed: false,
  },
  {
    kind: 'together',
    id: 'famous-works',
    snippet: 'His most famous works include the Guggenheim Museum Bilbao in Spain',
    names: ['Guggenheim Museum Bilbao', 'Walt Disney Concert Hall', 'Louis Vuitton Foundation'],
  },
  {
    kind: 'together',
    id: 'pavilion-center',
    snippet: 'Gehry also designed the open-air Jay Pritzker Pavilion (2004)',
    names: ['Jay Pritzker Pavilion', 'New World Center'],
  },
]

export const CONNECTIONS: Partial<Record<ArticleId, ConnectionRec[]>> = { 'frank-gehry': GEHRY }

export const ROLE_LABEL: Record<Role, string> = {
  definition: 'Definition',
  example: 'Example',
  discussion: 'Discussion',
}
