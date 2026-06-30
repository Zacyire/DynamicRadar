"""Synthetic, pre-cached demo radar scenarios.

Live NEXRAD access is blocked on many networks, so these generators produce
deterministic, physically-plausible polar fields (reflectivity, velocity,
correlation coefficient) for a handful of named scenarios — a tornadic
supercell, a hurricane, a squall-line/derecho, and clear air.

The output dicts match :func:`app.services.radar_decode.extract_sweep`, so the
*same* analytics engine, 2D georeferencing and 3D stacking run unchanged. No
network, no Py-ART, pure numpy.
"""

from __future__ import annotations

from datetime import datetime, timezone

import numpy as np

# --------------------------------------------------------------------------- #
# Scenario catalogue                                                           #
# --------------------------------------------------------------------------- #

SCENARIOS: dict[str, dict] = {
    "tornado": {
        "label": "Tornadic Supercell — Central Oklahoma",
        "region": "Oklahoma City · Moore · Norman",
        "lat": 35.22,
        "lon": -97.44,
        "zoom": 8,
        "station": "KTLX (sim)",
        "description": "Classic supercell: hook echo, a strong TVS velocity couplet, "
        "and a debris ball (low CC, high Z) confirming a TDS. Large hail core.",
        "alerts": ["Tornado Warning", "Severe Thunderstorm Warning"],
    },
    "hurricane": {
        "label": "Hurricane — Florida Gulf Coast",
        "region": "Tampa Bay · Gulf of Mexico",
        "lat": 27.70,
        "lon": -82.40,
        "zoom": 7,
        "station": "KTBW (sim)",
        "description": "Eye, eyewall and spiral rainbands with broad cyclonic "
        "rotation and tropical-downpour reflectivity.",
        "alerts": ["Flash Flood Warning", "Severe Thunderstorm Warning"],
    },
    "squall": {
        "label": "Squall Line / Derecho — Midwest",
        "region": "Chicago · Midwest",
        "lat": 41.60,
        "lon": -88.08,
        "zoom": 7,
        "station": "KLOT (sim)",
        "description": "Bow-echo line with intense reflectivity and damaging "
        "straight-line (divergent) winds.",
        "alerts": ["Severe Thunderstorm Warning"],
    },
    "clear": {
        "label": "Clear Air — Quiet Baseline",
        "region": "Central Oklahoma",
        "lat": 35.33,
        "lon": -97.28,
        "zoom": 8,
        "station": "KTLX (sim)",
        "description": "No significant weather — a baseline with no detections.",
        "alerts": [],
    },
}

NYQUIST = 40.0  # synthetic data is unaliased; report a high Nyquist

_LONG_NAMES = {
    "reflectivity": "Base Reflectivity",
    "velocity": "Base Velocity",
    "cross_correlation_ratio": "Correlation Coefficient",
}
_UNITS = {
    "reflectivity": "dBZ",
    "velocity": "m/s",
    "cross_correlation_ratio": "ratio",
}
_DEFAULT_ELEVS = [0.5, 0.9, 1.3, 1.8, 2.4, 3.1, 4.0]


# --------------------------------------------------------------------------- #
# Field generators — each returns (Z, V, CC) arrays of shape (naz, ngates).    #
# np.nan marks "no echo / no data".                                            #
# --------------------------------------------------------------------------- #

def _polar_grid(naz: int, ngates: int, gate_m: float):
    az = np.arange(naz) * (360.0 / naz)
    rng = (np.arange(ngates) + 0.5) * gate_m
    AZ, RNG = np.meshgrid(az, rng, indexing="ij")
    return az, rng, AZ, RNG


def _ang_diff(az_grid, center):
    """Signed smallest azimuth difference (deg) in [-180, 180]."""
    return (az_grid - center + 180.0) % 360.0 - 180.0


