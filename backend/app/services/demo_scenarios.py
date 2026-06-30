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

from datetime import datetime, timedelta, timezone

import numpy as np

from app.core.geo import destination_point

# --------------------------------------------------------------------------- #
# Playback timeline                                                            #
# --------------------------------------------------------------------------- #
# Each scenario is a *living* simulation over a 2-hour window in 5-minute steps.
# The `minute` argument (0..120) drives the storm's lifecycle, so reflectivity,
# velocity and CC all evolve together and stay perfectly in sync.

WINDOW_MIN = 120
STEP_MIN = 5
N_FRAMES = WINDOW_MIN // STEP_MIN + 1  # 25 frames (0,5,…,120)
# Simulated wall-clock start (a classic Oklahoma tornado evening).
BASE_TIME = datetime(2024, 5, 20, 16, 0, 0, tzinfo=timezone.utc)


def _smoothstep(a: float, b: float, x: float) -> float:
    """Hermite ramp 0→1 across [a, b]."""
    if a == b:
        return float(x >= b)
    t = min(max((x - a) / (b - a), 0.0), 1.0)
    return t * t * (3.0 - 2.0 * t)


def _bell(x: float, mu: float, sigma: float) -> float:
    """Gaussian bump, peak 1.0 at x == mu."""
    return float(np.exp(-(((x - mu) / sigma) ** 2)))


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


def _tornado(AZ, RNG, elev, minute=0.0):
    """A supercell lifecycle over the 2-hour window.

    * ~0 min   — heavy rain blob, rounded, no rotation.
    * ~30 min  — a sharp hook echo curls inward; rotation begins.
    * ~60 min  — PEAK: high-Z core, tight velocity couplet, debris ball (TDS).
    * ~90 min  — weakening; hook and couplet relax.
    * ~120 min — dissipated.

    Reflectivity, velocity and CC are all driven by the same lifecycle terms,
    so the wind circulation tightens exactly as the hook echo peaks.
    """
    # Storm tracks toward / past the radar over the window (NE motion).
    track = _smoothstep(0, 120, minute)
    azc = 232.0 - 14.0 * track
    rc = 62000.0 - 26000.0 * track

    # Lifecycle envelopes.
    presence = 1.0 - _smoothstep(92, 120, minute)            # dissipates by ~120
    hook_amp = _smoothstep(18, 38, minute) * (1.0 - _smoothstep(80, 112, minute))
    couplet_amp = _bell(minute, 62, 24)                      # rotation, peak @62
    tds_depth = 0.55 * min(max((minute - 48) / 12.0, 0.0), 1.0) * (1.0 - _smoothstep(72, 102, minute))
    core_peak = 50.0 + 14.0 * _bell(minute, 62, 40)          # ~50 dBZ blob → 64 dBZ core

    daz = _ang_diff(AZ, azc)

    # Reflectivity: rounded rain core + a hook that sharpens at maturity.
    core = core_peak * np.exp(-((daz / 8.0) ** 2) - ((RNG - rc) / 9000.0) ** 2)
    hook = (44.0 + 10.0 * _bell(minute, 62, 30)) * hook_amp * np.exp(
        -(((daz - (9.0 + 4.0 * hook_amp)) / 4.0) ** 2) - ((RNG - (rc - 6500.0)) / 4200.0) ** 2
    )
    Z = np.maximum(core, hook) * presence

    # Velocity couplet — tilts with height and TIGHTENS (smaller radial sigma)
    # as the circulation matures, peaking with the hook.
    shift = (elev - 0.5) * 3.0
    dazv = _ang_diff(AZ, azc + shift)
    radial = np.exp(-(((RNG - rc) / (4800.0 - 1500.0 * couplet_amp)) ** 2))
    V = couplet_amp * 34.0 * np.tanh(dazv / 1.4) * np.exp(-((dazv / 9.0) ** 2)) * radial

    # CC: healthy rain, dropping to a debris ball (TDS) only near peak intensity.
    CC = np.full_like(Z, 0.985)
    CC -= tds_depth * np.exp(-((daz / 3.5) ** 2) - ((RNG - rc) / 3800.0) ** 2)

    echo = Z >= 5.0
    Z = np.where(echo, Z, np.nan)
    V = np.where(echo, V, np.nan)
    CC = np.where(echo, CC, np.nan)
    return Z, V, CC


