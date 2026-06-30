/**
 * Client-side georeferencing of compact polar radar data.
 *
 * The backend returns each sweep as polar arrays (azimuths in degrees CW from
 * north, slant ranges in metres, and a rays×gates value grid). Here we project
 * every gate to a radar-relative east/north metric plane, paint it onto a
 * canvas with the field's colormap, and return the canvas plus the geographic
 * coordinates of its four corners. Those corners drive a Mapbox `image` source,
 * which warps the canvas into the map's Web-Mercator projection.
 *
 * At the low beam tilts used for storm analysis, slant range ≈ ground range, so
 * we treat range as ground distance. The flat metric-plane → corner-quad
 * approach is the standard radar-overlay approximation and is accurate to well
 * under a pixel across a few hundred kilometres.
 *
 * Rendering is done in two passes: gates are painted sharp onto an offscreen
 * canvas, then composited through a blur so the hard polygon edges feather into
 * smooth, flowing "weather-broadcast" contours.
 */
import { colormapFor } from './colormaps';

const DEG2RAD = Math.PI / 180;
const METERS_PER_DEG_LAT = 111320;

/** Offset a lat/lon by east/north metres (local flat-earth approximation). */
function offsetLatLon(lat, lon, eastM, northM) {
  const dLat = northM / METERS_PER_DEG_LAT;
  const dLon = eastM / (METERS_PER_DEG_LAT * Math.cos(lat * DEG2RAD));
  return [lon + dLon, lat + dLat];
}

/**
 * Render a sweep to an offscreen canvas.
 *
 * @param {object} sweep  Result of the backend /sweep endpoint.
 * @param {object} opts
 * @param {number} opts.size    Canvas edge length in pixels (default 1600).
 * @param {number} opts.smooth  Gaussian blur radius in px for contour
 *                              smoothing (default scales with size; 0 = off).
 * @returns {{canvas: HTMLCanvasElement, coordinates: number[][]}}
 *          `coordinates` is [topLeft, topRight, bottomRight, bottomLeft] as
 *          [lon, lat], ready for a Mapbox image source.
 */
export function renderSweepToCanvas(sweep, { size = 1600, smooth } = {}) {
  const { azimuths, ranges_m: ranges, data, radar_lat: lat, radar_lon: lon } = sweep;
  const colorOf = colormapFor(sweep.field);
  const blur = smooth == null ? Math.max(1.5, size / 650) : smooth;

  const gateSpacing = ranges.length > 1 ? ranges[1] - ranges[0] : 250;
  const maxR = ranges[ranges.length - 1] + gateSpacing / 2; // metres
  const azStep = azimuths.length > 1 ? 360 / azimuths.length : 1; // deg per ray

  // --- pass 1: paint gates sharp on an offscreen canvas ------------------ //
  const sharp = document.createElement('canvas');
  sharp.width = size;
  sharp.height = size;
  const sctx = sharp.getContext('2d');

  const scale = size / (2 * maxR); // metres → pixels; canvas spans ±maxR, N up
  const toPx = (eastM, northM) => [(eastM + maxR) * scale, (maxR - northM) * scale];

  // A hair of angular overlap removes seams the blur would otherwise spread.
  const pad = azStep * 0.08 * DEG2RAD;

  for (let i = 0; i < azimuths.length; i++) {
    const a0 = azimuths[i] * DEG2RAD - pad;
    const a1 = (azimuths[i] + azStep) * DEG2RAD + pad;
    const sin0 = Math.sin(a0);
    const cos0 = Math.cos(a0);
    const sin1 = Math.sin(a1);
    const cos1 = Math.cos(a1);
    const row = data[i];
    if (!row) continue;

    for (let j = 0; j < ranges.length; j++) {
      const value = row[j];
      if (value == null) continue;
      const [r, g, b, alpha] = colorOf(value);
      if (alpha === 0) continue;

      const rNear = j === 0 ? Math.max(0, ranges[0] - gateSpacing / 2) : (ranges[j - 1] + ranges[j]) / 2;
      const rFar = j === ranges.length - 1 ? ranges[j] + gateSpacing / 2 : (ranges[j] + ranges[j + 1]) / 2;

      const p1 = toPx(rNear * sin0, rNear * cos0);
      const p2 = toPx(rFar * sin0, rFar * cos0);
      const p3 = toPx(rFar * sin1, rFar * cos1);
      const p4 = toPx(rNear * sin1, rNear * cos1);

      sctx.fillStyle = `rgba(${r},${g},${b},${alpha / 255})`;
      sctx.beginPath();
      sctx.moveTo(p1[0], p1[1]);
      sctx.lineTo(p2[0], p2[1]);
      sctx.lineTo(p3[0], p3[1]);
      sctx.lineTo(p4[0], p4[1]);
      sctx.closePath();
      sctx.fill();
    }
  }

  // --- pass 2: composite through a blur for smooth contours -------------- //
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (blur > 0) ctx.filter = `blur(${blur}px)`;
  ctx.drawImage(sharp, 0, 0);
  ctx.filter = 'none';

  const coordinates = [
    offsetLatLon(lat, lon, -maxR, maxR), // top-left  (NW)
    offsetLatLon(lat, lon, maxR, maxR), // top-right (NE)
    offsetLatLon(lat, lon, maxR, -maxR), // bottom-right (SE)
    offsetLatLon(lat, lon, -maxR, -maxR), // bottom-left (SW)
  ];

  return { canvas, coordinates };
}

/** Render and return a PNG data URL + corner coordinates for an image source. */
export function renderSweepToImage(sweep, opts) {
  const { canvas, coordinates } = renderSweepToCanvas(sweep, opts);
  return { url: canvas.toDataURL('image/png'), coordinates };
}
