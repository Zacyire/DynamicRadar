"""Decode NEXRAD Level II volume scans with Py-ART.

Exposes helpers to read a downloaded ``*_V06`` file into a Py-ART ``Radar``
object and extract per-sweep polar data for the three primary moments:

* **Reflectivity (Z)**  – ``reflectivity``           [dBZ]
* **Velocity (V)**      – ``velocity``               [m/s]
* **Correlation Coefficient (CC / rho-HV)** – ``cross_correlation_ratio`` [unitless]

Parsing a volume scan is relatively expensive, so parsed ``Radar`` objects are
cached in-process keyed by the local file path.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path

import numpy as np
import pyart  # type: ignore

logger = logging.getLogger(__name__)

# Public field aliases -> Py-ART NEXRAD field names.
FIELD_ALIASES: dict[str, str] = {
    "reflectivity": "reflectivity",
    "z": "reflectivity",
    "velocity": "velocity",
    "v": "velocity",
    "cross_correlation_ratio": "cross_correlation_ratio",
    "cc": "cross_correlation_ratio",
    "rhohv": "cross_correlation_ratio",
}

# Friendly metadata fallbacks when the file omits them.
_LONG_NAMES = {
    "reflectivity": "Base Reflectivity",
    "velocity": "Base Velocity",
    "cross_correlation_ratio": "Correlation Coefficient",
}
_DEFAULT_UNITS = {
    "reflectivity": "dBZ",
    "velocity": "m/s",
    "cross_correlation_ratio": "unitless",
}


def resolve_field(name: str) -> str:
    """Map a public alias (e.g. ``"Z"``) to a Py-ART field name."""
    key = name.strip().lower()
    if key not in FIELD_ALIASES:
        raise KeyError(
            f"Unknown field {name!r}. Valid: {sorted(set(FIELD_ALIASES))}"
        )
    return FIELD_ALIASES[key]


@lru_cache(maxsize=4)
def read_radar(path: str) -> "pyart.core.Radar":
    """Read a NEXRAD Level II archive file into a Py-ART Radar (cached)."""
    logger.info("decoding NEXRAD archive %s", path)
    return pyart.io.read_nexrad_archive(path)


def ensure_dealiased_velocity(radar) -> str:
    """Add a region-based dealiased velocity field and return its field name.

    NEXRAD base velocity is aliased at the Nyquist co-interval (±~26 m/s); raw
    gate-to-gate folds masquerade as velocity couplets. Region-based dealiasing
    unfolds them so TVS detection sees true shear. On failure (or if already
    present) the function degrades gracefully to the raw ``velocity`` field.
    """
    if "velocity" not in radar.fields:
        return "velocity"
    if "corrected_velocity" in radar.fields:
        return "corrected_velocity"
    try:
        corrected = pyart.correct.dealias_region_based(radar, vel_field="velocity")
        radar.add_field("corrected_velocity", corrected, replace_existing=True)
        return "corrected_velocity"
    except Exception as exc:  # noqa: BLE001 - dealiasing is best-effort
        logger.warning("velocity dealiasing failed (%s); using raw velocity", exc)
        return "velocity"


def _sweep_has_field(radar, field: str, sweep: int) -> bool:
    """True if the field exists and has at least one unmasked gate in the sweep."""
    if field not in radar.fields:
        return False
    sl = radar.get_slice(sweep)
    data = radar.fields[field]["data"][sl]
    return bool(np.ma.count(data) > 0)


def scan_time_iso(radar) -> str:
    """Volume-scan start time as an ISO-8601 UTC string."""
    times = radar.time
    base = times["units"].replace("seconds since ", "")
    start = np.datetime64(base) + np.timedelta64(
        int(round(float(times["data"][0]) * 1000)), "ms"
    )
    return np.datetime_as_string(start, unit="s") + "Z"


def summarize(radar) -> dict:
    """Build a VolumeMeta-shaped summary dict for a parsed radar volume."""
    nsweeps = int(radar.nsweeps)
    fixed = radar.fixed_angle["data"]
    available = sorted(radar.fields.keys())

    sweeps = []
    for s in range(nsweeps):
        present = [f for f in available if _sweep_has_field(radar, f, s)]
        sl = radar.get_slice(s)
        sweeps.append(
            {
                "sweep": s,
                "elevation_deg": round(float(fixed[s]), 2),
                "nrays": int(sl.stop - sl.start),
                "fields": present,
            }
        )

    return {
        "scan_time": scan_time_iso(radar),
        "radar_lat": float(radar.latitude["data"][0]),
        "radar_lon": float(radar.longitude["data"][0]),
        "radar_alt_m": float(radar.altitude["data"][0]),
        "nsweeps": nsweeps,
        "elevations_deg": [round(float(a), 2) for a in fixed],
        "available_fields": available,
        "sweeps": sweeps,
    }


def lowest_sweep_with_field(radar, field: str) -> int:
    """Index of the lowest-elevation sweep containing valid data for ``field``.

    NEXRAD low-level "split cuts" carry reflectivity and velocity in separate
    sweeps, so the lowest sweep with valid Z is not always the one with valid V.
    """
    order = np.argsort(radar.fixed_angle["data"])
    for s in order:
        if _sweep_has_field(radar, field, int(s)):
            return int(s)
    raise ValueError(f"No sweep contains valid data for field {field!r}")


def _nyquist(radar, sweep: int) -> float | None:
    inst = radar.instrument_parameters or {}
    nyq = inst.get("nyquist_velocity")
    if nyq is None:
        return None
    sl = radar.get_slice(sweep)
    return round(float(np.ma.median(nyq["data"][sl])), 2)


def extract_sweep(
    radar,
    field: str,
    sweep: int | None = None,
    *,
    max_range_km: float | None = 300.0,
    range_stride: int = 1,
    decimals: int = 1,
) -> dict:
    """Extract one field/sweep as JSON-serializable polar data.

    Parameters
    ----------
    field
        Py-ART field name (use :func:`resolve_field` for aliases).
    sweep
        Sweep index. If ``None``, the lowest sweep with valid data is chosen.
    max_range_km
        Drop gates beyond this slant range (``None`` keeps all).
    range_stride
        Keep every Nth range gate to bound payload size.
    decimals
        Round data values to this many decimals.
    """
    if field not in radar.fields:
        raise KeyError(f"Field {field!r} not present in this volume")
    if sweep is None:
        sweep = lowest_sweep_with_field(radar, field)
    elif not _sweep_has_field(radar, field, sweep):
        raise ValueError(f"Sweep {sweep} has no valid {field!r} data")

    sl = radar.get_slice(sweep)
    azimuths = radar.azimuth["data"][sl]
    ranges = radar.range["data"]
    data = radar.fields[field]["data"][sl]

    # Range gating.
    gate_mask = np.ones(ranges.shape[0], dtype=bool)
    if max_range_km is not None:
        gate_mask &= ranges <= max_range_km * 1000.0
    if range_stride > 1:
        stride_mask = np.zeros_like(gate_mask)
        stride_mask[::range_stride] = True
        gate_mask &= stride_mask

    ranges = ranges[gate_mask]
    data = data[:, gate_mask]

    # Masked / non-finite -> None, rounded.
    filled = np.ma.filled(data.astype(float), np.nan)
    filled = np.round(filled, decimals)
    rows: list[list[float | None]] = [
        [None if np.isnan(v) else float(v) for v in row] for row in filled
    ]

    field_meta = radar.fields[field]
    return {
        "field": field,
        "long_name": field_meta.get("long_name", _LONG_NAMES.get(field, field)),
        "units": field_meta.get("units", _DEFAULT_UNITS.get(field, "")),
        "scan_time": scan_time_iso(radar),
        "sweep": sweep,
        "elevation_deg": round(float(radar.fixed_angle["data"][sweep]), 2),
        "radar_lat": float(radar.latitude["data"][0]),
        "radar_lon": float(radar.longitude["data"][0]),
        "radar_alt_m": float(radar.altitude["data"][0]),
        "nyquist_velocity": _nyquist(radar, sweep),
        "azimuths": [round(float(a), 2) for a in azimuths],
        "ranges_m": [float(r) for r in ranges],
        "range_stride": range_stride,
        "data": rows,
    }
