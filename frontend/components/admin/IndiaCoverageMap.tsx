'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import 'leaflet/dist/leaflet.css';
import styles from './IndiaCoverageMap.module.css';
import type { LiveInterview } from './LiveTab';

// Accurate coordinates (lat, lng) for Indian States and Union Territories
export const INDIA_STATE_COORDINATES: Record<string, { lat: number; lng: number }> = {
  'Andhra Pradesh': { lat: 15.9129, lng: 79.7400 },
  'Arunachal Pradesh': { lat: 28.2180, lng: 94.7278 },
  'Assam': { lat: 26.2006, lng: 92.9376 },
  'Bihar': { lat: 25.0961, lng: 85.3131 },
  'Chhattisgarh': { lat: 21.2787, lng: 81.8661 },
  'Goa': { lat: 15.2993, lng: 74.1240 },
  'Gujarat': { lat: 22.2587, lng: 71.1924 },
  'Haryana': { lat: 29.0588, lng: 76.0856 },
  'Himachal Pradesh': { lat: 31.1048, lng: 77.1734 },
  'Jharkhand': { lat: 23.6102, lng: 85.2799 },
  'Karnataka': { lat: 15.3173, lng: 75.7139 },
  'Kerala': { lat: 10.8505, lng: 76.2711 },
  'Madhya Pradesh': { lat: 22.9734, lng: 78.6569 },
  'Maharashtra': { lat: 19.7515, lng: 75.7139 },
  'Manipur': { lat: 24.6637, lng: 93.9063 },
  'Meghalaya': { lat: 25.4670, lng: 91.3662 },
  'Mizoram': { lat: 23.1645, lng: 92.9376 },
  'Nagaland': { lat: 26.1584, lng: 94.5624 },
  'Odisha': { lat: 20.9517, lng: 85.0985 },
  'Punjab': { lat: 31.1471, lng: 75.3412 },
  'Rajasthan': { lat: 27.0238, lng: 74.2179 },
  'Sikkim': { lat: 27.5330, lng: 88.5122 },
  'Tamil Nadu': { lat: 11.1271, lng: 78.6569 },
  'Telangana': { lat: 18.1124, lng: 79.0193 },
  'Tripura': { lat: 23.9408, lng: 91.9882 },
  'Uttar Pradesh': { lat: 26.8467, lng: 80.9462 },
  'Uttarakhand': { lat: 30.0668, lng: 79.0193 },
  'West Bengal': { lat: 22.9868, lng: 87.8550 },
  'Delhi': { lat: 28.7041, lng: 77.1025 },
  'Jammu & Kashmir': { lat: 33.7782, lng: 76.5762 },
  'Jammu and Kashmir': { lat: 33.7782, lng: 76.5762 },
  'Ladakh': { lat: 34.1526, lng: 77.5771 },
  'Chandigarh': { lat: 30.7333, lng: 76.7794 },
  'Puducherry': { lat: 11.9416, lng: 79.8083 },
  'Andaman & Nicobar Islands': { lat: 11.7401, lng: 92.6586 },
  'Dadra and Nagar Haveli and Daman and Diu': { lat: 20.4283, lng: 72.8397 },
};

export interface StateStats {
  state: string;
  total: number;
  pending: number;
  interviewed: number;
  selected: number;
  rejected: number;
  passRate: number;
  liveCount?: number;
}

export interface DistrictStats {
  state: string;
  district: string;
  total: number;
}

interface IndiaCoverageMapProps {
  adminToken?: string | null;
  adminApiBase?: string;
  interviews?: LiveInterview[];
  onNavigateToCandidates?: (stateName?: string) => void;
}

const INDIA_CENTER_LAT = 22.9734;
const INDIA_CENTER_LNG = 78.6569;
const DEFAULT_ZOOM = 4.8;

