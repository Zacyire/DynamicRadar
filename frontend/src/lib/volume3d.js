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

// Per-field "is this gate worth drawing" tests. Reflectivity reaches down to
// light returns so the storm reads as a thick, cohesive cloud (not just cores).
const SIGNIFICANCE = {
  reflectivity: (v) => v >= 12, // cloud body + cores
  velocity: (v) => Math.abs(v) >= 5, // meaningful motion / couplet
  cross_correlation_ratio: (v) => v < 0.97, // depressed CC (debris / mixed)
};

// Reflectivity gates at/above this glow (60+ dBZ cores) get an additive halo.
const GLOW_DBZ = 58;

function significanceFor(field) {
  return SIGNIFICANCE[field] || (() => true);
}

/**
 * Build a dense, jittered point cloud plus a separate "glow" set for the
 * highest-reflectivity cores.
 *
 * @param {object} volume
 * @param {object} opts
 * @param {number} opts.vertExag  Vertical exaggeration.
 * @param {number} opts.density   Points emitted per gate (>1 = jittered fill).
 * @param {number} opts.jitterKm  Horizontal jitter radius for extra points.
 * @returns {{positions, colors, glow:{positions,colors}, count, topKm}}
 */
export function buildVolumeGeometry(volume, { vertExag = 4, density = 3, jitterKm = 0.45 } = {}) {
  const colorOf = colormapFor(volume.field);
  const significant = significanceFor(volume.field);
  const isReflectivity = volume.field === 'reflectivity';
  const positions = [];
  const colors = [];
  const glowPos = [];
  const glowCol = [];
  let topKm = 0;

  const emit = (x, y, z, r, g, b) => {
    positions.push(x, y, z);
    colors.push(r, g, b);
  };

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
        if (upKm > topKm) topKm = upKm;

        const cr = r / 255;
        const cg = g / 255;
        const cb = b / 255;
        emit(eastKm, upKm, northKm, cr, cg, cb);
        // Densify: scatter extra points around the gate so it reads as cloud.
        for (let d = 1; d < density; d++) {
          emit(
            eastKm + (Math.random() - 0.5) * 2 * jitterKm,
            upKm + (Math.random() - 0.5) * jitterKm * vertExag * 0.5,
            northKm + (Math.random() - 0.5) * 2 * jitterKm,
            cr,
            cg,
            cb
          );
        }

        // Glow halo for intense reflectivity cores (brightened toward white).
        if (isReflectivity && v >= GLOW_DBZ) {
          glowPos.push(eastKm, upKm, northKm);
          glowCol.push(cr + (1 - cr) * 0.5, cg + (1 - cg) * 0.5, cb + (1 - cb) * 0.5);
        }
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
    glow: { positions: new Float32Array(glowPos), colors: new Float32Array(glowCol) },
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
