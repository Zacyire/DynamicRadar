# CLAUDE.md

Orientation for AI assistants (and humans) picking up **DynamicRadar**. Read
this first, then `README.md` for the feature overview and `RUNNING.md` for setup.

## What this is
A real-time 3D weather-radar web app: it ingests **NEXRAD Level II** (WSR-88D)
data, decodes the primary moments, runs a storm-analytics engine
(TVS/TDS + hazards), and visualizes everything in a **2D Mapbox map** and a
**3D volumetric view**. All five build phases are complete and on GitHub.

## Tech stack
- **Backend:** Python 3.11, FastAPI, Uvicorn, **Py-ART** (`arm-pyart`), **boto3**
  (anonymous S3), NumPy/SciPy.
- **Frontend:** React 18, Vite, **Mapbox GL JS** (2D), **Three.js /
  @react-three/fiber + drei** (3D).

## Layout
```
backend/app/
  main.py            FastAPI app + router wiring
  config.py          pydantic-settings (.env)
  routers/           health, radar, analytics, alerts, demo
  services/
    nexrad_fetch.py  boto3 anonymous S3 fetch (latest volume scan)
    radar_decode.py  Py-ART decode: sweeps, Z/V/CC, dealiasing, volume tilts
    analytics.py     TVS/TDS detection, attributes, hazard classification (numpy-only)
    demo_scenarios.py synthetic offline datasets (tornado/hurricane/squall/clear)
  core/              geo helpers, models (pydantic), station catalog
  tests/             17 offline tests (no network)
frontend/src/
  App.jsx            top-level state, scenario/source, 2D/3D toggle, timeline, banner
  components/        MapView (2D), Volume3D (3D), Sidebar, SearchBar, Timeline
  hooks/             useGeolocation (legacy live-mode helper)
  lib/               api, colormaps, radarRender (2D georef), volume3d (3D beam math),
                     places (search catalog), sample (crosshair polar lookup)
```

## How the pieces fit
1. **Geolocate → nearest radar:** browser coords → `/api/radar/nearest` →
   WSR-88D ICAO (`useGeolocation` + `core/stations.py`).
2. **Fetch + decode:** `nexrad_fetch` pulls the latest `*_V06` from public S3
   (anonymous); `radar_decode` parses it with Py-ART into compact **polar**
   arrays (azimuths, ranges, rays×gates values).
3. **Analytics:** `analytics.py` runs on the polar data — gate-to-gate
   azimuthal shear couplets (TVS), CC-drop cross-reference (TDS), diameter /
   rotational-wind estimates, and hail/snow/wind hazards.
4. **2D render:** `lib/radarRender.js` georeferences polar gates onto a canvas →
   Mapbox image source; warnings + detection markers overlay on top.
5. **3D render:** `/api/radar/{station}/volume` returns all tilts;
   `lib/volume3d.js` places each gate via the 4/3-earth beam model and builds a
   colored point cloud in `Volume3D.jsx`.

## Domain decisions worth knowing
- **Polar, not per-gate lat/lon:** the backend returns compact polar data;
  georeferencing happens client-side (small payloads). 2D uses an equirectangular
  canvas → Mapbox image-source quad; 3D uses the 4/3-earth beam-height model.
- **Split cuts:** at low tilts NEXRAD carries Z and V in *separate* sweeps at the
  same elevation. Decode logic picks the lowest sweep that actually has valid
  data **per moment**; `unique_elevation_sweeps()` collapses duplicates for 3D.
- **Velocity dealiasing:** raw velocity is aliased at the Nyquist co-interval and
  folds masquerade as couplets. Analytics + the 3D volume **dealias first**
  (`ensure_dealiased_velocity`, Py-ART region-based).
- **TVS gating:** couplets are confined to gates with reflectivity
  (`TVS_MIN_REFLECTIVITY`) so clear-air noise isn't flagged. Wind hazards are
  likewise reflectivity-gated.
- **Documented caveats (intentional):** far-range circulation **diameters look
  large** due to beam broadening; the **snow heuristic is temperature-less**
  (Z/CC only). Both are inherent to single-radar polar analysis.

## Environment / egress notes (important)
This was built in a sandbox with a restrictive egress proxy. Equivalent
restrictions may apply wherever it next runs:
- **NOAA bucket `noaa-nexrad-level2` was blocked** → default is the **Unidata
  mirror** `unidata-nexrad-level2` (same layout). Override via `NEXRAD_BUCKET`.
