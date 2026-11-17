// Live tab data: which interview sessions count as live, and grouping of live candidates by their registered
// state and district for the Live Map. Positions come from the registered location only, never the candidate's device.

export interface LiveMapInterview {
  id: string;
  candidateId: string;
  candidateName: string;
  candidateState?: string;
  candidateDistrict?: string;
  status?: string;
  startedAt: string;
}

export interface LiveMapCandidate {
  /** The candidate's ongoing session (the one "View Interview" opens). */
  interviewId: string;
  candidateId: string;
  name: string;
  district: string;
  /** Canonical state name; the text as stored on the profile when it is not a known state. */
  state: string;
  startedAt: Date | null;
}

export interface LiveStateGroup {
  state: string;
  lat: number;
  lng: number;
  candidates: LiveMapCandidate[];
}

export interface LiveMapGroups {
  states: LiveStateGroup[];
  /** Live candidates whose registered state is missing or not a known state. */
  unknown: LiveMapCandidate[];
}

// Approximate geographic centre of each state / UT, used only to place that state's marker.
// Values match the centroid table in the Ajrasakha map, with two changes: Lakshadweep is added (Anveshan's state list
// has it), and Jammu and Kashmir uses the area-weighted centroid of the post-2019 UT boundary (the Ajrasakha value is
// the centre of the old state including Ladakh, which falls inside Ladakh). Every value lies inside its own shape in
// public/geo/india-states.json (checked by lib/live-map.test.mjs).
export const STATE_CENTROIDS: Record<string, [number, number]> = {
  "Andaman and Nicobar Islands": [11.7401, 92.6586],
  "Andhra Pradesh": [15.9129, 79.74],
  "Arunachal Pradesh": [28.218, 94.7278],
  Assam: [26.2006, 92.9376],
  Bihar: [25.0961, 85.3131],
  Chandigarh: [30.7333, 76.7794],
  Chhattisgarh: [21.2787, 81.8661],
  "Dadra and Nagar Haveli and Daman and Diu": [20.3974, 72.8328],
  Delhi: [28.7041, 77.1025],
  Goa: [15.2993, 74.124],
  Gujarat: [22.2587, 71.1924],
  Haryana: [29.0588, 76.0856],
  "Himachal Pradesh": [31.1048, 77.1734],
  "Jammu and Kashmir": [33.6725, 74.8572],
  Jharkhand: [23.6102, 85.2799],
  Karnataka: [15.3173, 75.7139],
  Kerala: [10.8505, 76.2711],
  Ladakh: [34.1526, 77.5771],
  Lakshadweep: [10.5667, 72.6417],
  "Madhya Pradesh": [22.9734, 78.6569],
  Maharashtra: [19.7515, 75.7139],
  Manipur: [24.6637, 93.9063],
  Meghalaya: [25.467, 91.3662],
  Mizoram: [23.1645, 92.9376],
  Nagaland: [26.1584, 94.5624],
  Odisha: [20.9517, 85.0985],
  Puducherry: [11.9416, 79.8083],
  Punjab: [31.1471, 75.3412],
  Rajasthan: [27.0238, 74.2179],
  Sikkim: [27.533, 88.5122],
  "Tamil Nadu": [11.1271, 78.6569],
  Telangana: [18.1124, 79.0193],
  Tripura: [23.9408, 91.9882],
  "Uttar Pradesh": [26.8467, 80.9462],
  Uttarakhand: [30.0668, 79.0193],
  "West Bengal": [22.9868, 87.855],
};

/** Lowercase, "&" read as "and", punctuation dropped, spaces collapsed. */
export function stateKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Older or alternate spellings that should count as one of the states above
const STATE_ALIASES: Record<string, string> = {
  orissa: "Odisha",
  uttaranchal: "Uttarakhand",
  pondicherry: "Puducherry",
  "new delhi": "Delhi",
  "nct of delhi": "Delhi",
  "delhi nct": "Delhi",
  "national capital territory of delhi": "Delhi",
  "delhi national capital territory": "Delhi",
  "andaman and nicobar": "Andaman and Nicobar Islands",
  "dadra and nagar haveli": "Dadra and Nagar Haveli and Daman and Diu",
  "daman and diu": "Dadra and Nagar Haveli and Daman and Diu",
  "j and k": "Jammu and Kashmir",
};

const STATE_BY_KEY: Record<string, string> = (() => {
  const byKey: Record<string, string> = {};
  for (const name of Object.keys(STATE_CENTROIDS)) byKey[stateKey(name)] = name;
  for (const [alias, name] of Object.entries(STATE_ALIASES)) byKey[stateKey(alias)] = name;
  return byKey;
})();

/** The canonical state name for a stored value, or null when it is empty or not a known state. */
export function normalizeState(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const key = stateKey(raw);
  return key ? STATE_BY_KEY[key] ?? null : null;
}

/**
 * Parses a timestamp from the backend. Naive values (no offset) are UTC, since MongoDB stores UTC
 * and the API serialises them without a zone.
 */
