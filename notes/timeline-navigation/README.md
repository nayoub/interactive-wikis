# Timeline navigation: implementation walkthrough

Five ways to navigate an existing article by time, on one route:
`/timeline-navigation?variant=contents|ruler|trail|parallel|milestones&article=frank-gehry|bilbao|test-fixture`.
Code: `src/components/viz/navigate/`. Screenshots: `screenshots/`.

**These are implementation-walkthrough observations by the builder, not user-research
findings.** Building an option does not validate its hypothesis; every "best for" below
is a hypothesis to test with readers.

## Shared foundation

- **Events**: 20 for Frank Gehry, 19 for Bilbao (`events.ts`). Each one is a date mention
  already in the snapshot, found by its exact date text and a snippet of its sentence. Labels
  are trimmed from that sentence. Dates, citations and anchors come from the existing pick
  model (`eventFromMention`). Images are the article's own, attached only where the image
  caption names the same thing as the sentence. The same collection feeds all five variants.
- **Navigation contract** (`useNavigator.ts`): selected event, passages in view, period and
  saved origin are separate states. Only `jump` and `returnToOrigin` move the article. A jump
  opens a collapsed Minerva section, places the sentence below any sticky navigator and above
  any bottom bar, washes the sentence background (link colours stay the same), marks the
  paragraph with a margin bar, moves focus to it and announces it. The origin is saved on the
  first jump and kept until Return to reading or Stay here. The selected event is in the URL
  through `replace`, so no history entries are added. An unresolved anchor shows a message and
  nothing moves.
- **Test fixture**: `public/snapshots/timeline-test-fixture.html` + `fixture.ts`. It covers
  BCE dates, centuries, circa, overlapping durations, a repeated year in two sections, three
  events on one day, a very long label, an Arabic-script label and an unresolved anchor.
  `&dir=rtl` mirrors any article.
- **Test switch**: `&motion=reduce` behaves like the reduced-motion setting (instant scroll,
  no fade). It was used for automated checks because the in-app browser was hidden.

## Walkthrough on Frank Gehry (desktop 1440×900)

Step counts are activations (clicks or Enter presses), measured on the build.

| Task | A Contents | B Ruler | C Trail | D Parallel | E Milestones |
| --- | --- | --- | --- | --- | --- |
| 1. Find a known event (Pritzker, 1989) and read its passage | 2 (open 1980s, link) | 1 (the mark) or 2 (1980s, list link) | 3 (Start from, choose, Start here) | 2 (1980s, link) | 1 (it is a milestone); otherwise 3 (All events, decade, link) |
| 2. Explore the 1950s | 1 (open 1950s); lists 4 | 1; list of 4 + band on the rule | n/a: walk with Next | 1; 3 rows side by side, one empty | n/a: All events dialog |
| 3. Are two events close in time? (USC 1954 vs Harvard fall 1956) | Read the dates; spacing is even on purpose | Visible: a "2" cluster at 1954, Harvard 2 years later | Read the dates in the Previous/Next buttons | Visible within the Life row | Read the dates |
| 4. Next event across a section boundary (1954 Early life → 1954 Education → Fall 1956) | Next row in the list, then jump | Next row in the list, then jump | 1 (Next); the passage is higher up or in another section, and its date and section show first | Next row in the column | Only if both are milestones |
| 5. Return to the paragraph where navigation began | 1 (Return to reading); position restored to the pixel | 1 | 1 (Return to where I started) | 1 | 1 |

**Best-supported task per option (builder's judgement, untested with readers):**
task 1 → A (and E when the event is a milestone); task 2 → B, or D when the question is
cross-topic; task 3 → B; task 4 → C; task 5 → all equal, because they share one contract.

## Main unresolved tradeoff per option

- **A Contents**: it only stays beside the article at 1300px and wider. Narrower than that it
  is a button and dialog, so it is no longer always visible. Decade groups start closed, so
  fast lookup assumes the reader knows the decade.
- **B Ruler**: while in use it stays at the top of the screen and takes about 460px of a
  900px window. It does not stick in windows shorter than 820px or on phones. On Bilbao
  (700 years) the 19th and 20th centuries collapse into count clusters, so the overview sends
  you to the list.
- **C Trail**: ordering depends on the date model's estimates ("the 1970s" sorts as 1975,
  after "1969–1973"), so the sequence is partly an artifact of the model. On phones the bar is
  145px, a third of the height at 200% zoom.
- **D Parallel**: it needs an editor to map sections to rows for each article. Gehry's
  introduction ("rose to prominence in the 1970s") had to be assigned to a row. The phone
  list (every period × every row) is long.
- **E Milestones**: the selection is subjective. 3 of 7 Gehry milestones have a supported
  image, and those rows dominate visually. The complete list is one dialog away.

## Checks performed

- 1440×900 and 390×844 for all five variants (Chrome DevTools emulation in the in-app browser
  and in headless Chrome). Screenshots are in `screenshots/`.
- A Minerva section collapsed before jumping into it (`a-phone-active`): it reopens, then the
  passage is revealed.
- Keyboard on A: Enter opens a group, Tab moves to the link, Enter jumps, and focus lands on the
  passage with a visible ring.
- Dark theme (`b-desktop-dark`), RTL (`fixture-ruler-rtl`), and an unresolved anchor:
  a message, no scroll (`fixture-contents-unresolved`).
- 720×450 viewport as a stand-in for 200% zoom on 1440×900: no horizontal scroll, and C's
  bar keeps the passage clear.
