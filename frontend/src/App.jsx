import { useEffect, useMemo, useState } from 'react';
import MapView from './components/MapView';
import Volume3D from './components/Volume3D';
import Sidebar from './components/Sidebar';
import SearchBar from './components/SearchBar';
import { getDemoAlerts, getDemoAnalytics, getScenarios } from './lib/api';

/** Is there a circulation worth a 3D look? (TDS, or a couplet >= moderate.) */
function hasSignificantCirculation(analytics) {
  return (analytics?.tornado_signatures || []).some(
    (s) => s.is_tds || s.severity === 'high' || s.severity === 'extreme'
  );
}

/**
 * DynamicRadar app shell (Phase 6 — search + demo scenarios).
 *
 * The app is driven by a selected demo *scenario* (tornado / hurricane /
 * squall / clear). The map search bar pans the camera to a city/region and
 * swaps in the matching scenario; all radar, analytics and alert data come
 * from the offline demo endpoints.
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

  // Scenario → analytics + alerts.
  useEffect(() => {
    if (!scenario) return;
    setAnalytics(null);
    getDemoAnalytics(scenario).then(setAnalytics).catch((e) => console.warn('analytics', e.message));
    getDemoAlerts(scenario)
      .then(setAlerts)
      .catch(() => setAlerts({ type: 'FeatureCollection', features: [] }));
  }, [scenario]);

  useEffect(() => setBannerDismissed(false), [analytics]);

  const activeMeta = useMemo(
    () => scenarios.find((s) => s.id === scenario) || null,
    [scenarios, scenario]
  );

  const circulationDetected = useMemo(() => hasSignificantCirculation(analytics), [analytics]);
  const showBanner = circulationDetected && viewMode === '2d' && !bannerDismissed;

  // Search bar → pan camera + swap scenario.
  const handleSearchSelect = (place) => {
    setCamera({ center: [place.lon, place.lat], zoom: place.zoom });
    if (place.scenario !== scenario) setScenario(place.scenario);
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>DynamicRadar</h1>
        <div className="header-right">
          <div className="view-toggle">
            <button className={viewMode === '2d' ? 'active' : ''} onClick={() => setViewMode('2d')}>2D Map</button>
            <button className={viewMode === '3d' ? 'active' : ''} onClick={() => setViewMode('3d')}>3D Volume</button>
          </div>
          <span className="app-status">{activeMeta ? `${activeMeta.station} · ${field}` : 'loading…'}</span>
        </div>
      </header>
      <div className="app-body">
        <Sidebar
          meta={activeMeta}
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
          <SearchBar onSelect={handleSearchSelect} activeScenario={scenario} />
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
              camera={camera}
              field={field}
              alerts={alerts}
              analytics={analytics}
              opacity={opacity}
              onSweepMeta={setSweepMeta}
            />
          ) : (
            <Volume3D scenario={scenario} field={field} analytics={analytics} vertExag={vertExag} />
          )}
        </div>
      </div>
    </div>
  );
}
