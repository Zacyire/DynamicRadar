import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { getSweep } from '../lib/api';
import { renderSweepToImage } from '../lib/radarRender';

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

// Box-style colors per warning type (NWS convention).
const EVENT_COLOR = [
  'match',
  ['get', 'event'],
  'Tornado Warning', '#ff2d2d',
  'Severe Thunderstorm Warning', '#ffb000',
  'Flash Flood Warning', '#2ecc71',
  /* default */ '#9aa0b5',
];

const SEVERITY_COLOR = [
  'match',
  ['get', 'severity'],
  'extreme', '#ff00ff',
  'high', '#ff2d2d',
  'moderate', '#ffb000',
  /* default */ '#4cc9f0',
];

/**
 * The 2D Mapbox map: base map + radar overlay (Z/V/CC) + NWS warning polygons
 * + TVS/TDS detection markers. Sweep data is fetched here (keyed by station and
 * field) and georeferenced client-side into a raster image overlay.
 */
export default function MapView({ station, field, alerts, analytics, opacity = 0.8, onSweepMeta }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [renderMsg, setRenderMsg] = useState('');

  // --- map init ---------------------------------------------------------- //
  useEffect(() => {
    if (!TOKEN || mapRef.current) return;
    mapboxgl.accessToken = TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-97.5, 35.4],
      zoom: 6,
    });
    map.addControl(new mapboxgl.NavigationControl(), 'top-left');
    map.on('load', () => setReady(true));
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // --- recenter + station marker when station changes -------------------- //
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !station) return;
    map.flyTo({ center: [station.lon, station.lat], zoom: 7, speed: 1.2 });
    if (markerRef.current) markerRef.current.remove();
    markerRef.current = new mapboxgl.Marker({ color: '#4cc9f0' })
      .setLngLat([station.lon, station.lat])
      .setPopup(new mapboxgl.Popup().setText(`${station.icao} — ${station.name}`))
      .addTo(map);
  }, [ready, station]);

  // --- radar overlay: fetch sweep + render image source ------------------ //
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !station) return;
    let cancelled = false;
    setRenderMsg('Loading sweep…');

    getSweep(station.icao, { field, maxRangeKm: 300, rangeStride: 2 })
      .then((sweep) => {
        if (cancelled) return;
        onSweepMeta?.(sweep);
        const { url, coordinates } = renderSweepToImage(sweep, { size: 1400 });
        const src = map.getSource('radar-src');
        if (src) {
          src.updateImage({ url, coordinates });
        } else {
          map.addSource('radar-src', { type: 'image', url, coordinates });
          map.addLayer({
            id: 'radar-layer',
            type: 'raster',
            source: 'radar-src',
            paint: { 'raster-opacity': opacity, 'raster-resampling': 'nearest', 'raster-fade-duration': 0 },
          });
          // Keep warning polygons above radar.
          if (map.getLayer('alerts-line')) map.moveLayer('radar-layer', 'alerts-fill');
        }
        setRenderMsg('');
      })
      .catch((err) => {
        if (!cancelled) setRenderMsg(`Radar: ${err.message}`);
      });

    return () => {
      cancelled = true;
    };
  }, [ready, station, field]);

  // --- opacity ----------------------------------------------------------- //
  useEffect(() => {
    const map = mapRef.current;
    if (map?.getLayer('radar-layer')) map.setPaintProperty('radar-layer', 'raster-opacity', opacity);
  }, [opacity]);

  // --- NWS warning polygons ---------------------------------------------- //
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const fc = alerts || { type: 'FeatureCollection', features: [] };
    const src = map.getSource('alerts-src');
    if (src) {
      src.setData(fc);
      return;
    }
    map.addSource('alerts-src', { type: 'geojson', data: fc });
    map.addLayer({
      id: 'alerts-fill',
      type: 'fill',
      source: 'alerts-src',
      paint: { 'fill-color': EVENT_COLOR, 'fill-opacity': 0.12 },
    });
    map.addLayer({
      id: 'alerts-line',
      type: 'line',
      source: 'alerts-src',
      paint: { 'line-color': EVENT_COLOR, 'line-width': 2.5 },
    });
    map.on('click', 'alerts-fill', (e) => {
      const p = e.features?.[0]?.properties;
      if (!p) return;
      new mapboxgl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(`<strong>${p.event}</strong><br/>${p.headline || ''}<br/><em>${p.areaDesc || ''}</em>`)
        .addTo(map);
    });
    map.on('mouseenter', 'alerts-fill', () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', 'alerts-fill', () => (map.getCanvas().style.cursor = ''));
  }, [ready, alerts]);

  // --- TVS / TDS detection markers --------------------------------------- //
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const features = (analytics?.tornado_signatures || []).map((s) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
      properties: { ...s, label: s.is_tds ? 'TDS' : 'TVS' },
    }));
    const fc = { type: 'FeatureCollection', features };
    const src = map.getSource('tvs-src');
    if (src) {
      src.setData(fc);
      return;
    }
    map.addSource('tvs-src', { type: 'geojson', data: fc });
    map.addLayer({
      id: 'tvs-circle',
      type: 'circle',
      source: 'tvs-src',
      paint: {
        'circle-radius': ['case', ['get', 'is_tds'], 11, 8],
        'circle-color': SEVERITY_COLOR,
        'circle-opacity': 0.55,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': ['case', ['get', 'is_tds'], 3, 1.5],
      },
    });
    map.addLayer({
      id: 'tvs-label',
      type: 'symbol',
      source: 'tvs-src',
      layout: { 'text-field': ['get', 'label'], 'text-size': 11, 'text-offset': [0, -1.4] },
      paint: { 'text-color': '#ffffff', 'text-halo-color': '#000', 'text-halo-width': 1 },
    });
    map.on('click', 'tvs-circle', (e) => {
      const p = e.features?.[0]?.properties;
      if (!p) return;
      new mapboxgl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(
          `<strong>${p.is_tds === 'true' || p.is_tds === true ? 'Tornadic Debris Signature' : 'Velocity Couplet'}</strong><br/>` +
            `Vrot: ${p.rotational_velocity_kt} kt<br/>` +
            `ΔV: ${p.delta_v_ms} m/s · width: ${Math.round(p.diameter_m)} m<br/>` +
            `Est. peak wind: ${p.estimated_peak_wind_mph} mph<br/>` +
            `${p.ef_estimate} · severity: ${p.severity}`
        )
        .addTo(map);
    });
    map.on('mouseenter', 'tvs-circle', () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', 'tvs-circle', () => (map.getCanvas().style.cursor = ''));
  }, [ready, analytics]);

  if (!TOKEN) {
    return (
      <div className="map-placeholder">
        <h2>Mapbox token required</h2>
        <p>
          Set <code>VITE_MAPBOX_TOKEN</code> in <code>frontend/.env</code> and restart the dev
          server to load the 2D map.
        </p>
      </div>
    );
  }

  return (
    <div className="map-wrap">
      <div ref={containerRef} className="map-canvas" />
      {renderMsg && <div className="map-toast">{renderMsg}</div>}
    </div>
  );
}
