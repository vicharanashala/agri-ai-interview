"use client";

import { useState, useMemo } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from "react-simple-maps";
import styles from "../app/admin/dashboard/dashboard.module.css";

// District-level India GeoJSON (759 districts, includes state name per feature)
const INDIA_GEO_URL =
  "https://cdn.jsdelivr.net/gh/udit-001/india-maps-data@ef25ebc/geojson/india.geojson";

interface StateEntry {
  state: string;
  total: number;
  selected: number;
  rejected: number;
  passRate: number;
}

interface DistrictEntry {
  state: string;
  district: string;
  total: number;
  passRate: number;
}

interface IndiaMapProps {
  states: StateEntry[];
  districts?: DistrictEntry[];
}

// Normalize DB state name → GeoJSON st_nm
const STATE_NAME_MAP: Record<string, string> = {
  "andaman and nicobar islands": "Andaman & Nicobar",
  "andaman & nicobar": "Andaman & Nicobar",
  andhra: "Andhra Pradesh",
  "andhra pradesh": "Andhra Pradesh",
  arunachal: "Arunachal Pradesh",
  "arunachal pradesh": "Arunachal Pradesh",
  assam: "Assam",
  bihar: "Bihar",
  chandigarh: "Chandigarh",
  chhattisgarh: "Chhattisgarh",
  "dadra and nagar haveli": "Dadra & Nagar Haveli",
  "daman and diu": "Daman & Diu",
  delhi: "NCT of Delhi",
  "new delhi": "NCT of Delhi",
  goa: "Goa",
  gujarat: "Gujarat",
  haryana: "Haryana",
  "himachal pradesh": "Himachal Pradesh",
  "jammu and kashmir": "Jammu & Kashmir",
  jharkhand: "Jharkhand",
  karnataka: "Karnataka",
  kerala: "Kerala",
  ladakh: "Ladakh",
  "madhya pradesh": "Madhya Pradesh",
  madhya: "Madhya Pradesh",
  maharashtra: "Maharashtra",
  manipur: "Manipur",
  meghalaya: "Meghalaya",
  mizoram: "Mizoram",
  nagaland: "Nagaland",
  odisha: "Odisha",
  orissa: "Odisha",
  puducherry: "Puducherry",
  punjab: "Punjab",
  rajasthan: "Rajasthan",
  sikkim: "Sikkim",
  tamil: "Tamil Nadu",
  "tamil nadu": "Tamil Nadu",
  telangana: "Telangana",
  tripura: "Tripura",
  "uttar pradesh": "Uttar Pradesh",
  uttarakhand: "Uttarakhand",
  "west bengal": "West Bengal",
};

// Also normalize for partial matches
function normalizeState(name: string): string {
  if (!name) return "";
  const lower = name.toLowerCase().trim();
  if (STATE_NAME_MAP[lower]) return STATE_NAME_MAP[lower];
  return (
    name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()
  );
}

function getDensityLevel(total: number, maxTotal: number): number {
  if (total === 0) return 0;
  const ratio = total / maxTotal;
  if (ratio <= 0.05) return 1;
  if (ratio <= 0.15) return 2;
  if (ratio <= 0.3) return 3;
  if (ratio <= 0.5) return 4;
  return 5;
}

const DENSITY_COLORS = [
  "#f0fdf4", // 0
  "#bbf7d0", // 1
  "#86efac", // 2
  "#22c55e", // 3
  "#16a34a", // 4
  "#15803d", // 5
];

interface TooltipState {
  show: boolean;
  x: number;
  y: number;
  name: string;
  total: number;
  passRate: number;
}

