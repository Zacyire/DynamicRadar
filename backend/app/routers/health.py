"""Health / readiness endpoints."""

from fastapi import APIRouter

from app import __version__

router = APIRouter(tags=["meta"])


@router.get("/api/health")
def health() -> dict:
    """Liveness probe."""
    return {"status": "ok", "version": __version__}
