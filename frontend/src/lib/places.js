/**
 * Searchable place catalogue for the map search bar.
 *
 * Live geocoding (Mapbox/NWS) is unavailable on egress-blocked networks, so we
 * ship a curated catalogue: typing a city or region pans the camera there and
 * swaps in the matching pre-cached demo scenario. Every place sits within radar
 * range of its scenario's simulated station so the storm stays framed.
 */

export const PLACES = [
  // --- Tornadic supercell (Central Oklahoma · KTLX sim) ---
  { name: 'Oklahoma City, OK', aliases: ['okc'], lat: 35.47, lon: -97.51, zoom: 9, scenario: 'tornado' },
  { name: 'Moore, OK', aliases: [], lat: 35.34, lon: -97.49, zoom: 9, scenario: 'tornado' },
  { name: 'Norman, OK', aliases: [], lat: 35.22, lon: -97.44, zoom: 9, scenario: 'tornado' },
  { name: 'Edmond, OK', aliases: [], lat: 35.65, lon: -97.48, zoom: 9, scenario: 'tornado' },
  { name: 'Tornado Alley', aliases: ['tornado', 'supercell', 'mesocyclone', 'tvs', 'tds'], lat: 35.22, lon: -97.44, zoom: 8, scenario: 'tornado' },

  // --- Hurricane (Florida Gulf Coast · KTBW sim) ---
  { name: 'Tampa, FL', aliases: ['tampa bay'], lat: 27.95, lon: -82.46, zoom: 8, scenario: 'hurricane' },
  { name: 'St. Petersburg, FL', aliases: ['st pete'], lat: 27.77, lon: -82.64, zoom: 8, scenario: 'hurricane' },
  { name: 'Clearwater, FL', aliases: [], lat: 27.97, lon: -82.8, zoom: 8, scenario: 'hurricane' },
  { name: 'Sarasota, FL', aliases: [], lat: 27.34, lon: -82.53, zoom: 8, scenario: 'hurricane' },
  { name: 'Gulf Coast (Hurricane)', aliases: ['hurricane', 'gulf', 'florida', 'eyewall', 'tropical'], lat: 27.7, lon: -82.4, zoom: 7, scenario: 'hurricane' },

  // --- Squall line / derecho (Midwest · KLOT sim) ---
  { name: 'Chicago, IL', aliases: [], lat: 41.88, lon: -87.63, zoom: 8, scenario: 'squall' },
  { name: 'Joliet, IL', aliases: [], lat: 41.52, lon: -88.08, zoom: 8, scenario: 'squall' },
  { name: 'Naperville, IL', aliases: [], lat: 41.78, lon: -88.15, zoom: 8, scenario: 'squall' },
  { name: 'Midwest (Derecho)', aliases: ['squall', 'derecho', 'midwest', 'bow echo', 'straight line wind'], lat: 41.6, lon: -88.08, zoom: 7, scenario: 'squall' },

  // --- Clear air baseline ---
  { name: 'Clear Air (Quiet)', aliases: ['clear', 'quiet', 'calm', 'baseline'], lat: 35.33, lon: -97.28, zoom: 8, scenario: 'clear' },
];

/** Rank-ordered place matches for a query (prefix matches first). */
export function searchPlaces(query, limit = 6) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored = [];
  for (const p of PLACES) {
    const hay = [p.name.toLowerCase(), ...p.aliases.map((a) => a.toLowerCase())];
    let score = -1;
    for (const h of hay) {
      if (h === q) score = Math.max(score, 3);
      else if (h.startsWith(q)) score = Math.max(score, 2);
      else if (h.includes(q)) score = Math.max(score, 1);
    }
    if (score >= 0) scored.push({ place: p, score });
  }
  scored.sort((a, b) => b.score - a.score || a.place.name.localeCompare(b.place.name));
  return scored.slice(0, limit).map((s) => s.place);
}
