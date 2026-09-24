const TOKEN = 'clinovara.token';
const TENANT = 'clinovara.tenant';

export function getToken() { try { return localStorage.getItem(TOKEN) || ''; } catch { return ''; } }
export function setToken(t) { try { if (t) localStorage.setItem(TOKEN, t); else localStorage.removeItem(TOKEN); } catch { /* ignore */ } }
/** Clinic slug used by patient-facing pages (kiosk, display, forms, chat) that have no staff session. */
export function getTenant() { try { return sessionStorage.getItem(TENANT) || ''; } catch { return ''; } }
export function setTenant(slug) { try { if (slug) sessionStorage.setItem(TENANT, slug); else sessionStorage.removeItem(TENANT); } catch { /* ignore */ } }

export function userName() {
  try { return localStorage.getItem('clinovara.user') || 'Front desk'; } catch { return 'Front desk'; }
}
export function setUserName(name) { try { localStorage.setItem('clinovara.user', name); } catch { /* ignore */ } }

const listeners = new Set();
export function onUnauthorized(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export async function api(method, path, body) {
  const headers = { 'content-type': 'application/json' };
  const token = getToken(); if (token) headers.authorization = `Bearer ${token}`;
  const tenant = getTenant(); if (tenant) headers['x-tenant'] = tenant;
  const res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  if (!res.ok) {
    const err = new Error(data?.error || `${res.status} ${res.statusText}`);
    err.status = res.status;
    if (res.status === 401 && token && !path.startsWith('/api/auth/')) { setToken(''); listeners.forEach((fn) => fn()); }
    throw err;
  }
  return data;
}
export const get = (path) => api('GET', path);
export const post = (path, body = {}) => api('POST', path, body);
export const put = (path, body = {}) => api('PUT', path, body);
export const patch = (path, body = {}) => api('PATCH', path, body);
export const del = (path) => api('DELETE', path);

/** Downloads a file (CSV, JSON, FHIR Bundle…) through the authenticated API and saves it, since a plain <a href> link cannot carry the bearer token or clinic header. */
export async function downloadFile(path, filename) {
  const headers = {};
  const token = getToken(); if (token) headers.authorization = `Bearer ${token}`;
  const tenant = getTenant(); if (tenant) headers['x-tenant'] = tenant;
  const res = await fetch(path, { headers });
  if (!res.ok) { let msg = `${res.status} ${res.statusText}`; try { msg = (await res.json())?.error || msg; } catch { /* not json */ } throw new Error(msg); }
  const blob = await res.blob();
  const suggested = res.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1];
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename || suggested || 'download';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
