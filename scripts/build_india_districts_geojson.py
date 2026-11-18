"""
Build the district boundaries for the admin Live Map (state -> district view):
  frontend/public/geo/districts/<state-slug>.json   one simplified FeatureCollection per state
  frontend/public/geo/district-index.json           per state: file, and for every district its display name,
                                                     the name keys that match it, and its label point

Data, as in the Ajrasakha AnalyticsMap (lib/geoJson.ts -> fetchDistricts):
  base   : geohacker/india district/india_district.geojson (GADM-derived, MIT licence, ~2011 districts)
           https://raw.githubusercontent.com/geohacker/india/master/district/india_district.geojson
  patches: Ajrasakha frontend/src/geojson/District.json (5 newer districts, drawn above their old parent)
Ajrasakha's state fixes are applied (old Telangana districts moved to Telangana, Kargil/Leh to Ladakh); Mahbubnagar,
missing from Ajrasakha's Telangana list, is also moved to Telangana. Ajrasakha's district renames are kept as extra
match keys.

District names are matched to frontend/data/india-states-districts.ts by exact normalised name (lowercase, letters
and digits only), plus the hand-checked spelling list scripts/india_district_aliases.json. No fuzzy matching.
Candidates whose district matches nothing are shown by the map under "District not on map".

Usage (no network access; inputs are local files):
  python scripts/build_india_districts_geojson.py <india_district.geojson> <ajrasakha District.json>
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_india_states_geojson import (  # noqa: E402  (shared pure-Python geometry helpers)
    DNHDD, DNHDD_PARTS, BASE_RENAMES, anveshan_state_names, bbox, label_point, polygons_of,
    simplify_polygons,
)

TOLERANCE = 0.0025       # degrees (~280 m)
MIN_POLYGON_AREA = 1e-5  # square degrees; smaller islands dropped, the largest part is always kept

# Ajrasakha lib/rename.ts and lib/geoJson.ts
AJRASAKHA_DISTRICT_RENAMES = {
    "Baramula": "Baramulla", "Ladakh (Leh)": "Leh", "Naini Tal": "Nainital", "Dehra Dun": "Dehradun",
    "Belgaum": "Belagavi", "Mysore": "Mysuru", "Tumkur": "Tumakuru", "Bagalkot": "Bagalkote",
    "Chikmagalur": "Chikkamagaluru", "Chamrajnagar": "Chamarajanagara", "Vishakhapatnam": "Visakhapatnam",
    "Anantapur": "Ananthapuramu", "Tiruchchirappalli": "Tiruchirappalli", "Villupuram": "Viluppuram",
    "Aurangabad": "Chhatrapati Sambhajinagar", "Gondiya": "Gondia", "Keonjhar": "Kendujhar",
    "Chittaurgarh": "Chittorgarh", "Kanpur": "Kanpur Nagar", "Nawan Shehar": "Nawanshahr",
}
TELANGANA_DISTRICTS = {  # Ajrasakha's list + Mahbubnagar
    "Adilabad", "Hyderabad", "Karimnagar", "Khammam", "Medak", "Nalgonda", "Nizamabad", "Rangareddi", "Warangal",
    "Mahbubnagar",
}
LADAKH_DISTRICTS = {"Kargil", "Leh", "Ladakh (Leh)"}
# Boundaries drawn without a label: the source name is not a district of this state (see aliases "excluded")
NO_LABEL = {(DNHDD, "Junagadh")}


def district_key(name):
    """Must match districtKey() in frontend/lib/live-map.ts."""
    return re.sub(r"[^a-z0-9]", "", name.lower().replace("&", " and "))


def state_slug(state):
    return re.sub(r"[^a-z0-9]+", "-", state.lower()).strip("-")


def canonical_state(name1, name2):
    if name2 in TELANGANA_DISTRICTS:
        return "Telangana"
    if name2 in LADAKH_DISTRICTS:
        return "Ladakh"
    if name1 in DNHDD_PARTS:
        return DNHDD
    return BASE_RENAMES.get(name1, name1)


def main(base_path, patch_path):
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_dir = os.path.join(repo_root, "frontend", "public", "geo")
    known_states = anveshan_state_names(repo_root)

    src = open(os.path.join(repo_root, "frontend", "data", "india-states-districts.ts"), encoding="utf-8").read()
    anveshan = {m.group(1): [d for d in re.findall(r'"([^"]+)"', m.group(2)) if d != "Others"]
                for m in re.finditer(r'^  "([^"]+)": \[(.*?)\]', src, re.M | re.S)}
    alias_table = json.load(open(os.path.join(repo_root, "scripts", "india_district_aliases.json"),
                                 encoding="utf-8"))["aliases"]

    base = json.load(open(base_path, encoding="utf-8"))["features"]
    patches = [f for group in json.load(open(patch_path, encoding="utf-8")).values() for f in group]

    by_state = {}  # state -> list of {"raw", "polys", "patch"}
    for features, is_patch in ((base, False), (patches, True)):
        for f in features:
            p = f["properties"]
            state = canonical_state(p.get("NAME_1") or "", p.get("NAME_2") or "")
            if state not in known_states:
                sys.exit(f"Unknown state {state!r} for district {p.get('NAME_2')!r}")
            by_state.setdefault(state, []).append(
                {"raw": p["NAME_2"], "polys": polygons_of(f["geometry"]), "patch": is_patch})

    # Validate the alias table: source in the onboarding list, target present in that state's boundaries
    for state, table in alias_table.items():
        raws = {d["raw"] for d in by_state.get(state, [])}
        for source, target in table.items():
            if source not in anveshan.get(state, []):
                sys.exit(f"Alias source {source!r} is not in the {state} district list")
            if target not in raws:
                sys.exit(f"Alias target {target!r} has no boundary in {state}")

    os.makedirs(os.path.join(out_dir, "districts"), exist_ok=True)
    index, report = {}, []
    totals = {"listed": 0, "exact": 0, "alias": 0}
    for state in sorted(by_state):
        items = sorted(by_state[state], key=lambda d: d["patch"])  # patches last: drawn above their old parent
        listed = anveshan.get(state, [])
        listed_by_key = {}
        for name in listed:
            listed_by_key.setdefault(district_key(name), name)
        aliases_by_target = {}
        for source, target in alias_table.get(state, {}).items():
            aliases_by_target.setdefault(target, []).append(source)

        for d in items:
            d["polys"] = simplify_polygons(d["polys"], TOLERANCE, MIN_POLYGON_AREA)
        features, entries, key_owner = [], [], {}
        matched_exact, matched_alias = set(), set()
        for i, d in enumerate(items):
            raw = d["raw"]
            renamed = AJRASAKHA_DISTRICT_RENAMES.get(raw)
            source_keys = {district_key(raw)} | ({district_key(renamed)} if renamed else set())
            exact = [listed_by_key[k] for k in source_keys if k in listed_by_key]
            aliases = aliases_by_target.get(raw, [])
            display = exact[0] if exact else (aliases[0] if aliases else re.sub(r"\s*\(.*?\)", "", renamed or raw))
            matched_exact.update(exact)
            matched_alias.update(a for a in aliases if a not in exact)
            keys = sorted(source_keys | {district_key(display)} | {district_key(a) for a in aliases})
            for k in keys:
                if key_owner.get(k, i) != i:
                    sys.exit(f"Name key {k!r} matches two boundaries in {state}")
                key_owner[k] = i

            occluders = [p for later in items[i + 1:] if later["patch"]
                         for p in later["polys"] if _boxes_overlap(bbox(later["polys"]), bbox(d["polys"]))]
            label = None if (state, raw) in NO_LABEL else label_point(d["polys"], occluders)
            polys = d["polys"]
            geom = {"type": "Polygon", "coordinates": polys[0]} if len(polys) == 1 else {
                "type": "MultiPolygon", "coordinates": polys}
            props = {"name": display}
            if label:
                props["label"] = list(label)
            features.append({"type": "Feature", "properties": props, "geometry": geom})
            entries.append({"name": display, "keys": keys, **({"label": list(label)} if label else {})})

        rel = f"districts/{state_slug(state)}.json"
        with open(os.path.join(out_dir, rel), "w", encoding="utf-8", newline="\n") as f:
            json.dump({"type": "FeatureCollection", "features": features}, f, separators=(",", ":"))
            f.write("\n")
        index[state] = {"file": rel, "districts": entries}

        n_exact = len([n for n in listed if n in matched_exact])
        n_alias = len([n for n in listed if n in matched_alias and n not in matched_exact])
        totals["listed"] += len(listed); totals["exact"] += n_exact; totals["alias"] += n_alias
        report.append((state, len(listed), n_exact, n_alias, len(items),
                       os.path.getsize(os.path.join(out_dir, rel))))

    missing_states = sorted(set(anveshan) - set(by_state))
    if missing_states:
        sys.exit(f"No district boundaries for listed states: {missing_states}")

    with open(os.path.join(out_dir, "district-index.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump({
            "metadata": {
                "description": "District names, match keys and label points for the Anveshan admin Live Map.",
                "sources": [
                    "geohacker/india district/india_district.geojson (GADM-derived), MIT licence, (c) 2014 Sajjad Anwar",
                    "Ajrasakha frontend/src/geojson/District.json patches",
                    "scripts/india_district_aliases.json (hand-checked spelling list)",
                ],
                "generated_by": "scripts/build_india_districts_geojson.py",
            },
            "states": index,
        }, f, separators=(",", ":"))
        f.write("\n")

    print(f"{'state':42} listed exact alias  on-map  boundaries   bytes")
    for state, listed, ex, al, nb, size in report:
        print(f"{state:42} {listed:6} {ex:5} {al:5} {ex + al:7} {nb:11} {size:7}")
    on_map = totals["exact"] + totals["alias"]
    print(f"TOTAL listed={totals['listed']} exact={totals['exact']} alias={totals['alias']} "
          f"on map={on_map} ({100 * on_map / totals['listed']:.1f}%) not on map={totals['listed'] - on_map}")
    print(f"index size={os.path.getsize(os.path.join(out_dir, 'district-index.json'))} bytes")


def _boxes_overlap(a, b):
    return not (a[2] < b[0] or b[2] < a[0] or a[3] < b[1] or b[3] < a[1])


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
