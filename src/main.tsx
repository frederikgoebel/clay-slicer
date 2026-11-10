import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Object3D } from 'three';
import App from './App';
import './styles/global.css';

// The whole app is Z-up (printer coordinates). Must happen before any camera is created.
Object3D.DEFAULT_UP.set(0, 0, 1);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
