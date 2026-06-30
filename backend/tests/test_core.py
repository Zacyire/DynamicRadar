"""Offline unit tests (no network) for core helpers and field resolution."""

import pytest

from app.core.geo import haversine_km
from app.core.stations import nearest_station
from app.services.radar_decode import resolve_field


def test_haversine_known_distance():
    # OKC (KTLX) to a point ~25 km away.
    d = haversine_km(35.3331, -97.2778, 35.2, -97.5)
    assert 20 < d < 30


def test_nearest_station_okc():
    s = nearest_station(35.2, -97.5)
    assert s.icao == "KTLX"


@pytest.mark.parametrize(
    "alias,expected",
    [
        ("Z", "reflectivity"),
        ("z", "reflectivity"),
        ("V", "velocity"),
        ("CC", "cross_correlation_ratio"),
        ("rhohv", "cross_correlation_ratio"),
        ("reflectivity", "reflectivity"),
    ],
)
def test_resolve_field_aliases(alias, expected):
    assert resolve_field(alias) == expected


def test_resolve_field_unknown():
    with pytest.raises(KeyError):
        resolve_field("not_a_field")