def _hurricane(AZ, RNG, elev, minute=0.0):
    # Eye drifts NNE and the core intensifies then eases across the window.
    track = _smoothstep(0, 120, minute)
    eye_e = 22000.0 + 8000.0 * track
    eye_n = 28000.0 + 10000.0 * track
    intensify = 0.8 + 0.35 * _bell(minute, 60, 55)

    gx = RNG * np.sin(np.radians(AZ))
    gy = RNG * np.cos(np.radians(AZ))
    dx, dy = gx - eye_e, gy - eye_n
    d = np.hypot(dx, dy) + 1.0

    spiral = np.sin(np.radians(AZ) * 2.0 + d / 7000.0 - minute / 15.0)  # bands rotate
    Z = 22.0 + 20.0 * np.clip(spiral, 0, 1) + 12.0 * np.exp(-((d - 24000.0) / 9000.0) ** 2)
    Z = Z * intensify
    Z = np.where(d < 8000.0, np.nan, Z)  # eye
    Z = np.where((Z >= 5.0) | np.isnan(Z), Z, np.nan)

    rmax, vmax = 22000.0, 46.0 * intensify
    Vt = np.where(d < rmax, vmax * d / rmax, vmax * rmax / d)
    that_x, that_y = -dy / d, dx / d
    rhat_x, rhat_y = np.sin(np.radians(AZ)), np.cos(np.radians(AZ))
    V = Vt * (that_x * rhat_x + that_y * rhat_y) * (1.0 - 0.08 * (elev - 0.5))
    V = np.where(np.isnan(Z), np.nan, V)

    CC = np.where(np.isnan(Z), np.nan, 0.985)
    return Z, V, CC


def _squall(AZ, RNG, elev, minute=0.0):
    gx = RNG * np.sin(np.radians(AZ))
    gy = RNG * np.cos(np.radians(AZ))

    # The line propagates eastward across the window and intensifies mid-life.
    advance = -30000.0 + 70000.0 * _smoothstep(0, 120, minute)
    intensify = 0.7 + 0.4 * _bell(minute, 55, 45)
    line_x = 40000.0 + advance - 0.00018 * gy**2
    dist = gx - line_x
    Z = 58.0 * intensify * np.exp(-((dist / 6000.0) ** 2))
    Z = np.where(np.abs(gy) < 90000.0, Z, np.nan)

    V = (30.0 * intensify * np.exp(-((dist + 4000.0) / 9000.0) ** 2) + 4.0)
    V = np.where(np.isnan(Z) | (Z < 5.0), np.nan, V)
    Z = np.where(Z >= 5.0, Z, np.nan)
    CC = np.where(np.isnan(Z), np.nan, 0.97)
    return Z, V, CC


def _clear(AZ, RNG, elev, minute=0.0):
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


def _scan_time(minute: float = 0.0) -> str:
    """Simulated wall-clock time for a given lifecycle minute."""
    t = BASE_TIME + timedelta(minutes=minute)
    return t.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _validate(scenario: str) -> dict:
    if scenario not in SCENARIOS:
        raise KeyError(scenario)
    return SCENARIOS[scenario]


def build_sweep(
    scenario: str,
    field: str,  # py-art field name
    elevation_deg: float = 0.5,
    *,
    minute: float = 0.0,
    naz: int = 360,
    ngates: int = 320,
    gate_m: float = 250.0,
    range_stride: int = 1,
) -> dict:
    """One synthetic polar sweep for a scenario/field at lifecycle `minute`."""
    meta = _validate(scenario)
    az, rng, AZ, RNG = _polar_grid(naz, ngates, gate_m)
    Z, V, CC = _FIELD_FUNCS[scenario](AZ, RNG, elevation_deg, minute)
    arr = {"reflectivity": Z, "velocity": V, "cross_correlation_ratio": CC}[field]
    if range_stride > 1:
        rng = rng[::range_stride]
        arr = arr[:, ::range_stride]
    return {
        "field": field,
        "long_name": _LONG_NAMES[field],
        "units": _UNITS[field],
        "scan_time": _scan_time(minute),
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
    minute: float = 0.0,
    naz: int = 180,
    ngates: int = 160,
    gate_m: float = 500.0,
) -> dict:
    """All elevation tilts for a scenario/field at lifecycle `minute` (3D)."""
    meta = _validate(scenario)
    sweeps = []
    for elev in _DEFAULT_ELEVS:
        s = build_sweep(scenario, field, elev, minute=minute, naz=naz, ngates=ngates, gate_m=gate_m)
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
        "scan_time": _scan_time(minute),
        "radar_lat": meta["lat"],
        "radar_lon": meta["lon"],
        "radar_alt_m": 380.0,
        "n_tilts": len(sweeps),
        "elevations_deg": _DEFAULT_ELEVS,
        "sweeps": sweeps,
    }


