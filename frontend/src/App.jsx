import { useCallback, useEffect, useState } from 'react';
import MapView from './components/MapView';
import Sidebar from './components/Sidebar';
import { useGeolocation } from './hooks/useGeolocation';
import { getAlerts, getAnalytics, getNearestStation } from './lib/api';

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

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>DynamicRadar</h1>
        <span className="app-status">
          {station ? `${station.icao} · ${field}` : 'initializing…'}
        </span>
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
        />
        <MapView
          key={refreshKey}
          station={station}
          field={field}
          alerts={alerts}
          analytics={analytics}
          opacity={opacity}
          onSweepMeta={setSweepMeta}
        />
      </div>
    </div>
  );
}
