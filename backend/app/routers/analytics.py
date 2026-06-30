"""Storm-analytics endpoint: TVS/TDS detection + hazard classification."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.core.models import AnalysisResult
from app.services import analytics, nexrad_fetch, radar_decode

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/{station}", response_model=AnalysisResult)
def analyze_station(
    station: str,
    range_stride: int = Query(2, ge=1, le=10, description="Range downsample for analysis"),
    max_range_km: float = Query(160.0, gt=0),
) -> AnalysisResult:
    """Run the analytics engine on the latest volume scan for ``station``.

    Extracts the lowest-elevation Velocity (TVS source), Reflectivity and
    Correlation Coefficient sweeps, then detects velocity couplets, confirms
    Tornadic Debris Signatures, estimates physical attributes, and flags
    hail / snow / damaging-wind hazards.
    """
    try:
        _, path = nexrad_fetch.fetch_latest(station)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    radar = radar_decode.read_radar(str(path))

    def _extract(py_field: str) -> dict | None:
        if py_field not in radar.fields:
            return None
        try:
            return radar_decode.extract_sweep(
                radar, py_field, max_range_km=max_range_km, range_stride=range_stride
            )
        except (KeyError, ValueError):
            return None

    # Dealias velocity so aliasing folds aren't mistaken for couplets.
    vel_field = radar_decode.ensure_dealiased_velocity(radar)
    vel = _extract(vel_field)
    if vel is None:
        raise HTTPException(
            status_code=422,
            detail=f"No valid velocity data in latest {station.upper()} volume; cannot analyze.",
        )
    refl = _extract("reflectivity")
    cc = _extract("cross_correlation_ratio")
    # Carry the true Nyquist forward even when using the corrected velocity field.
    if vel_field == "corrected_velocity":
        raw = _extract("velocity")
        if raw is not None:
            vel["nyquist_velocity"] = raw.get("nyquist_velocity")

    result = analytics.analyze(vel, refl, cc, nyquist=vel.get("nyquist_velocity"))
    return AnalysisResult(station=station.upper(), **result)
