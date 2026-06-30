"""Geospatial helpers."""

from math import asin, atan2, cos, degrees, radians, sin, sqrt

EARTH_RADIUS_KM = 6371.0088


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two WGS84 points, in kilometers."""
    d_lat = radians(lat2 - lat1)
    d_lon = radians(lon2 - lon1)
    a = (
        sin(d_lat / 2) ** 2
        + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lon / 2) ** 2
    )
    return 2 * EARTH_RADIUS_KM * asin(sqrt(a))


def destination_point(
    lat: float, lon: float, bearing_deg: float, distance_km: float
) -> tuple[float, float]:
    """Project a point ``distance_km`` along ``bearing_deg`` from (lat, lon).

    Spherical forward geodesic. Used to place a radar-relative polar detection
    (azimuth + ground range) onto the map. At the low beam-tilt angles used for
    storm analysis, slant range ≈ ground range, so callers pass slant range.
    """
    ang = distance_km / EARTH_RADIUS_KM
    br = radians(bearing_deg)
    lat1 = radians(lat)
    lon1 = radians(lon)
    lat2 = asin(sin(lat1) * cos(ang) + cos(lat1) * sin(ang) * cos(br))
    lon2 = lon1 + atan2(
        sin(br) * sin(ang) * cos(lat1),
        cos(ang) - sin(lat1) * sin(lat2),
    )
    return degrees(lat2), degrees(lon2)
