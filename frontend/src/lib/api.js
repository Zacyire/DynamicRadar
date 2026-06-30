/**
 * Thin API client for the DynamicRadar backend.
 *
 * In dev, requests go to "/api" and are proxied to FastAPI by Vite. In
 * production, set VITE_API_BASE to the deployed backend origin.
 */
const API_BASE = import.meta.env.VITE_API_BASE || '';

async function request(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`API ${path} failed: ${res.status}`);
  }
  return res.json();
}

export function getHealth() {
  return request('/api/health');
}
