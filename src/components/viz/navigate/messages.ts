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

  // Prototype menu
  menuVariant: 'Option',
  menuArticle: 'Article',
  menuDirection: 'Direction',
  menuTheme: 'Theme',
}

export const VARIANTS = [
  { id: 'contents', letter: 'A', label: 'Chronological contents' },
  { id: 'ruler', letter: 'B', label: 'Time ruler' },
  { id: 'trail', letter: 'C', label: 'Chronological reading trail' },
  { id: 'parallel', letter: 'D', label: 'Parallel histories' },
  { id: 'milestones', letter: 'E', label: 'Illustrated milestones' },
] as const
export type VariantId = (typeof VARIANTS)[number]['id']

export const ARTICLE_CHOICES = [
  { id: 'frank-gehry', label: 'Frank Gehry' },
  { id: 'bilbao', label: 'Bilbao' },
  { id: 'test-fixture', label: 'Test fixture' },
] as const
