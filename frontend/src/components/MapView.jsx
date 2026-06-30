import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { getDemoSweep } from '../lib/api';
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

const DEG2RAD = Math.PI / 180;
const METERS_PER_DEG_LAT = 111320;

function offsetLngLat([lon, lat], eastM, northM) {
  return [
    lon + eastM / (METERS_PER_DEG_LAT * Math.cos(lat * DEG2RAD)),
    lat + northM / METERS_PER_DEG_LAT,
  ];
}

/** A point on the radar circle at azimuth `deg` (CW from N), `radiusKm` out. */
function rim(center, radiusKm, deg) {
  const r = radiusKm * 1000;
  return offsetLngLat(center, r * Math.sin(deg * DEG2RAD), r * Math.cos(deg * DEG2RAD));
}

/**
 * Build the rotating-sweep geometry: a fading trail of wedges behind the
 * leading beam, plus the bright leading line. Mimics a scanning radar dish.
 */
function sweepGeoJSON(center, radiusKm, leadDeg) {
  const segments = 14;
  const segWidth = 3.2; // degrees per trailing wedge
  const features = [];
  for (let k = 0; k < segments; k++) {
    const a1 = leadDeg - k * segWidth;
    const a0 = a1 - segWidth;
    const ring = [center, rim(center, radiusKm, a0), rim(center, radiusKm, a1), center];
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [ring] },
      properties: { op: 0.2 * (1 - k / segments) ** 1.5 },
    });
  }
  const trail = { type: 'FeatureCollection', features };
  const beam = {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [center, rim(center, radiusKm, leadDeg)] },
    properties: {},
  };
  return { trail, beam };
}

/**
 * The 2D Mapbox map: base map + radar overlay (Z/V/CC) + NWS warning polygons
 * + TVS/TDS detection markers. Sweep data for the active demo scenario is
 * fetched here and georeferenced client-side into a raster image overlay. The
 * camera flies to `camera` whenever it changes (driven by the search bar).
 */
export default function MapView({ scenario, camera, field, alerts, analytics, opacity = 0.8, onSweepMeta }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const radarRef = useRef(null); // { center: [lon,lat], radiusKm } for the sweep
  const [ready, setReady] = useState(false);
  const [renderMsg, setRenderMsg] = useState('');

  // --- map init ---------------------------------------------------------- //
  useEffect(() => {
    if (!TOKEN || mapRef.current) return;
    mapboxgl.accessToken = TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: camera?.center || [-97.5, 35.4],
      zoom: camera?.zoom || 7,
    });
    map.addControl(new mapboxgl.NavigationControl(), 'top-left');
    map.on('load', () => setReady(true));
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // --- fly camera when the search target changes ------------------------- //
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !camera) return;
    map.flyTo({ center: camera.center, zoom: camera.zoom, speed: 1.3, essential: true });
  }, [ready, camera]);

  // --- radar overlay: fetch demo sweep + render image source ------------- //
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !scenario) return;
    let cancelled = false;
    setRenderMsg('Loading sweep…');

    getDemoSweep(scenario, { field })
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
            paint: { 'raster-opacity': opacity, 'raster-resampling': 'linear', 'raster-fade-duration': 0 },
          });
          // Keep warning polygons above radar.
          if (map.getLayer('alerts-line')) map.moveLayer('radar-layer', 'alerts-fill');
        }
        // Radar-site marker + sweep center/radius.
        if (markerRef.current) markerRef.current.remove();
        markerRef.current = new mapboxgl.Marker({ color: '#4cc9f0' })
          .setLngLat([sweep.radar_lon, sweep.radar_lat])
          .setPopup(new mapboxgl.Popup().setText(`${sweep.station} · ${field}`))
          .addTo(map);
        const lastRange = sweep.ranges_m[sweep.ranges_m.length - 1] || 150000;
        radarRef.current = { center: [sweep.radar_lon, sweep.radar_lat], radiusKm: lastRange / 1000 };
        setRenderMsg('');
      })
      .catch((err) => {
        if (!cancelled) setRenderMsg(`Radar: ${err.message}`);
      });

    return () => {
      cancelled = true;
    };
  }, [ready, scenario, field]);

  // --- opacity ----------------------------------------------------------- //
  useEffect(() => {
    const map = mapRef.current;
    if (map?.getLayer('radar-layer')) map.setPaintProperty('radar-layer', 'raster-opacity', opacity);
  }, [opacity]);

  // --- rotating radar sweep (scanning-dish animation) -------------------- //
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let raf;
    let angle = 0;
    let last = performance.now();

    const ensureLayers = () => {
      if (map.getSource('sweep-trail')) return;
      const empty = { type: 'FeatureCollection', features: [] };
      map.addSource('sweep-trail', { type: 'geojson', data: empty });
      map.addLayer({
        id: 'sweep-trail',
        type: 'fill',
        source: 'sweep-trail',
        paint: { 'fill-color': '#4cc9f0', 'fill-opacity': ['get', 'op'] },
      });
      map.addSource('sweep-beam', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} } });
      map.addLayer({
        id: 'sweep-beam',
        type: 'line',
        source: 'sweep-beam',
        paint: { 'line-color': '#aef6ff', 'line-width': 2, 'line-opacity': 0.85, 'line-blur': 2 },
      });
    };

    const tick = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      const r = radarRef.current;
      if (r && map.isStyleLoaded()) {
        ensureLayers();
        angle = (angle + dt * 55) % 360; // ~6.5 s per revolution
        const { trail, beam } = sweepGeoJSON(r.center, r.radiusKm, angle);
        map.getSource('sweep-trail')?.setData(trail);
        map.getSource('sweep-beam')?.setData(beam);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready]);

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
