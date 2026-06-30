"""Pydantic response models for the radar API."""

from typing import Literal

from pydantic import BaseModel, Field


class StationInfo(BaseModel):
    """A WSR-88D station and (optionally) its distance from a query point."""

    icao: str
    name: str
    lat: float
    lon: float
    elevation_m: float
    distance_km: float | None = None


class FieldAvailability(BaseModel):
    """Whether a moment (Z/V/CC/...) has valid data in a given sweep."""

    field: str
    available: bool


class SweepSummary(BaseModel):
    """Metadata for one elevation sweep within a volume scan."""

    sweep: int
    elevation_deg: float
    nrays: int
    fields: list[str]  # fields with at least some valid data in this sweep


class VolumeMeta(BaseModel):
    """Summary of the latest volume scan for a station."""

    station: str
    key: str
    scan_time: str  # ISO-8601 UTC
    radar_lat: float
    radar_lon: float
    radar_alt_m: float
    nsweeps: int
    elevations_deg: list[float]
    available_fields: list[str]
    sweeps: list[SweepSummary]


class SweepData(BaseModel):
    """Decoded polar data for a single field + sweep.

    Data is returned in radar-relative *polar* form: one row per ray
    (ordered by ``azimuths``) and one column per range gate (``ranges``).
    Masked / below-threshold gates are ``null``. The frontend georeferences
    gates from the radar location + azimuth/range (Phase 4).
    """

    station: str
    field: str
    long_name: str
    units: str
    scan_time: str
    sweep: int
    elevation_deg: float
    radar_lat: float
    radar_lon: float
    radar_alt_m: float
    nyquist_velocity: float | None = None
    azimuths: list[float] = Field(..., description="Ray azimuths, degrees CW from N")
    ranges_m: list[float] = Field(..., description="Gate-center slant ranges, meters")
    range_stride: int
    data: list[list[float | None]]


# --------------------------------------------------------------------------- #
# Phase 3 — Analytics engine                                                   #
# --------------------------------------------------------------------------- #

Severity = Literal["low", "moderate", "high", "extreme"]
HazardType = Literal["tornado", "hail", "snow", "damaging_wind"]


class VortexSignature(BaseModel):
    """A detected velocity couplet (mesocyclone / TVS), with TDS cross-check."""

    # Location (radar-relative + georeferenced)
    azimuth_deg: float
    range_km: float
    lat: float
    lon: float
    elevation_deg: float

    # Velocity-derived attributes
    delta_v_ms: float = Field(..., description="Gate-to-gate velocity difference (Vmax - Vmin)")
    rotational_velocity_ms: float = Field(..., description="Vrot = delta_v / 2")
    rotational_velocity_kt: float
    diameter_m: float = Field(..., description="Azimuthal width of the circulation")
    estimated_peak_wind_mph: float
    ef_estimate: str
    possible_aliasing: bool = False

    # Tornadic Debris Signature cross-reference
    is_tds: bool = False
    cc_value: float | None = Field(None, description="Correlation coefficient at the couplet")
    z_value: float | None = Field(None, description="Reflectivity (dBZ) at the couplet")

    severity: Severity


class HazardFlag(BaseModel):
    """A non-tornadic severe-weather flag (hail / snow / damaging wind)."""

    type: HazardType
    severity: Severity
    detail: str
    evidence: dict[str, float]
    lat: float | None = None
    lon: float | None = None


class AnalysisResult(BaseModel):
    """Full storm-analytics output for the latest volume scan of a station."""

    station: str
    scan_time: str
    radar_lat: float
    radar_lon: float
    velocity_elevation_deg: float
    reflectivity_elevation_deg: float
    max_reflectivity_dbz: float | None = None
    peak_rotational_velocity_kt: float | None = None
    tornado_signatures: list[VortexSignature]
    hazards: list[HazardFlag]
    summary: str
