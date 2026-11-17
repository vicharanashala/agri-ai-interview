"use client";

// Live Map: where candidates in live interview sessions registered from, by state and then by district.
// Leaflet touches `window` on import, so LiveTab loads this file with next/dynamic and ssr: false.
// All data comes from the `interviews` prop (the Live tab's existing 5-second poll); this component does not poll.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import styles from "./LiveInterviewMap.module.css";
import { INDIA_STATES_DISTRICTS } from "../../data/india-states-districts";
import {
  STATE_CENTROIDS,
  STATE_NOT_PROVIDED,
  candidateProfileHref,
  districtKey,
  districtOptions,
  groupLiveForMap,
  panelData,
  spotsOf,
  type DistrictIndex,
  type LiveMapCandidate,
  type LiveMapInterview,
} from "../../lib/live-map";

interface LiveInterviewMapProps {
  interviews: LiveMapInterview[];
  /** Opens this interview in the Live Chats view. */
  onOpenChat: (interviewId: string) => void;
}

// Used until the boundaries load (then the map fits the India boundary)
const INDIA_CENTER: L.LatLngExpression = [22.5, 80];
const INDIA_ZOOM = 4.5;
const STATE_MAX_ZOOM = 9;

// Boundaries, as in the Ajrasakha AnalyticsMap (geohacker/india + Ajrasakha patches), simplified by
// scripts/build_india_states_geojson.py and scripts/build_india_districts_geojson.py
const GEO_BASE = "/geo/";
const STATES_FILE = "india-states.json";
const DISTRICT_INDEX_FILE = "district-index.json";

// State labels too small to read at the India zoom; they appear on their own district view instead
const HIDDEN_STATE_LABELS = new Set([
  "Chandigarh",
  "Delhi",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Puducherry",
  "Lakshadweep",
]);

const STATE_STYLE = {
  base: { color: "#94a3b8", weight: 0.8, fillColor: "#ffffff", fillOpacity: 1 },
  selected: { color: "#475569", weight: 1.6, fillColor: "#ffffff", fillOpacity: 1 },
  other: { color: "#cbd5e1", weight: 0.6, fillColor: "#f1f5f9", fillOpacity: 1 },
} satisfies Record<string, L.PathOptions>;
const DISTRICT_STYLE: L.PathOptions = { color: "#94a3b8", weight: 0.7, fillColor: "#ffffff", fillOpacity: 1 };
const DISTRICT_SELECTED_STYLE: L.PathOptions = { color: "#15803d", weight: 2, fillColor: "#f0fdf4", fillOpacity: 1 };
const DISTRICT_MAX_ZOOM = 10;

// State filter options: every state / UT, alphabetically
const STATE_OPTIONS = Object.keys(STATE_CENTROIDS).sort((a, b) => a.localeCompare(b));

// Optional faded basemap behind the boundaries, only when a CARTO key is set at build time
// (CARTO serves "API KEY REQUIRED" images without one)
const CARTO_API_KEY = (process.env.NEXT_PUBLIC_CARTO_API_KEY || "").trim();
const CARTO_TILES = CARTO_API_KEY
  ? {
      url: `https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(CARTO_API_KEY)}`,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer">CARTO</a>',
    }
  : null;

interface BoundaryFeature {
  type: "Feature";
  properties: { name: string; label?: [number, number] };
  geometry: unknown;
}
interface BoundaryCollection {
  type: "FeatureCollection";
  features: BoundaryFeature[];
}

// Static map files, fetched once per page load and shared by every mount of the map
const fileRequests = new Map<string, Promise<unknown>>();
function loadGeoFile<T>(file: string): Promise<T> {
  let request = fileRequests.get(file);
  if (!request) {
    request = fetch(GEO_BASE + file)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .catch((err) => {
        fileRequests.delete(file); // allow a retry later
        throw err;
      });
    fileRequests.set(file, request);
  }
  return request as Promise<T>;
}

const asGeoJson = (data: BoundaryCollection) => data as unknown as Parameters<typeof L.geoJSON>[0];
const featureName = (layer: L.Layer): string =>
  ((layer as L.Polygon).feature?.properties as BoundaryFeature["properties"] | undefined)?.name ?? "";

/** A text label below a point. Text is set with textContent, never as HTML. */
function labelMarker(lat: number, lng: number, text: string, className: string): L.Marker {
  const el = document.createElement("span");
  el.className = className;
  el.textContent = text;
  return L.marker([lat, lng], {
    icon: L.divIcon({ className: styles.labelWrap, html: el, iconSize: [0, 0], iconAnchor: [0, 0] }),
    interactive: false,
    keyboard: false,
    pane: "labels",
  });
}

