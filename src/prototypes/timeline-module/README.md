# Timeline module (prototype)

A Visual Editor tool that builds a timeline from dates already in an article
(Frank Gehry, frozen snapshot). Route: `/timeline-module`.

The code is split so the next modules (a map, a quantity chart) can reuse the
first two parts with a different renderer:

| Part | Folder | Does | Must not |
| --- | --- | --- | --- |
| **Pick** | `pick/` | Find things in the article text (dates today), wrap them as chips, select mode, duplicate detection, finding and marking a source passage. Produces `Mention<T>` (`pick/types.ts`). | Know about timelines or panels. |
| **Curate** | `curate/` | The panel that lists, edits and orders picked items; images (article + Wikimedia Commons); where to insert. The result preview comes in through a slot. | Import a renderer or the host article. |
| **Render** | `render/` | Draw a timeline from a plain list of events, styled only by `viz-tokens.css`. | Know about the article, picking or curating; hard-code colours, weights or sizes. |

Shared:

- `model/` — plain data (`types.ts`) and date logic (`dates.ts`: formatting with the original precision, position estimates, ages).
- `viz-tokens.css` — the one style for visualization modules (one hue plus neutrals, one line weight, one dot, one image size, two Codex text styles).
- `article/` — the host: the article page, VE toolbar, placement of the block, and wiring Pick → Curate → Render.
- `store.ts` — prototype state (localStorage; shared between the page and its phone-width iframe).
- `example.ts` — the "Load example" picks.
- `scripts/snapshot.py` — refreshes `public/snapshots/frank-gehry*`.
