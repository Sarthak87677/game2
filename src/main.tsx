import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/global.css';
import { useTerraStore } from './state/store';

// Exposed for diagnostics and end-to-end tests (read-only use).
(window as unknown as { __terraStore: typeof useTerraStore }).__terraStore = useTerraStore;

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
