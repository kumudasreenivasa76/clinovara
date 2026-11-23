const TOKEN = 'clinovara.token';
const TENANT = 'clinovara.tenant';

// Browser storage can be blocked (sandboxed frames, private modes). The values are also kept in memory so a login still works for the whole visit.
let memToken = ''; let memTenant = ''; let memUser = '';
export function getToken() { if (memToken) return memToken; try { return localStorage.getItem(TOKEN) || sessionStorage.getItem(TOKEN) || ''; } catch { return ''; } }
let remember = true;
/** Keep me signed in: true keeps the session across browser restarts, false ends it when the tab closes. */
export function setRemember(v) { remember = v !== false; }
export function setToken(t) {
  memToken = t || '';
  try {
    localStorage.removeItem(TOKEN); sessionStorage.removeItem(TOKEN);
    if (t) (remember ? localStorage : sessionStorage).setItem(TOKEN, t);
  } catch { /* storage blocked: memory only */ }
}
/** Clinic slug used by patient-facing pages (kiosk, display, forms, chat) that have no staff session. */
export function getTenant() { if (memTenant) return memTenant; try { return sessionStorage.getItem(TENANT) || ''; } catch { return ''; } }
export function setTenant(slug) { memTenant = slug || ''; try { if (slug) sessionStorage.setItem(TENANT, slug); else sessionStorage.removeItem(TENANT); } catch { /* storage blocked: memory only */ } }

export function userName() {
  if (memUser) return memUser; try { return localStorage.getItem('clinovara.user') || 'Front desk'; } catch { return 'Front desk'; }
}
export function setUserName(name) { memUser = name || ''; try { localStorage.setItem('clinovara.user', name); } catch { /* ignore */ } }

const listeners = new Set();
export function onUnauthorized(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** Tells the app whether the server can be reached, so it can show one banner instead of an error on every card. */
function reach(ok) { try { window.dispatchEvent(new CustomEvent('clinovara:reach', { detail: { ok } })); } catch { /* not in a browser */ } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TIMEOUT_MS = 20000;
const inFlight = new Map(); // identical reads asked for at the same moment share one request

async function send(method, path, body, headers) {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try { return await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctl.signal }); }
  catch (e) {
    const err = new Error(e.name === 'AbortError' ? 'The server took too long to answer. Please try again.' : 'Cannot reach the server. Check your internet connection and try again.');
    err.status = 0; err.network = true; throw err;
  } finally { clearTimeout(timer); }
}

export async function api(method, path, body, extra = {}) {
  const headers = { 'content-type': 'application/json', ...extra };
  const token = getToken(); if (token) headers.authorization = `Bearer ${token}`;
  const tenant = getTenant(); if (tenant) headers['x-tenant'] = tenant;
  const read = method === 'GET';
  const key = read ? `${path}|${token}|${tenant}` : null;
  if (key && inFlight.has(key)) return inFlight.get(key);
  const work = (async () => {
    let res;
    // A read is safe to repeat, so one hiccup (a dropped connection, a restarting server) is retried once. Changes are never repeated.
    for (let attempt = 0; ; attempt++) {
      try { res = await send(method, path, body, headers); } catch (e) { if (read && attempt === 0) { await sleep(600); continue; } reach(false); throw e; }
      if (read && attempt === 0 && [502, 503, 504].includes(res.status)) { await sleep(600); continue; }
      break;
    }
    reach(true);
    let data = null;
    try { data = await res.json(); } catch { /* no body */ }
    if (!res.ok) {
      const err = new Error(data?.error || (res.status >= 500 ? 'Something went wrong on our side. Please try again.' : `${res.status} ${res.statusText}`));
      err.status = res.status; err.code = data?.code || null; err.requestId = data?.requestId || res.headers.get('x-request-id') || null;
      if (res.status === 401 && token && !path.startsWith('/api/auth/')) { setToken(''); listeners.forEach((fn) => fn()); }
      throw err;
    }
    return data;
  })();
  if (key) { inFlight.set(key, work); work.finally(() => inFlight.delete(key)).catch(() => {}); }
  return work;
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
