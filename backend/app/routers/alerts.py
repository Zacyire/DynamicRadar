"""NWS warning polygons proxy.

Fetches live active warnings from the National Weather Service API and returns
them as a GeoJSON FeatureCollection the map can render directly. Proxying
server-side lets us send the NWS-required descriptive ``User-Agent`` and avoids
browser CORS issues.
"""

from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter, HTTPException, Query

from app.config import get_settings
from app.core.geo import haversine_km

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/api/alerts", tags=["alerts"])

# The three warning types we overlay as box-style polygons.
WARNING_EVENTS = [
    "Tornado Warning",
    "Severe Thunderstorm Warning",
    "Flash Flood Warning",
]


def _centroid(geometry: dict) -> tuple[float, float] | None:
    """Rough lon/lat centroid of a (Multi)Polygon for distance filtering."""
    geo_type = geometry.get("type")
    coords = geometry.get("coordinates")
    if not coords:
        return None
    if geo_type == "Polygon":
        ring = coords[0]
    elif geo_type == "MultiPolygon":
        ring = coords[0][0]
    else:
        return None
    if not ring:
        return None
    lon = sum(p[0] for p in ring) / len(ring)
    lat = sum(p[1] for p in ring) / len(ring)
    return lon, lat


def _demo_features(lat: float, lon: float) -> list[dict]:
    """Synthetic, clearly-labelled warning polygons near a point.

    Used only when ``demo=true`` so the overlay/legend can be exercised in
    environments where the live NWS API is not reachable. Never represents real
    warnings — every headline is prefixed ``[DEMO]``.
    """

    def box(dlat: float, dlon: float, w: float = 0.4, h: float = 0.3) -> dict:
        cy, cx = lat + dlat, lon + dlon
        return {
            "type": "Polygon",
            "coordinates": [[
                [cx - w, cy - h], [cx + w, cy - h],
                [cx + w, cy + h], [cx - w, cy + h], [cx - w, cy - h],
            ]],
        }

    specs = [
        ("Tornado Warning", "Severe", (0.5, 0.6)),
        ("Severe Thunderstorm Warning", "Severe", (-0.4, 0.2)),
        ("Flash Flood Warning", "Moderate", (0.1, -0.7)),
    ]
    feats = []
    for i, (event, severity, (dlat, dlon)) in enumerate(specs):
        feats.append({
            "type": "Feature",
            "geometry": box(dlat, dlon),
            "properties": {
                "id": f"DEMO-{i}",
                "event": event,
                "headline": f"[DEMO] {event} — sample polygon (not a real warning)",
                "severity": severity,
                "certainty": "Observed",
                "urgency": "Immediate",
                "onset": None,
                "expires": None,
                "areaDesc": "Demo area",
            },
        })
    return feats


@router.get("/active")
def active_alerts(
    lat: float | None = Query(None, ge=-90, le=90),
    lon: float | None = Query(None, ge=-180, le=180),
    radius_km: float = Query(600.0, gt=0),
    demo: bool = Query(False, description="Return labelled sample polygons (offline dev)"),
) -> dict:
    """Active Tornado / Severe Thunderstorm / Flash Flood warnings as GeoJSON.

    When ``lat``/``lon`` are supplied, polygons whose centroid is farther than
    ``radius_km`` from that point are dropped (keeps the overlay regional).
    With ``demo=true`` returns labelled sample polygons instead of calling NWS.
    """
    if demo:
        feats = _demo_features(lat if lat is not None else 35.33, lon if lon is not None else -97.28)
        return {"type": "FeatureCollection", "features": feats}
    params: list[tuple[str, str]] = [("status", "actual"), ("message_type", "alert")]
    params += [("event", e) for e in WARNING_EVENTS]
    headers = {
        "User-Agent": settings.nws_user_agent,
        "Accept": "application/geo+json",
    }
    url = f"{settings.nws_api_base}/alerts/active"

    try:
        with httpx.Client(timeout=20.0, follow_redirects=True) as client:
            resp = client.get(url, params=params, headers=headers)
            resp.raise_for_status()
            payload = resp.json()
    except httpx.HTTPError as exc:
        logger.warning("NWS alerts fetch failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"NWS alerts fetch failed: {exc}") from exc

    features = []
    for feat in payload.get("features", []):
        geom = feat.get("geometry")
        if not geom:  # zone-only alerts carry no polygon; skip for the map
            continue
        props = feat.get("properties", {})
        if lat is not None and lon is not None:
            c = _centroid(geom)
            if c and haversine_km(lat, lon, c[1], c[0]) > radius_km:
                continue
        features.append(
            {
                "type": "Feature",
                "geometry": geom,
                "properties": {
                    "id": props.get("id"),
                    "event": props.get("event"),
                    "headline": props.get("headline"),
                    "severity": props.get("severity"),
                    "certainty": props.get("certainty"),
                    "urgency": props.get("urgency"),
                    "onset": props.get("onset"),
                    "expires": props.get("expires"),
                    "areaDesc": props.get("areaDesc"),
                },
            }
        )

    return {"type": "FeatureCollection", "features": features}
