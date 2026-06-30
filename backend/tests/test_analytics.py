"""Offline tests for the analytics engine using synthetic polar fields."""

import numpy as np

from app.services import analytics
from app.services.analytics import PolarField


def _blank_sweep(field, nrays=360, ngates=120, fill=None, units=""):
    """A sweep dict with all gates masked (None) unless filled later."""
    return {
        "field": field,
        "long_name": field,
        "units": units,
        "scan_time": "2026-06-30T05:38:19Z",
        "sweep": 0,
        "elevation_deg": 0.5,
        "radar_lat": 35.3331,
        "radar_lon": -97.2778,
        "radar_alt_m": 389.0,
        "nyquist_velocity": 26.0,
        "azimuths": [round(i * 360.0 / nrays, 2) for i in range(nrays)],
        "ranges_m": [250.0 * (g + 1) for g in range(ngates)],
        "range_stride": 1,
        "data": [[fill for _ in range(ngates)] for _ in range(nrays)],
    }


def _inject_couplet(sweep, ray, gate, inbound=-30.0, outbound=30.0):
    """Place an inbound/outbound velocity couplet at (ray, gate) and (ray+1, gate)."""
    sweep["data"][ray][gate] = inbound
    sweep["data"][ray + 1][gate] = outbound


def test_detect_tvs_finds_injected_couplet():
    vel = _blank_sweep("velocity", units="m/s")
    # Range gate 80 -> 250*81 = 20.25 km (inside 5..160 km window).
    _inject_couplet(vel, ray=100, gate=80, inbound=-32.0, outbound=34.0)
    pf = PolarField.from_sweep(vel)
    couplets = analytics.detect_tvs(pf, nyquist=26.0)
    assert len(couplets) == 1
    c = couplets[0]
    assert abs(c.delta_v_ms - 66.0) < 0.5          # 34 - (-32)
    assert abs(c.rotational_velocity_ms - 33.0) < 0.5
    assert 18 < c.range_km < 22
    assert c.diameter_m > 0


def test_weak_shear_below_threshold_ignored():
    vel = _blank_sweep("velocity", units="m/s")
    _inject_couplet(vel, ray=50, gate=60, inbound=-5.0, outbound=8.0)  # ΔV=13 < 20
    couplets = analytics.detect_tvs(PolarField.from_sweep(vel))
    assert couplets == []


def test_tds_cross_reference():
    vel = _blank_sweep("velocity", units="m/s")
    _inject_couplet(vel, ray=100, gate=80, inbound=-32.0, outbound=34.0)
    refl = _blank_sweep("reflectivity", units="dBZ")
    cc = _blank_sweep("cross_correlation_ratio", units="ratio")
    # High Z + low CC across the couplet location (rays 100-101, gate 80).
    for ray in (100, 101):
        refl["data"][ray][80] = 48.0
        cc["data"][ray][80] = 0.55
    result = analytics.analyze(vel, refl, cc, nyquist=26.0)
    sigs = result["tornado_signatures"]
    assert len(sigs) == 1
    assert sigs[0]["is_tds"] is True
    assert sigs[0]["cc_value"] is not None and sigs[0]["cc_value"] < 0.8
    assert sigs[0]["z_value"] >= 35


def test_high_cc_means_no_tds():
    vel = _blank_sweep("velocity", units="m/s")
    _inject_couplet(vel, ray=100, gate=80, inbound=-32.0, outbound=34.0)
    refl = _blank_sweep("reflectivity", units="dBZ")
    cc = _blank_sweep("cross_correlation_ratio", units="ratio")
    for ray in (100, 101):
        refl["data"][ray][80] = 48.0
        cc["data"][ray][80] = 0.99      # healthy CC -> rain, not debris
    result = analytics.analyze(vel, refl, cc)
    assert result["tornado_signatures"][0]["is_tds"] is False


def test_hail_classification():
    refl = _blank_sweep("reflectivity", units="dBZ")
    cc = _blank_sweep("cross_correlation_ratio", units="ratio")
    for ray in range(40, 45):
        for gate in range(50, 55):
            refl["data"][ray][gate] = 63.0
            cc["data"][ray][gate] = 0.90
    hazards = analytics.classify_hazards(
        PolarField.from_sweep(refl), None, PolarField.from_sweep(cc)
    )
    hail = [h for h in hazards if h["type"] == "hail"]
    assert hail and hail[0]["severity"] == "high"
    assert hail[0]["evidence"]["max_dbz"] >= 60


def test_snow_classification():
    refl = _blank_sweep("reflectivity", units="dBZ")
    cc = _blank_sweep("cross_correlation_ratio", units="ratio")
    # Broad, low-Z, very high uniform CC.
    for ray in range(360):
        for gate in range(0, 80):
            refl["data"][ray][gate] = 18.0
            cc["data"][ray][gate] = 0.99
    hazards = analytics.classify_hazards(
        PolarField.from_sweep(refl), None, PolarField.from_sweep(cc)
    )
    assert any(h["type"] == "snow" for h in hazards)


def test_damaging_wind_classification():
    vel = _blank_sweep("velocity", units="m/s")
    # Strong radial divergence along a beam: inbound near, outbound far.
    for gate in range(40, 50):
        vel["data"][200][gate] = -28.0
    for gate in range(50, 60):
        vel["data"][200][gate] = 30.0
    hazards = analytics.classify_hazards(None, PolarField.from_sweep(vel), None)
    wind = [h for h in hazards if h["type"] == "damaging_wind"]
    assert wind and wind[0]["severity"] in ("moderate", "high")


def test_empty_velocity_yields_no_signatures():
    vel = _blank_sweep("velocity", units="m/s")
    result = analytics.analyze(vel)
    assert result["tornado_signatures"] == []
    assert "No significant" in result["summary"]