- **`api.weather.gov` (NWS) was blocked** → the alerts endpoint supports
  **`?demo=true`** returning labelled sample polygons. The live integration is
  correct and works where NWS is reachable.
- **Mapbox needs `VITE_MAPBOX_TOKEN`** in `frontend/.env`; without it the map
  shows a placeholder (everything else still works).
- **Anonymous S3** (boto3 `UNSIGNED`) — **no AWS credentials required.**

## Conventions
- Backend handlers that do Py-ART / S3 work are **sync `def`** so FastAPI runs
  them in its threadpool.
- Analytics is **pure numpy** (no Py-ART import) → unit-testable with synthetic
  fields. Keep it that way.
- Thresholds live as **module constants** at the top of `analytics.py`; tune
  there, not inline.
- Run `pytest -q` in `backend/` after touching decode/analytics (17 tests, all
  offline). Run `npm run build` after frontend changes.

## Demo scenarios + search (offline-first UX)
The UI is driven by a selected **demo scenario** rather than live geolocation.
- `services/demo_scenarios.py` generates synthetic but physically-plausible
  polar fields (tornado, hurricane, squall/derecho, clear) that flow through the
  *same* analytics + render pipeline. Served under `/api/demo/{scenario}/...`.
- Frontend `SearchBar` + `lib/places.js`: typing a city/region pans the Mapbox
  camera and swaps in the matching scenario. No network needed.
- Live endpoints still exist; `_load_latest` now returns **502** (not 500) when
  the S3 provider is blocked, pointing clients at `/api/demo/scenarios`.

## Playback timeline (storm lifecycle)
Each demo scenario is a *living* simulation over a 2-hour window (5-min steps,
25 frames), driven by a `minute` (0–120) query param on the demo endpoints.
- `demo_scenarios.py` field funcs take `minute`; lifecycle envelopes
  (`_smoothstep`/`_bell`) evolve reflectivity, velocity and CC **together** so the
  couplet tightens exactly as the hook echo peaks. Tornado arc: rain blob →
  hook (~30) → TVS+TDS peak (~60) → weakening (~90) → dissipation (~120).
- Frontend `components/Timeline.jsx` (bottom bar): play/pause/loop, 1×/2×/5×,
  digital sim-clock. `App` runs the playback rAF; **2D crossfades** two adjacent
  5-min frames (`MapView` radar-a/radar-b layers) for smooth scrubbing; 3D +
  analytics snap to the nearest frame (cached).
- **Advancing warnings:** `demo_scenarios.alert_features(scenario, minute)`
  emits one warning polygon downstream of the storm core (Tornado/red at peak,
  else Severe/yellow); `MapView` blinks it via the sweep rAF.

## Workstation UI extras
- **Inspect crosshair** (`MapView` tool menu + `lib/sample.js`): O(1) polar
  lookup of Z & V under the cursor → floating HUD (dBZ / MPH). No canvas reads.
- **Station Source switch** (Sidebar): Demo ⇄ Live NOAA. In **Live** mode a
  station dropdown (`lib/stations.py` → KTBW/KTLX/KOKX/KHGX) drives the live
  endpoints; `App` polls `getSweep`/`getVolume`/`getAnalytics` every ~2.5 min
  (and on manual refresh), a retro spinner shows while a scan downloads, and
  the timeline is replaced by a LIVE status bar. NWS alerts come from the real
  feed (needs open egress; degrades to empty when blocked).
- **Meteorological Log** (Sidebar): per-frame max core dBZ, peak rotational
  shear (kt/mph), and an estimated hail size — driven by new
  `AnalysisResult.max_reflectivity_dbz` / `peak_rotational_velocity_kt`.

## Status & next ideas
- **Done:** Phases 1–5 + offline demo-scenario search, committed/pushed to
  `claude/dynamic-radar-project-init-l5ta0z`.
- **Not started:** opening a PR (deferred by request); auto-refresh/looping
  scans; code-splitting the 3D bundle; expanding the seed station catalog
  (`core/stations.py`) to the full ~160-site network from NWS metadata.

## Git
- Work on branch **`claude/dynamic-radar-project-init-l5ta0z`**.
- Push: `git push -u origin claude/dynamic-radar-project-init-l5ta0z`
  (repo write access is granted; remote routes through the managed git proxy).
