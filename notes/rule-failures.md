# Rule failures

Where the rule-based picking (no language model) falls short, on the Frank Gehry
article (enwiki rev 1385946633). One line each: **what the text said** → **what the
rule produced** → **what would have been right**. This log decides later whether a
model is needed, and for what.

Rules in force: a *place* is a link whose target has a Wikidata coordinate (P625),
looked up once at build time; its year is a "(year)" right after the link, else
Wikidata's opening (P1619) or inception (P571). A *date* is a regex match in the
prose (see `src/components/viz/pick/extractDates.ts`).

## Places mentioned without a link

- "residential buildings such as the eccentric Norton House (1984) in Venice" → no chip (not linked) → a place, Norton House, Venice, 1984.
- "the over 2,000 sq ft … "David Cabin"" (Idyllwild, 1957) → no chip (not linked; only Idyllwild is) → the David Cabin, 1957.
- "the Peter B. Lewis Library (2008) at Princeton University" → "Peter B. Lewis" links to the person, so no place; Princeton University is offered instead → the library, 2008.

## Links whose target is not the thing the sentence is about

- "the Vitra International Furniture Manufacturing Facility and Design Museum in Germany" → links to Vitra (the furniture company) → the Vitra Design Museum building, Weil am Rhein.
- "the Frederick Weisman Museum of Art (1993) in Minneapolis" → both the museum and Minneapolis are chips; picking the city is easy by mistake → only the museum; the city is where it is.
- "The boisterous, curvaceous Walt Disney Concert Hall (2003) in downtown Los Angeles" → "downtown Los Angeles" is a chip too → only the hall.
- "the Dancing House in Prague (1996)" → the city link sits between name and year, so the "(year)" rule misses; the year comes from Wikidata (also 1996, by luck) → 1996 from the sentence.
- "the Guggenheim Museum Bilbao opened in Bilbao, Spain" → Bilbao is a chip next to the museum → only the museum.
- "California Aerospace Museum (1984)" → the link resolves to Wikidata's *California Science Center* (the institution) → the aerospace building of 1984. The map now labels it with the article's words, but the Wikidata name, coordinate and dates are the institution's.
- "Chiat/Day Building (1991)" → Wikidata names it *Binoculars Building* → fine as a place, but the name the reader sees in the callout differs from the article.
- "Los Angeles River Revitalization Corporation" (an organisation) → resolves to the *Los Angeles River* (a river with a point coordinate) → not a place for this map.
- Universities, schools and companies with a headquarters coordinate become places: University of Southern California, Harvard, MIT, Princeton, Columbia, Yale, UCLA, University of Toronto, Hennessy, Dassault Systèmes, the Chicago Symphony Orchestra, the BBC → offered as places although the sentence is about studying, teaching, or a commission, not a site → offered only when the sentence is about the place (built, opened, located).
- "Basque Country" → kept as a site (its classes are not in the region list) → a region; not a point.

## Linked buildings with no Wikidata coordinate

- "the Forma skyscraper project in his hometown of Toronto" → Forma (Toronto) has no P625 → no chip → a place in Toronto (unbuilt at the time of writing; the text says "project").
- "the Grand Avenue Project in Los Angeles" → no P625 → no chip → a place in Los Angeles.

## Dates on places that belong to something else

- "Cabrillo Marine Aquarium (1981) in San Pedro" → sentence 1981 vs Wikidata 1941 → 1981 is Gehry's building; 1941 is the institution's founding. The rule chose 1981 (sentence first): right here, but only because the year is parenthetical.
- "the California Aerospace Museum (1984)" → sentence 1984 vs Wikidata 1951 (the Science Center) → 1984.
- "the Cinémathèque Française (1994) in Paris" → sentence 1994 vs Wikidata 1936 → 1994 for the building (the institution dates from 1936).
- "the Museum of Pop Culture (2000) in Seattle" → sentence 2000 vs Wikidata 2004 → 2000 (Wikidata's value is a renaming, not the opening).
- "Gehry Residence … Originally built in 1920 and purchased by Gehry in 1977" → no "(year)" after the link, Wikidata says 1976 → 1978 (the renovation) or 1977 (purchase); the article does not give the remodel year in that sentence. A clause-level reading would be needed.
- "the Stata Center (2004) at MIT, and the Peter B. Lewis Library (2008)" → Stata gets 2004 (right); MIT, the next link, does not take 2008 (right, by the parenthesis rule) — but the library itself is lost (see above).

## Dates (timeline) the picker misses or misreads

- "In December, Gehry said that he had no plans to move." → not picked (no year; the year, 2016, is in the previous sentence) → December 2016.
- "released July of that year", "performed in November of that year", "The subsequent year" → not picked → the year from the earlier sentence.
- "In 1957, at age 28" / "until around the age of 80" → ages are not dates → 1957 is picked anyway; "around the age of 80" ≈ 2009 is not.
- "From May 14–June 27, 2026" → only June 27, 2026 is picked → a span May 14 – June 27, 2026.
- "Originally built in 1920 and purchased by Gehry in 1977" → 1920 is offered → it is the house's date, not an event in Gehry's life.
- "the 2010 World Architecture Survey" → 2010 is offered → part of a title; fine as an event only if the editor wants it.
- "the "Avant-Garde in Russia 1910–1930" exhibition in 1980" → 1910–1930 is offered as a span → part of an exhibition title.
- "the California "funk" art movement of the 1960s and early 1970s" → two decades offered → they date a movement, not an event.
- "In 1962, he established a practice … that became Frank Gehry and Associates in 1967, then Gehry Partners in 2001." → three chips, all with the 1962 clause as their label → each year needs its own clause as a label.
