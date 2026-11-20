#!/usr/bin/env python3
"""Build the places snapshot for the map prototype (run once, commit the output).

For every wiki link in public/snapshots/frank-gehry.html: resolve the target
(following redirects) to its Wikidata item, keep items with a coordinate
(P625), and record label, country (P17), opening (P1619) or inception (P571)
year, and a coarse kind from instance-of (P31). No language model: a lookup.

Writes public/snapshots/frank-gehry.places.json keyed by the link's page title
as it appears in the article HTML (`./Title` → "Title").

Run from the repo root:
    python3 src/prototypes/map-module/scripts/places.py
"""
import html
import json
import re
import time
import urllib.parse
import urllib.request

SNAPSHOT = "public/snapshots/frank-gehry.html"
OUT = "public/snapshots/frank-gehry.places.json"
UA = open("src/api-user-agent.txt").read().strip()

# P31 classes → kind. Countries and first-level regions have a coordinate too,
# but a country is not a point: they are kept with kind "region" and the
# prototype does not offer them as places (see notes/rule-failures.md).
SETTLEMENT = {
    "Q515", "Q1549591", "Q486972", "Q5119", "Q1637706", "Q200250", "Q1093829",
    "Q3957", "Q532", "Q15284", "Q7930989", "Q62049", "Q747074", "Q1840161",
    "Q15127012", "Q2264924", "Q123705", "Q188509", "Q2989398", "Q1907114",
}
REGION = {
    "Q6256", "Q3624078", "Q35657", "Q107390", "Q10864048", "Q1221156",
    "Q3336843", "Q15304003", "Q11828004", "Q5852411", "Q22865", "Q1250464",
    "Q13220204", "Q82794", "Q1620908", "Q7275", "Q512187", "Q1048835",
}


def get(url: str) -> dict:
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception:
            time.sleep(1 + attempt * 2)
    raise RuntimeError(f"failed: {url}")


def chunks(xs, n):
    for i in range(0, len(xs), n):
        yield xs[i : i + n]


def year_of(claims: dict, prop: str):
    for c in claims.get(prop, []):
        v = c.get("mainsnak", {}).get("datavalue", {}).get("value", {})
        t = v.get("time") if isinstance(v, dict) else None
        if t:
            m = re.match(r"^[+-](\d{4})", t)
            if m:
                return int(m.group(1))
    return None


def ids_of(claims: dict, prop: str):
    out = []
    for c in claims.get(prop, []):
        v = c.get("mainsnak", {}).get("datavalue", {}).get("value", {})
        if isinstance(v, dict) and v.get("id"):
            out.append(v["id"])
    return out


def main() -> None:
    raw = open(SNAPSHOT, encoding="utf-8").read()
    titles = sorted(
        {
            urllib.parse.unquote(html.unescape(t))
            for t in re.findall(r'<a[^>]*rel="mw:WikiLink"[^>]*href="\./([^"#?]+)', raw)
        }
    )
    print(f"{len(titles)} linked titles")

    # 1. Title → Wikidata item (following redirects).
    qid_of: dict[str, str] = {}
    for batch in chunks(titles, 50):
        q = urllib.parse.urlencode(
            {
                "action": "query",
                "format": "json",
                "formatversion": "2",
                "redirects": "1",
                "prop": "pageprops",
                "ppprop": "wikibase_item",
                "titles": "|".join(t.replace("_", " ") for t in batch),
            }
        )
        data = get(f"https://en.wikipedia.org/w/api.php?{q}")["query"]
        back = {}
        for n in data.get("normalized", []):
            back[n["to"]] = back.get(n["from"], n["from"])
        for r in data.get("redirects", []):
            back[r["to"]] = back.get(r["from"], r["from"])
        for p in data.get("pages", []):
            qid = p.get("pageprops", {}).get("wikibase_item")
            if not qid:
                continue
            original = back.get(p["title"], p["title"])
            # follow chains (normalized → redirect)
            while original in back and back[original] != original:
                original = back[original]
            qid_of[original.replace(" ", "_")] = qid
        time.sleep(0.2)
    print(f"{len(qid_of)} resolved to Wikidata")

    # 2. Items → coordinates, label, country, dates, kind.
    entities: dict[str, dict] = {}
    for batch in chunks(sorted(set(qid_of.values())), 50):
        q = urllib.parse.urlencode(
            {
                "action": "wbgetentities",
                "format": "json",
                "ids": "|".join(batch),
                "props": "labels|claims",
                "languages": "en",
            }
        )
        entities.update(get(f"https://www.wikidata.org/w/api.php?{q}")["entities"])
        time.sleep(0.2)

    with_coords = {}
    countries = set()
    for qid, e in entities.items():
        claims = e.get("claims", {})
        coord = None
        for c in claims.get("P625", []):
            v = c.get("mainsnak", {}).get("datavalue", {}).get("value")
            if isinstance(v, dict) and "latitude" in v:
                coord = {"lat": round(v["latitude"], 5), "lon": round(v["longitude"], 5)}
                break
        if not coord:
            continue
        p31 = set(ids_of(claims, "P31"))
        kind = "region" if p31 & REGION else "settlement" if p31 & SETTLEMENT else "site"
        country = (ids_of(claims, "P17") or [None])[0]
        if country:
            countries.add(country)
        with_coords[qid] = {
            "wikidataId": qid,
            "name": e.get("labels", {}).get("en", {}).get("value", qid),
            "coordinates": coord,
            "countryId": country,
            "opened": year_of(claims, "P1619"),
            "inception": year_of(claims, "P571"),
            "kind": kind,
        }

    # 3. Country labels.
    names = {}
    for batch in chunks(sorted(countries), 50):
        q = urllib.parse.urlencode(
            {"action": "wbgetentities", "format": "json", "ids": "|".join(batch), "props": "labels", "languages": "en"}
        )
        for qid, e in get(f"https://www.wikidata.org/w/api.php?{q}")["entities"].items():
            names[qid] = e.get("labels", {}).get("en", {}).get("value", qid)
        time.sleep(0.2)

    places = {}
    for title, qid in sorted(qid_of.items()):
        p = with_coords.get(qid)
        if not p:
            continue
        places[title] = {**p, "country": names.get(p.pop("countryId") if False else p["countryId"], None)}
    for p in places.values():
        p.pop("countryId", None)

    out = {
        "source": "Wikidata, via enwiki page props; built by src/prototypes/map-module/scripts/places.py",
        "built": time.strftime("%Y-%m-%d"),
        "places": places,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    kinds = {}
    for p in places.values():
        kinds[p["kind"]] = kinds.get(p["kind"], 0) + 1
    print(f"{len(places)} titles with coordinates → {OUT}  {kinds}")


if __name__ == "__main__":
    main()
