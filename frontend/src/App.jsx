import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MapView from './components/MapView';
import Volume3D from './components/Volume3D';
import Sidebar from './components/Sidebar';
import SearchBar from './components/SearchBar';
import Timeline from './components/Timeline';
import {
  getAlerts,
  getAnalytics,
  getDemoAlerts,
  getDemoAnalytics,
  getScenarios,
} from './lib/api';
import { findStation } from './lib/stations';

// Live polling cadence — NEXRAD sites finish a volume scan every few minutes.
const LIVE_POLL_MS = 150000;

/** Is there a circulation worth a 3D look? (TDS, or a couplet >= moderate.) */
function hasSignificantCirculation(analytics) {
  return (analytics?.tornado_signatures || []).some(
    (s) => s.is_tds || s.severity === 'high' || s.severity === 'extreme'
  );
}

// Simulated minutes advanced per real second at 1× playback.
const SIM_MIN_PER_SEC = 4;
const STEP = 5;
const WINDOW = 120;

/**
 * DynamicRadar app shell — search + demo scenarios + playback timeline.
 *
 * A selected scenario is animated over a 2-hour lifecycle (`minute`, 0–120).
 * The 2D map crossfades between 5-minute frames for smooth scrubbing; the 3D
 * volume and analytics snap to the nearest frame.
 */