def _tornado(AZ, RNG, elev):
    azc, rc = 225.0, 45000.0
    daz = _ang_diff(AZ, azc)

    # Reflectivity: rounded core + a hooked appendage on the rear flank.
    core = 62.0 * np.exp(-((daz / 8.0) ** 2) - ((RNG - rc) / 9000.0) ** 2)
    hook = 48.0 * np.exp(-(((daz - 13.0) / 4.0) ** 2) - ((RNG - (rc - 6500.0)) / 4000.0) ** 2)
    Z = np.maximum(core, hook)

    # Velocity couplet at the mesocyclone — tilts with height (storm-relative).
    shift = (elev - 0.5) * 3.0
    dazv = _ang_diff(AZ, azc + shift)
    radial = np.exp(-(((RNG - rc) / 5000.0) ** 2))
    V = 33.0 * np.tanh(dazv / 1.5) * np.exp(-((dazv / 9.0) ** 2)) * radial

    # CC: healthy rain, with a debris ball (low CC) at the couplet.
    CC = np.full_like(Z, 0.985)
    CC -= 0.52 * np.exp(-((daz / 4.0) ** 2) - ((RNG - rc) / 4000.0) ** 2)

    # Mask to the precipitation footprint.
    echo = Z >= 5.0
    Z = np.where(echo, Z, np.nan)
    V = np.where(echo, V, np.nan)
    CC = np.where(echo, CC, np.nan)
    return Z, V, CC


def _hurricane(AZ, RNG, elev):
    # Eye ~35 km north-east of the radar.
    eye_e, eye_n = 22000.0, 28000.0
    gx = RNG * np.sin(np.radians(AZ))
    gy = RNG * np.cos(np.radians(AZ))
    dx, dy = gx - eye_e, gy - eye_n
    d = np.hypot(dx, dy) + 1.0

    # Spiral-band reflectivity; suppressed in the calm eye.
    spiral = np.sin(np.radians(AZ) * 2.0 + d / 7000.0)
    Z = 22.0 + 20.0 * np.clip(spiral, 0, 1) + 12.0 * np.exp(-((d - 24000.0) / 9000.0) ** 2)
    Z = np.where(d < 8000.0, np.nan, Z)  # eye
    Z = np.where((Z >= 5.0) | np.isnan(Z), Z, np.nan)

    # Cyclonic tangential wind (Rankine vortex) projected onto the radar radial.
    rmax, vmax = 22000.0, 46.0
    Vt = np.where(d < rmax, vmax * d / rmax, vmax * rmax / d)
    that_x, that_y = -dy / d, dx / d            # counter-clockwise tangent
    rhat_x, rhat_y = np.sin(np.radians(AZ)), np.cos(np.radians(AZ))
    V = Vt * (that_x * rhat_x + that_y * rhat_y) * (1.0 - 0.08 * (elev - 0.5))
    V = np.where(np.isnan(Z), np.nan, V)

    CC = np.where(np.isnan(Z), np.nan, 0.985)   # uniform tropical rain
    return Z, V, CC


def _squall(AZ, RNG, elev):
    gx = RNG * np.sin(np.radians(AZ))
    gy = RNG * np.cos(np.radians(AZ))

    # A north-south line that bows eastward, ~40 km east of the radar.
    line_x = 40000.0 - 0.00018 * gy**2          # bow (convex east)
    dist = gx - line_x
    Z = 58.0 * np.exp(-((dist / 6000.0) ** 2))
    Z = np.where(np.abs(gy) < 90000.0, Z, np.nan)

    # Strong outbound (eastward) flow behind the line → radial divergence.
    V = 30.0 * np.exp(-((dist + 4000.0) / 9000.0) ** 2) + 4.0
    V = np.where(np.isnan(Z) | (Z < 5.0), np.nan, V)
    Z = np.where(Z >= 5.0, Z, np.nan)
    CC = np.where(np.isnan(Z), np.nan, 0.97)
    return Z, V, CC


def _clear(AZ, RNG, elev):
    nan = np.full(AZ.shape, np.nan)
    return nan, nan.copy(), nan.copy()


_FIELD_FUNCS = {
    "tornado": _tornado,
    "hurricane": _hurricane,
    "squall": _squall,
    "clear": _clear,
}


# --------------------------------------------------------------------------- #
# Assembly into sweep / volume dicts                                           #
# --------------------------------------------------------------------------- #

def _rows(arr: np.ndarray) -> list[list[float | None]]:
    rounded = np.where(np.isfinite(arr), np.round(arr, 1), np.nan)
    return [[None if np.isnan(v) else float(v) for v in row] for row in rounded]


