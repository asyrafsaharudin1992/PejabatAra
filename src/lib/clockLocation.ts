export type ClockLocation = { lat: number; lng: number; accuracy: number };
export class ClockLocationError extends Error {
  constructor(public readonly reason: 'denied' | 'unavailable' | 'timeout' | 'inaccurate' | 'cancelled', message: string) {
    super(message);
    this.name = 'ClockLocationError';
  }
}

// Call directly from the clock button's click handler so the browser can show its own prompt.
// No permission reset or substitute prompt can override a previously blocked browser permission.
type LocationProvider = Pick<Geolocation, 'getCurrentPosition'> & Partial<Pick<Geolocation, 'watchPosition' | 'clearWatch'>>;
export function requestClockLocation(required: boolean, geolocation: LocationProvider | null | undefined = navigator.geolocation, options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<ClockLocation | null> {
  return new Promise((resolve, reject) => {
    if (!geolocation) {
      return required ? reject(new ClockLocationError('unavailable', 'This browser cannot provide your location. Open AraOffice in Safari or Chrome on your phone.')) : resolve(null);
    }
    const timeoutMs = options.timeoutMs ?? 12000;
    const watching = required && !!geolocation.watchPosition && !!geolocation.clearWatch;
    let watchId: number | undefined, done = false, best: ClockLocation | null = null;
    let unavailable = false;
    const cleanup = () => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      if (watchId !== undefined) geolocation.clearWatch?.(watchId);
    };
    const finish = (value: ClockLocation | null, error?: ClockLocationError) => {
      if (done) return;
      done = true; cleanup();
      if (error) reject(error); else resolve(value);
    };
    const abort = () => finish(null, new ClockLocationError('cancelled', 'Location check cancelled.'));
    const expire = () => {
      if (!required) return finish(null);
      if (best) return finish(null, new ClockLocationError('inaccurate', `GPS accuracy is ±${Math.round(best.accuracy)} m. AraOffice needs ±200 m or better. Turn on Precise Location for your browser and try again. No clock was recorded.`));
      finish(null, new ClockLocationError(unavailable ? 'unavailable' : 'timeout', unavailable ? 'Your phone could not find your location. Turn on Location Services and try again.' : 'Your phone took too long to find your location. Please try again.'));
    };
    const timer = setTimeout(expire, timeoutMs);
    if (options.signal?.aborted) { abort(); return; }
    options.signal?.addEventListener('abort', abort, { once: true });
    const success: PositionCallback = ({ coords }) => {
      if (done) return;
      if (!Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude) || !Number.isFinite(coords.accuracy) || coords.accuracy < 0 || Math.abs(coords.latitude) > 90 || Math.abs(coords.longitude) > 180) { unavailable = true; if (!watching) expire(); return; }
      const point = { lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy };
      if (!best || point.accuracy < best.accuracy) best = point;
      // Keep the server's existing 200 m accuracy requirement. Stop as soon as it is met.
      if (!required || point.accuracy <= 200) finish(point);
      else if (!watching) expire();
    };
    const failure: PositionErrorCallback = error => {
      if (done) return;
      if (!required) return finish(null);
      if (error.code === 1) return finish(null, new ClockLocationError('denied', 'Location is blocked for AraOffice. Allow it in your browser settings, then try again.'));
      unavailable = error.code === 2;
      if (!watching || error.code === 3) expire();
    };
    const positionOptions = { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 };
    try {
      if (watching) {
        watchId = geolocation.watchPosition!(success, failure, positionOptions);
        if (done) geolocation.clearWatch!(watchId);
      } else geolocation.getCurrentPosition(success, failure, positionOptions);
    } catch {
      finish(null, new ClockLocationError('unavailable', 'This browser could not start a location check. Open AraOffice directly in Safari or Chrome.'));
    }
  });
}
