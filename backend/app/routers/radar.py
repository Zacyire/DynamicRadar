"""Radar data endpoints: station discovery, latest volume metadata, sweep data.

These are defined as synchronous handlers so FastAPI runs them in its worker
threadpool — Py-ART parsing and S3 I/O are blocking.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.core import stations as station_catalog
from app.core.geo import haversine_km
from app.core.models import (
    SweepData,
    StationInfo,
    VolumeMeta,
)
from app.services import nexrad_fetch, radar_decode

router = APIRouter(prefix="/api/radar", tags=["radar"])


@router.get("/stations", response_model=list[StationInfo])
def list_stations() -> list[StationInfo]:
    """Return the WSR-88D station catalog."""
    return [
        StationInfo(
            icao=s.icao,
            name=s.name,
            lat=s.lat,
            lon=s.lon,
            elevation_m=s.elevation_m,
        )
        for s in station_catalog.STATIONS
    ]


@router.get("/nearest", response_model=StationInfo)
def nearest(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
) -> StationInfo:
    """Return the station closest to the given coordinates (geolocation auto-connect)."""
    s = station_catalog.nearest_station(lat, lon)
    return StationInfo(
        icao=s.icao,
        name=s.name,
        lat=s.lat,
        lon=s.lon,
        elevation_m=s.elevation_m,
        distance_km=round(haversine_km(lat, lon, s.lat, s.lon), 2),
    )


def _load_latest(station: str):
    """Fetch + decode the latest volume scan, returning (key, radar)."""
    try:
        key, path = nexrad_fetch.fetch_latest(station)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    radar = radar_decode.read_radar(str(path))
    return key, radar


@router.get("/{station}/latest", response_model=VolumeMeta)
def latest_volume(station: str) -> VolumeMeta:
    """Metadata for the latest volume scan: elevations, fields, per-sweep summary."""
    key, radar = _load_latest(station)
    summary = radar_decode.summarize(radar)
    return VolumeMeta(station=station.upper(), key=key, **summary)


@router.get("/{station}/sweep", response_model=SweepData)
def sweep(
    station: str,
    field: str = Query("reflectivity", description="Z, V, CC or full field name"),
    sweep: int | None = Query(None, ge=0, description="Sweep index; default = lowest valid"),
    max_range_km: float | None = Query(300.0, gt=0),
    range_stride: int = Query(1, ge=1, le=20),
) -> SweepData:
    """Decoded polar data for one moment (Z / V / CC) and sweep of the latest scan."""
    try:
        py_field = radar_decode.resolve_field(field)
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    _, radar = _load_latest(station)
    try:
        result = radar_decode.extract_sweep(
            radar,
            py_field,
            sweep=sweep,
            max_range_km=max_range_km,
            range_stride=range_stride,
        )
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return SweepData(station=station.upper(), **result)
