/**
 * Every reader-facing string of the timeline navigators, in one place so it
 * can be translated. Plurals and word order are per message (functions),
 * not assembled from fragments.
 */
export const msg = {
  // Shared
  returnToReading: 'Return to reading',
  returnFrom: (section: string) => `Back to where you were, in ${section}`,
  keepReadingHere: 'Stay here',
  keepReadingHereHint: 'Forget the earlier position; the next event starts a new exploration',
  inView: 'In view',
  inViewHint: 'Its passage is on screen now',
  selected: 'Selected',
  approximate: 'Approximate date',
  duration: 'Duration',
  allEvents: 'All events',
  allEventsCount: (n: number) => `All events (${n})`,
  eventsCount: (n: number) => (n === 1 ? '1 event' : `${n} events`),
  inSection: (s: string) => `In “${s}”`,
  unresolved: (label: string) =>
    `The passage for “${label}” could not be found in this revision of the article. Nothing was moved.`,
  unresolvedShort: 'Passage not found',
  dismiss: 'Dismiss',
  close: 'Close',
  noEventsIn: 'No indexed events in this period',
  blankMeaning: 'A blank stretch means the article has no indexed events there, not that nothing happened.',
  sourceOf: (date: string, label: string) => `${date}: ${label}. Opens its passage in the article.`,
  citation: 'Cited in the article',

  // A · Chronological contents
  contentsTitle: 'Timeline',
  contentsNote: (n: number) => `${n} dated events, in date order. Each opens its passage.`,
  expandAll: 'Expand all',
  collapseAll: 'Collapse all',
  openTimeline: 'Timeline',
  timelineDialogTitle: 'Timeline of this article',

  // B · Time ruler
  rulerTitle: 'Time ruler',
  rulerNote: 'Marks sit at their dates; spacing shows real time between events.',
  period: 'Period',
  allPeriods: 'All dates',
  matching: (n: number, period: string) => (n === 1 ? `1 event in ${period}` : `${n} events in ${period}`),
  clusterLabel: (n: number, from: string, to: string) =>
    from === to ? `${n} events in ${from}; show them in the list` : `${n} events, ${from} to ${to}; show them in the list`,
  collapse: 'Collapse',
  expand: 'Expand',
  rulerCollapsed: (period: string) => `Time ruler · ${period}`,
  dragHint: 'Drag along the rule to choose a period, or use the period buttons.',
  backToRuler: 'Back to the ruler',

  // C · Chronological reading trail
  readChronologically: 'Read chronologically',
  trailIntro: (n: number) => `Follow the article's ${n} dated events in date order, across its sections.`,
  startFrom: 'Or start from',
  startFromPlaceholder: 'Choose an event',
  startHere: 'Start here',
  eventNofN: (n: number, total: number) => `Event ${n} of ${total}`,
  previousEvent: 'Previous event',
  nextEvent: 'Next event',
  firstEvent: 'This is the first event',
  lastEvent: 'This is the last event',
  resumeAt: (date: string) => `Resume at ${date}`,
  exitTrail: 'Exit trail',
  returnToStart: 'Return to where I started',
  trailLabel: 'Chronological reading trail',

  // D · Parallel histories
  parallelTitle: 'Parallel histories',
  parallelNote: 'Rows follow the article’s own sections; one shared time scale.',
  rowSections: (s: string) => `From: ${s}`,
  allTopics: 'All rows',
  showOnlyRow: (label: string) => `Show only ${label}`,
  comparing: (period: string) => `In ${period}`,
  noRowEvents: 'No indexed events in this period',

  // E · Illustrated milestones
  milestonesTitle: 'Selected milestones',
  milestonesNote: (n: number, total: number) =>
    `${n} of the article’s ${total} dated events, chosen by an editor. Images appear only where the article shows that moment.`,
  imageDetails: 'Image details',
  backToMilestones: 'Back to milestones',

  // Pass 2: occurrences, links, connections
  readPassage: 'Read this passage',
  readPassageOf: (date: string, label: string) => `Read this passage: ${date}, ${label}`,
  followMentions: 'Follow mentions',
  followMentionsOf: (name: string, n: number) => `Follow mentions of ${name} (${n})`,
  mentionsIn: (n: number) => (n === 1 ? '1 linked mention in the article' : `${n} linked mentions in the article`),
  otherDated: 'Other dated appearances',
  alsoTold: 'Also told in',
  linksHint: 'Names follow their links. A date opens its passage; the list button shows the event and Follow mentions.',
  selectHint: 'Select a mark to see its event. Read this passage takes you to the sentence.',
  binNote: (years: number, from: string, to: string) =>
    `Each column is ${years} years (${from}–${to}, …). One mark per event: repeated mentions of the same event add no mark. Marks stack to count the events in a column; height is a count, not a date.`,
  binNoteVertical: (years: number) =>
    `Each row is ${years} years. One mark per event; marks side by side count the events in a row.`,
  spansNote: 'Durations (solid) and approximate dates (dotted) span their whole possible period instead of a single column.',
  listAll: (n: number) => `All ${n} events as a list`,
  expectedMark: 'Expected (in the source’s words; not an event that has happened)',
  noLinks: 'No linked name in this sentence',
  linksNote: 'Linked names from the article, placed by the dated event the article describes. Names follow their links; dates open the passage.',
  columnsCount: (n: number) => (n === 1 ? '1 event' : `${n} events`),
  connectTitle: 'Show connections',
  connectNote: 'Choose one thread, topic or relationship. The article stays as it is; ordinary links work as usual.',
  kindThread: 'Same subject (same link target)',
  kindTopic: 'Topics (grouped by an editor)',
  kindRelation: 'Stated relationships (source’s own words)',
  kindTogether: 'Mentioned together (no relationship stated)',
  noCuratedConnections: 'No curated topics or relationships for this article yet; same-subject threads come from its links.',
  evidence: 'Evidence',
  editorNote: 'Editor’s note',
  clear: 'Clear',
  above: 'above',
  below: 'below',
  inViewNow: 'in view',
  goTo: 'Go to passage',
  from: 'From',
  to: 'To',
  between: 'Between',
  statesIt: 'states it',
  pairedPlanned: 'Planned or expected',
  pairedBuilt: 'Built or opened',
  pairedNote: 'Two streams from the article’s own wording: on the left, what was projected, approved or expected; on the right, what was built, opened or realised. The centre is the date.',
  pairedUnsupported: 'This article does not separate plans from completed works with dates often enough for a paired chronology.',
  openWithBilbao: 'Open with Bilbao',
  calendarUnsupported: 'Calendar paths need a short, day-by-day episode; neither article has one.',

  // Prototype menu
  menuVariant: 'Option',
  menuBaselines: 'Earlier options (baselines)',
  menuPass2: 'This pass',
  menuArticle: 'Article',
  menuDirection: 'Direction',
  menuTheme: 'Theme',
}

