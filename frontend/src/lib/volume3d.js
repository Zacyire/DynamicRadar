/**
 * Build a 3D point cloud from stacked elevation sweeps.
 *
 * Each gate is placed in a radar-centred scene (radar at the origin) using the
 * standard 4/3-earth-radius beam-propagation model: a gate at slant range r and
 * elevation θ sits at height h above the radar and ground range s. Stacking all
 * tilts reproduces the storm's vertical structure — the reflectivity core, or
 * the way a velocity couplet tilts with height.
 *
 * Scene units are kilometres. The vertical axis is exaggerated (storms are
 * ~15 km tall but ~150 km wide) so structure is legible when orbiting.
 */
import { colormapFor } from './colormaps';

const DEG2RAD = Math.PI / 180;
const EARTH_RADIUS_M = 6371000;
const R_EFF = EARTH_RADIUS_M * (4 / 3); // effective radius for standard refraction

/** Beam height above the radar (metres) for a slant range and elevation angle. */
export function beamHeight(rangeM, elevDeg) {
  const el = elevDeg * DEG2RAD;
  return Math.sqrt(rangeM ** 2 + R_EFF ** 2 + 2 * rangeM * R_EFF * Math.sin(el)) - R_EFF;
}

/** Ground range (metres) projected to the surface for a slant range/elevation. */
export function groundRange(rangeM, elevDeg) {
  const el = elevDeg * DEG2RAD;
  const h = beamHeight(rangeM, elevDeg);
  return R_EFF * Math.asin((rangeM * Math.cos(el)) / (R_EFF + h));
}

// Per-field "is this gate worth drawing" tests (keeps the cloud meaningful).
const SIGNIFICANCE = {
  reflectivity: (v) => v >= 20, // precipitation and cores
  velocity: (v) => Math.abs(v) >= 6, // meaningful motion / couplet
  cross_correlation_ratio: (v) => v < 0.95, // depressed CC (debris / mixed)
};

function significanceFor(field) {
  return SIGNIFICANCE[field] || (() => true);
}

/**
 * @returns {{positions: Float32Array, colors: Float32Array, count: number,
 *            topKm: number}}  Buffers for a THREE.Points geometry.
 */
export function buildVolumeGeometry(volume, { vertExag = 4 } = {}) {
  const colorOf = colormapFor(volume.field);
  const significant = significanceFor(volume.field);
  const positions = [];
  const colors = [];
  let topKm = 0;

  for (const sweep of volume.sweeps) {
    const el = sweep.elevation_deg;
    const { azimuths, ranges_m: ranges, data } = sweep;
    for (let i = 0; i < azimuths.length; i++) {
      const a = azimuths[i] * DEG2RAD;
      const sinA = Math.sin(a);
      const cosA = Math.cos(a);
      const row = data[i];
      if (!row) continue;
      for (let j = 0; j < ranges.length; j++) {
        const v = row[j];
        if (v == null || !significant(v)) continue;
        const [r, g, b, alpha] = colorOf(v);
        if (alpha === 0) continue;
        const h = beamHeight(ranges[j], el);
        const gr = groundRange(ranges[j], el);
        const eastKm = (gr * sinA) / 1000;
        const northKm = (gr * cosA) / 1000;
        const upKm = (h / 1000) * vertExag;
        positions.push(eastKm, upKm, northKm); // three.js: Y up
        colors.push(r / 255, g / 255, b / 255);
        if (upKm > topKm) topKm = upKm;
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
    count: positions.length / 3,
    topKm,
  };
}

/** Scene-space (east, north) km for a radar-relative azimuth/range detection. */
export function detectionScenePosition(signature) {
  const a = signature.azimuth_deg * DEG2RAD;
  const gr = groundRange(signature.range_km * 1000, signature.elevation_deg) / 1000;
  return { eastKm: gr * Math.sin(a), northKm: gr * Math.cos(a) };
}