export function parseServerDate(value: string | null | undefined): Date | null {
  if (!value || typeof value !== "string") return null;
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value.trim());
  const date = new Date(hasZone ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

const startedAtMs = (iv: LiveMapInterview) => parseServerDate(iv.startedAt)?.getTime() ?? 0;

/**
 * Session statuses where the candidate is taking part in the interview right now.
 * "paused" is left out: the candidate has disconnected and the saved interview waits for them to resume
 * (SlotManager.pause_interview / resume_interview; stale paused sessions expire after 24 hours).
 * A session without a status counts as "active", as in the API.
 */
export const ONGOING_SESSION_STATUSES = ["active", "interviewing"];

/**
 * Candidates currently in an interview, once each, newest start first. Live Chats and the Live Map both show this
 * list: ongoing sessions only, and the most recently started one when a candidate has several.
 */
export function currentLiveInterviews<T extends LiveMapInterview>(interviews: T[]): T[] {
  const byCandidate = new Map<string, T>();
  for (const iv of interviews) {
    if (!ONGOING_SESSION_STATUSES.includes(iv.status || "active")) continue;
    const key = iv.candidateId ? String(iv.candidateId) : `interview:${iv.id}`;
    const current = byCandidate.get(key);
    if (!current || startedAtMs(iv) > startedAtMs(current)) byCandidate.set(key, iv);
  }
  return Array.from(byCandidate.values()).sort((a, b) => startedAtMs(b) - startedAtMs(a));
}

function toCandidate(iv: LiveMapInterview, state: string | null): LiveMapCandidate {
  return {
    interviewId: iv.id,
    candidateId: iv.candidateId ? String(iv.candidateId) : "",
    name: (iv.candidateName || "").trim(),
    district: (iv.candidateDistrict || "").trim(),
    state: state ?? (iv.candidateState || "").trim(),
    startedAt: parseServerDate(iv.startedAt),
  };
}

const newestFirst = (a: LiveMapCandidate, b: LiveMapCandidate) =>
  (b.startedAt?.getTime() ?? 0) - (a.startedAt?.getTime() ?? 0);

// ── District level ───────────────────────────────────────────────────────────

/**
 * Lowercase, "&" read as "and", everything except letters and digits removed.
 * Must match district_key() in scripts/build_india_districts_geojson.py.
 */
export function districtKey(name: string): string {
  return name.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]/g, "");
}

/** One district boundary in public/geo/district-index.json. */
export interface DistrictIndexEntry {
  name: string;
  /** Normalised names that match this boundary: its own, the onboarding-list spelling and hand-checked aliases. */
  keys: string[];
  /** [lat, lng] inside the boundary; absent when the boundary is drawn without a label. */
  label?: [number, number];
}

export type DistrictIndex = Record<string, { file: string; districts: DistrictIndexEntry[] }>;

/** Shown for a candidate whose profile has no district. */
export const DISTRICT_NOT_PROVIDED = "District not provided";

export interface LiveDistrictGroup {
  /** The candidate's registered district as entered (first spelling seen), or DISTRICT_NOT_PROVIDED. */
  district: string;
  lat: number;
  lng: number;
  /**
   * How the position was chosen (internal; not shown to administrators):
   *  "district" - inside the district's own boundary (exact name or hand-checked alias match)
   *  "state"    - the state's representative point, used when the district has no boundary or is not provided
   */
  position: "district" | "state";
  candidates: LiveMapCandidate[];
}

export interface LiveMapStateView {
  state: string;
  lat: number;
  lng: number;
  candidates: LiveMapCandidate[];
  /** One group per registered district; several groups can share a position. */
  districts: LiveDistrictGroup[];
}

export interface LiveMapView {
  states: LiveMapStateView[];
  /** State missing or not recognised: no region to place them in. */
  unknown: LiveMapCandidate[];
}

/**
 * Live candidates grouped by registered state, then by registered district.
 *
 * Marker position for a district group (no random or invented coordinates):
 *  1. the district matches a boundary by exact normalised name or a hand-checked alias
 *     (scripts/india_district_aliases.json) -> that boundary's label point, inside the district;
 *  2. otherwise (district created after the boundary data, not a district, or not provided) -> the state's
 *     representative point: `stateAnchors[state]` (the label point of the visible state shape in
 *     public/geo/india-states.json), else STATE_CENTROIDS. Both are tested to lie inside the state.
 * Groups are keyed by the candidate's own district name, so two districts sharing a fallback point stay separate.
 */
