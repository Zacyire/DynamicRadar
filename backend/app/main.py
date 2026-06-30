"""DynamicRadar FastAPI application entrypoint.

Phase 1 establishes the app skeleton, CORS, health check, and router wiring.
The radar data pipeline (Phase 2) and analytics engine (Phase 3) attach their
routes under ``app/routers/``.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.config import get_settings
from app.routers import health, radar

settings = get_settings()

app = FastAPI(
    title="DynamicRadar API",
    description=(
        "Real-time NEXRAD Level II radar ingestion, storm analytics "
        "(TVS/TDS detection, hazard classification) and 2D/3D visualization data."
    ),
    version=__version__,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Routers ---
app.include_router(health.router)
app.include_router(radar.router)
# Phase 3: app.include_router(analytics.router)
# Phase 4: app.include_router(alerts.router)


@app.get("/", tags=["meta"])
def root() -> dict:
    """Service banner."""
    return {
        "service": "DynamicRadar API",
        "version": __version__,
        "docs": "/docs",
    }
