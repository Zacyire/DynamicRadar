# Running DynamicRadar

A step-by-step guide to standing up the DynamicRadar stack from a fresh clone —
backend (FastAPI + Py-ART), frontend (React/Vite + Mapbox + Three.js), and the
offline testing modes that let you use the UI without hitting network egress
blocks.

> **TL;DR**
> 1. `cd backend && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt`
> 2. `uvicorn app.main:app --reload --port 8000`
> 3. `cd frontend && npm install && npm run dev`
> 4. Open the printed Vite URL (default http://localhost:5173). No Mapbox token?
>    The map shows a placeholder, but the API + 3D math still work — and add
>    `?demo=true` paths to exercise alerts offline (see [Testing Modes](#5-testing-modes)).

---

## 1. Prerequisites

| Tool | Version used | Notes |
|------|--------------|-------|
| Python | **3.11** | 3.10–3.12 should work; Py-ART wheels exist for these. |
| Node.js | **22 LTS** | 18+ is fine. Ships with npm 10. |
| Git | any recent | |

---

## 2. System Dependencies (native libraries for Py-ART)

`arm-pyart` and its scientific stack (NumPy, SciPy, netCDF4) install from
**prebuilt binary wheels** on the common platforms below, so in the normal case
**no system compilers are required** — `pip install -r requirements.txt` just
works. The native libraries you may need only come into play if pip has to build
something from source (an unusual platform/arch, or a pinned version with no
wheel).

### Linux (Debian/Ubuntu)
```bash
sudo apt-get update
sudo apt-get install -y \
  build-essential gfortran \      # C/C++/Fortran toolchain (SciPy/NumPy from source)
  python3-dev \                   # Python headers
  libhdf5-dev libnetcdf-dev \     # HDF5/netCDF — Py-ART I/O + netCDF4
  libgeos-dev libproj-dev         # GEOS/PROJ — geometry & map projections
```

### macOS (Homebrew)
```bash
brew install hdf5 netcdf geos proj
# Apple Silicon: if a source build can't find them, export:
#   export HDF5_DIR="$(brew --prefix hdf5)"
#   export NETCDF4_DIR="$(brew --prefix netcdf)"
```

### Windows
Use **WSL2** (then follow the Linux steps) or **conda**, which bundles the
native libs:
```bash
conda create -n dynamicradar python=3.11
conda activate dynamicradar
conda install -c conda-forge arm_pyart   # pulls HDF5/netCDF/GEOS/PROJ as deps
pip install -r backend/requirements.txt  # the remaining web/test deps
```

> **Why these libs?** Py-ART decodes NEXRAD archives and can read/write netCDF
> (→ HDF5 + netCDF), and its gridding/geolocation helpers lean on GEOS/PROJ. The
> three primary moments we use (Z, V, CC) only need the core read path, but
> installing the full set keeps optional features and any source builds happy.

### Verify the native stack imports
```bash
source backend/venv/bin/activate
python -c "import pyart, numpy, scipy, netCDF4; print('Py-ART', pyart.__version__, 'OK')"
```

---

## 3. Backend — FastAPI + Py-ART

```bash
cd backend

# 3a. Create & activate the virtual environment
python3 -m venv venv
source venv/bin/activate            # Windows: venv\Scripts\activate

# 3b. Install Python dependencies
pip install --upgrade pip
pip install -r requirements.txt

# 3c. (Optional) configure environment
cp .env.example .env                # defaults are sensible; edit if needed

# 3d. Run the API server
uvicorn app.main:app --reload --port 8000
```

- App entrypoint: **`app/main.py`** (the `app` object).
- Interactive API docs: **http://localhost:8000/docs**
- Health check: **http://localhost:8000/api/health**

### NEXRAD data source (no AWS credentials needed)
Level II data is read from a **public S3 bucket with anonymous/unsigned**
requests. The default bucket is the **Unidata mirror** (`unidata-nexrad-level2`),
chosen because the canonical NOAA bucket (`noaa-nexrad-level2`) is unreachable
from some networks. Both share the same `YYYY/MM/DD/ICAO/` layout; switch via
`.env`:
```bash
NEXRAD_BUCKET=noaa-nexrad-level2    # use the NOAA bucket if reachable for you
```

### Key endpoints
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Liveness probe |
| GET | `/api/radar/nearest?lat=&lon=` | Nearest WSR-88D (geolocation auto-connect) |
| GET | `/api/radar/{station}/latest` | Latest volume-scan metadata |
| GET | `/api/radar/{station}/sweep?field=Z\|V\|CC` | One decoded polar sweep (2D plotting) |
| GET | `/api/radar/{station}/volume?field=Z` | All elevation tilts (3D stacking) |
| GET | `/api/analytics/{station}` | TVS/TDS detection + hazard classification |
| GET | `/api/alerts/active?lat=&lon=` | Live NWS warning polygons (GeoJSON) |

### Run the backend tests
```bash
cd backend
source venv/bin/activate
pytest -q                           # 17 offline tests (no network)
```

---

## 4. Frontend — React / Vite / Mapbox / Three.js

```bash
cd frontend

# 4a. Install dependencies
npm install

# 4b. Configure the Mapbox token (required for the live 2D map)
cp .env.example .env
#   Edit .env and set:
#   VITE_MAPBOX_TOKEN=pk.xxxx-your-token   (https://account.mapbox.com/access-tokens/)
#   VITE_API_BASE=                          (leave empty in dev — Vite proxies /api)

# 4c. Start the dev server
npm run dev                         # serves http://localhost:5173
```

- The Vite dev server **proxies `/api` → `http://localhost:8000`** (see
  `vite.config.js`), so run the backend first.
- **No Mapbox token?** The 2D map renders a "token required" placeholder, but the
  rest of the app (API calls, analytics sidebar, 3D volumetric view) still works.
- **Production build:** `npm run build` → output in `dist/`, preview with
  `npm run preview`.

> The bundle is large (~2 MB) because it includes `mapbox-gl` **and** `three` +
> `@react-three/fiber`. That's expected; code-splitting the 3D view behind a
> dynamic `import()` is a known future optimization.

### Using the app
1. The app requests your **browser geolocation** (falls back to Oklahoma
   City / KTLX if denied) and auto-connects to the **nearest WSR-88D**.
2. Toggle products **Z / V / CC** and overlay opacity in the sidebar.
3. **NWS warnings** draw as box-style polygons (Tornado = red, Severe
   T-storm = orange, Flash Flood = green).
4. When the analytics engine flags a **significant circulation** (a confirmed
   TDS, or a high/extreme couplet), a banner offers to open the **3D Volumetric
   View** — or toggle **2D Map / 3D Volume** in the header anytime. In 3D,
   orbit with the mouse and use the **vertical-exaggeration** slider.

---

## 5. Testing Modes (offline / egress-blocked networks)

Some networks block outbound access to data providers. Two independent
fallbacks keep the app usable:

### a. NWS warnings — `?demo=true`
The live NWS API (`api.weather.gov`) may be blocked. Append **`demo=true`** to
the alerts endpoint to get **clearly-labelled sample polygons** (every headline
is prefixed `[DEMO]`, so they're never mistaken for real warnings):

```bash
# Three labelled demo warning polygons near a point:
curl "http://localhost:8000/api/alerts/active?lat=35.33&lon=-97.28&demo=true"
```

In the **UI**, tick **"Demo polygons (offline)"** in the sidebar's *NWS
Warnings* card to render them on the map and exercise the legend/popups without
any network call to NWS.

### b. Radar data — Unidata mirror (default)
Radar fetching already defaults to the reachable **Unidata** S3 mirror, so the
data pipeline, analytics, 2D plotting, and 3D stacking all work against **live
radar** out of the box. If your network reaches the NOAA bucket instead, set
`NEXRAD_BUCKET=noaa-nexrad-level2` in `backend/.env`.

### c. Finding an active storm to test analytics/3D
A quiet station yields "No significant signatures." To see TVS/TDS markers,
hail, and a rich 3D structure, point at a station with active convection. Quick
scan for the hottest reflectivity among a few stations:

```bash
cd backend && source venv/bin/activate
python - <<'PY'
import warnings; warnings.filterwarnings("ignore")
import numpy as np
from app.services import nexrad_fetch, radar_decode
for st in ["KTLX","KFWS","KICT","KDDC","KAMA","KLBB","KMLB","KSHV"]:
    try:
        _, path = nexrad_fetch.fetch_latest(st)
        s = radar_decode.extract_sweep(radar_decode.read_radar(str(path)),
                                        "reflectivity", range_stride=4)
        flat = np.array([v for row in s["data"] for v in row if v is not None])
        print(f"{st}: max {flat.max():.0f} dBZ" if flat.size else f"{st}: no echo")
    except Exception as e:
        print(st, "err", str(e)[:40])
PY
```
Then open the UI and the station closest to you, or hit
`/api/analytics/<STATION>` directly.

---

## 6. Quick reference — two terminals

```bash
# Terminal 1 — backend
cd backend && source venv/bin/activate && uvicorn app.main:app --reload --port 8000

# Terminal 2 — frontend
cd frontend && npm run dev
```

| Thing | URL |
|-------|-----|
| Frontend (Vite) | http://localhost:5173 |
| Backend API docs | http://localhost:8000/docs |
| Health | http://localhost:8000/api/health |
| Demo alerts | http://localhost:8000/api/alerts/active?lat=35.33&lon=-97.28&demo=true |

---

## 7. Troubleshooting

| Symptom | Likely cause / fix |
|---------|--------------------|
| `pip install` fails building HDF5/netCDF | Install the [system deps](#2-system-dependencies-native-libraries-for-py-art), or use the conda path. |
| `Access Denied` fetching radar | NOAA bucket blocked on your network — keep the default `NEXRAD_BUCKET=unidata-nexrad-level2`. |
| Alerts return `502` | `api.weather.gov` unreachable — use `?demo=true` or the sidebar demo toggle. |
| Map shows "Mapbox token required" | Set `VITE_MAPBOX_TOKEN` in `frontend/.env`, restart `npm run dev`. |
| Frontend can't reach API | Start the backend first; Vite proxies `/api` → `:8000`. |
| "No significant signatures" | The station is quiet — pick one with active convection ([§5c](#c-finding-an-active-storm-to-test-analytics3d)). |
