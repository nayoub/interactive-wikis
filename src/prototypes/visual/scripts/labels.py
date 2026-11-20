#!/usr/bin/env python3
"""Snapshot other-language labels for the things an article links (run once, commit the output).

For every Wikidata item in public/snapshots/<slug>.places.json, fetch its label
in each language asked for (Basque and French by default) from the Wikidata
API. Items without a label in a language are left out for that language; the
English label is used then.

Writes public/snapshots/<slug>.labels.json:
    {"languages": [{"value": "eu", "label": "Euskara"}, …], "labels": {"Q…": {"eu": "…", "fr": "…"}}}

Run from the repo root:
    python3 src/prototypes/visual/scripts/labels.py --slug bilbao
"""
import argparse
import json
import time
import urllib.parse
import urllib.request

UA = open("src/api-user-agent.txt").read().strip()
NAMES = {"eu": "Euskara", "fr": "Français", "es": "Español", "de": "Deutsch"}


def get(url: str) -> dict:
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception:
            time.sleep(1 + attempt * 2)
    raise RuntimeError(f"failed: {url}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--slug", required=True)
    ap.add_argument("--languages", default="eu,fr")
    a = ap.parse_args()
    langs = a.languages.split(",")
    places = json.load(open(f"public/snapshots/{a.slug}.places.json", encoding="utf-8"))["places"]
    qids = sorted({p["wikidataId"] for p in places.values() if p.get("wikidataId")})
    labels: dict[str, dict[str, str]] = {}
    for i in range(0, len(qids), 50):
        batch = qids[i : i + 50]
        q = urllib.parse.urlencode(
            {"action": "wbgetentities", "ids": "|".join(batch), "props": "labels", "languages": "|".join(langs), "format": "json"}
        )
        data = get(f"https://www.wikidata.org/w/api.php?{q}")
        for qid, ent in data.get("entities", {}).items():
            got = {l: ent["labels"][l]["value"] for l in langs if l in ent.get("labels", {})}
            if got:
                labels[qid] = got
        time.sleep(0.2)
    out = f"public/snapshots/{a.slug}.labels.json"
    doc = {
        "source": "Wikidata labels, via the Wikidata API; built by src/prototypes/visual/scripts/labels.py",
        "languages": [{"value": l, "label": NAMES.get(l, l)} for l in langs],
        "labels": labels,
    }
    json.dump(doc, open(out, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    for l in langs:
        print(f"{l}: {sum(1 for v in labels.values() if l in v)} of {len(qids)} items")
    print(f"→ {out}")


if __name__ == "__main__":
    main()
