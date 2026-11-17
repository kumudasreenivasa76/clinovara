export const COLLECTIONS = [
  'settings', 'patients', 'appointments', 'waitlist', 'conversations', 'formPackets',
  'visits', 'treatmentPlans', 'communications', 'kioskSessions', 'activity', 'blocks', 'webhookLog', 'callbacks',
  'calls', 'ehrOutbox', 'documents', 'labCases', 'images', 'tasks',
];

let counter = 0;
export function id(prefix) {
  counter = (counter + 1) % 1000;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36).padStart(2, '0')}${Math.random().toString(36).slice(2, 6)}`;
}

export const nowIso = () => new Date().toISOString();
export const addMinutes = (iso, m) => new Date(new Date(iso).getTime() + m * 60000).toISOString();
export const addDays = (iso, d) => new Date(new Date(iso).getTime() + d * 86400000).toISOString();
export const dayKey = (iso) => {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
export const todayKey = () => dayKey(nowIso());
export const minutesBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 60000);
export const overlaps = (aStart, aEnd, bStart, bEnd) => new Date(aStart) < new Date(bEnd) && new Date(bStart) < new Date(aEnd);

export function localDateTime(dateKeyStr, hhmm) {
  const [y, mo, d] = dateKeyStr.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  return new Date(y, mo - 1, d, h, mi, 0, 0).toISOString();
}

export function fullName(p) { return p ? `${p.firstName} ${p.lastName}`.trim() : 'Unknown'; }

/** Normalises a phone number to national digits. Indian numbers: strips a leading +91 / 91 / 0. */
export function digits(s, countryCode = '91') {
  let d = String(s || '').replace(/\D/g, '');
  if (d.length === 10 + countryCode.length && d.startsWith(countryCode)) d = d.slice(countryCode.length);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
}

export function log(db, type, text, meta = {}) {
  db.activity.unshift({ id: id('act'), type, text, at: nowIso(), ...meta });
  if (db.activity.length > 500) db.activity.length = 500;
}

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const bad = (msg) => { throw new HttpError(400, msg); };
export const notFound = (what) => { throw new HttpError(404, `${what} not found`); };
export const find = (list, key, what) => list.find((x) => x.id === key) || notFound(what);

export function money(db, n) {
  const sym = db.settings.locale?.currencySymbol || '₹';
  return `${sym}${Number(n || 0).toLocaleString(db.settings.locale?.numberLocale || 'en-IN')}`;
}

/** Quotes a CSV cell, wrapping and doubling quotes only when the value needs it. */
export const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** Parses CSV text (quoted fields, embedded commas/newlines) into an array of row arrays. Drops blank rows. */
export function parseCsv(text) {
  const rows = []; let row = []; let cur = ''; let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += ch; }
    else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

/**
 * Clinic hours ("09:00") and day boundaries are computed in the process time zone, so each request runs in its own
 * clinic's zone (settings.locale.timezone, default CLINOVARA_TZ or Asia/Kolkata). Scheduling handlers are synchronous,
 * so the zone cannot change underneath a request.
 */
export const DEFAULT_TZ = process.env.CLINOVARA_TZ || 'Asia/Kolkata';
export function useTimezone(tz) {
  let zone = tz || DEFAULT_TZ;
  try { new Intl.DateTimeFormat('en', { timeZone: zone }); } catch { zone = DEFAULT_TZ; }
  if (process.env.TZ !== zone) process.env.TZ = zone;
  return zone;
}
