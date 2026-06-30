/** Control panel: station info, field toggle, alerts toggle, analytics summary. */

const FIELDS = [
  { key: 'Z', label: 'Reflectivity (Z)' },
  { key: 'V', label: 'Velocity (V)' },
  { key: 'CC', label: 'Corr. Coeff (CC)' },
];

const SEV_COLOR = { extreme: '#ff00ff', high: '#ff2d2d', moderate: '#ffb000', low: '#4cc9f0' };

export default function Sidebar({
  meta,
  field,
  onField,
  opacity,
  onOpacity,
  alertsCount,
  analytics,
  sweepMeta,
  viewMode,
  vertExag,
  onVertExag,
}) {
  return (
    <aside className="sidebar">
      <section className="card">
        <h2>Scenario</h2>
        {meta ? (
          <>
            <div className="kv"><span>Dataset</span><strong>{meta.station}</strong></div>
            <div className="kv"><span>Region</span><span>{meta.region}</span></div>
            <div className="scenario-desc">{meta.label}</div>
            <div className="muted small">{meta.description}</div>
            {sweepMeta && (
              <div className="kv" style={{ marginTop: '0.4rem' }}>
                <span>Scan</span><span>{new Date(sweepMeta.scan_time).toUTCString().slice(17, 25)}Z</span>
              </div>
            )}
            <div className="muted small">Search a city above to switch scenarios.</div>
          </>
        ) : (
          <div className="muted">Loading scenarios…</div>
        )}
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
        {viewMode === '2d' ? (
          <label className="slider">
            Opacity
            <input
              type="range" min="0.2" max="1" step="0.05"
              value={opacity}
              onChange={(e) => onOpacity(parseFloat(e.target.value))}
            />
          </label>
        ) : (
          <label className="slider">
            Vertical exaggeration ×{vertExag}
            <input
              type="range" min="1" max="10" step="1"
              value={vertExag}
              onChange={(e) => onVertExag(parseInt(e.target.value, 10))}
            />
          </label>
        )}
      </section>

      <section className="card">
        <h2>NWS Warnings {alertsCount > 0 && <span className="badge">{alertsCount}</span>}</h2>
        <div className="muted small">Scenario warning polygons (simulated).</div>
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
