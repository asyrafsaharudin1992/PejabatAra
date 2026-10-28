import {StrictMode, Suspense, lazy} from 'react';
import {createRoot} from 'react-dom/client';
import OfficeLobby from './OfficeLobby.tsx';
import './index.css';
import { installDeviceFetch } from './lib/device';

installDeviceFetch();
// Split desktop + phone preview, only when running locally with `npm run dev` (not part of the live build).
const DevShell = import.meta.env.DEV ? lazy(() => import('./DevPhoneView.tsx')) : null;
const app = <OfficeLobby />;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {DevShell ? <Suspense fallback={null}><DevShell>{app}</DevShell></Suspense> : app}
  </StrictMode>,
);