export const VARIANTS = [
  { id: 'contents', letter: 'A', label: 'Chronological contents', group: 'baseline' },
  { id: 'ruler', letter: 'B', label: 'Time ruler', group: 'baseline' },
  { id: 'trail', letter: 'C', label: 'Chronological reading trail', group: 'baseline' },
  { id: 'parallel', letter: 'D', label: 'Parallel histories', group: 'baseline' },
  { id: 'milestones', letter: 'E', label: 'Illustrated milestones', group: 'baseline' },
  { id: 'field', letter: '1a', label: 'Events in time: field in the article', group: 'pass2' },
  { id: 'field-margin', letter: '1b', label: 'Events in time: field in the margin', group: 'pass2' },
  { id: 'link-columns', letter: '2a', label: 'Links: period columns', group: 'pass2' },
  { id: 'link-chronology', letter: '2b', label: 'Links: chronology', group: 'pass2' },
  { id: 'connect-brackets', letter: '3a', label: 'Connections: marginal brackets', group: 'pass2' },
  { id: 'connect-paths', letter: '3b', label: 'Connections: curved paths', group: 'pass2' },
  { id: 'paired', letter: '4', label: 'Paired chronology: plans and completions', group: 'pass2' },
] as const
/** Variants that navigate the richer occurrence records rather than the shared 20-event collection. */
export const OCCURRENCE_VARIANTS = new Set<string>(['field', 'field-margin', 'link-columns', 'link-chronology', 'paired'])
export type VariantId = (typeof VARIANTS)[number]['id']

export const ARTICLE_CHOICES = [
  { id: 'frank-gehry', label: 'Frank Gehry' },
  { id: 'bilbao', label: 'Bilbao' },
  { id: 'test-fixture', label: 'Test fixture' },
] as const
