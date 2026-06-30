/**
 * Thin API client for the DynamicRadar backend.
 *
 * In dev, requests go to "/api" and are proxied to FastAPI by Vite. In
 * production, set VITE_API_BASE to the deployed backend origin.
 */
const API_BASE = import.meta.env.VITE_API_BASE || '';

async function request(path, params) {
  const qs = params
    ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v != null))
    : '';
  const res = await fetch(`${API_BASE}${path}${qs}`);
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      detail = (await res.json()).detail || detail;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(`API ${path} failed: ${detail}`);
  }
  return res.json();
}

export function getHealth() {
  return request('/api/health');
}

/** Nearest WSR-88D station to a coordinate (geolocation auto-connect). */
export function getNearestStation(lat, lon) {
  return request('/api/radar/nearest', { lat, lon });
}

export function getStations() {
  return request('/api/radar/stations');
}

/** Latest volume-scan metadata for a station. */
export function getLatestVolume(station) {
  return request(`/api/radar/${station}/latest`);
}

/** Decoded polar sweep for one moment (field: Z | V | CC). */
export function getSweep(station, { field = 'Z', sweep = null, maxRangeKm = 300, rangeStride = 2 } = {}) {
  return request(`/api/radar/${station}/sweep`, {
    field,
    sweep,
    max_range_km: maxRangeKm,
    range_stride: rangeStride,
  });
}

/** Storm analytics (TVS/TDS + hazards) for the latest scan. */
export function getAnalytics(station) {
  return request(`/api/analytics/${station}`);
}

/** All elevation tilts of one moment for 3D volumetric stacking. */
export function getVolume(station, { field = 'Z', maxRangeKm = 150, rangeStride = 4, azStride = 3 } = {}) {
  return request(`/api/radar/${station}/volume`, {
    field,
    max_range_km: maxRangeKm,
    range_stride: rangeStride,
    az_stride: azStride,
  });
}

/** Live NWS warning polygons (GeoJSON FeatureCollection). */
export function getAlerts(lat, lon, { radiusKm = 600, demo = false } = {}) {
  return request('/api/alerts/active', { lat, lon, radius_km: radiusKm, demo: demo || null });
}

// --- Demo scenarios (offline, synthetic datasets) ------------------------- //

export function getScenarios() {
  return request('/api/demo/scenarios');
}

export function getDemoSweep(scenario, { field = 'Z', rangeStride = 1 } = {}) {
  return request(`/api/demo/${scenario}/sweep`, { field, range_stride: rangeStride });
}

export function getDemoVolume(scenario, { field = 'Z' } = {}) {
  return request(`/api/demo/${scenario}/volume`, { field });
}

export function getDemoAnalytics(scenario) {
  return request(`/api/demo/${scenario}/analytics`);
}

export function getDemoAlerts(scenario) {
  return request(`/api/demo/${scenario}/alerts`);
}
