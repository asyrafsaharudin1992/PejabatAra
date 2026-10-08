// Registered-device token (Plato-style). Staff need a registered device; the
// token is sent on every API and Supabase request as x-device-token.
const TOKEN_KEY = 'ara_device_token';
const NAME_KEY = 'ara_device_name';
export const DEVICE_REQUIRED_EVENT = 'ara:device-required';

export function deviceToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}

export function lastDeviceName() {
  try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; }
}

export function saveDevice(token: string, name: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(NAME_KEY, name);
}

export function withDeviceHeader(init: RequestInit = {}): RequestInit {
  const token = deviceToken();
  if (!token) return init;
  const headers = new Headers(init.headers);
  headers.set('x-device-token', token);
  return { ...init, headers };
}

// Adds the device token to every same-origin /api request, and tells the app
// when the server says this device needs registering (e.g. after 30 days).
let installed = false;
export function installDeviceFetch() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    // Request objects carry their own headers; the app only calls the API with URL strings.
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : '';
    const isApi = url.startsWith('/api/') || url.startsWith(`${window.location.origin}/api/`);
    const response = await original(input, isApi ? withDeviceHeader(init) : init);
    if (isApi && response.status === 403) {
      response.clone().json().then((body) => {
        if (String(body?.error || '').includes('device is not registered')) window.dispatchEvent(new Event(DEVICE_REQUIRED_EVENT));
      }).catch(() => undefined);
    }
    return response;
  };
}
