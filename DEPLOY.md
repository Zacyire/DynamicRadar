# Deploying DynamicRadar

How to host the FastAPI backend in the cloud (so it can reach the NOAA NEXRAD
S3 buckets that are blocked on local networks) and point the frontend at it.

## Why deploy the backend?
NEXRAD Level II lives in public AWS S3 buckets. Many home/office networks block
that egress, so the local backend returns a clean **502** ("provider blocked").
A cloud host (Render, Fly.io, Railway, etc.) has open egress, so the same code
streams **live** radar once deployed.

---

## 1. Backend adjustments for production (already in the code)

| Concern | How it's handled |
|--------|------------------|
| **Port** | The app never hardcodes a listen port. The start command binds `--host 0.0.0.0 --port $PORT`; Render/Heroku inject `$PORT`. |
| **CORS** | `CORS_ORIGINS` (env, comma-separated) drives `app/main.py`. Set it to your frontend URL. A single `*` allows any origin (credentials auto-disabled) for a quick first test. |
| **Python version** | `backend/runtime.txt` pins `python-3.11.9`; `render.yaml` also sets `PYTHON_VERSION`. |
| **Native libs (Py-ART)** | Installs from manylinux wheels on Render's native runtime — no system packages needed. (A `backend/Dockerfile` is included as a fallback that installs HDF5/netCDF/GEOS/PROJ.) |
| **Data source** | Set `NEXRAD_BUCKET=noaa-nexrad-level2` in the cloud (reachable there). |
| **Cache** | `CACHE_DIR=/tmp/nexrad-cache` keeps downloaded scans on the ephemeral writable disk. |
| **Health check** | `GET /api/health` (configured in `render.yaml`). |

---

## 2. Deploy to Render (Blueprint)

1. Push this repo to GitHub (already done).
2. Render → **New +** → **Blueprint** → select the repo. It reads `render.yaml`
   and provisions the `dynamicradar-api` web service (root dir `backend`).
3. Edit the env vars on the service:
   - `CORS_ORIGINS` → your frontend URL (or `*` to start).
   - `NWS_USER_AGENT` → `DynamicRadar (your-real-email)`.
4. Deploy. When live you'll get a URL like
   `https://dynamicradar-api.onrender.com`.
5. Verify:
   ```
   curl https://dynamicradar-api.onrender.com/api/health
   curl https://dynamicradar-api.onrender.com/api/radar/KTLX/latest
   ```

**Manual setup (no Blueprint):** New Web Service → root dir `backend` →
Build `pip install -r requirements.txt` →
Start `uvicorn app.main:app --host 0.0.0.0 --port $PORT` → add the env vars above.

**Docker path:** point the service at `backend/Dockerfile` instead of the native
runtime; the `CMD` already honors `$PORT`.

---

## 3. Point the frontend at the cloud backend

The API client (`frontend/src/lib/api.js`) already uses `VITE_API_BASE`:

```js
const API_BASE = import.meta.env.VITE_API_BASE || '';
```

So just set it in `frontend/.env`:

```bash
# frontend/.env
VITE_MAPBOX_TOKEN=pk.your-token
VITE_API_BASE=https://dynamicradar-api.onrender.com   # no trailing slash
```

Then **rebuild** (Vite inlines env vars at build time):

```bash
cd frontend
npm run build      # or: npm run dev  (dev also reads .env)
```

Two gotchas:
- **Rebuild after changing `.env`** — a running `npm run build` output won't pick
  up the new value until you rebuild.
- **CORS must include the frontend origin** — set `CORS_ORIGINS` on the backend
  to wherever the frontend is served (your Vercel/Netlify URL, or
  `http://localhost:5173` when developing against the cloud backend).

---

## 4. Live data: API is ready, UI wiring is the next step

The **live API endpoints are already deployable and work in the cloud**:

```
GET /api/radar/{station}/latest      # e.g. KTLX, KFWS, KTLX, KAMA …
GET /api/radar/{station}/sweep?field=Z
GET /api/radar/{station}/volume?field=Z
GET /api/analytics/{station}
GET /api/alerts/active?lat=&lon=      # live NWS warnings
```

The current **dashboard UI renders the demo scenarios** (so it's always usable
offline). To stream live radar in the UI, the remaining step is a small
front-end change: a **Demo / Live** switch plus a WSR-88D station selector that
points the existing `getSweep` / `getVolume` / `getAnalytics` / `getAlerts`
helpers (already in `lib/api.js`) at a live station instead of a demo scenario.
Until then you can hit the live endpoints directly (curl / the `/docs` Swagger
UI on the deployed backend) to confirm live data flows.
