/**
 * Direct polar gate sampling for the inspect crosshair.
 *
 * Converts a map coordinate to the radar-relative azimuth/range and indexes
 * straight into the polar arrays — O(1), no canvas pixel reads — so it stays
 * smooth during playback. Returns the gate value, or null if outside the
 * scan / masked.
 */
const DEG2RAD = Math.PI / 180;
const METERS_PER_DEG_LAT = 111320;

export function sampleGate(sweep, center, lng, lat) {
  if (!sweep || !center) return null;
  const [rlon, rlat] = center;
  const north = (lat - rlat) * METERS_PER_DEG_LAT;
  const east = (lng - rlon) * METERS_PER_DEG_LAT * Math.cos(rlat * DEG2RAD);
  const range = Math.hypot(east, north);

  const ranges = sweep.ranges_m;
  if (!ranges || ranges.length === 0) return null;
  const spacing = ranges.length > 1 ? ranges[1] - ranges[0] : 250;
  const gi = Math.round((range - ranges[0]) / spacing);
  if (gi < 0 || gi >= ranges.length) return null;

  const naz = sweep.azimuths.length;
  let az = Math.atan2(east, north) / DEG2RAD; // CW from north
  az = (az + 360) % 360;
  const ai = Math.round(az / (360 / naz)) % naz;
  const row = sweep.data[ai];
  if (!row) return null;
  const v = row[gi];
  return v == null ? null : v;
}
