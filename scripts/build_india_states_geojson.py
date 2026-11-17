"""
Build frontend/public/geo/india-states.json: simplified India state / union territory boundaries for the admin Live Map.

Follows the Ajrasakha AnalyticsMap approach (lib/geoJson.ts -> fetchStates):
  base   : geohacker/india  state/india_state.geojson  (GADM-derived, MIT licence)
           https://raw.githubusercontent.com/geohacker/india/master/state/india_state.geojson
  patches: Ajrasakha frontend/src/geojson/State.json  ->  "Jammu And Kashmir", "Ladakh", "Telangana"
Then, as Ajrasakha does: Orissa -> Odisha, Uttaranchal -> Uttarakhand, J&K geometry replaced by the patch,
Ladakh and Telangana added. Additionally (Anveshan):
  - "Andaman and Nicobar" -> "Andaman and Nicobar Islands"
  - "Dadra and Nagar Haveli" + "Daman and Diu" merged into "Dadra and Nagar Haveli and Daman and Diu" (2020 merger)
  - names match the Anveshan state list / STATE_CENTROIDS exactly (the build fails otherwise)
  - Telangana is written last so it draws above Andhra Pradesh, whose base geometry still includes it
    (same overlap as Ajrasakha; no polygon clipping library is used)
  - geometry simplified (Douglas-Peucker) and coordinates rounded so the file is small enough to load in a browser

Usage (no network access; both inputs are local files):
  python scripts/build_india_states_geojson.py <india_state.geojson> <ajrasakha State.json> [out.json]
"""
import json
import math
import os
import re
import sys

TOLERANCE = 0.006          # degrees (~650 m) for Douglas-Peucker
MIN_POLYGON_AREA = 2e-5    # square degrees (~0.25 km^2); smaller islands are dropped, the largest part is always kept
DECIMALS = 3               # ~110 m

BASE_RENAMES = {
    "Orissa": "Odisha",
    "Uttaranchal": "Uttarakhand",
    "Andaman and Nicobar": "Andaman and Nicobar Islands",
}
DNHDD = "Dadra and Nagar Haveli and Daman and Diu"
DNHDD_PARTS = {"Dadra and Nagar Haveli", "Daman and Diu"}
BASE_REPLACED = {"Jammu and Kashmir"}  # pre-2019 state including Ladakh; replaced by the patches
PATCHES = {"Jammu And Kashmir": "Jammu and Kashmir", "Ladakh": "Ladakh", "Telangana": "Telangana"}
UNION_TERRITORIES = {
    "Andaman and Nicobar Islands", "Chandigarh", DNHDD, "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep",
    "Puducherry",
}
DRAW_LAST = ["Telangana"]  # drawn above Andhra Pradesh


# ── geometry helpers (pure Python) ───────────────────────────────────────────

def _perp_dist(p, a, b):
    (x, y), (x1, y1), (x2, y2) = p, a, b
    dx, dy = x2 - x1, y2 - y1
    if dx == 0 and dy == 0:
        return math.hypot(x - x1, y - y1)
    t = max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
    return math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))


def douglas_peucker(points, tol):
    if len(points) < 3:
        return points[:]
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        s, e = stack.pop()
        best, idx = 0.0, -1
        for i in range(s + 1, e):
            d = _perp_dist(points[i], points[s], points[e])
            if d > best:
                best, idx = d, i
        if idx != -1 and best > tol:
            keep[idx] = True
            stack.extend([(s, idx), (idx, e)])
    return [p for p, k in zip(points, keep) if k]


def ring_area(ring):
    return abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(ring, ring[1:]))) / 2


def simplify_ring(ring, tolerance=TOLERANCE):
    ring = [(float(x), float(y)) for x, y, *_ in ring]
    if ring[0] != ring[-1]:
        ring.append(ring[0])
    xs, ys = [p[0] for p in ring], [p[1] for p in ring]
    extent = max(max(xs) - min(xs), max(ys) - min(ys))
    tol = min(tolerance, extent / 12)  # small islands keep their shape
    out = douglas_peucker(ring, tol)
    out = [(round(x, DECIMALS), round(y, DECIMALS)) for x, y in out]
    dedup = [out[0]] + [p for prev, p in zip(out, out[1:]) if p != prev]
    if dedup[0] != dedup[-1]:
        dedup.append(dedup[0])
    return dedup if len(dedup) >= 4 else None


