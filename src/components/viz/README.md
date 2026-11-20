# Article modules kit (`src/components/viz/`)

Shared code for visualization modules an editor builds from an article in the
Visual Editor: pick things in the text, curate them, render them. Used by two
prototypes, which differ only in which kinds they offer:

- `src/prototypes/timeline-module/` — timeline only (`/timeline-module`)
- `src/prototypes/map-module/` — map and timeline on one page (`/map-module`)

| Part       | Folder    | Does                                                                                                                                                                                                                                                                                                                                                                     | Must not                                                                         |
| ---------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| **Pick**   | `pick/`   | Find things in the article text and make them chips in place: dates (`extractDates`), places (links to Wikidata items with a coordinate, from a build-time lookup). Select mode, duplicates, finding and marking a source passage. Produces `Mention<T>` (`pick/types.ts`).                                                                                              | Know about timelines, maps or panels.                                            |
| **Curate** | `curate/` | The panel (`Curator`) that lists, edits and orders picked items, says where the result goes, and inserts it; generic over the item. Item editors share `ItemEditor` (label, image, source, "Show in article"); `EventEditor` and `PlaceEditor` add their own head. Images from the article or Wikimedia Commons; a Wikidata search for places the article does not link. | Import a renderer or the host page.                                              |
| **Render** | `render/` | Draw a module from a plain list of items and `tokens.css`: `TimelineView`, `MapView`.                                                                                                                                                                                                                                                                                    | Know about the article, picking or curating; hard-code a colour, weight or size. |

Shared:

- `tokens.css` — the one style for all modules: one hue (Codex progressive) plus neutrals, lightness for order, area for count; one line weight, one dot, one image size and crop, two Codex text styles; map base tokens.
- `model/` — plain data (`types.ts`: `BaseItem`, `TimelineEvent`, `Place`, `ModuleData`…) and logic on it (`dates.ts`, `places.ts`).
- `host/` — the page: `ModulesPrototype` (control strip, phone-width iframe), `ArticleModules` (article, VE toolbar with Insert per kind, select mode, curator, placed blocks, timeline↔map links), `kinds.ts` (everything that differs between kinds), `loadArticle.ts` (the Frank Gehry snapshot), `examples.ts`, `store.ts` (one localStorage store per route).

Data, committed (no runtime lookups except the panel's Commons and Wikidata searches):

- `public/snapshots/frank-gehry.html` — `src/prototypes/timeline-module/scripts/snapshot.py`
- `public/snapshots/frank-gehry.places.json` — `src/prototypes/map-module/scripts/places.py` (Wikidata)
- `public/geo/land-110m.json`, `land-50m.json`, `10m/*.json` — `src/prototypes/map-module/scripts/land.py` (Natural Earth land and lakes, public domain, pre-projected; three levels of detail, the 1:10m level tiled and fetched only for the view: `render/baseMap.ts`)

Adding a kind (e.g. a quantity chart): a mention type and extractor in `pick/`, an item type in `model/types.ts`, an entry in `host/kinds.ts`, an item editor over `ItemEditor`, a renderer in `render/` reading `tokens.css` (add tokens there, never literals), and the two template branches in `ArticleModules.vue`.

Where rules fall short is logged in `notes/rule-failures.md`.