function dotMarker(lat: number, lng: number, title: string, selected: boolean): L.Marker {
  return L.marker([lat, lng], {
    icon: L.divIcon({
      className: styles.markerWrap,
      html: `<span class="${selected ? `${styles.dot} ${styles.dotSelected}` : styles.dot}"></span>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    }),
    title,
    alt: title,
    keyboard: true,
    riseOnHover: true,
  });
}

// Interview start in India time, always as "17 Nov 2026, 01:33 PM IST"
const START_FORMAT = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});
const formatStart = (date: Date | null) => {
  if (!date) return "Not available";
  const p = Object.fromEntries(START_FORMAT.formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute} ${String(p.dayPeriod).toUpperCase()} IST`;
};

const plural = (n: number) => `${n} live candidate${n === 1 ? "" : "s"}`;

/** Credits for the map library and data, behind a small info button so the map itself stays clean. */
function MapCredits() {
  const [open, setOpen] = useState(false);
  const ext = { target: "_blank", rel: "noopener noreferrer" } as const;
  return (
    <div className={styles.credits}>
      {open && (
        <div className={styles.creditsPanel} role="dialog" aria-label="Map credits">
          <div>
            Map library:{" "}
            <a href="https://leafletjs.com" {...ext}>
              Leaflet
            </a>
          </div>
          <div>
            Boundaries:{" "}
            <a href="https://github.com/geohacker/india" {...ext}>
              geohacker/india
            </a>
          </div>
          <div>
            Data source:{" "}
            <a href="https://gadm.org" {...ext}>
              GADM
            </a>
          </div>
          {CARTO_TILES && (
            <div>
              Basemap: ©{" "}
              <a href="https://www.openstreetmap.org/copyright" {...ext}>
                OpenStreetMap
              </a>{" "}
              contributors, ©{" "}
              <a href="https://carto.com/attributions" {...ext}>
                CARTO
              </a>
            </div>
          )}
          {/* Full copyright and licence notices (Leaflet BSD-2-Clause, geohacker/india MIT) */}
          <a className={styles.creditsLicences} href="/geo/LICENSES.txt" {...ext}>
            Licences and notices
          </a>
        </div>
      )}
      <button
        type="button"
        className={styles.creditsBtn}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Map credits"
        title="Map credits"
      >
        i
      </button>
    </div>
  );
}

/**
 * One live candidate. Two separate destinations:
 *  - the name opens the candidate's profile page (All Candidates context);
 *  - "View Interview" opens Live Chats with this candidate's live interview selected.
 */
function CandidateItem({ c, onOpenChat }: { c: LiveMapCandidate; onOpenChat: (id: string) => void }) {
  const name = c.name || "Unnamed candidate";
  return (
    <li className={styles.row}>
      <div className={styles.rowMain}>
        {c.candidateId ? (
          <Link href={candidateProfileHref(c.candidateId)} className={styles.nameLink} title={`Open ${name}'s profile`}>
            {name}
          </Link>
        ) : (
          <span className={styles.rowName}>{name}</span>
        )}
        <span className={styles.rowDetail}>{[c.state || STATE_NOT_PROVIDED, c.district].filter(Boolean).join(", ")}</span>
        <span className={styles.rowDetail}>Started {formatStart(c.startedAt)}</span>
      </div>
      <button type="button" className={styles.viewBtn} onClick={() => onOpenChat(c.interviewId)}>
        View Interview
      </button>
    </li>
  );
}

export default function LiveInterviewMap({ interviews, onOpenChat }: LiveInterviewMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const statesLayerRef = useRef<L.GeoJSON | null>(null);
  const stateLabelsRef = useRef<L.LayerGroup | null>(null);
  const districtLayerRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const indiaBoundsRef = useRef<L.LatLngBounds | null>(null);
  const selectStateRef = useRef<(name: string) => void>(() => {});
  const selectedStateRef = useRef<string | null>(null);
  // District shapes of the selected state, by district name in the boundary data
  const districtShapesRef = useRef<Map<string, L.Polygon>>(new Map());

  const [statesReady, setStatesReady] = useState<"loading" | "ready" | "failed">("loading");
  const [stateLabels, setStateLabels] = useState<Record<string, [number, number]>>({});
  const [districtIndex, setDistrictIndex] = useState<DistrictIndex | null>(null);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedSpot, setSelectedSpot] = useState<string | null>(null);
  // District filter (a registered district name); null = All Districts
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const [districtShapesVersion, setDistrictShapesVersion] = useState(0);
  const [districtsFailed, setDistrictsFailed] = useState(false);
  const [tilesFailed, setTilesFailed] = useState(false);

  // stateLabels: each state's representative point, also the position for districts without their own boundary
  const view = useMemo(
    () => groupLiveForMap(interviews, districtIndex, stateLabels),
    [interviews, districtIndex, stateLabels],
  );
  const selectedStateView = view.states.find((s) => s.state === selectedState) ?? null;
  const spots = useMemo(() => spotsOf(selectedStateView?.districts ?? []), [selectedStateView]);
  // A card closes by itself once the last live interview at its position ends
  const openSpot = spots.find((s) => s.id === selectedSpot) ?? null;
  const openSpotCount = openSpot ? openSpot.districts.reduce((n, d) => n + d.candidates.length, 0) : 0;

  // Live Candidates panel: same live data, filtered by the State / District filters
  const panel = useMemo(() => panelData(view, selectedState, selectedDistrict), [view, selectedState, selectedDistrict]);
  const districtChoices = useMemo(
    () => (selectedState ? districtOptions(INDIA_STATES_DISTRICTS[selectedState] ?? [], selectedStateView?.candidates ?? []) : []),
    [selectedState, selectedStateView],
  );

  const flyToState = (name: string) => {
    const map = mapRef.current;
    const shape = statesLayerRef.current?.getLayers().find((l) => featureName(l) === name) as L.Polygon | undefined;
    if (map && shape) map.flyToBounds(shape.getBounds(), { padding: [24, 24], maxZoom: STATE_MAX_ZOOM, duration: 0.7 });
  };

  // The state filter and the map's selected state are the same thing; changing state resets the district filter
  const selectState = useCallback((name: string) => {
    // Clicks inside the open state reach its shape (district shapes take no clicks); keep the current view
    if (name === selectedStateRef.current) return;
    selectedStateRef.current = name;
    setSelectedState(name);
    setSelectedDistrict(null);
    setSelectedSpot(null);
    flyToState(name);
  }, []);
  selectStateRef.current = selectState;

  const showIndia = useCallback(() => {
    selectedStateRef.current = null;
    setSelectedState(null);
    setSelectedDistrict(null);
    setSelectedSpot(null);
    const map = mapRef.current;
    if (map && indiaBoundsRef.current) map.flyToBounds(indiaBoundsRef.current, { padding: [12, 12], duration: 0.7 });
  }, []);

  /** The district's own boundary in the selected state, matched like the markers (exact name or alias). */
  const districtShape = (state: string, district: string): L.Polygon | undefined => {
    const entry = districtIndex?.[state]?.districts.find((d) => d.keys.includes(districtKey(district)));
    return entry ? districtShapesRef.current.get(entry.name) : undefined;
  };

  const selectDistrict = (district: string | null) => {
    setSelectedDistrict(district);
    setSelectedSpot(null);
    const state = selectedStateRef.current;
    if (!state) return;
    const shape = district ? districtShape(state, district) : undefined;
    const map = mapRef.current;
    // No boundary of its own (or All Districts): show the whole state
    if (map && shape) map.flyToBounds(shape.getBounds(), { padding: [40, 40], maxZoom: DISTRICT_MAX_ZOOM, duration: 0.7 });
    else flyToState(state);
  };

  // Create the map once; the parent keeps this component mounted while the Map view is open
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const map = L.map(el, {
      center: INDIA_CENTER,
      zoom: INDIA_ZOOM,
      minZoom: 3,
      maxZoom: 11,
      zoomSnap: 0.25,
      maxBounds: [
        [2, 62],
        [40, 102],
      ],
      maxBoundsViscosity: 1,
      // Keeps the dashboard page scrollable over the map; zoom with the +/- buttons
      scrollWheelZoom: false,
      // Credits live in the MapCredits panel. A CARTO/OpenStreetMap basemap must be attributed visibly on the map
      // (ODbL / CARTO terms), so the standard attribution bar is kept only when that basemap is enabled.
      attributionControl: Boolean(CARTO_TILES),
    });
    if (CARTO_TILES) map.attributionControl.setPrefix(false);
    // Labels sit above the boundaries and below the markers, and never take clicks
    const labelsPane = map.createPane("labels");
    labelsPane.style.zIndex = "450";
    labelsPane.style.pointerEvents = "none";

    if (CARTO_TILES) {
      const tiles = L.tileLayer(CARTO_TILES.url, {
        attribution: CARTO_TILES.attribution,
        subdomains: "abcd",
        maxZoom: 19,
        opacity: 0.6,
      });
      tiles.on("tileerror", () => setTilesFailed(true));
      tiles.on("tileload", () => setTilesFailed(false));
      tiles.addTo(map);
    }

    districtLayerRef.current = L.layerGroup();
    stateLabelsRef.current = L.layerGroup().addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    // Leaflet measures its container once; re-measure when the layout changes size
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(el);

    let cancelled = false;
    loadGeoFile<BoundaryCollection>(STATES_FILE)
      .then((data) => {
        if (cancelled) return;
        const labels: Record<string, [number, number]> = {};
        const layer = L.geoJSON(asGeoJson(data), {
          style: () => STATE_STYLE.base,
          onEachFeature: (feature, path) => {
            const { name, label } = (feature.properties || {}) as BoundaryFeature["properties"];
            if (label) labels[name] = label;
            path.on("click", () => selectStateRef.current(name));
          },
        });
        // State shapes go under everything else
        layer.addTo(map).bringToBack();
        statesLayerRef.current = layer;

        for (const [name, [lat, lng]] of Object.entries(labels)) {
          if (!HIDDEN_STATE_LABELS.has(name)) labelMarker(lat, lng, name, styles.stateLabel).addTo(stateLabelsRef.current!);
        }
        setStateLabels(labels);

        const bounds = layer.getBounds();
        if (bounds.isValid()) {
          indiaBoundsRef.current = bounds;
          map.setMaxBounds(bounds.pad(0.25));
          map.fitBounds(bounds, { padding: [12, 12], animate: false });
          map.setMinZoom(Math.max(2, map.getZoom() - 0.5));
        }
        setStatesReady("ready");
      })
      .catch(() => {
        if (!cancelled) setStatesReady("failed");
      });

    loadGeoFile<{ states: DistrictIndex }>(DISTRICT_INDEX_FILE)
      .then((data) => {
        if (!cancelled) setDistrictIndex(data.states);
      })
      .catch(() => {
        if (!cancelled) setDistrictsFailed(true);
      });

    return () => {
      cancelled = true;
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      statesLayerRef.current = null;
      stateLabelsRef.current = null;
      districtLayerRef.current = null;
      markersRef.current = null;
      indiaBoundsRef.current = null;
    };
  }, []);

  // State shapes: the selected state stands out, the rest fade; state labels only on the India view
  useEffect(() => {
    const map = mapRef.current;
    const layer = statesLayerRef.current;
    if (!map || !layer || statesReady !== "ready") return;
    layer.eachLayer((child) => {
      const name = featureName(child);
      (child as L.Path).setStyle(
        !selectedState ? STATE_STYLE.base : name === selectedState ? STATE_STYLE.selected : STATE_STYLE.other,
      );
    });
    const labels = stateLabelsRef.current;
    if (labels) {
      if (selectedState) map.removeLayer(labels);
      else labels.addTo(map);
    }
  }, [selectedState, statesReady]);

  // District boundaries and labels of the selected state
  useEffect(() => {
    const map = mapRef.current;
    const group = districtLayerRef.current;
    if (!map || !group) return;
    group.clearLayers();
    map.removeLayer(group);
    districtShapesRef.current = new Map();
    if (!selectedState || !districtIndex) return;

    const file = districtIndex[selectedState]?.file;
    if (!file) return;
    let cancelled = false;
    loadGeoFile<BoundaryCollection>(file)
      .then((data) => {
        if (cancelled) return;
        // In feature order: newer districts from the Ajrasakha patches come last and draw above their old parent
        const shapes = L.geoJSON(asGeoJson(data), { interactive: false, style: () => DISTRICT_STYLE }).addTo(group);
        const byName = new Map<string, L.Polygon>();
        shapes.eachLayer((l) => byName.set(featureName(l), l as L.Polygon));
        districtShapesRef.current = byName;
        setDistrictShapesVersion((v) => v + 1);
        for (const f of data.features) {
          const label = f.properties.label;
          if (label) labelMarker(label[0], label[1], f.properties.name, styles.districtLabel).addTo(group);
        }
        group.addTo(map);
        setDistrictsFailed(false);
      })
      .catch(() => {
        if (!cancelled) setDistrictsFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedState, districtIndex]);

  // Outline the district chosen in the District filter (fills stay opaque; draw order is unchanged)
  useEffect(() => {
    const shapes = districtShapesRef.current;
    const state = selectedStateRef.current;
    let selectedShape: L.Polygon | undefined;
    if (state && selectedDistrict) {
      const entry = districtIndex?.[state]?.districts.find((d) => d.keys.includes(districtKey(selectedDistrict)));
      selectedShape = entry ? shapes.get(entry.name) : undefined;
    }
    shapes.forEach((shape) => shape.setStyle(shape === selectedShape ? DISTRICT_SELECTED_STYLE : DISTRICT_STYLE));
  }, [selectedDistrict, districtShapesVersion, districtIndex]);

  // Green dots: one per state with live candidates on the India view, one per district on a state view
  useEffect(() => {
    const layer = markersRef.current;
    if (!layer) return;
    layer.clearLayers();

    if (!selectedState) {
      for (const s of view.states) {
        const [lat, lng] = stateLabels[s.state] ?? [s.lat, s.lng];
        dotMarker(lat, lng, `${s.state}: ${plural(s.candidates.length)}`, false)
          .on("click", () => selectStateRef.current(s.state))
          .addTo(layer);
      }
      return;
    }

    // One dot per position; districts that share a position are listed together in its card
    for (const spot of spots) {
      const title = spot.districts
        .map((d) => `${d.district}: ${plural(d.candidates.length)}`)
        .join("; ");
      dotMarker(spot.lat, spot.lng, title, spot.id === selectedSpot)
        .on("click", () => setSelectedSpot(spot.id))
        .addTo(layer);
    }
  }, [view, selectedState, spots, selectedSpot, stateLabels]);

  return (
    <div className={styles.container}>
      <div className={styles.mapPane}>
        <div ref={containerRef} className={styles.map} aria-label="Map of live interview candidates by registered location" />

        {selectedState && (
          <div className={styles.topBar}>
            <button type="button" className={styles.backBtn} onClick={showIndia}>
              ← India
            </button>
            <span className={styles.crumb}>{selectedState}</span>
          </div>
        )}

        {(statesReady === "failed" || districtsFailed || tilesFailed) && (
          <div className={styles.notice}>Part of the map could not load. Please refresh the page.</div>
        )}

        {openSpot && (
          <div className={styles.card} role="dialog" aria-label={`Live candidates in ${selectedState}`}>
            <div className={styles.cardHeader}>
              <div>
                <div className={styles.cardTitle}>
                  {openSpot.districts.length === 1 ? openSpot.districts[0].district : selectedState}
                </div>
                <div className={styles.cardSub}>
                  {openSpot.districts.length === 1 ? `${selectedState} · ` : ""}
                  {plural(openSpotCount)}
                </div>
              </div>
              <button type="button" className={styles.closeBtn} onClick={() => setSelectedSpot(null)} aria-label="Close">
                ×
              </button>
            </div>
            <div className={styles.cardBody}>
              {openSpot.districts.map((d) => (
                <section key={d.district} className={styles.cardGroup}>
                  {openSpot.districts.length > 1 && <h5 className={styles.cardGroupTitle}>{d.district}</h5>}
                  <ul className={styles.rows}>
                    {d.candidates.map((c) => (
                      <CandidateItem key={c.interviewId} c={c} onOpenChat={onOpenChat} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        )}

        <MapCredits />
      </div>

      <aside className={styles.panel} aria-label="Live candidates">
        <div className={styles.panelHeader}>
          <h3 className={styles.panelTitle}>
            Live Candidates
            {selectedState && <span className={styles.countPill}>{panel.candidates.length}</span>}
          </h3>
          <div className={styles.filters}>
            <label className={styles.filter}>
              <span>State</span>
              <select
                value={selectedState ?? ""}
                onChange={(e) => (e.target.value ? selectState(e.target.value) : showIndia())}
              >
                <option value="">All States</option>
                {STATE_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.filter}>
              <span>District</span>
              <select
                value={selectedDistrict ?? ""}
                disabled={!selectedState}
                onChange={(e) => selectDistrict(e.target.value || null)}
              >
                <option value="">All Districts</option>
                {districtChoices.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className={styles.panelBody}>
          {panel.candidates.length === 0 ? (
            <p className={styles.panelEmpty}>
              {panel.total === 0 ? "No live interviews right now." : "No live candidates for this selection."}
            </p>
          ) : (
            <ul className={styles.rows}>
              {panel.candidates.map((c) => (
                <CandidateItem key={c.interviewId} c={c} onOpenChat={onOpenChat} />
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
