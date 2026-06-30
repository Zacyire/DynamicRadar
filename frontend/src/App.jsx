import { useEffect, useState } from 'react';
import { getHealth } from './lib/api';

/**
 * Phase 1 placeholder shell.
 *
 * Establishes the app structure and verifies backend connectivity. The 2D
 * Mapbox map (Phase 4) and 3D volumetric view (Phase 5) mount inside this
 * shell in later phases.
 */
export default function App() {
  const [status, setStatus] = useState('checking…');

  useEffect(() => {
    getHealth()
      .then((data) => setStatus(`backend ok · v${data.version}`))
      .catch(() => setStatus('backend unreachable'));
  }, []);

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>DynamicRadar</h1>
        <span className="app-status">{status}</span>
      </header>
      <main className="app-main">
        <p>
          Project scaffolding complete. Map (2D) and volumetric (3D) views are
          wired up in later phases.
        </p>
      </main>
    </div>
  );
}
