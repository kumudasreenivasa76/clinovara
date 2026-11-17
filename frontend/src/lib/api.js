const TOKEN = 'clinovara.token';
const TENANT = 'clinovara.tenant';

// Browser storage can be blocked (sandboxed frames, private modes). The values are also kept in memory so a login still works for the whole visit.
let memToken = ''; let memTenant = ''; let memUser = '';
export function getToken() { if (memToken) return memToken; try { return localStorage.getItem(TOKEN) || ''; } catch { return ''; } }
export function setToken(t) { memToken = t || ''; try { if (t) localStorage.setItem(TOKEN, t); else localStorage.removeItem(TOKEN); } catch { /* storage blocked: memory only */ } }
/** Clinic slug used by patient-facing pages (kiosk, display, forms, chat) that have no staff session. */
export function getTenant() { if (memTenant) return memTenant; try { return sessionStorage.getItem(TENANT) || ''; } catch { return ''; } }
export function setTenant(slug) { memTenant = slug || ''; try { if (slug) sessionStorage.setItem(TENANT, slug); else sessionStorage.removeItem(TENANT); } catch { /* storage blocked: memory only */ } }

export function userName() {
  if (memUser) return memUser; try { return localStorage.getItem('clinovara.user') || 'Front desk'; } catch { return 'Front desk'; }
}
export function setUserName(name) { memUser = name || ''; try { localStorage.setItem('clinovara.user', name); } catch { /* ignore */ } }

const listeners = new Set();
export function onUnauthorized(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export async function api(method, path, body, extra = {}) {
  const headers = { 'content-type': 'application/json', ...extra };
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
export const get = (path, extra) => api('GET', path, undefined, extra);
export const post = (path, body = {}, extra) => api('POST', path, body, extra);
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
