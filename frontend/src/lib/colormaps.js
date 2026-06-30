/**
 * Color scales for the three radar moments. Each returns an [r, g, b, a] tuple
 * (0-255). Values outside the meaningful range return alpha 0 (transparent).
 */

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Interpolate within an ordered list of [value, [r,g,b]] stops. */
function rampColor(value, stops) {
  if (value <= stops[0][0]) return [...stops[0][1], 255];
  const last = stops[stops.length - 1];
  if (value >= last[0]) return [...last[1], 255];
  for (let i = 0; i < stops.length - 1; i++) {
    const [v0, c0] = stops[i];
    const [v1, c1] = stops[i + 1];
    if (value >= v0 && value <= v1) {
      const t = (value - v0) / (v1 - v0);
      return [
        Math.round(lerp(c0[0], c1[0], t)),
        Math.round(lerp(c0[1], c1[1], t)),
        Math.round(lerp(c0[2], c1[2], t)),
        255,
      ];
    }
  }
  return [0, 0, 0, 0];
}

// NWS-style reflectivity scale (dBZ). Light returns below ~5 dBZ are dropped.
const REFLECTIVITY_STOPS = [
  [5, [4, 233, 231]],
  [10, [1, 159, 244]],
  [15, [3, 0, 244]],
  [20, [2, 253, 2]],
  [25, [1, 197, 1]],
  [30, [0, 142, 0]],
  [35, [253, 248, 2]],
  [40, [229, 188, 0]],
  [45, [253, 149, 0]],
  [50, [253, 0, 0]],
  [55, [212, 0, 0]],
  [60, [188, 0, 0]],
  [65, [248, 0, 253]],
  [70, [152, 84, 198]],
  [75, [255, 255, 255]],
];

export function reflectivityColor(dbz) {
  if (dbz == null || dbz < 5) return [0, 0, 0, 0];
  return rampColor(dbz, REFLECTIVITY_STOPS);
}

// Base velocity scale (m/s): green = inbound (toward radar, negative),
// red = outbound (away, positive), near-zero is muted.
export function velocityColor(ms) {
  if (ms == null) return [0, 0, 0, 0];
  const max = 35;
  const v = Math.max(-max, Math.min(max, ms));
  if (Math.abs(v) < 1) return [120, 120, 120, 200];
  if (v < 0) {
    const t = -v / max; // 0..1 inbound
    return [Math.round(lerp(120, 0, t)), Math.round(lerp(200, 255, t)), Math.round(lerp(120, 0, t)), 255];
  }
  const t = v / max; // 0..1 outbound
  return [Math.round(lerp(200, 255, t)), Math.round(lerp(120, 0, t)), Math.round(lerp(120, 0, t)), 255];
}

// Correlation coefficient (0-1): low CC (debris/non-meteo) highlighted.
const CC_STOPS = [
  [0.2, [40, 0, 60]],
  [0.45, [120, 0, 160]],
  [0.7, [220, 40, 40]],
  [0.85, [240, 200, 40]],
  [0.95, [60, 200, 60]],
  [1.0, [230, 230, 230]],
];

export function ccColor(v) {
  if (v == null || v < 0.2) return [0, 0, 0, 0];
  return rampColor(Math.min(v, 1.0), CC_STOPS);
}

export const COLORMAPS = {
  reflectivity: reflectivityColor,
  velocity: velocityColor,
  cross_correlation_ratio: ccColor,
};

/** Resolve a field alias (Z/V/CC or full name) to its colormap function. */
export function colormapFor(field) {
  const key = (field || '').toLowerCase();
  if (key === 'z' || key === 'reflectivity') return reflectivityColor;
  if (key === 'v' || key === 'velocity') return velocityColor;
  if (key === 'cc' || key === 'rhohv' || key === 'cross_correlation_ratio') return ccColor;
  return reflectivityColor;
}