- Variant switch keeps the selected event (all five on Bilbao). Period, cluster, hover and
  collapse leave the article where it is (scroll delta 0). Collapsing B keeps the passage
  being read in place.
- `npm run build`, `npm run type-check`, and eslint on the new files: clean apart from the
  existing `v-html` warning.

## Not verified

- A real screen reader. Only labels, `aria-current`, `aria-expanded` and the live-region text
  were inspected.
- Real browser zoom, touch dragging on the ruler, and a physical phone.
- Smooth scrolling and the fading wash in a visible browser. The code path exists, but the
  checks ran with `motion=reduce`.
- Firefox and Safari. Without the CSS Highlight API (Firefox before 140) there is no
  sentence wash; the paragraph's margin bar remains.
- The GitHub Pages and PR-preview build of this route (built locally only).

---

# Pass 2: time field, links, connections

Seven compositions on the same route; A–E stay as baselines. Screenshots: `screenshots/pass-2/`.
Again: **builder's walkthrough observations, not user-research findings.**

| Direction | Composition | URL (`/timeline-navigation?…`) |
| --- | --- | --- |
| 1 Events in time | 1a field in the article | `variant=field` |
| | 1b field in the margin | `variant=field-margin` |
| 2 Timeline from links | 2a period columns | `variant=link-columns` |
| | 2b chronology | `variant=link-chronology` |
| 3 Connections | 3a marginal brackets | `variant=connect-brackets&connection=relation:named-effect` |
| | 3b curved paths | `variant=connect-paths&connection=topic:fish` |
| Further variation | 4 paired chronology | `variant=paired&article=bilbao` |

Calendar paths were not built: neither fixture has a short, day-by-day episode
(Bilbao's 1936–37 events are a day and a month apart, not a sequence). The paired view
says so on the page.

## Source records

- **Occurrences** (`navigate/occurrences.ts`): 52 for Frank Gehry, 36 for Bilbao. The
  20 and 19 shared events are reused with the same ids, plus the article's other dated works,
  exhibitions, honours and Bilbao's plans and completions. Every record is checked when it is
  built:
  - the date is a mention already in the snapshot (found by its text and a snippet of its
    sentence);
  - each linked name is a real link in that sentence, copied with its own href and classes;
  - the qualifier is a verbatim span of the sentence.

  The build reports 0 problems. One event per mark: Gehry's birth, death, Pritzker Prize and
  World Cup of Hockey trophy are each told twice and kept as `also` passages. Two museums that
  open in one sentence ("Biomuseo … and the Fondation Louis Vuitton") are two events on one
  passage.
- **Red links** are only where the source marks `new`: Gehry has one (American Center in
  Paris). Bilbao has many in district lists, none in these records. Gehry's records also keep
  `mw-redirect` and one `external text` link (Library).
- **Connections** (`navigate/connections.ts`, Gehry):
  - Same-subject threads come at run time from prose links with the same target, the only
    identity treated as verified.
  - 3 curated topics: Fish as a motif, the "Bilbao effect", "Starchitect".
  - 7 stated relationships, each with from, to and supporting-span anchors: "As a result of
    his fascination", "spun off", "was acquired by", "For example … completed for $3M less",
    "After the phenomenal success … critics began referring to", "attempts to replicate this
    effect", and "in collaboration with" (undirected).
  - 2 co-mentions.
  - One endpoint match is the editor's judgement and is labelled on the page ("his firm" =
    the 1962 practice).

## What I checked in the browser

- **Widths:** 1440×900 and 390×844 for all seven, by emulation in the in-app browser and
  headless Chrome. One dark-theme check each for 1a and 3b.
- **Selecting stays put:** selecting a mark or entry (click, or Enter with the keyboard) shows
  the event and moves nothing (scroll delta 0).
- **Reading moves you:** Read this passage moves to the sentence and focuses it, and Return to
  reading appears.
- **Follow mentions:** it lists Guggenheim Museum Bilbao's 3 verified linked mentions and its
  other dated appearance (the 2002 exhibition). Each mention jumps to its sentence.
- **Links stay links:** linked names keep their href and `target` like the article's links. The
  red link renders in `--color-link-red`. Names follow links; dates and Read this passage
  navigate locally.
- **Connections:**
  - Each kind paints differently in the text: underline for a thread, neutral wash for a topic,
    endpoint wash plus underlined stating words for a relation, dotted underline for a
    co-mention.
  - A relation's card quotes the supporting sentence with the span marked, plus its citation.
  - Destination references update as you scroll (above / in view / below).
  - On phones there are no lines: highlights plus the list.

## Not verified

- A screen reader, real zoom, a physical phone, and touch hover behaviour. The Follow-mentions
  button in 2a appears on hover or focus, and always under `hover: none`.
- Smooth scrolling (checks ran with `motion=reduce`).
- Firefox and Safari. Without the CSS Highlight API, the text marks for connections don't show;
  the card and list still do.
- With long topics, the evidence card at the bottom of the margin can cover part of the drawing.

## Which composition does what best (builder's judgement)

- **Reveals time:** 1a, the field in the article. Binned stacks show density, and blank
  columns show gaps. Durations and approximate dates have their own rows, so they never pose
  as precise. 1b is close but squeezed.
- **Easiest to follow subjects:** 2b, the chronology. Every linked name is readable, with its
  qualifier and section, and Follow mentions is one action away. 2a is more striking but
  truncates, and its follow action is hidden until hover or focus.
