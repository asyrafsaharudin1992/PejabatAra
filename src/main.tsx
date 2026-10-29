import {StrictMode, Suspense, lazy} from 'react';
import {createRoot} from 'react-dom/client';
import OfficeLobby from './OfficeLobby.tsx';
import './index.css';
import { installDeviceFetch } from './lib/device';

installDeviceFetch();
// Everything from the Individual Sign In page onward (hub, leave, profile, assessments, incentives) is drawn a little smaller on phones.
const syncPhoneScale = () => document.documentElement.classList.toggle('compact-phone', /^#office\/(individual|assessment|incentives)/.test(window.location.hash));
syncPhoneScale(); window.addEventListener('hashchange', syncPhoneScale);
// Split desktop + phone preview, only when running locally with `npm run dev` (not part of the live build).
const DevShell = import.meta.env.DEV ? lazy(() => import('./DevPhoneView.tsx')) : null;
const app = <OfficeLobby />;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {DevShell ? <Suspense fallback={null}><DevShell>{app}</DevShell></Suspense> : app}
  </StrictMode>,
);
