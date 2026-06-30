"""WSR-88D (NEXRAD) station catalog and nearest-station lookup.

This is a *seed* catalog for Phase 1 scaffolding. The full 150+ station list
(ICAO id, name, lat, lon, elevation) is populated in Phase 2/4 — ideally loaded
from NWS station metadata rather than hard-coded.
"""

from dataclasses import dataclass

from app.core.geo import haversine_km


@dataclass(frozen=True)
class Station:
    """A single WSR-88D radar site."""

    icao: str          # 4-letter site id, e.g. "KTLX"
    name: str
    lat: float
    lon: float
    elevation_m: float = 0.0


# Seed subset — expanded to the full NEXRAD network in a later phase.
STATIONS: list[Station] = [
    Station("KTLX", "Oklahoma City, OK", 35.3331, -97.2778, 370.0),
    Station("KFWS", "Dallas/Fort Worth, TX", 32.5731, -97.3031, 208.0),
    Station("KLOT", "Chicago, IL", 41.6044, -88.0847, 202.0),
    Station("KDIX", "Philadelphia, PA", 39.9470, -74.4108, 45.0),
    Station("KMUX", "San Francisco Bay Area, CA", 37.1551, -121.8983, 1057.0),
]


def nearest_station(lat: float, lon: float) -> Station:
    """Return the catalog station closest to the given coordinates."""
    if not STATIONS:
        raise ValueError("Station catalog is empty")
    return min(STATIONS, key=lambda s: haversine_km(lat, lon, s.lat, s.lon))