export function groupLiveForMap(
  interviews: LiveMapInterview[],
  index: DistrictIndex | null,
  stateAnchors: Record<string, [number, number]> = {},
): LiveMapView {
  const { states, unknown } = groupLiveByState(interviews);

  const views = states.map((g): LiveMapStateView => {
    const view: LiveMapStateView = { state: g.state, lat: g.lat, lng: g.lng, candidates: g.candidates, districts: [] };
    if (!index) return view;

    const byKey = new Map<string, DistrictIndexEntry>();
    for (const entry of index[g.state]?.districts ?? []) for (const k of entry.keys) byKey.set(k, entry);
    const [anchorLat, anchorLng] = stateAnchors[g.state] ?? [g.lat, g.lng];

    const groups = new Map<string, LiveDistrictGroup>();
    for (const c of g.candidates) {
      const key = c.district ? districtKey(c.district) : "";
      let group = groups.get(key);
      if (!group) {
        const entry = key ? byKey.get(key) : undefined;
        group = entry?.label
          ? { district: c.district, lat: entry.label[0], lng: entry.label[1], position: "district", candidates: [] }
          : { district: c.district || DISTRICT_NOT_PROVIDED, lat: anchorLat, lng: anchorLng, position: "state", candidates: [] };
        groups.set(key, group);
      }
      group.candidates.push(c);
    }
    view.districts = Array.from(groups.values()).sort(
      (a, b) => b.candidates.length - a.candidates.length || a.district.localeCompare(b.district),
    );
    return view;
  });

  return { states: views, unknown };
}

// ── Live Candidates panel ────────────────────────────────────────────────────

/** Profile page of a candidate, opened in the All Candidates context (its Back button returns to All Candidates). */
export function candidateProfileHref(candidateId: string): string {
  return `/admin/candidates/${encodeURIComponent(candidateId)}?from=${encodeURIComponent("tab=candidates")}`;
}

/**
 * District filter options for a state: the onboarding district list (without "Others"), plus any district a live
 * candidate in that state registered that is not in the list (typed in under "Others"). Deduplicated by districtKey.
 */
export function districtOptions(listed: string[], candidates: LiveMapCandidate[]): string[] {
  const options = new Map<string, string>();
  for (const name of listed) {
    if (name !== "Others" && !options.has(districtKey(name))) options.set(districtKey(name), name);
  }
  for (const c of candidates) {
    if (c.district && !options.has(districtKey(c.district))) options.set(districtKey(c.district), c.district);
  }
  return Array.from(options.values()).sort((a, b) => a.localeCompare(b));
}

export interface PanelData {
  /** Live candidates matching the filters, most recently started first. */
  candidates: LiveMapCandidate[];
  /** All live candidates. */
  total: number;
}

export const STATE_NOT_PROVIDED = "State not provided";

/**
 * The Live Candidates panel: one list of candidates filtered by state and registered district, newest start first.
 * Uses only the grouped live data (no map files), so it is complete as soon as the poll returns.
 * Candidates with an unrecognised state only appear when no state is selected.
 */
export function panelData(view: Pick<LiveMapView, "states" | "unknown">, state: string | null, district: string | null): PanelData {
  const all = [...view.states.flatMap((s) => s.candidates), ...view.unknown];
  const wantedDistrict = district ? districtKey(district) : null;
  const candidates = all
    .filter((c) => (!state || c.state === state) && (wantedDistrict === null || districtKey(c.district) === wantedDistrict))
    .sort(newestFirst);
  return { candidates, total: all.length };
}

export interface LiveMapSpot {
  /** Stable id for the position ("lat,lng"). */
  id: string;
  lat: number;
  lng: number;
  /** Districts shown at this position (usually one; several when they share the state's fallback point). */
  districts: LiveDistrictGroup[];
}

/** One marker per distinct position; districts at the same position are listed together, not offset. */
export function spotsOf(districts: LiveDistrictGroup[]): LiveMapSpot[] {
  const spots = new Map<string, LiveMapSpot>();
  for (const d of districts) {
    const id = `${d.lat},${d.lng}`;
    let spot = spots.get(id);
    if (!spot) {
      spot = { id, lat: d.lat, lng: d.lng, districts: [] };
      spots.set(id, spot);
    }
    spot.districts.push(d);
  }
  return Array.from(spots.values());
}

/** Groups live candidates (the currentLiveInterviews list) by registered state; unknown states are kept aside, not dropped. */
export function groupLiveByState(interviews: LiveMapInterview[]): LiveMapGroups {
  const groups = new Map<string, LiveStateGroup>();
  const unknown: LiveMapCandidate[] = [];

  for (const iv of interviews) {
    const state = normalizeState(iv.candidateState);
    const candidate = toCandidate(iv, state);
    if (!state) {
      unknown.push(candidate);
      continue;
    }
    let group = groups.get(state);
    if (!group) {
      const [lat, lng] = STATE_CENTROIDS[state];
      group = { state, lat, lng, candidates: [] };
      groups.set(state, group);
    }
    group.candidates.push(candidate);
  }

  const states = Array.from(groups.values());
  for (const g of states) g.candidates.sort(newestFirst);
  states.sort((a, b) => b.candidates.length - a.candidates.length || a.state.localeCompare(b.state));
  unknown.sort(newestFirst);
  return { states, unknown };
}
