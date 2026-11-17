export const pad = (n) => String(n).padStart(2, '0');
/** Calendar day in the clinic's time zone, so "today" is the clinic's today whatever the device's zone is. */
export const dayKey = (d = new Date()) => new Date(d).toLocaleDateString('en-CA', { timeZone: LOCALE.timezone || undefined });
/** Wall-clock parts of an instant in the clinic's time zone. */
function zonedParts(ms, tz) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz || undefined, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const o = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour, mi: +o.minute, s: +o.second };
}
/** Minutes since midnight of an instant, in the clinic's time zone (what the calendar grid is laid out in). */
export const minutesOfDay = (iso) => { const p = zonedParts(new Date(iso).getTime(), getLocale().timezone); return p.h * 60 + p.mi; };
/** The instant for a clinic wall-clock time, e.g. "2026-10-29" at 14:30 in Asia/Kolkata. */
export function zonedToIso(day, hour, minute = 0) {
  const tz = getLocale().timezone; const [y, mo, d] = day.split('-').map(Number);
  let ms = Date.UTC(y, mo - 1, d, hour, minute);
  for (let i = 0; i < 2; i++) { const p = zonedParts(ms, tz); ms -= Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) - Date.UTC(y, mo - 1, d, hour, minute); }
  return new Date(ms).toISOString();
}
export const todayKey = () => dayKey(new Date());
export const addDaysKey = (key, n) => { const [y, m, d] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

let LOCALE = { currencySymbol: '₹', numberLocale: 'en-IN', phoneCountryCode: '91', dateLocale: 'en-IN', timezone: 'Asia/Kolkata' };
export function setLocale(l) { if (l) LOCALE = { ...LOCALE, ...l, dateLocale: l.numberLocale || 'en-IN' }; }
export const getLocale = () => LOCALE;

export const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString(LOCALE.dateLocale, { hour: 'numeric', minute: '2-digit', timeZone: LOCALE.timezone || undefined }) : '');
export const fmtDate = (iso) => (iso ? new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString(LOCALE.dateLocale, { weekday: 'short', month: 'short', day: 'numeric', ...(iso.length > 10 ? { timeZone: LOCALE.timezone || undefined } : {}) }) : '');
export const fmtDateLong = (iso) => (iso ? new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString(LOCALE.dateLocale, { weekday: 'long', month: 'long', day: 'numeric', ...(iso.length > 10 ? { timeZone: LOCALE.timezone || undefined } : {}) }) : '');
export const fmtWhen = (iso) => (iso ? `${fmtDate(iso)}, ${fmtTime(iso)}` : '');
export const fmtPhone = (p) => {
  const d = String(p || '').replace(/\D/g, '');
  if (!d) return '';
  if (LOCALE.phoneCountryCode === '91' && d.length === 10) return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return p;
};
export const fmtMoney = (n) => (n || n === 0 ? `${LOCALE.currencySymbol}${Number(n).toLocaleString(LOCALE.numberLocale)}` : '');

export function ago(iso, now = Date.now()) {
  if (!iso) return '';
  const m = Math.round((now - new Date(iso)) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}
export function minutesSince(iso, now = Date.now()) { return Math.max(0, Math.round((now - new Date(iso)) / 60000)); }

export const fullName = (p) => (p ? `${p.firstName || ''} ${p.lastName || ''}`.trim() : 'Unknown');
export const initials = (p) => (p ? `${(p.firstName || '?')[0]}${(p.lastName || '')[0] || ''}`.toUpperCase() : '?');
export const LANG_NAME = { en: 'English', hi: 'हिन्दी', kn: 'ಕನ್ನಡ', ta: 'தமிழ்', te: 'తెలుగు', mr: 'मराठी', bn: 'বাংলা' };

export const STATUS_LABEL = {
  scheduled: 'Scheduled', confirmed: 'Confirmed', arrived: 'Arrived', checked_in: 'Checked in', ready: 'Ready', called: 'Called', in_chair: 'In chair', completed: 'Completed', cancelled: 'Cancelled', no_show: 'No-show',
  expected: 'Expected', checking_in: 'Checking in', needs_attention: 'Needs attention', brought_back: 'In chair', done: 'Done',
  ai: 'AI handling', needs_staff: 'Needs staff', staff: 'With staff', closed: 'Closed',
  sent: 'Sent', partial: 'In progress', complete: 'Complete', created: 'Not sent',
  recommended: 'Recommended', accepted: 'Accepted', declined: 'Declined',
  unpaid: 'Unpaid', paid: 'Paid', insurance: 'Cashless',
  whatsapp: 'WhatsApp', sms: 'SMS', web: 'Web', call: 'Call',
};
export const label = (s) => STATUS_LABEL[s] || (s ? s.replace(/_/g, ' ') : '');