export default function App() {
  const [scenarios, setScenarios] = useState([]);
  const [scenario, setScenario] = useState('tornado');
  const [camera, setCamera] = useState(null);
  const [field, setField] = useState('Z');
  const [opacity, setOpacity] = useState(0.8);
  const [vertExag, setVertExag] = useState(4);
  const [viewMode, setViewMode] = useState('2d');
  const [analytics, setAnalytics] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [sweepMeta, setSweepMeta] = useState(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [sourceMode, setSourceMode] = useState('demo'); // 'demo' | 'live'
  const [liveStation, setLiveStation] = useState('KTBW');
  const [liveTick, setLiveTick] = useState(0); // bumps on each poll / manual refresh

  // Timeline state.
  const [minute, setMinute] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(true);

  // Analytics is evaluated per discrete frame (snap to nearest 5 min).
  const frameMinute = useMemo(() => Math.round(minute / STEP) * STEP, [minute]);
  const analyticsCache = useRef(new Map());

  // Load the scenario catalogue once; seed the camera from the default.
  useEffect(() => {
    getScenarios()
      .then((d) => {
        setScenarios(d.scenarios);
        const def = d.scenarios.find((s) => s.id === 'tornado') || d.scenarios[0];
        if (def) {
          setScenario(def.id);
          setCamera({ center: [def.lon, def.lat], zoom: def.zoom });
        }
      })
      .catch((e) => console.error('scenarios failed', e.message));
  }, []);

  // DEMO: warning polygon advances with the storm — per (scenario, frame).
  useEffect(() => {
    if (sourceMode !== 'demo' || !scenario) return;
    getDemoAlerts(scenario, { minute: frameMinute })
      .then(setAlerts)
      .catch(() => setAlerts({ type: 'FeatureCollection', features: [] }));
  }, [sourceMode, scenario, frameMinute]);

  // DEMO: analytics evolve with the storm — per (scenario, frame), cached.
  useEffect(() => {
    if (sourceMode !== 'demo' || !scenario) return;
    const key = `${scenario}|${frameMinute}`;
    const cache = analyticsCache.current;
    if (cache.has(key)) {
      setAnalytics(cache.get(key));
      return;
    }
    let cancelled = false;
    getDemoAnalytics(scenario, { minute: frameMinute })
      .then((a) => {
        cache.set(key, a);
        if (!cancelled) setAnalytics(a);
      })
      .catch((e) => console.warn('analytics', e.message));
    return () => {
      cancelled = true;
    };
  }, [sourceMode, scenario, frameMinute]);

  // LIVE: poll real analytics + NWS alerts for the selected station.
  useEffect(() => {
    if (sourceMode !== 'live' || !liveStation) return;
    let cancelled = false;
    setAnalytics(null);
    getAnalytics(liveStation)
      .then((a) => !cancelled && setAnalytics(a))
      .catch((e) => {
        if (!cancelled) setAnalytics(null);
        console.warn('live analytics', e.message);
      });
    const st = findStation(liveStation);
    if (st) {
      getAlerts(st.lat, st.lon, { radiusKm: 400 })
        .then((fc) => !cancelled && setAlerts(fc))
        .catch(() => !cancelled && setAlerts({ type: 'FeatureCollection', features: [] }));
    }
    return () => {
      cancelled = true;
    };
  }, [sourceMode, liveStation, liveTick]);

  // LIVE: poll for new scans on a clean interval; fly to the station.
  useEffect(() => {
    if (sourceMode !== 'live') return;
    setPlaying(false);
    const st = findStation(liveStation);
    if (st) setCamera({ center: [st.lon, st.lat], zoom: st.zoom });
    const id = setInterval(() => setLiveTick((t) => t + 1), LIVE_POLL_MS);
    return () => clearInterval(id);
  }, [sourceMode, liveStation]);

  // Reset caches + clock when the scenario changes.
  useEffect(() => {
    analyticsCache.current.clear();
    setMinute(0);
  }, [scenario]);

  useEffect(() => setBannerDismissed(false), [scenario]);

  // Playback loop: advance the lifecycle minute while playing.
  useEffect(() => {
    if (!playing) return;
    let raf;
    let last = performance.now();
    const tick = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      setMinute((m) => {
        let next = m + dt * SIM_MIN_PER_SEC * speed;
        if (next >= WINDOW) {
          if (loop) next -= WINDOW;
          else {
            next = WINDOW;
            setPlaying(false);
          }
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, loop]);

  const activeMeta = useMemo(
    () => scenarios.find((s) => s.id === scenario) || null,
    [scenarios, scenario]
  );
  const circulationDetected = useMemo(() => hasSignificantCirculation(analytics), [analytics]);
  const showBanner = circulationDetected && viewMode === '2d' && !bannerDismissed;

  const handleSearchSelect = (place) => {
    setCamera({ center: [place.lon, place.lat], zoom: place.zoom });
    if (place.scenario !== scenario) setScenario(place.scenario);
  };

  const scrub = useCallback((m) => {
    setPlaying(false);
    setMinute(m);
  }, []);

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>DynamicRadar</h1>
        <div className="header-right">
          <div className="view-toggle">
            <button className={viewMode === '2d' ? 'active' : ''} onClick={() => setViewMode('2d')}>2D Map</button>
            <button className={viewMode === '3d' ? 'active' : ''} onClick={() => setViewMode('3d')}>3D Volume</button>
          </div>
          <span className="app-status">
            {sourceMode === 'live' ? `${liveStation} · ${field} · LIVE` : activeMeta ? `${activeMeta.station} · ${field}` : 'loading…'}
          </span>
        </div>
      </header>
      <div className="app-body">
        <Sidebar
          meta={activeMeta}
          sourceMode={sourceMode}
          onSourceMode={setSourceMode}
          liveStation={liveStation}
          onLiveStation={setLiveStation}
          field={field}
          onField={setField}
          opacity={opacity}
          onOpacity={setOpacity}
          analytics={analytics}
          alertsCount={alerts?.features?.length || 0}
          sweepMeta={sweepMeta}
          viewMode={viewMode}
          vertExag={vertExag}
          onVertExag={setVertExag}
        />
        <div className="view-area">
          {sourceMode === 'demo' && <SearchBar onSelect={handleSearchSelect} activeScenario={scenario} />}
          {showBanner && (
            <div className="circ-banner">
              <span>⚠ Circulation detected — inspect the vertical structure in 3D.</span>
              <div>
                <button className="btn-inline" onClick={() => setViewMode('3d')}>Open 3D View</button>
                <button className="btn-inline ghost" onClick={() => setBannerDismissed(true)}>Dismiss</button>
              </div>
            </div>
          )}
          {viewMode === '2d' ? (
            <MapView
              scenario={scenario}
              sourceMode={sourceMode}
              station={liveStation}
              liveTick={liveTick}
              camera={camera}
              field={field}
              minute={minute}
              alerts={alerts}
              analytics={analytics}
              opacity={opacity}
              onSweepMeta={setSweepMeta}
            />
          ) : (
            <Volume3D
              scenario={scenario}
              sourceMode={sourceMode}
              station={liveStation}
              liveTick={liveTick}
              field={field}
              minute={frameMinute}
              analytics={analytics}
              vertExag={vertExag}
            />
          )}
        </div>
      </div>
      {sourceMode === 'demo' ? (
        <Timeline
          minute={minute}
          maxMinute={WINDOW}
          step={STEP}
          playing={playing}
          speed={speed}
          loop={loop}
          onScrub={scrub}
          onPlayPause={() => setPlaying((p) => !p)}
          onSpeed={setSpeed}
          onToggleLoop={() => setLoop((l) => !l)}
        />
      ) : (
        <div className="live-bar">
          <span className="live-dot" />
          <span className="live-label">LIVE NOAA FEED · {liveStation}</span>
          <span className="live-meta">
            {sweepMeta ? `Latest scan ${new Date(sweepMeta.scan_time).toUTCString().slice(17, 25)}Z` : 'streaming…'}
          </span>
          <button className="tl-btn small" onClick={() => setLiveTick((t) => t + 1)}>Refresh now</button>
        </div>
      )}
    </div>
  );
}