export default function IndiaCoverageMap({
  adminToken,
  adminApiBase,
  interviews = [],
  onNavigateToCandidates,
}: IndiaCoverageMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<Record<string, any>>({});

  const [loading, setLoading] = useState(true);
  const [states, setStates] = useState<StateStats[]>([]);
  const [districts, setDistricts] = useState<DistrictStats[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedState, setSelectedState] = useState<string | null>(null);

  // Group live interviews by candidateState
  const liveCountByState = useMemo(() => {
    const map: Record<string, number> = {};
    for (const iv of interviews) {
      if (iv.candidateState) {
        const s = iv.candidateState.trim();
        map[s] = (map[s] || 0) + 1;
      }
    }
    return map;
  }, [interviews]);

  // Fetch geographic statistics from backend
  useEffect(() => {
    let cancelled = false;

    const fetchGeoStats = async () => {
      setLoading(true);
      try {
        const base = adminApiBase || process.env.NEXT_PUBLIC_ADMIN_API_URL || '';
        const headers: Record<string, string> = {};
        if (adminToken) headers['X-Admin-Token'] = adminToken;

        const res = await fetch(`${base}/api/admin/geo/stats`, {
          headers,
          credentials: 'include',
        });

        if (res.ok && !cancelled) {
          const data = await res.json();
          setStates(data.states || []);
          setDistricts(data.districts || []);
        }
      } catch (err) {
        console.error('Failed to load geo stats for map:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchGeoStats();
    return () => {
      cancelled = true;
    };
  }, [adminToken, adminApiBase]);

  // Merge live interview counts into state statistics
  const enrichedStates = useMemo(() => {
    return states.map((s) => ({
      ...s,
      liveCount: liveCountByState[s.state] || 0,
    }));
  }, [states, liveCountByState]);

  // Filter states based on search query
  const filteredStates = useMemo(() => {
    if (!searchQuery.trim()) return enrichedStates;
    const q = searchQuery.toLowerCase().trim();
    return enrichedStates.filter((s) => s.state.toLowerCase().includes(q));
  }, [enrichedStates, searchQuery]);

  // Summary Metrics
  const totalCandidatesAcrossIndia = useMemo(
    () => states.reduce((acc, s) => acc + (s.total || 0), 0),
    [states]
  );

  const totalStatesRepresented = useMemo(
    () => states.filter((s) => s.state !== 'Unknown' && s.total > 0).length,
    [states]
  );

  const topState = useMemo(() => {
    const valid = states.filter((s) => s.state !== 'Unknown');
    return valid.length > 0 ? valid[0] : null;
  }, [states]);

  // Initialize Leaflet map using OpenStreetMap basemap tiles
  useEffect(() => {
    if (typeof window === 'undefined' || !mapContainerRef.current) return;
    let isMounted = true;

    import('leaflet').then((L) => {
      if (!isMounted || !mapContainerRef.current) return;

      // Prevent re-initialization if already active
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      // Initialize map with India view
      const map = L.map(mapContainerRef.current, {
        center: [INDIA_CENTER_LAT, INDIA_CENTER_LNG],
        zoom: DEFAULT_ZOOM,
        minZoom: 4,
        maxZoom: 12,
        scrollWheelZoom: true,
      });

      // Completely free, open-source OpenStreetMap standard tile layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
      }).addTo(map);

      mapInstanceRef.current = map;
      renderMarkers(L, map);
    });

    return () => {
      isMounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Re-render markers whenever state data or live interviews change
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    import('leaflet').then((L) => {
      renderMarkers(L, mapInstanceRef.current);
    });
  }, [enrichedStates, districts]);

  const renderMarkers = (L: any, map: any) => {
    // Clear existing markers
    Object.values(markersRef.current).forEach((m: any) => m.remove());
    markersRef.current = {};

    enrichedStates.forEach((st) => {
      const coords = INDIA_STATE_COORDINATES[st.state];
      if (!coords || st.total <= 0) return;

      const isLive = (st.liveCount || 0) > 0;
      const count = st.total;

      // Scale marker size based on candidate volume
      const size = Math.max(30, Math.min(48, 28 + Math.log10(count + 1) * 10));

      const customIcon = L.divIcon({
        className: '',
        html: `
          <div class="osm-marker-pin ${isLive ? 'osm-marker-pin-live' : ''}" style="width: ${size}px; height: ${size}px; font-size: ${size > 36 ? 13 : 11}px;">
            ${count}
          </div>
        `,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });

      const marker = L.marker([coords.lat, coords.lng], { icon: customIcon }).addTo(map);

      // Collect top districts for popup
      const stateDistricts = districts
        .filter((d) => d.state === st.state && d.district !== 'Unknown')
        .slice(0, 5);

      const popupContent = `
        <div style="font-family: inherit;">
          <div style="background: #f9fafb; padding: 12px 16px; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; justify-content: space-between;">
            <strong style="font-size: 14px; color: #111827;">${st.state}</strong>
            <span style="background: #dcfce7; color: #15803d; font-weight: 700; font-size: 11px; padding: 2px 8px; border-radius: 9999px;">
              ${count} Candidate${count === 1 ? '' : 's'}
            </span>
          </div>
          <div style="padding: 12px 16px; display: flex; flex-direction: column; gap: 8px;">
            ${
              isLive
                ? `<div style="display: flex; align-items: center; gap: 6px; padding: 5px 8px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; font-size: 11px; font-weight: 700; color: #b91c1c;">
                    🔴 ${st.liveCount} Currently Attending Live Interview
                   </div>`
                : ''
            }
            <div style="display: flex; justify-content: space-between; font-size: 12px; color: #4b5563;">
              <span>Interviewed:</span>
              <strong style="color: #111827;">${st.interviewed}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 12px; color: #4b5563;">
              <span>Selected / Pass:</span>
              <strong style="color: #15803d;">${st.selected} (${st.passRate}%)</strong>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 12px; color: #4b5563;">
              <span>Onboarding / New:</span>
              <strong style="color: #111827;">${st.pending}</strong>
            </div>
            ${
              stateDistricts.length > 0
                ? `<div style="border-top: 1px solid #f3f4f6; padding-top: 6px; margin-top: 2px;">
                    <div style="font-size: 10px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 4px;">Top Districts:</div>
                    <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                      ${stateDistricts.map((d) => `<span style="background: #f3f4f6; color: #374151; font-size: 10px; padding: 2px 5px; border-radius: 4px;">${d.district} (${d.total})</span>`).join('')}
                    </div>
                   </div>`
                : ''
            }
            <button
              id="view-candidates-btn-${st.state.replace(/\s+/g, '-')}"
              style="margin-top: 6px; width: 100%; padding: 6px 10px; background: #08CB00; color: white; border: none; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer;"
            >
              View Candidates from ${st.state} →
            </button>
          </div>
        </div>
      `;

      marker.bindPopup(popupContent, {
        className: 'osm-state-popup',
        maxWidth: 280,
      });

      marker.on('popupopen', () => {
        setSelectedState(st.state);
        setTimeout(() => {
          const btn = document.getElementById(`view-candidates-btn-${st.state.replace(/\s+/g, '-')}`);
          if (btn && onNavigateToCandidates) {
            btn.onclick = () => onNavigateToCandidates(st.state);
          }
        }, 50);
      });

      markersRef.current[st.state] = marker;
    });
  };

  const handleStateClick = (stateName: string) => {
    setSelectedState(stateName);
    const coords = INDIA_STATE_COORDINATES[stateName];
    if (coords && mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([coords.lat, coords.lng], 6.5, {
        duration: 1.2,
      });
      const marker = markersRef.current[stateName];
      if (marker) {
        setTimeout(() => marker.openPopup(), 600);
      }
    }
  };

  const handleResetView = () => {
    setSelectedState(null);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([INDIA_CENTER_LAT, INDIA_CENTER_LNG], DEFAULT_ZOOM, {
        duration: 1.0,
      });
      mapInstanceRef.current.closePopup();
    }
  };

  return (
    <div className={styles.container}>
      {/* ─── Top KPI Metrics ─── */}
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <div className={styles.kpiIconWrapper}>🇮🇳</div>
          <div className={styles.kpiContent}>
            <span className={styles.kpiLabel}>State Coverage</span>
            <span className={styles.kpiValue}>
              {totalStatesRepresented} <span style={{ fontSize: '14px', color: '#6b7280', fontWeight: 500 }}>/ 28 States</span>
            </span>
            <span className={styles.kpiSubtext}>Recruitment reach across India</span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiIconWrapper}>👥</div>
          <div className={styles.kpiContent}>
            <span className={styles.kpiLabel}>Total Candidates</span>
            <span className={styles.kpiValue}>{totalCandidatesAcrossIndia}</span>
            <span className={styles.kpiSubtext}>Registered across all states</span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={`${styles.kpiIconWrapper} ${interviews.length > 0 ? styles.kpiLiveIconWrapper : ''}`}>
            {interviews.length > 0 ? '🔴' : '🎙️'}
          </div>
          <div className={styles.kpiContent}>
            <span className={styles.kpiLabel}>Live Attending Now</span>
            <span className={styles.kpiValue} style={{ color: interviews.length > 0 ? '#dc2626' : '#111827' }}>
              {interviews.length} Live
            </span>
            <span className={styles.kpiSubtext}>
              {interviews.length > 0 ? 'Active in real-time interview' : 'No active sessions currently'}
            </span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiIconWrapper}>🏆</div>
          <div className={styles.kpiContent}>
            <span className={styles.kpiLabel}>Top Recruitment State</span>
            <span className={styles.kpiValue}>
              {topState ? topState.state : 'None'}
            </span>
            <span className={styles.kpiSubtext}>
              {topState ? `${topState.total} candidates enrolled` : 'No candidates yet'}
            </span>
          </div>
        </div>
      </div>

      {/* ─── Main Map + Side Explorer Layout ─── */}
      <div className={styles.mapSectionLayout}>
        {/* OpenStreetMap Basemap Container */}
        <div className={styles.mapWrapper}>
          {loading && (
            <div className={styles.mapLoadingOverlay}>
              <div className={styles.spinner} />
              <span>Loading OpenStreetMap Recruitment Data...</span>
            </div>
          )}

          <div ref={mapContainerRef} className={styles.mapElement} />

          {/* Quick Map Controls Overlay */}
          <div className={styles.mapControlsOverlay}>
            <button
              type="button"
              className={styles.mapControlBtn}
              onClick={handleResetView}
              title="Reset map to full India view"
            >
              🔄 Reset View
            </button>
          </div>

          {/* Map Legend */}
          <div className={styles.mapLegend}>
            <div className={styles.legendItem}>
              <span className={styles.legendDotGreen} />
              <span>State Candidate Volume</span>
            </div>
            <div className={styles.legendItem}>
              <span className={styles.legendDotLive} />
              <span>Live Interview Attending Now</span>
            </div>
          </div>
        </div>

        {/* State-wise Explorer Side Panel */}
        <div className={styles.sidePanel}>
          <div className={styles.sidePanelHeader}>
            <div className={styles.sidePanelTitleRow}>
              <h3 className={styles.sidePanelTitle}>State Breakdown</h3>
              <span className={styles.stateCountBadge}>
                {enrichedStates.length} States
              </span>
            </div>

            <div className={styles.searchBox}>
              <span className={styles.searchIcon}>🔍</span>
              <input
                type="text"
                placeholder="Search state..."
                className={styles.searchInput}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className={styles.clearSearchBtn}
                  onClick={() => setSearchQuery('')}
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          <div className={styles.stateList}>
            {filteredStates.length === 0 ? (
              <div className={styles.emptyStateSearch}>No states found matching &quot;{searchQuery}&quot;</div>
            ) : (
              filteredStates.map((st) => {
                const isSelected = selectedState === st.state;
                const isLive = (st.liveCount || 0) > 0;
                const maxTotal = topState?.total || 1;
                const progressPct = Math.min(100, Math.round((st.total / maxTotal) * 100));

                return (
                  <div
                    key={st.state}
                    className={`${styles.stateCard} ${isSelected ? styles.stateCardActive : ''}`}
                    onClick={() => handleStateClick(st.state)}
                  >
                    <div className={styles.stateCardTop}>
                      <span className={styles.stateName}>
                        {st.state}
                        {isLive && <span className={styles.liveTag}>🔴 LIVE ({st.liveCount})</span>}
                      </span>
                      <span className={styles.stateTotal}>{st.total}</span>
                    </div>

                    <div className={styles.stateProgressTrack}>
                      <div
                        className={styles.stateProgressFill}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>

                    <div className={styles.stateCardMeta}>
                      <span>Interviewed: {st.interviewed}</span>
                      <span>Selected: {st.selected}</span>
                      <span>Pass Rate: {st.passRate}%</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
