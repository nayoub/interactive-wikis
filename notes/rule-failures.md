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

# Tables (election module)

On the results tables of *2025 German federal election* (rev 1385970319), *2021…*
(rev 1385970268) and *2017…* (rev 1386057083). Rules in force
(`src/components/viz/pick/tables.ts`): header rows are the leading all-`<th>` rows,
merged cells repeated; *category* = the column with the most text in its own
cells; *seats* = whole numbers summing to the infobox's chamber size; *share* =
"%" in header or cells (first such column); *votes* = whole numbers ≥ 10,000
under a "vote" header (first such column); *change* = signed numbers or a "+/–"
header; *colour* = an empty cell with an inline background; *not a party* = rows
named Total, Valid, Invalid, Registered, Turnout, Source…

Result: the same 10 roles on all three tables — ignore (colour), category, votes,
share, ignore, ignore, ignore, ignore, seats, change — with the two misses below
fixed in the rules.

## Merged headers

- One "Party" header spans the colour cell and the name → both columns are called "Party" → right for display, but matching the 2021/2017 tables by header text gave the name column the colour column's role (no parties found) → fixed: same header in the same place first, then the first unused one.
- "Party list › Seats" (sums 354 / 436 / 410) and "Constituency › Seats" (276 / 299 / 299) beside "Total seats" (630 / 735 / 709) → only the total sums to the chamber → right. Without the infobox's chamber size the rule could not tell the three apart.
- Two "Votes" and two "%" columns (party list = second vote, constituency = first vote) → the first of each is kept → right for Germany (the list vote decides seats), but only because it comes first.

## Totals rows

- "Total" is one cell merged across the colour and name columns → it made the colour column look like the most-text column, so *category* went to the colour column → fixed: a merged cell counts once, for its first column.
- "Valid votes", "Invalid/blank votes", "Total", "Registered voters/turnout" → dropped by name → right. A totals row named differently (e.g. "Overall") would be read as a party.

## Footnote markers in numbers

- FDP change "−91[d]" → footnote stripped, −91 → right.
- BSW change "New" → no number, no change shown → right.

## Coalition and alliance rows

- The infobox lists the alliance "CDU/CSU" (one link, 208 seats) while the table has CDU (164) and CSU (44) as rows → split by initials of the table names → CDU, CSU in the infobox's slot → right; an alliance whose short names are not initials (e.g. "Greens/EFA") would fall to the end of the order.

## Renamed parties

- 2025 infobox links *Die_Linke*; the 2025, 2021 and 2017 tables link *The_Left_(Germany)* → no link match → matched by equal seats won (64) → right, but fails when two parties have the same seats. The short name follows the infobox ("Die Linke") while the full name follows the table ("The Left").
- *Sahra Wagenknecht Alliance* exists only in 2025 → absent in 2021/2017 → right (its slot is empty in those years).

## Constituency / list seats split

- Seats come from "Total seats"; the list/constituency split is ignored. The seat diagram cannot show overhang or the 2025 rule that left constituency winners without a seat.

## Tables the rules do not read

- "Party list vote share by state" (states as rows, parties as columns, percentages without a "%") → not lit (no quantity found) → a share table per party, transposed.
- "Seats won by state" tables → not lit (parties as columns) → same.
- "Seats targeted by The Left / the Free Voters" → lit, *share* = the winner's 2021 share → offered as bars, which is a valid but odd chart; a seat diagram is rightly not offered.
- "Sociology of the electorate" → lit, *share* = the first party column (Union) only → bars of one party by demographic; the other parties' columns are ignored as "another percentage column".

## Totals: 2021 shows 735 seats, the 2025 article says 736

- The 2025 article's lead says the Bundestag went "down from 736 in 2021". The 2021 article's infobox says "All 735 seats", its results table totals 735 (FDP 91), and its own parliament diagram (`File:Bundestag_2021.svg`) has 736 seats (FDP 92). The infobox explains it in a footnote on FDP's 91: initially allocated 92 seats, it lost one in a repeat election in Berlin. The article's results section says when: the repeat election in 455 Berlin precincts on 11 February 2024 cost the FDP a seat, the Bundestag being "reduced from 736 to 735 members". So 736 is the result as first declared, 735 the legal result after the repeat; the table and infobox were updated, the diagram file and the 2025 article's sentence were not.
- Rule now in force: party seats must equal every total the article states (infobox, the table's Total row, the parliament diagram). 2021 fails the diagram check → the curate panel shows a warning naming 735 and 736, and the figure carries the same note under it. The figure keeps the table's 735; it does not pick a side.

## Seat order (election module)

- Rule now in force: the default order is the article's own parliament diagram, read at build time (`src/prototypes/election/scripts/seating.py`: the SVG's party groups, left to right), matched to table rows by colour, then name, then seats. Before, the infobox order (by result) put AfD in the middle of the chamber.
- 2025 diagram (`File:21st_Bundestag.svg`): Linke, SPD, Grüne, SSW, CDU, CSU, AfD → all matched by colour.
- FDP has no seats in 2025, so the 2025 diagram does not seat it; in 2021 it would have fallen to the far right → placed where the most recent earlier diagram seated it (2021: between SSW and CDU).
- The diagram is found by trying the SVGs in the Results section and infobox and keeping the one whose seats are within 10% of the infobox's chamber size. A diagram drawn by another tool (not one `<g>` per party) would not be read; the order then falls back to the results table's.

