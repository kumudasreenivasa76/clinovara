/**
 * Hosted demo entry: runs the real backend (routes, scheduling, AI rule engine, marketing approvals)
 * inside the browser on top of the SmileCare sample data. State persists in this browser only.
 */
import './globals.js';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { createApp } from '../../../backend/src/app.js';
import { createRegistry } from '../../../backend/src/registry.js';
import App from '../App.jsx';
import '../styles.css';

const registry = createRegistry({ memory: true });
const SNAP = 'clinovara.demo.snapshot.v3';
try {
  const snap = JSON.parse(localStorage.getItem(SNAP) || 'null');
  if (snap?.platform) { registry.platform.replace(snap.platform); for (const [id, db] of Object.entries(snap.tenants || {})) { const st = registry.tenantStore(id); if (st) st.replace(db); } }
} catch { /* start fresh */ }
const app = createApp({ registry, frontendBase: `${location.origin}${location.pathname}` });

let timer = null;
function persist() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      const tenants = {}; for (const t of registry.platform.db.tenants) { const st = registry.tenantStore(t.id); if (st) tenants[t.id] = st.db; }
      localStorage.setItem(SNAP, JSON.stringify({ platform: registry.platform.db, tenants }));
    } catch { /* quota or private mode: state lives for this page load only */ }
  }, 200);
}

const realFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  if (url.startsWith('/api')) return app.dispatch(url, init).then((r) => { if ((init?.method || 'GET') !== 'GET') persist(); return r; });
  return realFetch(input, init);
};
window.clinovaraDemoReset = () => { localStorage.removeItem(SNAP); location.reload(); };

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
