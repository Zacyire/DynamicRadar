# DynamicRadar

A high-performance web application that ingests **real-time NEXRAD Level II radar
data** (WSR-88D) and visualizes it with both **2D mapping** and **3D volumetric
rendering** of storm structures — in the spirit of Meteopool.

## Architecture

```
DynamicRadar/
├── backend/                  # Python · FastAPI · Py-ART · boto3
│   ├── app/
│   │   ├── main.py           # FastAPI entrypoint
│   │   ├── config.py         # Settings (pydantic-settings)
│   │   ├── routers/          # HTTP API routes
│   │   ├── services/         # NEXRAD fetch, Py-ART decode, analytics
│   │   ├── core/             # Shared models, station catalog, geo helpers
│   │   └── data/             # Static catalogs + runtime cache (gitignored)
│   └── requirements.txt
└── frontend/                 # React (Vite) · Mapbox GL JS · Three.js / R3F
    ├── src/
    │   ├── components/       # Map, 3D view, alert overlays, controls
    │   ├── hooks/            # Geolocation, radar data, alerts
    │   ├── lib/              # API client, color scales, constants
    │   └── styles/
    └── package.json
```

## Tech Stack

| Layer    | Technologies |
|----------|--------------|
| Backend  | Python 3.11, FastAPI, Uvicorn, [Py-ART](https://arm-doe.github.io/pyart/) (`arm-pyart`), AWS `boto3` (NEXRAD Level II on S3), NumPy/SciPy |
| Frontend | React 18, Vite, Mapbox GL JS, Three.js, `@react-three/fiber`, `@react-three/drei` |

## Core Features (build roadmap)

- [x] **Phase 1 — Project scaffolding** (this commit)
- [ ] **Phase 2 — Backend data pipeline**: fetch + decode latest sweep per station
- [ ] **Phase 3 — Analytics engine**: TVS/TDS detection, wind/width estimation, hazard classification (hail/snow/wind)
- [ ] **Phase 4 — Frontend 2D & alerts**: Mapbox, auto-location to nearest radar, NWS warning polygons, 2D reflectivity/velocity/CC plotting
- [ ] **Phase 5 — 3D volumetric view**: Three.js rendering of mesocyclone/tornado structure from elevation sweeps

## Getting Started

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate            # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                # configure as needed
uvicorn app.main:app --reload --port 8000
```

> NEXRAD Level II data lives in the public `noaa-nexrad-level2` S3 bucket and is
> read with **unsigned** boto3 requests — **no AWS credentials are required**.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env                # set VITE_MAPBOX_TOKEN
npm run dev
```

The frontend dev server proxies `/api` to the backend on `http://localhost:8000`.

## License

MIT
