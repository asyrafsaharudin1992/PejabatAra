import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import OfficeLobby from './OfficeLobby.tsx';
import './index.css';
import { installDeviceFetch } from './lib/device';

installDeviceFetch();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OfficeLobby />
  </StrictMode>,
);