def _core_track(scenario: str, minute: float):
    """Return (lat, lon, motion_bearing_deg) of the storm core at `minute`."""
    meta = SCENARIOS[scenario]
    rlat, rlon = meta["lat"], meta["lon"]

    def core_at(m: float):
        if scenario == "tornado":
            track = _smoothstep(0, 120, m)
            az = 232.0 - 14.0 * track
            rng_km = (62000.0 - 26000.0 * track) / 1000.0
        elif scenario == "squall":
            advance = -30000.0 + 70000.0 * _smoothstep(0, 120, m)
            az, rng_km = 90.0, (40000.0 + advance) / 1000.0
        elif scenario == "hurricane":
            track = _smoothstep(0, 120, m)
            # Eye drifts NNE; convert its east/north metres to a bearing/range.
            e = 22000.0 + 8000.0 * track
            n = 28000.0 + 10000.0 * track
            az = (np.degrees(np.arctan2(e, n))) % 360.0
            rng_km = float(np.hypot(e, n)) / 1000.0
        else:
            az, rng_km = 0.0, 0.0
        return destination_point(rlat, rlon, az, rng_km)

    lat0, lon0 = core_at(minute)
    lat1, lon1 = core_at(min(minute + 6.0, 120.0))
    de = (lon1 - lon0) * np.cos(np.radians(rlat))
    dn = lat1 - lat0
    bearing = (np.degrees(np.arctan2(de, dn))) % 360.0 if (de or dn) else 45.0
    return lat0, lon0, float(bearing)


def _warning_event(scenario: str, minute: float) -> str | None:
    """Which warning (if any) is in effect at `minute` for this scenario."""
    if scenario == "tornado":
        presence = 1.0 - _smoothstep(92, 120, minute)
        if minute < 8 or presence < 0.35:
            return None
        return "Tornado Warning" if _bell(minute, 62, 24) >= 0.5 else "Severe Thunderstorm Warning"
    if scenario == "squall":
        return "Severe Thunderstorm Warning" if (0.7 + 0.4 * _bell(minute, 55, 45)) >= 0.85 else None
    if scenario == "hurricane":
        return "Flash Flood Warning"
    return None


def alert_features(scenario: str, minute: float = 0.0) -> list[dict]:
    """A single warning polygon that tracks downstream of the storm core.

    The polygon advances across the map with the storm and its type escalates
    to a (red) Tornado Warning at peak rotation, otherwise a (yellow) Severe
    Thunderstorm Warning.
    """
    if scenario == "clear":
        return []
    event = _warning_event(scenario, minute)
    if event is None:
        return []

    lat, lon, bearing = _core_track(scenario, minute)
    # A warning "box" projected ahead of the core along its motion vector.
    near = destination_point(lat, lon, bearing, 8.0)
    far = destination_point(lat, lon, bearing, 55.0)
    nl = destination_point(*near, (bearing - 90) % 360, 20.0)
    nr = destination_point(*near, (bearing + 90) % 360, 20.0)
    fl = destination_point(*far, (bearing - 90) % 360, 15.0)
    fr = destination_point(*far, (bearing + 90) % 360, 15.0)
    ring = [
        [nl[1], nl[0]], [nr[1], nr[0]], [fr[1], fr[0]], [fl[1], fl[0]], [nl[1], nl[0]],
    ]
    meta = SCENARIOS[scenario]
    return [
        {
            "type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": [ring]},
            "properties": {
                "id": f"DEMO-{scenario}-warn",
                "event": event,
                "headline": f"[DEMO] {event} — {meta['region']} (simulated, advancing)",
                "severity": "Extreme" if "Tornado" in event else "Severe",
                "certainty": "Observed",
                "urgency": "Immediate",
                "blink": True,
                "onset": None,
                "expires": None,
                "areaDesc": meta["region"],
            },
        }
    ]


def timeline_meta() -> dict:
    """Playback timeline parameters shared with the frontend."""
    return {
        "window_min": WINDOW_MIN,
        "step_min": STEP_MIN,
        "n_frames": N_FRAMES,
        "frames_min": list(range(0, WINDOW_MIN + 1, STEP_MIN)),
        "base_time": _scan_time(0),
    }


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