export default function IndiaMap({ states, districts = [] }: IndiaMapProps) {
  const [tooltip, setTooltip] = useState<TooltipState>({
    show: false, x: 0, y: 0, name: "", total: 0, passRate: 0,
  });

  // Max candidates for color scaling
  const maxTotalState = useMemo(
    () => Math.max(...states.map((s) => s.total), 1),
    [states]
  );
  const maxTotalDistrict = useMemo(
    () => Math.max(...districts.map((d) => d.total), 1),
    [districts]
  );

  // State data lookup by normalized state name
  const stateLookup = useMemo(() => {
    const m: Record<string, { total: number; passRate: number }> = {};
    for (const s of states) {
      const norm = normalizeState(s.state);
      m[norm] = { total: s.total, passRate: s.passRate };
    }
    return m;
  }, [states]);

  // District data lookup by "district, state" key
  const districtLookup = useMemo(() => {
    const m: Record<string, { total: number; passRate: number }> = {};
    for (const d of districts) {
      const key = `${d.district}`.toLowerCase().trim();
      m[key] = { total: d.total, passRate: d.passRate };
    }
    return m;
  }, [districts]);

  const getStateFill = (geoStateName: string): string => {
    const data = stateLookup[geoStateName];
    if (!data) return "#f3f4f6";
    return DENSITY_COLORS[getDensityLevel(data.total, maxTotalState)];
  };

  const getDistrictFill = (
    geoDistrictName: string,
    geoStateName: string
  ): string => {
    const key = geoDistrictName.toLowerCase().trim();
    const data = districtLookup[key];
    if (!data) return "#f0fdf4"; // light — no data for this district
    return DENSITY_COLORS[getDensityLevel(data.total, maxTotalDistrict)];
  };

  const showTooltip = (
    e: React.MouseEvent,
    name: string,
    total: number,
    passRate: number
  ) => {
    const rect = (e.target as Element).getBoundingClientRect();
    setTooltip({
      show: true,
      x: rect.left + rect.width / 2,
      y: rect.top,
      name,
      total,
      passRate,
    });
  };

  return (
    <>
      {/* ---- District-level map (primary) ---- */}
      <div style={{ width: "100%", overflow: "hidden", borderRadius: 8 }}>
        <ComposableMap
          projection="geoMercator"
          projectionConfig={{ center: [78.9629, 20.5937], scale: 950 }}
          style={{ width: "100%", height: "auto" }}
        >
          <ZoomableGroup>
            <Geographies geography={INDIA_GEO_URL}>
              {({ geographies }) => {
                if (!geographies?.length) return null;
                return geographies.map((geo) => {
                  const district: string = String(geo.properties?.district ?? "");
                  const st_nm: string = String(geo.properties?.st_nm ?? "");
                  // Color by district data if available, else by state aggregate
                  const fill = districtLookup[district.toLowerCase().trim()]
                    ? getDistrictFill(district, st_nm)
                    : getStateFill(normalizeState(st_nm));

                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={fill}
                      stroke="#ffffff"
                      strokeWidth={0.3}
                      style={{
                        default: { outline: "none" },
                        hover: {
                          outline: "none",
                          fill: "#08CB00",
                          opacity: 0.8,
                        },
                        pressed: { outline: "none" },
                      }}
                      onMouseEnter={(e) => {
                        const distKey = district.toLowerCase().trim();
                        const distData = districtLookup[distKey];
                        const total = distData?.total ?? 0;
                        const passRate = distData?.passRate ?? 0;
                        const name = distData ? `${district}, ${st_nm}` : `${district}, ${st_nm}`;
                        showTooltip(e, name, total, passRate);
                      }}
                      onMouseLeave={() =>
                        setTooltip((t) => ({ ...t, show: false }))
                      }
                    />
                  );
                });
              }}
            </Geographies>
          </ZoomableGroup>
        </ComposableMap>
      </div>

      {/* Color legend */}
      <div className={styles.mapLegend}>
        <span>Low</span>
        <div style={{ display: "flex", gap: 3 }}>
          {DENSITY_COLORS.map((c) => (
            <div
              key={c}
              className={styles.mapLegendDot}
              style={{ background: c, border: "1px solid #e5e7eb" }}
            />
          ))}
        </div>
        <span>High</span>
        <span style={{ marginLeft: 8, color: "#9ca3af" }}>
          {districts.length > 0
            ? "Colors reflect district-level data"
            : "Colors reflect state-level data"}
        </span>
      </div>

      {/* State summary cards (below map) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
          gap: 6,
          marginTop: 12,
          width: "100%",
        }}
      >
        {states
          .slice()
          .sort((a, b) => b.total - a.total)
          .map((s) => {
            const level = getDensityLevel(s.total, maxTotalState);
            return (
              <div
                key={s.state}
                style={{
                  background: DENSITY_COLORS[level],
                  borderRadius: 6,
                  padding: "6px 10px",
                  cursor: "default",
                  border: "1px solid rgba(0,0,0,0.05)",
                }}
                onMouseEnter={(e) =>
                  showTooltip(e, s.state, s.total, s.passRate)
                }
                onMouseLeave={() =>
                  setTooltip((t) => ({ ...t, show: false }))
                }
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#374151",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {s.state}
                </div>
                <div style={{ fontSize: 10, color: "#6b7280" }}>
                  {s.total}{" "}
                  {s.total === 1 ? "candidate" : "candidates"}
                  {s.passRate > 0 ? ` · ${s.passRate}% pass` : ""}
                </div>
              </div>
            );
          })}
      </div>

      {/* Floating tooltip */}
      {tooltip.show && (
        <div
          className={styles.mapTooltip}
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: "translate(-50%, -100%)",
          }}
        >
          <strong>{tooltip.name}</strong>
          <br />
          {tooltip.total} candidate{tooltip.total !== 1 ? "s" : ""}
          {tooltip.passRate > 0 && (
            <>
              <br />
              Pass rate: {tooltip.passRate}%
            </>
          )}
        </div>
      )}
    </>
  );
}