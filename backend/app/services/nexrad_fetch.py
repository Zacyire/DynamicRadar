"""Fetch NEXRAD Level II volume scans from the public NOAA S3 bucket.

The ``noaa-nexrad-level2`` bucket is public and read with **unsigned** requests,
so no AWS credentials are required. Object keys follow the layout::

    YYYY/MM/DD/<ICAO>/<ICAO>_YYYYMMDD_HHMMSS_V06

Files are downloaded once into the local cache directory and reused.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

import boto3
from botocore import UNSIGNED
from botocore.client import Config

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Objects we never want to treat as volume scans.
_SKIP_SUFFIXES = ("_MDM",)


def _client():
    """An anonymous (unsigned) S3 client for the public NEXRAD bucket."""
    return boto3.client(
        "s3",
        region_name=settings.nexrad_region,
        config=Config(signature_version=UNSIGNED),
    )


def _cache_dir() -> Path:
    path = Path(settings.cache_dir)
    path.mkdir(parents=True, exist_ok=True)
    return path


def list_keys(station: str, day: datetime) -> list[str]:
    """All volume-scan object keys for a station on a given UTC day, sorted ascending."""
    station = station.upper()
    prefix = f"{day:%Y/%m/%d}/{station}/"
    s3 = _client()

    keys: list[str] = []
    paginator = s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=settings.nexrad_bucket, Prefix=prefix):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            if key.endswith(_SKIP_SUFFIXES):
                continue
            keys.append(key)
    # Keys embed a zero-padded UTC timestamp, so lexical sort == chronological.
    return sorted(keys)


def latest_key(station: str) -> str:
    """Return the most recent volume-scan key for a station.

    Scans the current UTC day and falls back to the previous day to handle the
    midnight-UTC rollover (and stations that are temporarily quiet).
    """
    station = station.upper()
    now = datetime.now(timezone.utc)
    for day_offset in (0, 1):
        day = now - timedelta(days=day_offset)
        keys = list_keys(station, day)
        if keys:
            return keys[-1]
    raise FileNotFoundError(
        f"No NEXRAD Level II volume scans found for station {station!r} "
        f"in the last 2 UTC days."
    )


def download(key: str) -> Path:
    """Download an object to the local cache (idempotent) and return its path."""
    local = _cache_dir() / key.replace("/", "_")
    if local.exists() and local.stat().st_size > 0:
        logger.debug("cache hit for %s", key)
        return local

    logger.info("downloading s3://%s/%s", settings.nexrad_bucket, key)
    tmp = local.with_suffix(local.suffix + ".part")
    _client().download_file(settings.nexrad_bucket, key, str(tmp))
    tmp.rename(local)
    return local


def fetch_latest(station: str) -> tuple[str, Path]:
    """Resolve and download the latest volume scan for ``station``.

    Returns ``(key, local_path)``.
    """
    key = latest_key(station)
    return key, download(key)