- **Easiest to inspect relationships:** 3a, the brackets. Endpoints, the stating span and
  "states it" line up in the margin, and the card quotes the evidence with its citation. 3b's
  curves show distance and direction better, but they start at the column edge (past
  figures), not at the sentence.

## Main tradeoffs

- **1a:** five-year bins hide order within a bin. Height is a count, which readers may read as
  time.
- **1b:** the 232px margin leaves room only for direct labels.
- **2a:** names truncate, and the column height (a count) competes with reading.
- **2b:** it's long.
- **3a / 3b:** they need the 1300px+ margin; below that, connections are only highlights and a
  list. Curated topics and relationships are editorial work for each article.
- **4:** sorting statements into "planned" and "built" is editorial, and only Bilbao supports it.

---

# B, Time ruler: one continuous ruler

`/timeline-navigation?variant=ruler` (Frank Gehry fixture; `&motion=reduce` for instant changes).
Code: `navigate/variants/VariantRuler.vue` and `navigate/ruler/` (`RulerScene.vue`,
`RulerRegion.vue`, `useDock.ts`, `useReading.ts`, `layout.ts`). Screenshots and a 14-second
capture of the core sequence: `screenshots/ruler-continuity/` (`ruler-core-sequence.mp4`).
Again: **builder's checks, not user research.**

## What changed

- **One object, three presentations.** The overview (about 236px below the introduction),
  the compact strip (73px, docked under the wiki header) and exploration (the same panel
  expanded where it is, at most 44% of the visible height) are the same mounted marks and
  axis. Horizontal positions depend only on the width; only vertical geometry (height,
  translate) and opacity animate. Milestone labels are placed once per width, so they
  never rearrange on selection or filtering.
- **Docking ≠ expansion.** A sentinel just above the sticky mount decides docking; the
  panel's own geometry never moves it. Docking contracts the overview; the overview comes
  back only when the slot is well back in view (a band of 30% of the screen), so scrolling up
  a few pixels keeps the strip. Explore timeline stays open through scrolling until Resume
  reading (Close when not docked), Escape, or Read this passage.
- **Anchoring.** The sticky mount stays in flow, so while docked a change of panel height
  moves everything after it by the same amount. The source line under the panel follows
  its lower edge by layout alone. Native scroll anchoring is switched off on the document
  scroller (`html.tn-anchor-off`) only until the panel's rendered height reaches its target,
  so nothing else compensates. The same check decides when Read this passage may measure.
  No saved scroll position is ever replayed, so scrolling mid-transition is never
  overridden.
- **Reading, selection, preview, filter and origin are separate.**
  - **Reading** is the last dated passage, in article order, above a line a third of the
    way down the area below the strip. It can move backwards in time. Past a passage it says
    "After 1997 · Career". Before any passage it names the section and gives no date.
  - **Reading is the strip's label**, with an outlined caret on the axis (dashed once past)
    and a quiet tick in the gutter beside the line.
  - **Selection** is a filled, ringed mark.
  - **The preview** is the region's content.
  - **The filter** dims marks and never refits the axis.
  - **The origin** is saved only by Read this passage.
- **Preview first.** Marks, list rows, Previous and Next, and arrow keys (with focus inside
  the ruler) select and preview; they never move the article.
- **Read this passage:**
  - It resolves the passage first; a missing one shows a message and nothing moves.
  - It contracts the panel and lets it settle, then places the passage below the strip.
  - Nearby passages are reached with smooth travel, distant ones directly (more than 1.5
    screens away).
  - Return to reading and Stay here live in the strip; the bottom return bar is gone for
    this variant.
- **Range.**
  - Drag across the ruler: the start, end and count show live. Release commits; Escape
    cancels the drag before anything else.
  - From and To selects do the same with taps or the keyboard.
  - Durations count by overlap. A range that excludes the open preview closes it but keeps
    the selection; reopening that event says "Outside the chosen range".
- **Crowding.** Hit targets are 24px wide (28px on phones). Points closer than that become
  one count; choosing it lists its events in the region, and nothing is spread away from its
  date.
- **Phones.** The full-domain ruler is the persistent object at every size. Exploring adds
  a 25-year close-up above it, centred on the reading period until you pan it (Earlier/Later,
  or tap the full ruler). The full ruler brackets the close-up.

**Motion:** one value, 240ms (`MOTION_MS`), with Codex `--transition-timing-function-user`
(ease-out: decelerates, no overshoot). The phases overlap:

- **Contracting:** controls and region fade over 0–70ms; labels fade over 0–60ms; lanes draw
  together over 40–180ms; the axis and caret settle over 100–240ms.
- **Expanding:** the reverse. The axis moves first (0–180ms) and the controls appear last
  (140–240ms).
- **Interrupting** starts from the rendered state (a CSS transition retargets).
- **Reduced motion** (or `&motion=reduce`) makes the same changes instantly.

## Acceptance checks run in the browser

Each was scripted in the in-app browser and repeated in a separate headless Chrome. The
1440×900, 1280×600 and 390×844 runs all passed:

1. **1997.** With the 1997 Bilbao sentence at the reading line, the strip reads
   "1997 · Guggenheim Museum Bilbao opened". The overview contracted on docking.
2. **2003.** Reading on, it reads "2003 · Walt Disney Concert Hall, downtown Los Angeles".
   The caret moved; selection and filter were untouched.
3. **Expand at 2003.** The panel grew from 73 to 396px (264 at 1280×600, 371 on the phone).
   The Disney Hall line stayed 247.1px below the panel's lower edge in every sampled frame
   of the animation, both ways.