# General tool (visual route, Bilbao)

On *Bilbao* (snapshot via `snapshot.py --title Bilbao`), with *San Sebastián*
for the Compare operator. Rules: `pick/toItems.ts` (tables, items),
`general/form-rules.json` (forms), `general/suggest.ts` (suggestions).

## Dates misread or missed

- The date rule only knew years 1800–2039 (fine for a modern biography) → no date in Bilbao's medieval history ("15 June 1300", "1323", "1376") → widened to 1000–2039. A number like "1500 inhabitants" with no comma would now read as a year; none found in this snapshot.
- "the very end of the thirteenth century", "the fourteenth century", "around the 11th century", "the 3rd or 2nd century BC", "6,000 years old" → not picked (centuries and ages in words) → a span of years each.
- Sub-subsections (h4: "Napoleonic invasion and Carlist wars" under "Contemporary Bilbao") were not mapped to their top section, so their dates were counted under whichever h2 came last → fixed: every heading is mapped to its h2 from the article's own nesting.

## Places without coordinates, or the wrong ones

- 681 linked titles, 653 resolved to Wikidata, 372 with a coordinate (30 regions, left out). Organisations with a headquarters coordinate (Athletic Bilbao, BBVA, Iberdrola) are offered as places, as on the Gehry article.
- Flight destinations ("Frankfurt", "Paris", "Munich", in Transport) are real places but not the city's → they made "Transport" the busiest section for the map suggestion and the map spanned Europe → the suggestion now counts only places within about 50 km of the median of the article's places.

- Places in comparisons: "Cityscape" links *Michigan Avenue Bridge* (Chicago) and *Santiago de Compostela* in sentences about Bilbao's own bridges and churches → both are offered as places and, picked with the rest, stretch the map to another continent → a place the sentence compares Bilbao with, not a place in Bilbao.

## Tables whose columns were misclassified

- The population table is not a `wikitable` but a `table-pale` box (Template:Historical populations) → not lit at first → data tables now include it.
- Climate cells carry °F in brackets ("25.1(77.2)") → the election parser's number rule rejected every temperature and precipitation row (only 5 of 13 rows read) → the first number in the cell is the value.
- "Percentage possible sunshine" has no unit in its label (the % is implied) → read without a unit.
- "Pop." → the measure's name came out as "Pop" → a small table of header abbreviations expands it to "Population".
- The districts table has three number columns (Population (2009), Area, Density) → all three were read as one quantity, mixing measures in one chart → a long table keeps one quantity column; the editor can switch which.
- The districts table's caption cell is "#" (its first header) → the suggestion was named "#, from the # table" → a caption without letters falls back to the section ("Districts").
- "Evolution of the Basque-speaking population" (years as columns, groups as rows) → rows of small columns by year; correct in shape, but the row labels are whole sentences ("Bilinguals: Able to understand and speak both Basque and Spanish").

## Units that could not be parsed

- "Area (km 2)" (superscript split by a space) → no unit; the column is ignored by default anyway.
- Units are read from a fixed list (°C, °F, mm, cm, %, hours, days, km²); anything else (inhabitants per km², euros) comes through without a unit.

## Suggestions that were wrong

- Timeline: "from 29 dated sentences in “Notable people”" → a list of people with birth years won over History (whose dates were missed, above) → the timeline suggestion now counts prose sentences only (not list items): "from 30 dated sentences in “History”".
- Map: "from 42 places in “Transport”" (airports and destinations abroad) → "from 26 places in “History”" with the distance rule.
- Every data table becomes a suggestion (seven in all); "Foreign population by country of birth" and "Districts" are valid bar charts but not what a reader of a city article would ask for first. No ranking yet.

## Images

- Inline thumbnails are 250px; drawn across the column an annotated image was blurry → every use of a file takes the largest copy the snapshot has, and the figure is never drawn at more than twice its resolution.
