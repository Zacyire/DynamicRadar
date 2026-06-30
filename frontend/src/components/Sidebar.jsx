/** Control panel: station info, field toggle, alerts toggle, analytics summary. */

const FIELDS = [
  { key: 'Z', label: 'Reflectivity (Z)' },
  { key: 'V', label: 'Velocity (V)' },
  { key: 'CC', label: 'Corr. Coeff (CC)' },
];

const SEV_COLOR = { extreme: '#ff00ff', high: '#ff2d2d', moderate: '#ffb000', low: '#4cc9f0' };

export default function Sidebar({
  station,
  geoStatus,
  field,
  onField,
  opacity,
  onOpacity,
  demoAlerts,
  onDemoAlerts,
  alertsCount,
  alertsError,
  analytics,
  sweepMeta,
  onRefresh,
}) {
  return (
    <aside className="sidebar">
      <section className="card">
        <h2>Radar</h2>
        {station ? (
          <>
            <div className="kv"><span>Station</span><strong>{station.icao}</strong></div>
            <div className="kv"><span>Site</span><span>{station.name}</span></div>
            {station.distance_km != null && (
              <div className="kv"><span>Distance</span><span>{station.distance_km} km</span></div>
            )}
            {sweepMeta && (
              <div className="kv"><span>Scan</span><span>{new Date(sweepMeta.scan_time).toUTCString().slice(17, 25)}Z</span></div>
            )}
            <div className="muted small">geolocation: {geoStatus}</div>
          </>
        ) : (
          <div className="muted">Locating nearest WSR-88D…</div>
        )}
        <button className="btn" onClick={onRefresh} disabled={!station}>Refresh</button>
      </section>

      <section className="card">
        <h2>Product</h2>
        <div className="field-toggle">
          {FIELDS.map((f) => (
            <button
              key={f.key}
              className={`chip ${field === f.key ? 'active' : ''}`}
              onClick={() => onField(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="slider">
          Opacity
          <input
            type="range" min="0.2" max="1" step="0.05"
            value={opacity}
            onChange={(e) => onOpacity(parseFloat(e.target.value))}
          />
        </label>
      </section>

      <section className="card">
        <h2>NWS Warnings {alertsCount > 0 && <span className="badge">{alertsCount}</span>}</h2>
        <label className="checkbox">
          <input type="checkbox" checked={demoAlerts} onChange={(e) => onDemoAlerts(e.target.checked)} />
          Demo polygons (offline)
        </label>
        {alertsError && <div className="muted small">live NWS unavailable: {alertsError}</div>}
        <ul className="legend">
          <li><span className="swatch" style={{ background: '#ff2d2d' }} /> Tornado</li>
          <li><span className="swatch" style={{ background: '#ffb000' }} /> Severe T-storm</li>
          <li><span className="swatch" style={{ background: '#2ecc71' }} /> Flash Flood</li>
        </ul>
      </section>

      <section className="card">
        <h2>Storm Analytics</h2>
        {!analytics ? (
          <div className="muted">No analysis yet.</div>
        ) : (
          <>
            <div className="summary">{analytics.summary}</div>
            {analytics.tornado_signatures.length > 0 && (
              <div className="sig-list">
                {analytics.tornado_signatures.slice(0, 6).map((s, i) => (
                  <div key={i} className="sig" style={{ borderColor: SEV_COLOR[s.severity] }}>
                    <strong>{s.is_tds ? 'TDS' : 'TVS'}</strong> {s.rotational_velocity_kt} kt ·{' '}
                    {Math.round(s.diameter_m)} m · {s.ef_estimate}
                  </div>
                ))}
              </div>
            )}
            {analytics.hazards.map((h, i) => (
              <div key={i} className="hazard" data-sev={h.severity}>
                <strong>{h.type.replace('_', ' ')}</strong> — {h.detail}
              </div>
            ))}
          </>
        )}
      </section>
    </aside>
  );
}