4. **Preview 1989.** The scroll position changed by 0. The preview heading is
   "1989 · Received the Pritzker Architecture Prize", the 1989 mark is selected, and
   Reading still says 2003.
5. **Resume.** The preview closed, the strip contracted, and the 2003 line came back to the
   same screen position (difference 0px). 1989 stays selected.
6. **Read 1989, then Return.** The 1989 sentence landed below the strip, highlighted and
   focused, and Reading said 1989. Return to reading put the 2003 line back where it was
   (0px).

Repeated with motion on in headless Chrome: dy was 0px at 1440×900, 0–1px at 1280×600 and
1–2px on the phone (sub-pixel rounding).

**Also checked:**

- **Slow frames:** the in-app browser dropped to about 5 frames a second mid-session. The
  first version waited on timers, so native anchoring caught the tail of a slow transition:
  the line moved by the panel's change, and one return was 163px off. Anchoring and settling
  now wait for the rendered height, and the same sequence at 5 fps gives dy 0 for Explore,
  preview, Resume and Return.

- **Rapid reversal:** Explore, then Resume after 110ms, contracts from the current height
  with the line unchanged.
- **Scrolling mid-transition:** the reader's 120px scroll was kept exactly. The panel stayed
  open, and a later Resume stayed at the new passage.
- **Hysteresis:** scrolling up 60px or 210px kept the strip; 510px brought the overview back.
- **Filtering out the current passage:** a 1985–1995 filter at 2003 left the caret at 2003
  and dimmed the 2003 marks, with 3 of 20 events. A 2000–2010 filter closed the 1989 preview
  and kept the selection.
- **Drag:** the live readout showed "1950 – 1961 · 4 events". Escape cancelled the drag only;
  release committed it with a scroll change of 0.
- **Keyboard:** arrows on a mark step the preview and move focus along. The first Escape
  closes the preview; the second contracts and focuses Explore timeline without scrolling.
- **Missing anchor** (test fixture): an honest message appears and Read this passage is
  disabled; nothing moves.
- **Dark theme:** the filter and preview state renders with Codex tokens.
- **Build:** `npm run build`, `npm run type-check` and eslint on the changed files are clean.

## Not verified / limitations

- **No automated tests.** The repo has no test runner, so the three named risks (preview
  must not navigate, reading must not erase selection, explicit expansion must survive
  docking) were checked by script in the browser, not by unit tests.
- **Not yet tried:** a real phone, touch dragging (only synthetic pointer events), real
  browser zoom and enlarged text (the strip grows with its top row; the scene's pixel lanes
  do not), a screen reader, Firefox and Safari, and landscape phones.
- **Wiki header:** the ProtoWiki header is not sticky, so the measured header offset is 0.
  The measuring code (`useDock.ts`) was not exercised against a sticky header.
- **Phone close-up:** it has no labels, so marks are identified by tapping or through the
  list. At 390px, 2002–2003 still form a count even in the 25-year close-up.
- **Bilbao** (700 years) was not walked through for this pass.

---

# B, Time ruler: the earlier even timeline, same reading behaviour

Same URL: `/timeline-navigation?variant=ruler`. This pass changes the look only; the approved
behaviour is untouched: docking, contraction, anchoring, reading, preview, Read this passage,
Resume and Return. Screenshots: `screenshots/ruler-even/`.
`before-after.mp4` plays the same 1280×720 sequence on the previous build (top) and this one
(bottom).

## How the earlier renderer was adapted

`render/TimelineView.vue` itself is **not** used or changed. It lays events out on a grid
of natural heights and falls back to a vertical list when they don't fit, and it owns its own
selection. None of that can animate into the 68px strip or stay under the ruler's control.
Instead, `ruler/EvenTrack.vue` reproduces its even-spacing composition:

- **Layout:** event i at the centre of slot i+1. Blocks alternate above and below one thin
  line, each two slots wide.
- **Marks:** small neutral dots and short straight stems.
- **Type:** bold 18px dates, 14px short labels in the subtle colour, and the article's own
  images at 72–96px wide.
- **Gaps:** gaps of 8 years or more are drawn dotted and labelled "n yrs". There are no year
  ticks.

It uses the same tokens (Codex colours, `--viz-slot-min` 80px, `--viz-gap-years` 8) and the
ruler stays in charge of everything else. The adapter contract from the brief:

- **Picking a block** sends `pick`, the old `focus`. It previews and selects; it never moves
  the article.
- **Navigating to the source**, the old `select`, stays the ruler's Read this passage.
- **Reading and selection** are separate props with separate looks. Reading is the outlined
  caret, placed on the side of the dot that has no stem (dashed once past). Selection is a
  progressive date, dot and stem. Selecting fades the other blocks only slightly (to 0.78).
- **Too many events to fit:** instead of the old vertical fallback, the track scrolls sideways
  with soft edges. It is the same scroller in every presentation, so the offset survives
  contraction and expansion. While you read (not explore), it keeps the reading event in view.

## Presentations

- **Overview** (in flow, about 376px at 1440×900): 3 label lines and 64px images, close to the
  reference figure.
- **Compact** (68px): blocks fade (0–60ms) and withdraw with the line, stems shorten into it,
  the line rises (100–240ms), and short years fade in under the dots. The same dots, caret and
  selected dot stay.
- **Explore** (the existing 44% cap): space goes first to the preview region (≥104px), then
  to the blocks. Images shrink before label lines are cut, and text is never scaled.
  - At 1440×900: 2 lines with 40px images.
  - At 1280×600: 1 line and no images. Labels there end in an ellipsis; the full label is in
    the preview and the list.
