import { useEffect, useState } from 'react';

/**
 * Resolve the user's coordinates via the browser Geolocation API.
 *
 * Falls back to a default location (Oklahoma City — the heart of tornado alley
 * and the KTLX coverage area) when geolocation is denied or unavailable, so the
 * app is always usable.
 */
const FALLBACK = { lat: 35.4676, lon: -97.5164, source: 'fallback' };

export function useGeolocation() {
  const [coords, setCoords] = useState(null);
  const [status, setStatus] = useState('locating');

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setCoords(FALLBACK);
      setStatus('unavailable');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude, source: 'gps' });
        setStatus('located');
      },
      () => {
        setCoords(FALLBACK);
        setStatus('denied');
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  }, []);

  return { coords, status };
}