def polygons_of(geom):
    if geom["type"] == "Polygon":
        return [geom["coordinates"]]
    if geom["type"] == "MultiPolygon":
        return geom["coordinates"]
    raise ValueError(f"unsupported geometry {geom['type']}")


def simplify_polygons(polys, tolerance=TOLERANCE, min_area=MIN_POLYGON_AREA):
    result = []
    for poly in polys:
        outer = simplify_ring(poly[0], tolerance)
        if not outer:
            continue
        holes = [h for h in (simplify_ring(r, tolerance) for r in poly[1:]) if h and ring_area(h) >= min_area]
        result.append([outer] + holes)
    if not result:
        return result
    largest = max(result, key=lambda p: ring_area(p[0]))
    return [p for p in result if p is largest or ring_area(p[0]) >= min_area]


def label_point(polys, occluders=()):
    """
    A point well inside the feature's largest part, for its label and marker: the sampled point farthest from any
    edge (an approximate "pole of inaccessibility"). Points covered by `occluders` (shapes drawn above this one, e.g.
    Telangana over Andhra Pradesh) are skipped, so the point lies in the visible part. Returns (lat, lng) or None.
    """
    target = max(polys, key=lambda p: ring_area(p[0]))
    occluders = list(occluders)
    edges = [(a, b) for ring in target for a, b in zip(ring, ring[1:])]
    edges += [(a, b) for p in occluders for ring in p for a, b in zip(ring, ring[1:])]

    def usable(x, y):
        return point_in_polys(x, y, [target]) and not (occluders and point_in_polys(x, y, occluders))

    def clearance(x, y):
        return min(_perp_dist((x, y), a, b) for a, b in edges)

    x0, y0, x1, y1 = bbox([target])
    best = None
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    w, h = x1 - x0, y1 - y0
    for _ in range(3):  # coarse grid, then two refinements around the best point
        n = 14
        for i in range(n + 1):
            for j in range(n + 1):
                x, y = cx - w / 2 + w * i / n, cy - h / 2 + h * j / n
                if usable(x, y):
                    d = clearance(x, y)
                    if best is None or d > best[0]:
                        best = (d, x, y)
        if best is None:
            break
        cx, cy, w, h = best[1], best[2], w / 3, h / 3
    return (round(best[2], 4), round(best[1], 4)) if best else None


def point_in_ring(x, y, ring):
    inside = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def point_in_polys(x, y, polys):
    return any(point_in_ring(x, y, p[0]) and not any(point_in_ring(x, y, h) for h in p[1:]) for p in polys)


def bbox(polys):
    pts = [pt for p in polys for pt in p[0]]
    return [min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts)]


def overlap_km2(a, b, step=0.02):
    """Grid-sampled overlap area between two polygon sets (for the build report)."""
    ax0, ay0, ax1, ay1 = bbox(a)
    bx0, by0, bx1, by1 = bbox(b)
    x0, y0, x1, y1 = max(ax0, bx0), max(ay0, by0), min(ax1, bx1), min(ay1, by1)
    if x0 >= x1 or y0 >= y1:
        return 0.0
    hits, y = 0, y0
    while y < y1:
        x = x0
        while x < x1:
            if point_in_polys(x, y, a) and point_in_polys(x, y, b):
                hits += 1
            x += step
        y += step
    cell = (step * 111.32) * (step * 111.32 * math.cos(math.radians((y0 + y1) / 2)))
    return hits * cell


# ── build ─────────────────────────────────────────────────────────────────────

