"""Storm analytics engine.

Operates purely on the polar gate data produced by
:func:`app.services.radar_decode.extract_sweep` (numpy only — no Py-ART
dependency), so it is fully unit-testable with synthetic fields.

Capabilities
------------
* **TVS detection** — gate-to-gate *azimuthal* velocity shear couplets
  (inbound adjacent to outbound at the same range).
* **TDS cross-reference** — confirms a couplet as a Tornadic Debris Signature
  when correlation coefficient drops sharply while reflectivity stays high.
* **Physical attributes** — circulation diameter from gate geometry and
  rotational / estimated peak wind from the velocity differential.
* **Hazard classification** — heuristics for hail, snow (winter precip) and
  damaging straight-line (divergent / downburst) winds.

All thresholds are module constants and overridable via function kwargs.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from math import atan2, cos, degrees, radians, sin

import numpy as np

from app.core.geo import destination_point

# --------------------------------------------------------------------------- #
# Tunable thresholds                                                           #
# --------------------------------------------------------------------------- #

# TVS / velocity couplet
TVS_MIN_DELTA_V = 20.0      # m/s gate-to-gate ΔV to register a couplet
TVS_AZ_WINDOW = 6           # rays spanned when searching for a couplet (~3°)
TVS_MIN_RANGE_KM = 5.0      # ignore near-field clutter / cone of silence edge
TVS_MAX_RANGE_KM = 160.0    # beyond this the beam is too broad / high to trust
NMS_AZ_DEG = 3.0            # non-max suppression: merge couplets within this az
NMS_RANGE_KM = 3.0          # ... and this range

# A couplet is only a meaningful circulation if it sits inside precipitation.
TVS_MIN_REFLECTIVITY = 20.0  # dBZ required at the couplet (rejects clear-air noise)

# TDS (debris) cross-reference
TDS_CC_MAX = 0.80           # correlation coefficient below this = non-meteo debris
TDS_Z_MIN = 35.0            # reflectivity must stay elevated

# Hail (reflectivity / dual-pol heuristic)
HAIL_Z_SMALL = 50.0
HAIL_Z_LARGE = 60.0
HAIL_CC_MAX = 0.95          # depressed CC in a high-Z core suggests hail/mix

# Snow / winter precip heuristic
SNOW_CC_MIN = 0.97
SNOW_Z_MAX = 45.0
SNOW_ECHO_MIN_DBZ = 5.0

# Damaging straight-line / downburst winds
WIND_STRONG_MS = 25.0
WIND_DAMAGING_MS = 30.0
WIND_DIV_MIN_MS = 25.0      # radial (along-beam) divergence ΔV for a downburst
WIND_MIN_REFLECTIVITY = 20.0  # only trust velocity where there is precipitation

MS_TO_MPH = 2.2369362921
MS_TO_KT = 1.9438444924


# --------------------------------------------------------------------------- #
# Polar field container                                                        #
# --------------------------------------------------------------------------- #

@dataclass
class PolarField:
    """A single moment as a masked polar array plus its geometry."""

    field: str
    azimuths: np.ndarray          # (nrays,) degrees CW from N
    ranges_m: np.ndarray          # (ngates,)
    data: np.ma.MaskedArray       # (nrays, ngates)
    elevation_deg: float
    radar_lat: float
    radar_lon: float

    @classmethod
    def from_sweep(cls, sweep: dict) -> "PolarField":
        """Build from an :func:`extract_sweep` result dict."""
        raw = np.array(
            [[np.nan if v is None else v for v in row] for row in sweep["data"]],
            dtype=float,
        )
        return cls(
            field=sweep["field"],
            azimuths=np.asarray(sweep["azimuths"], dtype=float),
            ranges_m=np.asarray(sweep["ranges_m"], dtype=float),
            data=np.ma.masked_invalid(raw),
            elevation_deg=float(sweep["elevation_deg"]),
            radar_lat=float(sweep["radar_lat"]),
            radar_lon=float(sweep["radar_lon"]),
        )

    @property
    def az_res_rad(self) -> float:
        """Azimuthal sample spacing in radians (consecutive rays are adjacent)."""
        n = len(self.azimuths)
        return radians(360.0 / n) if n else 0.0

    def sample(self, az_deg: float, range_m: float) -> float | None:
        """Nearest-gate value at a target azimuth/range, or None if masked/empty."""
        if self.data.size == 0:
            return None
        d_az = np.abs((self.azimuths - az_deg + 180.0) % 360.0 - 180.0)
        i = int(np.argmin(d_az))
        j = int(np.argmin(np.abs(self.ranges_m - range_m)))
        val = self.data[i, j]
        return None if val is np.ma.masked or np.ma.is_masked(val) else float(val)

    def regrid_nearest(self, other: "PolarField") -> np.ma.MaskedArray:
        """Sample ``other``'s data onto *this* field's (azimuth, range) grid.

        Nearest-neighbour in both dimensions (azimuth handled circularly). Used
        to gate one moment by another that was scanned on a different grid
        (e.g. masking velocity where reflectivity is absent).
        """
        if other.data.size == 0 or self.data.size == 0:
            return np.ma.masked_all(self.data.shape)
        d_az = np.abs(
            (self.azimuths[:, None] - other.azimuths[None, :] + 180.0) % 360.0 - 180.0
        )
        ai = np.argmin(d_az, axis=1)
        ri = np.clip(
            np.searchsorted(other.ranges_m, self.ranges_m), 0, len(other.ranges_m) - 1
        )
        return other.data[np.ix_(ai, ri)]


# --------------------------------------------------------------------------- #
# Detection results                                                            #
# --------------------------------------------------------------------------- #

@dataclass
class Couplet:
    """A raw velocity-shear couplet before TDS / classification."""

    azimuth_deg: float
    range_km: float
    delta_v_ms: float
    rotational_velocity_ms: float
    diameter_m: float
    possible_aliasing: bool
    lat: float = 0.0
    lon: float = 0.0
    is_tds: bool = False
    cc_value: float | None = None
    z_value: float | None = None
    extra: dict = field(default_factory=dict)


# --------------------------------------------------------------------------- #
# Helpers                                                                      #
# --------------------------------------------------------------------------- #

def _circular_mean_deg(a: float, b: float) -> float:
    """Mean of two azimuths handling the 360/0 wrap."""
    ar, br = radians(a), radians(b)
    x = (cos(ar) + cos(br)) / 2.0
    y = (sin(ar) + sin(br)) / 2.0
    return degrees(atan2(y, x)) % 360.0


def _circular_sep(i: int, j: int, n: int) -> int:
    """Smallest number of ray steps between two ray indices on a circle."""
    d = abs(i - j)
    return min(d, n - d)


def _ef_estimate(vrot_kt: float) -> tuple[str, str]:
    """Map rotational velocity (kt) to an EF-potential label and severity."""
    if vrot_kt < 30:
        return "sub-severe rotation", "low"
    if vrot_kt < 50:
        return "EF0–EF1 potential", "moderate"
    if vrot_kt < 70:
        return "EF2–EF3 potential", "high"
    return "EF4–EF5 potential", "extreme"


# --------------------------------------------------------------------------- #
# TVS — azimuthal velocity-shear couplets                                      #
# --------------------------------------------------------------------------- #

def detect_tvs(
    vel: PolarField,
    *,
    nyquist: float | None = None,
    min_delta_v: float = TVS_MIN_DELTA_V,
    az_window: int = TVS_AZ_WINDOW,
    min_range_km: float = TVS_MIN_RANGE_KM,
    max_range_km: float = TVS_MAX_RANGE_KM,
) -> list[Couplet]:
    """Find gate-to-gate azimuthal velocity couplets in a velocity sweep.

    For each range gate a sliding azimuthal window is scanned for a sign change
    (inbound next to outbound). Where ``Vmax - Vmin`` exceeds ``min_delta_v`` a
    candidate couplet is recorded, then non-maximum suppression merges nearby
    duplicates keeping the strongest.
    """
    arr = vel.data
    nrays, ngates = arr.shape
    if nrays == 0 or ngates == 0:
        return []
    az_res = vel.az_res_rad
    w = min(az_window, nrays)

    candidates: list[Couplet] = []
    for g in range(ngates):
        r_km = vel.ranges_m[g] / 1000.0
        if r_km < min_range_km or r_km > max_range_km:
            continue
        col = arr[:, g].filled(np.nan)
        if np.count_nonzero(~np.isnan(col)) < 2:
            continue

        # Wrap the column so azimuthal windows cross the 360/0 seam.
        ext = np.concatenate([col, col[: w - 1]])
        wins = np.lib.stride_tricks.sliding_window_view(ext, w)  # (nrays, w)

        valid = np.sum(~np.isnan(wins), axis=1) >= 2
        with np.errstate(invalid="ignore"):
            vmax = np.where(valid, np.nanmax(np.where(np.isnan(wins), -np.inf, wins), axis=1), np.nan)
            vmin = np.where(valid, np.nanmin(np.where(np.isnan(wins), np.inf, wins), axis=1), np.nan)
        dv = vmax - vmin

        hits = np.where(valid & (vmax > 0) & (vmin < 0) & (dv >= min_delta_v))[0]
        for i in hits:
            window = ext[i : i + w]
            kmax = (i + int(np.nanargmax(window))) % nrays
            kmin = (i + int(np.nanargmin(window))) % nrays
            sep = max(_circular_sep(kmax, kmin, nrays), 1)
            diameter_m = vel.ranges_m[g] * sep * az_res
            az = _circular_mean_deg(vel.azimuths[kmax], vel.azimuths[kmin])
            aliasing = bool(
                nyquist is not None
                and abs(vmax[i]) > 0.95 * nyquist
                and abs(vmin[i]) > 0.95 * nyquist
            )
            candidates.append(
                Couplet(
                    azimuth_deg=round(float(az), 2),
                    range_km=round(float(r_km), 2),
                    delta_v_ms=round(float(dv[i]), 1),
                    rotational_velocity_ms=round(float(dv[i]) / 2.0, 1),
                    diameter_m=round(float(diameter_m), 0),
                    possible_aliasing=aliasing,
                )
            )

    return _suppress(candidates)


def _suppress(cands: list[Couplet]) -> list[Couplet]:
    """Greedy non-maximum suppression, strongest ΔV first."""
    kept: list[Couplet] = []
    for c in sorted(cands, key=lambda x: x.delta_v_ms, reverse=True):
        dup = False
        for k in kept:
            d_az = abs((c.azimuth_deg - k.azimuth_deg + 180) % 360 - 180)
            if d_az <= NMS_AZ_DEG and abs(c.range_km - k.range_km) <= NMS_RANGE_KM:
                dup = True
                break
        if not dup:
            kept.append(c)
    return kept


# --------------------------------------------------------------------------- #
# TDS — debris cross-reference                                                 #
# --------------------------------------------------------------------------- #

def cross_reference_tds(
    couplets: list[Couplet],
    refl: PolarField | None,
    cc: PolarField | None,
    *,
    cc_max: float = TDS_CC_MAX,
    z_min: float = TDS_Z_MIN,
) -> None:
    """Annotate couplets in place with sampled Z/CC and a TDS flag.

    A Tornadic Debris Signature is confirmed where, *at the couplet location*,
    correlation coefficient is anomalously low (lofted non-meteorological
    debris) while reflectivity remains high.
    """
    for c in couplets:
        z = refl.sample(c.azimuth_deg, c.range_km * 1000.0) if refl else None
        rho = cc.sample(c.azimuth_deg, c.range_km * 1000.0) if cc else None
        c.z_value = None if z is None else round(z, 1)
        c.cc_value = None if rho is None else round(rho, 3)
        c.is_tds = bool(
            rho is not None and z is not None and rho < cc_max and z >= z_min
        )


# --------------------------------------------------------------------------- #
# Hazard classification                                                        #
# --------------------------------------------------------------------------- #

def _radial_divergence(arr: np.ma.MaskedArray) -> tuple[float, int, int]:
    """Strongest along-beam (range) velocity divergence: inbound→outbound.

    Returns ``(delta_v, ray_index, gate_index)``. A near-surface divergent
    couplet along the radial is the signature of a downburst / damaging wind.
    """
    filled = np.ma.filled(arr, np.nan)
    if filled.shape[1] < 2:
        return 0.0, 0, 0
    diff = filled[:, 1:] - filled[:, :-1]  # outbound(far) - inbound(near)
    diff = np.where(np.isnan(diff), -np.inf, diff)
    idx = int(np.argmax(diff))
    ray, gate = np.unravel_index(idx, diff.shape)
    best = diff[ray, gate]
    return (float(best) if np.isfinite(best) else 0.0, int(ray), int(gate))


def classify_hazards(
    refl: PolarField | None,
    vel: PolarField | None,
    cc: PolarField | None,
) -> list[dict]:
    """Return hazard dicts (hail / snow / damaging_wind) from the moments."""
    hazards: list[dict] = []

    # --- Hail: high-Z core, optionally with depressed CC ------------------- #
    if refl is not None and refl.data.count() > 0:
        zmax = float(refl.data.max())
        if zmax >= HAIL_Z_SMALL:
            ij = np.unravel_index(int(np.ma.argmax(refl.data)), refl.data.shape)
            az = float(refl.azimuths[ij[0]])
            rng_m = float(refl.ranges_m[ij[1]])
            rho_here = cc.sample(az, rng_m) if cc else None
            if zmax >= HAIL_Z_LARGE:
                sev, detail = "high", f"Very high reflectivity core ({zmax:.0f} dBZ) — large hail likely"
            elif zmax >= 55:
                sev, detail = "moderate", f"High reflectivity core ({zmax:.0f} dBZ) — hail likely"
            else:
                sev, detail = "low", f"Elevated reflectivity ({zmax:.0f} dBZ) — small hail possible"
            evidence = {"max_dbz": round(zmax, 1)}
            if rho_here is not None:
                evidence["cc_at_core"] = round(rho_here, 3)
                if rho_here < HAIL_CC_MAX:
                    detail += f"; depressed CC ({rho_here:.2f}) supports mixed/hail"
            lat, lon = destination_point(refl.radar_lat, refl.radar_lon, az, rng_m / 1000.0)
            hazards.append(
                {"type": "hail", "severity": sev, "detail": detail,
                 "evidence": evidence, "lat": lat, "lon": lon}
            )

    # --- Snow / winter precip: broad, low-Z, very high CC ------------------ #
    if refl is not None and cc is not None and refl.data.count() > 0:
        echo = refl.data >= SNOW_ECHO_MIN_DBZ
        n_echo = int(np.ma.count(refl.data[echo]))
        if n_echo > 0:
            zmed = float(np.ma.median(refl.data[echo]))
            zmax = float(refl.data.max())
            cc_echo = cc.data[echo]
            cc_med = float(np.ma.median(cc_echo)) if np.ma.count(cc_echo) else 0.0
            coverage = n_echo / max(int(np.ma.count(refl.data)), 1)
            if cc_med >= SNOW_CC_MIN and zmax <= SNOW_Z_MAX and zmed <= 30 and coverage >= 0.25:
                hazards.append(
                    {"type": "snow", "severity": "moderate" if zmed >= 15 else "low",
                     "detail": ("Widespread stratiform echo with very high, uniform CC and "
                                "low reflectivity — winter precipitation (snow) likely "
                                "(temperature data not used; heuristic)"),
                     "evidence": {"median_dbz": round(zmed, 1), "max_dbz": round(zmax, 1),
                                  "median_cc": round(cc_med, 3), "echo_coverage": round(coverage, 2)},
                     "lat": None, "lon": None}
                )

    # --- Damaging straight-line / downburst winds -------------------------- #
    if vel is not None and vel.data.count() > 0:
        # Only trust velocity where precipitation exists (gate by reflectivity).
        vd = vel.data
        if refl is not None and refl.data.count() > 0:
            rz = vel.regrid_nearest(refl)
            vd = np.ma.masked_where(np.ma.filled(rz, -999.0) < WIND_MIN_REFLECTIVITY, vel.data)
        if vd.count() == 0:
            return hazards
        vabs = float(np.ma.max(np.ma.abs(vd)))
        div, ray, gate = _radial_divergence(vd)
        metric = max(vabs, div)
        if metric >= WIND_STRONG_MS:
            sev = "high" if metric >= WIND_DAMAGING_MS else "moderate"
            parts = [f"Peak radial velocity {vabs:.0f} m/s ({vabs * MS_TO_MPH:.0f} mph)"]
            evidence = {"peak_radial_ms": round(vabs, 1), "peak_radial_mph": round(vabs * MS_TO_MPH, 1)}
            if div >= WIND_DIV_MIN_MS:
                parts.append(f"radial divergence {div:.0f} m/s (possible downburst)")
                evidence["radial_divergence_ms"] = round(div, 1)
            lat, lon = destination_point(
                vel.radar_lat, vel.radar_lon, float(vel.azimuths[ray]), float(vel.ranges_m[gate]) / 1000.0
            )
            hazards.append(
                {"type": "damaging_wind", "severity": sev,
                 "detail": "; ".join(parts) + " — damaging straight-line winds possible",
                 "evidence": evidence, "lat": lat, "lon": lon}
            )

    return hazards


# --------------------------------------------------------------------------- #
# Orchestrator                                                                 #
# --------------------------------------------------------------------------- #

def analyze(
    vel_sweep: dict,
    refl_sweep: dict | None = None,
    cc_sweep: dict | None = None,
    *,
    nyquist: float | None = None,
) -> dict:
    """Run the full engine and return an AnalysisResult-shaped dict.

    ``vel_sweep`` is required (TVS source); ``refl_sweep`` and ``cc_sweep``
    enable TDS cross-referencing and hazard classification.
    """
    vel = PolarField.from_sweep(vel_sweep)
    refl = PolarField.from_sweep(refl_sweep) if refl_sweep else None
    cc = PolarField.from_sweep(cc_sweep) if cc_sweep else None
    nyq = nyquist if nyquist is not None else vel_sweep.get("nyquist_velocity")

    couplets = detect_tvs(vel, nyquist=nyq)
    cross_reference_tds(couplets, refl, cc)

    # Confine couplets to actual storms: require reflectivity at the location.
    # (Skipped when no reflectivity sweep is supplied.)
    if refl is not None:
        couplets = [
            c for c in couplets
            if c.z_value is not None and c.z_value >= TVS_MIN_REFLECTIVITY
        ]

    signatures = []
    for c in couplets:
        lat, lon = destination_point(vel.radar_lat, vel.radar_lon, c.azimuth_deg, c.range_km)
        vrot_kt = c.rotational_velocity_ms * MS_TO_KT
        ef_label, ef_sev = _ef_estimate(vrot_kt)
        # A confirmed TDS escalates severity by one notch (capped at extreme).
        order = ["low", "moderate", "high", "extreme"]
        sev = ef_sev
        if c.is_tds:
            sev = order[min(order.index(ef_sev) + 1, len(order) - 1)]
        signatures.append(
            {
                "azimuth_deg": c.azimuth_deg,
                "range_km": c.range_km,
                "lat": round(lat, 4),
                "lon": round(lon, 4),
                "elevation_deg": vel.elevation_deg,
                "delta_v_ms": c.delta_v_ms,
                "rotational_velocity_ms": c.rotational_velocity_ms,
                "rotational_velocity_kt": round(vrot_kt, 1),
                "diameter_m": c.diameter_m,
                "estimated_peak_wind_mph": round(c.rotational_velocity_ms * MS_TO_MPH, 1),
                "ef_estimate": ef_label,
                "possible_aliasing": c.possible_aliasing,
                "is_tds": c.is_tds,
                "cc_value": c.cc_value,
                "z_value": c.z_value,
                "severity": sev,
            }
        )

    hazards = classify_hazards(refl, vel, cc)

    # Summary line.
    n_tds = sum(1 for s in signatures if s["is_tds"])
    bits = []
    if signatures:
        bits.append(f"{len(signatures)} velocity couplet(s)")
        if n_tds:
            bits.append(f"{n_tds} confirmed TDS")
    if hazards:
        bits.append(", ".join(sorted({h["type"] for h in hazards})))
    summary = "; ".join(bits) if bits else "No significant signatures detected"

    return {
        "scan_time": vel_sweep["scan_time"],
        "radar_lat": vel.radar_lat,
        "radar_lon": vel.radar_lon,
        "velocity_elevation_deg": vel.elevation_deg,
        "reflectivity_elevation_deg": (refl.elevation_deg if refl else vel.elevation_deg),
        "tornado_signatures": signatures,
        "hazards": hazards,
        "summary": summary,
    }
