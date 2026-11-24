# Article modules kit (`src/components/viz/`)

Shared code for visualization modules an editor builds from an article in the
Visual Editor: pick things in the text, curate them, render them. Used by two
prototypes, which differ only in which article and which kinds they offer. One link opens
them all: the site's base URL goes to the most recently viewed one (the timeline the first
time); the header's user menu switches between them (`host/hub.ts`, `host/hub-routes.json`).
The old routes (`/timeline-module`, `/map-module`, `/election-module`) redirect; `/visual` is
reserved for the general tool. The ProtoWiki gallery is at `/gallery`.

- `src/prototypes/timeline/` — timeline only (`/timeline`), Frank Gehry
- `src/prototypes/map/` — map and timeline on one page (`/map`), Frank Gehry
- `src/prototypes/visual/` — the general tool: any form by rule, several visuals per article (`/visual`), Bilbao
- `src/prototypes/election/` — a visual from a results table (seat diagram, bars, earlier elections), with timeline and map (`/election`), 2025 German federal election
- `src/prototypes/timeline-navigation/` — five ways to navigate an article by time (`/timeline-navigation?variant=contents|ruler|trail|parallel|milestones&article=frank-gehry|bilbao|test-fixture`), from `navigate/`: one curated event collection per article, one navigation contract (`navigate/useNavigator.ts`: selected event, passages in view, period, saved reading origin), the variants in `navigate/variants/`. Pass 2 adds `occurrences.ts` (dated events with their real linked names), `connections.ts` (threads, topics, stated relationships, co-mentions) and `passages.ts` (finding sentences and verified link mentions in the live article): variants `field`, `field-margin`, `link-columns`, `link-chronology`, `connect-brackets`, `connect-paths`, `paired`. B (`ruler`) is one persistent timeline (overview, compact strip, docked exploration) built from `navigate/ruler/`: the earlier even-spaced look of `render/TimelineView.vue` (`EvenTrack.vue`, phones add `EvenMini.vue`), driven by the ruler's docking, reading anchor and region. Walkthrough notes: `notes/timeline-navigation/`.

| Part       | Folder    | Does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Must not                                                                         |
| ---------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Pick**   | `pick/`   | Find things in the article text and make them chips in place: dates (`extractDates`), places (links to Wikidata items with a coordinate, from a build-time lookup), data tables (`tables.ts`: grid with merged cells expanded, column roles proposed by rules, party rows, the election infobox). Select mode, duplicates, finding and marking a source passage. Produces `Mention<T>` (`pick/types.ts`).                                                                                                                                                        | Know about timelines, maps or panels.                                            |
| **Curate** | `curate/` | The panel (`Curator`) that lists, edits and orders picked items, says where the result goes, and inserts it; generic over the item. Item editors share `ItemEditor` (label, image, source, "Show in article"); `EventEditor` and `PlaceEditor` add their own head. Images from the article or Wikimedia Commons; a Wikidata search for places the article does not link. A kind with its own list (a Visual) fills the `list` slot: `VisualCurate` (column roles, forms that fit, drag-to-order parties, "Others" threshold), from `visual.ts` / `fromTable.ts`. | Import a renderer or the host page.                                              |
| **Render** | `render/` | Draw a module from a plain list of items and `tokens.css`: `TimelineView`, `MapView`, `ElectionView` (hemicycle of the same dots, or bars; year control; `hemicycle.ts` geometry, block gaps and contrast). Selection is the same everywhere: the item lights, the rest dims, and `SelectionCard` below the figure gives its details, source sentence, citation and "Show in article".                                                                                                                                                                           | Know about the article, picking or curating; hard-code a colour, weight or size. |

Shared:

- `tokens.css` — the one style for all modules: one hue (Codex progressive) plus neutrals, lightness for order, area for count; one line weight, one dot, one image size and crop, two Codex text styles; map base tokens; election tokens. The one exception to the single hue is **party colours** (from the article's table, kept with their source): seats and bars only, every party labelled, outlined in a neutral when too close to the page (`--viz-contrast-min`), and a Monochrome prototype toggle that redraws them by lightness.
- `model/` — plain data (`types.ts`: `BaseItem`, `TimelineEvent`, `Place`, `Party`, `VisualSpec`, `ModuleData`…) and logic on it (`dates.ts`, `places.ts`, `parties.ts`: the curated order applied to each election, "Others").
- `host/` — the page: `ModulesPrototype` (phone-width iframe, the URL ⇄ controls sync: `?example=1|0&width=phone&plain=1&mono=1&spacing=even&shade=1&mode=edit`, Esc leaves phone width), `PrototypeMenu` (all prototype controls, in the header's user menu; a "Prototype" tag sits beside the logo), `ArticleModules` (article, VE toolbar with Insert per kind, select mode, curator, placed blocks, timeline↔map links), `kinds.ts` (everything that differs between kinds), `loadArticle.ts` (an `ArticleSource`: a snapshot by slug, its places, its data tables, and for a series the earlier articles' tables), `examples.ts`, `store.ts` (one localStorage store per route).

Street map: cities and streets come from OpenStreetMap data as **vector tiles from OpenFreeMap**
(free, no key; credited on the map), drawn by MapLibre GL behind the renderer's own marks
(`render/vectorBase.ts`). The style is OpenFreeMap's Positron recoloured from `--viz-map-*` tokens:
neutrals only, so the base stays weaker than the marks. MapLibre is loaded only when a map is on the
page. The drawn Natural Earth base stays underneath as the fallback while tiles load or offline.
(Wikimedia's own tiles refuse requests from other sites; CARTO's need an API key.)

Data, committed (no runtime lookups except the panel's Commons and Wikidata searches and the street-map tiles):

- `public/snapshots/frank-gehry.html`, `german-federal-election-{2025,2021,2017}.html` — `src/prototypes/timeline/scripts/snapshot.py --title … --slug … [--no-images]`
- `public/snapshots/<slug>.places.json` — `src/prototypes/map/scripts/places.py --slug …` (Wikidata)
- `public/snapshots/<slug>.seating.json` — `src/prototypes/election/scripts/seating.py --slug …` (the article's own parliament diagram from Commons: parties left to right, colours, seats; the default seat order and a totals check)
- `public/geo/land-110m.json`, `land-50m.json`, `10m/*.json` — `src/prototypes/map/scripts/land.py` (Natural Earth land and lakes, public domain, pre-projected; three levels of detail, the 1:10m level tiled and fetched only for the view: `render/baseMap.ts`)

Adding a kind (e.g. a quantity chart): a mention type and extractor in `pick/`, an item type in `model/types.ts`, an entry in `host/kinds.ts`, an item editor over `ItemEditor`, a renderer in `render/` reading `tokens.css` (add tokens there, never literals), and the two template branches in `ArticleModules.vue`.

## The general tool (`general/`, route `/visual`): the article is the interface

There is no side panel. **Insert → Visual** asks one thing (`KindChooser`: Dates, Places, A
table, An image — only those in the section), or a **suggestion card** starts it
(`SuggestionLayer` + `cards.ts`: margin cards on wide screens, a chip at the heading opening a
bottom sheet otherwise; the Visual Editor's own `FindingBody` with a reason on dismiss). That
kind lights up in that section and the rest dims; an empty block is inserted beside the source
and the visual grows in it with every pick. One bar at the bottom (`EditorBar`): kind and
count, a miniature, Undo, More (whole article, add all, form options, adjust columns, change
form), Cancel, Done; above it, only when needed, the one question about a table or two or three
forms. Labels are spans of their sentences (`pick/labelSpan.ts`), underlined in the text with an
end to drag at each side, a word to tap at either edge, or Shift(+Alt)+arrows
(`useSpanEditor.ts`). Items are edited on the visual (`VisualFrame` editing mode): click a label
to type, click an item for Show source / Change image / Move / Remove; bars drag to reorder. A
placed block drags by its handle (Move up / Move down on a phone). The Timeline, Map and
Election prototypes are listed under "Earlier prototypes".

### Pieces

Everything is the general object in `model/visual.ts`: sets of items with typed components
(time, place, quantity, category, region) and a source (with the label's span).

- `form-rules.json` — which forms fit which components (data). `rules.ts` reads it.
- `forms/` — one renderer per form plus its entry in `forms/index.ts` (label, how-to-read
  caption, settings, order, numbered, compare, preview thumbnail). Timeline, map and seat
  diagram wrap the existing renderers (`bare` mode, selection owned by the frame); line and
  columns, bars, rows of small columns and the annotated image are new. "Map and timeline,
  linked" (place + time) shows both views of the same items with one selection.
- Every item can carry an image (Change image on the item: the article's own images or Wikimedia
  Commons, through the same `ImagePicker` as the timeline); the frame's card shows it.
- `draft.ts` — what picking does (dates/places → items, a table → items by column roles,
  an image → markers), and the Compare operator (`setCompare`: the same table in a
  comparable article, as a second set). Over time and Link are noted in `model/visual.ts`.
- `cards.ts` — the suggestion cards (thresholds, one per section, three per article, dismissals in
  local storage); `suggest.ts` — the counts behind "Load example".
- Adding a form: a row in `form-rules.json`, a renderer and its entry in `forms/index.ts`.

Data: `public/snapshots/bilbao.html` (+ `.places.json`, `.labels.json` from
`src/prototypes/visual/scripts/labels.py`: Basque and French Wikidata labels for the user
menu's **Labels** choice), `san-sebastian.html` (Compare).

Where rules fall short is logged in `notes/rule-failures.md`.
