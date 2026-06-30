"""Demo scenario endpoints — synthetic radar datasets that work offline.

Mirrors the live radar/analytics/alerts endpoints but serves deterministic
pre-cached scenarios (tornado, hurricane, squall, clear) so the full UI —
2D plotting, storm analytics, 3D volume and warning overlays — is usable
without any network access.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.core.models import AnalysisResult, SweepData
from app.services import analytics, demo_scenarios, radar_decode

router = APIRouter(prefix="/api/demo", tags=["demo"])


def _resolve_field(field: str) -> str:
    try:
        return radar_decode.resolve_field(field)
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _check(scenario: str) -> None:
    if scenario not in demo_scenarios.SCENARIOS:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown scenario {scenario!r}. Options: {sorted(demo_scenarios.SCENARIOS)}",
        )


@router.get("/scenarios")
def list_scenarios() -> dict:
    """All available demo scenarios with their map centers and descriptions."""
    return {"scenarios": demo_scenarios.scenario_list()}


@router.get("/{scenario}/sweep", response_model=SweepData)
def sweep(
    scenario: str,
    field: str = Query("reflectivity", description="Z, V, CC or full field name"),
    range_stride: int = Query(1, ge=1, le=10),
) -> SweepData:
    """One synthetic polar sweep (2D plotting)."""
    _check(scenario)
    py_field = _resolve_field(field)
    result = demo_scenarios.build_sweep(scenario, py_field, range_stride=range_stride)
    return SweepData(station=demo_scenarios.SCENARIOS[scenario]["station"], **result)


@router.get("/{scenario}/volume")
def volume(
    scenario: str,
    field: str = Query("reflectivity", description="Z, V, CC or full field name"),
) -> dict:
    """All elevation tilts of a synthetic scenario (3D stacking)."""
    _check(scenario)
    py_field = _resolve_field(field)
    return demo_scenarios.build_volume(scenario, py_field)


@router.get("/{scenario}/analytics", response_model=AnalysisResult)
def scenario_analytics(scenario: str) -> AnalysisResult:
    """Run the storm-analytics engine on a synthetic scenario."""
    _check(scenario)
    vel = demo_scenarios.build_sweep(scenario, "velocity")
    refl = demo_scenarios.build_sweep(scenario, "reflectivity")
    cc = demo_scenarios.build_sweep(scenario, "cross_correlation_ratio")
    result = analytics.analyze(vel, refl, cc, nyquist=demo_scenarios.NYQUIST)
    return AnalysisResult(station=demo_scenarios.SCENARIOS[scenario]["station"], **result)


@router.get("/{scenario}/alerts")
def scenario_alerts(scenario: str) -> dict:
    """Scenario-appropriate, clearly-labelled demo warning polygons."""
    _check(scenario)
    return {"type": "FeatureCollection", "features": demo_scenarios.alert_features(scenario)}