- **Phones:** the persistent object is an overview of all 20 events, evenly spaced across the
  width (`EvenMini.vue`), with the reading caret, the selected dot and a bracket for the part
  in view. Tapping it scrolls the timeline there. Above it, the even timeline is the
  nearby-period view; it withdraws when docked.

## Data and controls

- **Short labels:** each event gained an optional `short` label in `events.ts`, made of words
  from its own sentence (for example "Pritzker Architecture Prize", "Practice in Los Angeles").
  Previews, the list and the Reading label keep the full label. Ages are left out.
- **Spans and approximate dates:** a span is a short fixed capsule (not proportional) with the
  range written in its date. An approximate date has an open dot and keeps "c." or "1970s".
- **Range:**
  - A mouse drag picks the events under it and commits their real date bounds; the live
    readout shows, for example, "1984 – 1997 · 4 events".
  - From and To list only the events' own years.
  - Touch scrolls the timeline sideways instead; the filter is the alternative.
- **Controls:**
  - The header keeps the passage label and the one mode button (Explore timeline / Resume
    reading).
  - Previous, Next, a filter disclosure (showing the active range), help and a subdued date
    span are quiet icons, hidden in the strip.
  - Read this passage is now an outlined progressive button, so the preview's heading and
    quote lead.

## Checks run

1440×900, 1280×600 and 390×844, scripted in headless Chrome, with reduced motion and with
motion on, plus the in-app browser:

- **The sequence:** reading 1997 → contract → 2003 → expand (horizontal offset unchanged) →
  preview 1989 (scroll 0; Reading still 2003) → Resume (dy 0) → read 1989 → Return (dy 0).
  With motion on, dy was 0–1px.
- **All events:** all 20 Gehry blocks render, and the list shows 20 rows. There are no
  proportional ticks; the gap labels are "8 yrs", "10 yrs" and "23 yrs".
- **Filter and selection:** the range drag maps to real dates, a 1984–1997 filter shows 4 of 20
  in dark theme, and selection stays independent of Reading.
- **Keyboard:** stepping from a focused block (a fix in this pass) goes 1989 → 1994–96 → 1997
  and back. Escape closes the preview, then contracts.
- **Other articles:** Bilbao (19 events, gaps up to 226 years) and the edge-case fixture
  (BCE, centuries, "c. 1200 CE") render without console errors.
- **Build:** type-check, build and eslint are clean.

## Not verified / limitations

- **Not yet tried:** touch scrolling of the timeline on a real phone, a screen reader,
  Firefox and Safari, and real zoom.
- **Short windows:** the docked explore view at 1280×600 shows one-line labels with an
  ellipsis.
- **Blank space:** each side's height is reserved for the tallest block anywhere on the track,
  so a window without images (early Bilbao) has empty space below the line.
- **Long dates** such as "February 28, 1929" overflow their block into the gap between
  neighbours. Very long era dates in the fixture could touch.

---

# B, Time ruler: a simpler reader, and editing from dates

Same URL: `/timeline-navigation?variant=ruler`. Captures: `screenshots/ruler-authoring/authoring.mp4`
(dates → live timeline → trimmed label → Commons image → Done) and `reader.mp4` (the approved
reading sequence on the simplified surface). Builder's checks, not user research.

## One authored dataset

- **What is saved:** the timeline is the general tool's item list (`model/visual.ts`), one per
  article, in the prototype store (`host/store.ts`, localStorage key
  `protowiki-timeline-navigation:v1`). See `ruler/authoring.ts`.
- **How the reader gets it:** through `toNavEvents`, a thin equivalent of `toTimelineEvents`
  that also keeps each event's mention id and article order for the reading anchor. The
  navigator indexes these events (`TimelineNavigation.vue`).
- **First visit:** the article's curated picks are written into the store once. After that the
  saved list is the only source, so edits are never overwritten on reload. An emptied timeline
  stays removed.
