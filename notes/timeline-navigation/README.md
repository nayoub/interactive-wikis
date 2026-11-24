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