def anveshan_state_names(repo_root):
    src = open(os.path.join(repo_root, "frontend", "lib", "live-map.ts"), encoding="utf-8").read()
    block = src.split("export const STATE_CENTROIDS", 1)[1].split("};", 1)[0]
    return set(re.findall(r'^\s*"?([A-Za-z][A-Za-z .]*?)"?\s*:\s*\[', block, re.M))


def main(base_path, patch_path, out_path):
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    base = json.load(open(base_path, encoding="utf-8"))
    patches = json.load(open(patch_path, encoding="utf-8"))

    raw = {}  # canonical name -> list of polygons
    for feat in base["features"]:
        name = feat["properties"]["NAME_1"]
        if name in BASE_REPLACED:
            continue
        name = DNHDD if name in DNHDD_PARTS else BASE_RENAMES.get(name, name)
        raw.setdefault(name, []).extend(polygons_of(feat["geometry"]))
    for patch_name, canonical in PATCHES.items():
        raw[canonical] = polygons_of(patches[patch_name]["geometry"])

    expected = anveshan_state_names(repo_root)
    missing, extra = expected - set(raw), set(raw) - expected
    if missing or extra:
        sys.exit(f"Name mismatch with Anveshan STATE_CENTROIDS. missing={sorted(missing)} extra={sorted(extra)}")

    order = sorted(n for n in raw if n not in DRAW_LAST) + DRAW_LAST
    features, report = [], []
    in_points = out_points = 0
    simplified = {}
    for name in order:
        polys = simplify_polygons(raw[name])
        simplified[name] = polys
        in_points += sum(len(r) for p in raw[name] for r in p)
        out_points += sum(len(r) for p in polys for r in p)
        geom = {"type": "Polygon", "coordinates": polys[0]} if len(polys) == 1 else {
            "type": "MultiPolygon", "coordinates": polys}
        kind = "Union Territory" if name in UNION_TERRITORIES else "State"
        # Telangana is drawn above Andhra Pradesh, so AP's label point must avoid it
        occluders = simplify_polygons(raw["Telangana"]) if name == "Andhra Pradesh" else ()
        label = label_point(polys, occluders)
        props = {"name": name, "type": kind}
        if label:
            props["label"] = list(label)
        features.append({"type": "Feature", "properties": props, "geometry": geom})
        report.append(f"  {name:42} {kind:16} parts={len(polys):3} pts={sum(len(r) for p in polys for r in p)}")

    collection = {
        "type": "FeatureCollection",
        "metadata": {
            "description": "India state and union territory boundaries for the Anveshan admin Live Map (display only).",
            "sources": [
                "geohacker/india state/india_state.geojson (GADM-derived), MIT licence, (c) 2014 Sajjad Anwar",
                "Ajrasakha frontend/src/geojson/State.json patches: Jammu And Kashmir, Ladakh, Telangana",
            ],
            "changes": "Renamed Orissa/Uttaranchal/Andaman and Nicobar; merged Dadra and Nagar Haveli + Daman and Diu; "
                       "J&K replaced and Ladakh/Telangana added from the Ajrasakha patches; Telangana drawn after "
                       f"Andhra Pradesh; Douglas-Peucker {TOLERANCE} deg, islands < {MIN_POLYGON_AREA} sq deg dropped, "
                       f"coordinates rounded to {DECIMALS} decimals. Generated by scripts/build_india_states_geojson.py.",
        },
        "features": features,
    }
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(collection, f, separators=(",", ":"))
        f.write("\n")

    print("\n".join(report))
    print(f"features={len(features)}  points {in_points} -> {out_points}  size={os.path.getsize(out_path)} bytes")
    print(f"overlap Jammu and Kashmir / Ladakh   ~{overlap_km2(simplified['Jammu and Kashmir'], simplified['Ladakh']):.0f} km2")
    print(f"overlap Andhra Pradesh / Telangana   ~{overlap_km2(simplified['Andhra Pradesh'], simplified['Telangana']):.0f} km2"
          " (expected: base AP still includes Telangana; Telangana is drawn on top)")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    default_out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                               "frontend", "public", "geo", "india-states.json")
    main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else default_out)
