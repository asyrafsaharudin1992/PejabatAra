import * as React from 'react';
import type { ReactNode } from 'react';

// A screen that fails to draw (or a page file that is gone because the app was updated while it was open) used to leave a blank white page.
// Now the person sees a short message and a Reload button, and an update that removed a page file reloads the app by itself once.
const STALE = /dynamically imported module|importing a module script|loading chunk|chunkloaderror|failed to fetch dynamically/i;
const RELOADED = 'araoffice-reloaded-at';
function reloadOnce(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOADED) || 0);
    if (Date.now() - last < 60000) return false;
    sessionStorage.setItem(RELOADED, String(Date.now()));
  } catch { /* storage blocked: reload anyway, once per page load */ }
  window.location.reload();
  return true;
}

export function installUpdateRecovery() {
  window.addEventListener('vite:preloadError', (event) => { if (reloadOnce()) event.preventDefault(); });
  window.addEventListener('unhandledrejection', (event) => { if (STALE.test(String((event.reason as Error)?.message || event.reason || ''))) reloadOnce(); });
}

export class AppErrorBoundary extends React.Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.error(error); if (STALE.test(String(error?.message || ''))) reloadOnce(); }
  render() {
    if (!this.state.failed) return (this as any).props.children as ReactNode;
    return <div role="alert" style={{ maxWidth: 420, margin: '15vh auto', padding: 24, textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
      <h2 style={{ fontSize: 20, fontWeight: 600 }}>Something went wrong</h2>
      <p style={{ margin: '12px 0 20px', color: '#475569' }}>This page could not be shown. The app may have been updated while it was open. Reload to carry on; your saved work is not lost.</p>
      <button type="button" onClick={() => window.location.reload()} style={{ background: '#0b587b', color: '#fff', border: 0, borderRadius: 10, padding: '10px 20px', fontWeight: 600 }}>Reload</button>
    </div>;
  }
}
