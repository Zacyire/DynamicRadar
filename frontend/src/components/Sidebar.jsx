/** Control panel: source switch, scenario info, products, met-log, analytics. */

const FIELDS = [
  { key: 'Z', label: 'Reflectivity (Z)' },
  { key: 'V', label: 'Velocity (V)' },
  { key: 'CC', label: 'Corr. Coeff (CC)' },
];

const SEV_COLOR = { extreme: '#ff00ff', high: '#ff2d2d', moderate: '#ffb000', low: '#4cc9f0' };
const KT_TO_MPH = 1.15078;

/** Rough hail-size estimate from peak core reflectivity. */
function estimateHail(dbz) {
  if (dbz == null || dbz < 50) return { inches: 0, label: 'None (< 0.25")' };
  const inches = Math.min(4.5, (dbz - 49) / 7.5);
  const sizes = [
    [0.25, 'Pea'], [0.5, 'Dime'], [0.75, 'Penny'], [1.0, 'Quarter'],
    [1.25, 'Half-dollar'], [1.75, 'Golf ball'], [2.5, 'Tennis ball'],
    [2.75, 'Baseball'], [4.0, 'Softball'],
  ];
  let label = 'Softball+';
  for (const [thr, name] of sizes) {
    if (inches <= thr) { label = name; break; }
  }
  return { inches, label };
}

export default function Sidebar({
  meta,
  sourceMode,
  onSourceMode,
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
  const maxZ = analytics?.max_reflectivity_dbz;
  const peakKt = analytics?.peak_rotational_velocity_kt || 0;
  const hail = estimateHail(maxZ);

  return (
    <aside className="sidebar">
      <section className="card">
        <h2>Station Source</h2>
        <div className="source-toggle" role="group" aria-label="Station source">
          <button
            className={sourceMode === 'demo' ? 'active' : ''}
            onClick={() => onSourceMode('demo')}
          >
            Demo Scenarios
          </button>
          <button
            className={sourceMode === 'live' ? 'active' : ''}
            onClick={() => onSourceMode('live')}
          >
            Live NOAA Feed
          </button>
        </div>
        {sourceMode === 'live' && (
          <div className="muted small">
            Live feed selected — wires to the NOAA `getSweep`/`getVolume` backend
            (pick a WSR-88D station to stream). Showing demo data until connected.
          </div>
        )}
      </section>

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
        <h2>Meteorological Log</h2>
        <div className="metric">
          <span className="metric-label">Max Core Reflectivity</span>
          <span className="metric-value z">{maxZ == null ? '—' : `${maxZ.toFixed(1)} dBZ`}</span>
        </div>
        <div className="metric">
          <span className="metric-label">Peak Rotational Shear</span>
          <span className="metric-value rot">
            {peakKt > 0 ? `${peakKt.toFixed(0)} kt · ${(peakKt * KT_TO_MPH).toFixed(0)} mph` : '—'}
          </span>
        </div>
        <div className="metric">
          <span className="metric-label">Est. Max Hail</span>
          <span className="metric-value hail">
            {hail.inches > 0 ? `${hail.inches.toFixed(2)}" · ${hail.label}` : hail.label}
          </span>
        </div>
      </section>

      <section className="card">
        <h2>NWS Warnings {alertsCount > 0 && <span className="badge">{alertsCount}</span>}</h2>
        <div className="muted small">Advancing warning polygon (simulated, tracks the storm).</div>
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
