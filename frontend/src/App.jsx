import { useCallback, useEffect, useMemo, useState } from 'react';
import MapView from './components/MapView';
import Volume3D from './components/Volume3D';
import Sidebar from './components/Sidebar';
import { useGeolocation } from './hooks/useGeolocation';
import { getAlerts, getAnalytics, getNearestStation } from './lib/api';

/** Is there a circulation worth a 3D look? (TDS, or a couplet >= moderate.) */
function hasSignificantCirculation(analytics) {
  return (analytics?.tornado_signatures || []).some(
    (s) => s.is_tds || s.severity === 'high' || s.severity === 'extreme'
  );
}

/**
 * DynamicRadar 2D interface (Phase 4).
 *
 * Flow: geolocate → resolve nearest WSR-88D → load the latest sweep + storm
 * analytics + NWS warnings, and render them on the Mapbox map.
 */
export default function App() {
  const { coords, status: geoStatus } = useGeolocation();
  const [station, setStation] = useState(null);
  const [field, setField] = useState('Z');
  const [opacity, setOpacity] = useState(0.8);
  const [analytics, setAnalytics] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [alertsError, setAlertsError] = useState('');
  const [demoAlerts, setDemoAlerts] = useState(false);
  const [sweepMeta, setSweepMeta] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [viewMode, setViewMode] = useState('2d'); // '2d' | '3d'
  const [vertExag, setVertExag] = useState(4);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Geolocation → nearest station.
  useEffect(() => {
    if (!coords) return;
    getNearestStation(coords.lat, coords.lon)
      .then(setStation)
      .catch((e) => console.error('nearest station failed', e));
  }, [coords]);

  // Station → analytics (non-fatal).
  useEffect(() => {
    if (!station) return;
    setAnalytics(null);
    getAnalytics(station.icao)
      .then(setAnalytics)
      .catch((e) => console.warn('analytics failed', e.message));
  }, [station, refreshKey]);

  // Coords/station → NWS warnings (non-fatal; supports demo mode).
  useEffect(() => {
    if (!coords) return;
    setAlertsError('');
    getAlerts(coords.lat, coords.lon, { demo: demoAlerts })
      .then((fc) => setAlerts(fc))
      .catch((e) => {
        setAlerts({ type: 'FeatureCollection', features: [] });
        setAlertsError(e.message);
      });
  }, [coords, demoAlerts, refreshKey]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Reset the circulation prompt whenever a fresh analysis arrives.
  useEffect(() => setBannerDismissed(false), [analytics]);

  const circulationDetected = useMemo(() => hasSignificantCirculation(analytics), [analytics]);
  const showBanner = circulationDetected && viewMode === '2d' && !bannerDismissed;

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
            {station ? `${station.icao} · ${field}` : 'initializing…'}
          </span>
        </div>
      </header>
      <div className="app-body">
        <Sidebar
          station={station}
          geoStatus={geoStatus}
          field={field}
          onField={setField}
          opacity={opacity}
          onOpacity={setOpacity}
          demoAlerts={demoAlerts}
          onDemoAlerts={setDemoAlerts}
          alertsCount={alerts?.features?.length || 0}
          alertsError={alertsError}
          analytics={analytics}
          sweepMeta={sweepMeta}
          onRefresh={refresh}
          viewMode={viewMode}
          vertExag={vertExag}
          onVertExag={setVertExag}
        />
        <div className="view-area">
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
              key={refreshKey}
              station={station}
              field={field}
              alerts={alerts}
              analytics={analytics}
              opacity={opacity}
              onSweepMeta={setSweepMeta}
            />
          ) : (
            <Volume3D station={station} field={field} analytics={analytics} vertExag={vertExag} />
          )}
        </div>
      </div>
    </div>
  );
}
