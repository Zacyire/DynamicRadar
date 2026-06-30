/**
 * Default WSR-88D stations for the Live NOAA Feed picker.
 *
 * Coordinates are the real radar-site locations (used for the initial camera
 * fly-to and live NWS alert centering). The backend returns the authoritative
 * radar lat/lon with each decoded sweep, so these only need to be close.
 */
export const LIVE_STATIONS = [
  { icao: 'KTBW', name: 'Tampa Bay, FL', lat: 27.7056, lon: -82.4017, zoom: 8 },
  { icao: 'KTLX', name: 'Oklahoma City, OK', lat: 35.3331, lon: -97.2778, zoom: 8 },
  { icao: 'KOKX', name: 'New York / Long Island, NY', lat: 40.8656, lon: -72.8639, zoom: 8 },
  { icao: 'KHGX', name: 'Houston, TX', lat: 29.4719, lon: -95.0792, zoom: 8 },
];

export function findStation(icao) {
  return LIVE_STATIONS.find((s) => s.icao === icao) || null;
}