- **Identity:** each event is identified by its source occurrence (the date mention's id), so
  two events in 1954 stay distinct.

## Reader

- **Header:**
  - The title is "Timeline", with a plain **Edit timeline** link beside it.
  - Docked, the header reads `2003 · Walt Disney Concert Hall` with the reading caret. There
    is no "Reading" sentence or section text.
  - There is no Explore button on the open overview. Once docked, a single chevron (with an
    accessible name and `aria-expanded`) opens and closes the timeline.
  - Return to reading appears only after a real jump.
- **Removed:** previous/next, the filter and date range, range dragging, the event count and
  date span, help, the Event list, the "n yrs" gap labels and dotted gaps, and the years under
  the compact strip.
- **Region:** the selected event's sentence (date in bold, citation, Commons credit) and
  **Read passage**, which stays reachable however long the sentence is. Nothing selected shows
  one quiet hint.
- **Layout:**
  - Slots are wider: about 6.5 events across a desktop column and 2.5 on a phone, with part of
    the next one showing.
  - Blocks are up to 240px wide.
  - Label lines follow the longest label, and images shrink before lines are cut.
  - An always-visible native scrollbar; arrow keys, Home and End move between events; Enter
    selects.
  - The blocks are an `<ol>` inside a `<figure>` whose description says even spacing shows
    order, not elapsed time.

## Editing

- **Getting in:**
  - **New:** the article's Edit tab opens the editor toolbar (`VeToolbar`), and
    **Insert → Timeline** starts an empty draft. It replaces the current timeline on Done.
  - **Existing:** Edit timeline opens a draft of the saved list.
- **Dates in the article:**
  - Every date becomes a chip (`pick/useSelectMode.ts`), and links stop looking like links
    while picking.
  - Selecting a date adds an event at once (`itemFromDate`: the default source span as its
    label, plus the exact span, section, citation and date precision) and selects it.
  - The timeline stays in date order. Selecting a picked date again removes it.
- **The selected event's actions:**
  - Its label is the underlined span in the sentence; trim it by dragging the ends or with
    Shift/Alt+Shift+arrows (`general/useSpanEditor.ts`). "Show in the article" scrolls to it.
  - **Add image / Change image** opens the existing `curate/ImagePicker.vue`. It offers the
    article's own images, and a Commons search seeded from the sentence's linked subject.
  - **Remove image** and **Remove event**.
- **Bar:** one bar at the bottom (`ruler/AuthorBar.vue`) with the count (or "Select dates in
  the article to add events"), Undo, Cancel and Done.
  - Undo reverses picks, label trims, image changes and removals.
  - Done saves and returns to reading; Cancel keeps the saved version.
  - Leaving editing removes the chip and span handlers, so links and previews behave normally.
- **Commons images** keep their file title, page URL, thumbnail, author, licence, licence URL
  and caption (the file's own name or description) through Done, reload and re-editing.
- **Shared fix:** `pick/labelSpan.ts` `cleanLabel` now also drops a leading ")" or "]". Before
  this, "Walt Disney Concert Hall (2003) in downtown…" started its draft label with ")".

## Checks run

Authoring, desktop 1440×900, in the in-app browser:

1. **New timeline:** Edit → Insert → Timeline gave an empty draft, with 184 date chips.
   Selecting 1997, then 1989, then 2003 gave the order 1989, 1997, 2003. Each keeps its own
   mention (d24, d32, d33).
2. **Trim:** the 1997 label went from "Gehry vaulted … when the Guggenheim Museum Bilbao opened
   in Bilbao" to "The Guggenheim Museum Bilbao opened".
3. **Image:** Commons search opened seeded with "Guggenheim Museum Bilbao", and I chose
   `File:Guggenheim Museum Bilbao 2.jpg` (kallerna, CC BY-SA 4.0). The saved item has the
   title, artist, licence, licence URL, page URL and thumbnail.
4. **Done:** the reader shows the three events, the trimmed label and the photo, with no
   chips and no toolbar.
5. **Reload:** the same timeline came back. Edit timeline → Remove event → Undo restored it;
   Cancel kept the saved version.
6. **Real change:** I swapped the photo for the article's own image and trimmed 2003 to "Walt
   Disney Concert Hall". Done, then reload: both persisted.

Also checked:

- **Phone (headless, 390×844):** Edit timeline → a date chip adds an event with its span
  underlined → Add image opens the picker (358px wide) → Done.
- **Keyboard:** date chips work with Enter and have accessible names ("1962: add to the
  timeline").

Reader, with the seeded timeline in headless Chrome at reduced motion, at 1440×900, 1280×600 and
390×844:

- **Sequence:** reading 1997 → contract → 2003 → open → preview 1989 (scroll 0) → close (dy 0)
  → Read passage 1989 → Return (dy 0).
- **Opening from the overview:** opening a preview from the un-docked overview moved the page
  0px.
- **Keyboard:** arrows and Home move focus along the events; Enter previews; the first Escape
  closes the preview (focus back on the event), the second collapses.
- **Dark theme**, type-check, build and eslint are clean.

## Not verified / limitations

- **Draft labels:** a new event's first label is the existing default span, which can be long
  or odd (for 2003: "In downtown Los Angeles is the centerpiece…") until it is trimmed.
- **Article editor:** the toolbar's own buttons other than Insert, Undo and Publish (text
  style, link, cite…) are inert here.
- **Picking near the top:** the open timeline sits below the introduction, so dates in the
  introduction are picked with the timeline out of view until you scroll it into place.
- **Chip contrast:** a picked chip under the sentence hover highlight shows white text on grey.
- **Not yet tried:** touch dragging of the span handles on a real phone, a screen reader,
  Firefox and Safari.

---

# B, Time ruler: visible dates, typed titles, live images

Same URL: `/timeline-navigation?variant=ruler`. Captures: `screenshots/ruler-dates/navigation-dates.mp4`
and `editing-title-image.mp4`; stills for every step at three sizes in the same folder.
Builder's checks, not user research.

## What changed

- **Dates stay visible.** Each event's date now sits next to its stem, then the title, then the
  photograph furthest from the line.
  - On docking, titles and photographs fade first and the stems shorten. The dates settle into
    two tight alternating rows around the same line, each beside its own point.
  - The date shrinks from 18px to 15px; nothing else changes size. Horizontal positions, order
    and scroll offset are those of the one scroller.
  - The docked strip is 52px plus the scrollbar (62px with a classic scrollbar).
  - Dates stay clickable, and the strip scrolls sideways.
  - The phone's dotless all-events overview (`EvenMini.vue`) is gone. Phones use the same dated
    strip, with about two and a half events in view.
- **No triangle.** The date being read has a subtle neutral underline. The selected event has a
  progressive date and a larger filled progressive point. Both can show on the same date, and
  each has its own accessible description.
- **Header:** the docked strip has no status sentence; the open header is "Timeline" and
  Edit timeline. Selecting an event adds one quiet "Read passage" link there (with an
  accessible name such as "Read the passage for 1989: Pritzker Prize"). A Commons photo also
  gets a quiet "Photo credit" link. The copied paragraph, its heading and the icon button are
  gone.
- **Selecting and closing:** selecting doesn't move the article. Select the event again, press
  Escape, or use the chevron to close. Return to reading appears only after a real jump.

## Titles

- **Titles are typed.** The title is the item's existing `label`, marked `labelEdited`, so
  rendering never regenerates it. The source sentence, anchor, citation, date and linked
  subjects are untouched.
- **Starting titles:**
  - Seeded events keep their concise labels ("Pritzker Architecture Prize").
  - A newly picked date starts from the curated short label for that occurrence, else the
    mention's own `draftLabel` (for 2003: "Walt Disney Concert Hall").
  - Focus stays in the article, so several dates can be picked in a row.
- **The Title field:** selecting an event while editing shows a **Title** field, its image, and
  quiet View source and Remove event links.
  - Typing updates the live timeline; Enter finishes.
  - Escape puts back the title from before that edit, and the timeline stays as it is.
  - An emptied field keeps the old title.
  - Each field session is one Undo step.
- **No span handles.** The label-span handles and "underlined words" instruction are gone from
  naming. `useSpanEditor` is no longer used by B.

## Images

- **The thumbnail is the control.** "Add image" when there's none; otherwise the thumbnail opens
  the picker, with an accessible name such as "Change image for Guggenheim Bilbao opens".
- **Removing an image** happens in the picker. `curate/ImagePicker.vue` has a new opt-in
  `removable` prop that shows the current image with its full attribution (author, licence
  link, file page) and a Remove image button.
- **Live preview:** a chosen photograph appears on the timeline at once, from the same draft
  the reader renders.

## Checks run

- **Reader** (headless Chrome, reduced motion; 1440×900, 1280×600 and 390×844):
  1. Reading 1997, then 2003 in the docked strip: dates visible (seven at 1440px, three on the
     phone) and no triangle.
  2. Panning the strip by 300px kept the dates attached. Opening it kept the scroll offset,
     with events at the same x (0px).
  3. Previewing 1989: Reading stayed on 2003, 1989 was selected, the Read passage link
     appeared, there was no copied paragraph, and the article moved 0px.
  4. Closing: dy 0. Read passage for 1989, then Return: dy 0.
  5. Dark theme: Reading 2003, selected 1989.
- **Keyboard** (in-app browser): arrows move along events; Enter selects and reveals Read
  passage; Escape clears the selection and keeps focus on the event; the page doesn't move.
- **Editing** (in-app browser, 1440×900):
  - Typing "Guggenheim Bilbao opens" into Title updated the timeline. Escape after typing
    restored the previous title.
  - Two renames then two Undos went back step by step.
  - A Commons search seeded with "Guggenheim Museum Bilbao". The chosen file showed on the
    timeline before Done, and the horizontal offset was kept.
  - Renaming again kept the image. After Done and reload, the title and image persisted with
    the full metadata, the sentence and anchor d32.
  - Image removal and Undo, event removal and Undo, and Cancel all worked.
  - A new timeline from 1997, 1989, 2003 came out in date order, with titles "Pritzker
    Architecture Prize", "Guggenheim Museum Bilbao opened" and "Walt Disney Concert Hall".
- **Build:** type-check and build are clean. ESLint reports warnings only, none new apart from
  ImagePicker's existing formatting style.

## Not verified / limitations

- **Focus treatment:** I checked focus styles from the CSS, not visually. This pane doesn't
  show keyboard-modality focus.
- **Title field events:** its focus and blur events don't fire in the unfocused pane. I made it
  robust: a session also starts on the first keystroke, and Enter and Escape end it explicitly.
  I didn't test it with a real keyboard in a focused window.
- **Not yet tried:** a screen reader, Firefox and Safari, and real touch.
- **Phone:** in the docked strip, long dates like "December 5, 2025" fade at the edge where the
  chevron sits.
- **Short windows:** the docked, open timeline drops photographs to fit the cap.

## Follow-up: selecting an event goes there

- **What changed** (after Nico's review): reading, a click, tap or Enter on an event goes
  straight to its passage. It's the same deliberate jump as before:
  - a collapsed section opens;
  - the strip settles docked;
  - the passage is placed below it, washed and focused;
  - the underline moves to that date.
- **Removed:** the "Read passage" link, the Photo credit link, Return to reading and its ×, and
  the reader's preview/selection state. Commons credit stays in each photo's tooltip and, in
  full, in the editor's image picker.
- **Editing is unchanged:** a click selects the event for its Title field and image.
- **Checked** in the in-app browser at 1440×900:
  - from the open overview (1989), the docked strip (2003) and the opened timeline (1997), the
    passage lands about 254px from the top, under the 62px strip;
  - there is no Return or Read passage control;
  - while editing, a click selects (scroll 0) and shows the Title field.

## Follow-up: the editing bar sits under the timeline

After Nico's review, the editing bar (count, Undo, Cancel, Done) moved from a fixed strip at
the bottom of the window into the timeline panel, directly under the event editor. It docks
with the panel and stays beside what is being edited.

Checked in the in-app browser:
- **1440×900, at the slot:** the panel runs from 124 to 510px, the editor ends at 462 and the
  bar takes 462–510.
- **1440×900, docked:** the panel runs from 0 to 386px with the bar at 338–386. Done saves and
  removes it.
- **390×844:** the bar sits under the editor in the docked panel.

## Follow-up: editing on phones

Nico reported that editing on mobile didn't work. With real taps at 375×812 I found:

- **The timeline was hidden under the editor toolbar.** The article editor's toolbar is fixed
  at the top, and the docked timeline slid under it, hiding the "Editing timeline" header and
  the row of dates above the line. The dock now treats `.ve-toolbar` as part of the header and
  re-measures when editing starts or ends. The same was true on desktop once docked.
- **A picked chip went blank on touch.** The grey sentence-hover highlight stayed after a tap
  (touch has no mouse-out), painting over the filled chip's white text. The highlight is now
  translucent, and off entirely on touch screens.
- **The chosen photograph didn't show on the phone's timeline.** The docked editing panel was
  too short for images.
  - While editing on a phone, the panel may take 55% of the visible height (44% when reading).
  - Editing prefers a one-line title with a small photo over a two-line title with none.
  - Desktop editing now also shows 1-line titles with 32–40px photos.

Checked with real taps and typing at 375×812:

1. Edit timeline opens editing, and the timeline docks under the toolbar (top 49px).
2. Tapping the 1961 date adds the event (21 events), centres it and opens its Title field.
3. Typing "Moves to Paris" updates the timeline.
4. Add image opens the picker above everything. A chosen photo shows on the timeline (32px)
   and as the thumbnail.
5. Cancel restores the saved 20 events.

Desktop editing re-checked at 1440×900: Cancel puts the dock back at 0.

## Follow-up: blue current date, spacing, ages

- **Current date in blue.** The date being read (the event last gone to) is now in the
  progressive blue with a filled blue point, instead of a grey underline. While editing, only
  the event being edited is blue.
- **Spacing.**
  - In the docked strip, dates sit 5px from the line on both sides (was 3px), so the larger
    current point no longer crowds them. The strip is 50px plus the scrollbar.
  - In the open timeline, stems are 10px.
- **Ages.**
  - Under each date: "aged 60", or "aged 40–44" for a span. The value is the event's year
    minus the subject's birth year from the infobox (1929 for Gehry).
  - There is none for the birth itself, and none for a subject with no birth date (Bilbao).
  - Ages withdraw with the titles when the strip docks, and are part of each event's
    accessible name.
- **Checked** in headless Chrome at 1440×900, 1280×600 and 390×844: dates are blue in the
  overview and the docked strip, ages appear under the dates, and the strip spacing is even.

## Follow-up: events on the same date

- **One slot per date.** Events whose dates read the same (Gehry: 1954 ×2 and 2002 ×2;
  Bilbao: 1876 ×2 and 26 August 1983 ×2) now share one slot (`ruler/layout.ts`, `slotsOf`):
  one point, one date, one age, with their titles stacked under it in article order.
  - Each title is still its own event and its own button. In reading it jumps to that event's
    passage; in editing it selects that event alone. They are a small list ("2 events on
    2002") inside the event list.
  - Only identical displayed dates group: "1954" and "the fall of 1956" don't, and neither
    would "1990" and "July 1990". Different precisions stay separate events in date order.
- **Docked strip:** a shared date appears once. Tapping it opens the timeline so the reader
  chooses which event; a single date still goes straight to its passage.
- **Reading and selection:** a shared date turns blue when any of its events is being read or
  edited; within the stack, the event being edited is blue.
- **Photograph:** the slot shows the first of its events that has one.
- **Layout:** the title area is sized for the tallest stack (each title up to two lines, at most
  four in a slot). When space is short, each title in a stack gets one line.
- **Keyboard:** arrows still go event by event, so both titles of a shared date in turn.
- **Checked** at 1440×900 and 375×812:
  - Gehry renders 20 events in 18 slots; 1954 and 2002 each show one date and age with two
    titles.
  - Clicking "Graduated from USC" jumps to its passage.
  - Tapping the shared date in the strip opens the timeline without moving the article (0px).
  - In editing, selecting "Gehry Technologies" selects only it (scroll 0).
  - Arrow keys go surname → USC → fall 1956.

## Follow-up: visual polish (Time ruler B)

A quieter, more refined pass on the same structure:

- **Line and points.** Stems are gone; a hairline axis carries small dots, each with a halo in the page background colour so the line appears to pass behind them. The current point is a larger blue dot with a soft blue ring.
- **Hierarchy.** Each event reads date (strong) → title (base) → age (small, placeholder grey). The current date turns blue; hover turns date and title blue without underlines.
- **Photos.** Rounded corners with a 1px hairline instead of a border, spaced evenly from the text.
- **Panel.** Hairline borders above and below. When docked, the strip is frosted (92% background + backdrop blur and saturation, with a solid fallback) and casts a soft shadow instead of a hard rule.
- **Scrollbar.** Thin, with a transparent track.

Screenshots: `screenshots/ruler-polish/`.
- **Per-side title room.** Each side of the line reserves only the title lines its own blocks need (`sideLines` in `ruler/layout.ts`), so one long title below no longer leaves blank lines above. The band that remains above the line is photo room for the photographs further along that side; it is kept so the line does not jump while scrolling sideways.
- **Phones: photographs below the line only.** With about two and a half events in view, photo room held above the line read as a blank band, so on phones photographs are drawn only for events below the line (`photosBelowOnly` in `richLayout`). The event editor still shows the selected event's photograph whichever side it is on.
- **Dot–date spacing, square photos, following.** Dates sit further from their points (16px open, 11px in the docked strip, which grows to 60px), clear of the current point's halo. Photographs have square corners, as in articles. While reading, the timeline brings the date being read to its centre, open or docked. Only a sideways gesture on the timeline pauses this: a sideways wheel, a sideways swipe, or a mouse press. Scrolling the page with the pointer over the strip does not.