def _scan_time() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _validate(scenario: str) -> dict:
    if scenario not in SCENARIOS:
        raise KeyError(scenario)
    return SCENARIOS[scenario]


def build_sweep(
    scenario: str,
    field: str,  # py-art field name
    elevation_deg: float = 0.5,
    *,
    naz: int = 360,
    ngates: int = 320,
    gate_m: float = 250.0,
    range_stride: int = 1,
) -> dict:
    """One synthetic polar sweep for a scenario/field (extract_sweep-shaped)."""
    meta = _validate(scenario)
    az, rng, AZ, RNG = _polar_grid(naz, ngates, gate_m)
    Z, V, CC = _FIELD_FUNCS[scenario](AZ, RNG, elevation_deg)
    arr = {"reflectivity": Z, "velocity": V, "cross_correlation_ratio": CC}[field]
    if range_stride > 1:
        rng = rng[::range_stride]
        arr = arr[:, ::range_stride]
    return {
        "field": field,
        "long_name": _LONG_NAMES[field],
        "units": _UNITS[field],
        "scan_time": _scan_time(),
        "sweep": 0,
        "elevation_deg": elevation_deg,
        "radar_lat": meta["lat"],
        "radar_lon": meta["lon"],
        "radar_alt_m": 380.0,
        "nyquist_velocity": NYQUIST,
        "azimuths": [round(float(a), 2) for a in az],
        "ranges_m": [float(r) for r in rng],
        "range_stride": range_stride,
        "data": _rows(arr),
    }


def build_volume(
    scenario: str,
    field: str,
    *,
    naz: int = 180,
    ngates: int = 160,
    gate_m: float = 500.0,
) -> dict:
    """All elevation tilts for a scenario/field, for 3D stacking."""
    meta = _validate(scenario)
    sweeps = []
    for elev in _DEFAULT_ELEVS:
        s = build_sweep(scenario, field, elev, naz=naz, ngates=ngates, gate_m=gate_m)
        sweeps.append(
            {
                "elevation_deg": elev,
                "nyquist_velocity": NYQUIST,
                "azimuths": s["azimuths"],
                "ranges_m": s["ranges_m"],
                "data": s["data"],
            }
        )
    return {
        "station": meta["station"],
        "field": field,
        "long_name": _LONG_NAMES[field],
        "units": _UNITS[field],
        "scan_time": _scan_time(),
        "radar_lat": meta["lat"],
        "radar_lon": meta["lon"],
        "radar_alt_m": 380.0,
        "n_tilts": len(sweeps),
        "elevations_deg": _DEFAULT_ELEVS,
        "sweeps": sweeps,
    }


def alert_features(scenario: str) -> list[dict]:
    """Scenario-appropriate, clearly-labelled demo warning polygons."""
    meta = _validate(scenario)
    lat, lon = meta["lat"], meta["lon"]
    offsets = [(0.45, 0.5), (-0.4, 0.25), (0.15, -0.55)]
    feats = []
    for i, event in enumerate(meta["alerts"]):
        dlat, dlon = offsets[i % len(offsets)]
        cy, cx = lat + dlat, lon + dlon
        w, h = 0.4, 0.32
        feats.append(
            {
                "type": "Feature",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[
                        [cx - w, cy - h], [cx + w, cy - h],
                        [cx + w, cy + h], [cx - w, cy + h], [cx - w, cy - h],
                    ]],
                },
                "properties": {
                    "id": f"DEMO-{scenario}-{i}",
                    "event": event,
                    "headline": f"[DEMO] {event} — {meta['region']} (simulated)",
                    "severity": "Severe" if "Tornado" in event else "Moderate",
                    "certainty": "Observed",
                    "urgency": "Immediate",
                    "onset": None,
                    "expires": None,
                    "areaDesc": meta["region"],
                },
            }
        )
    return feats


def scenario_list() -> list[dict]:
    """Catalogue metadata for the scenario picker / search."""
    return [
        {
            "id": key,
            "label": s["label"],
            "region": s["region"],
            "description": s["description"],
            "lat": s["lat"],
            "lon": s["lon"],
            "zoom": s["zoom"],
            "station": s["station"],
        }
        for key, s in SCENARIOS.items()
    ]
