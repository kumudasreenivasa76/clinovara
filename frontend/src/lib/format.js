export const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (d = new Date()) => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
export const todayKey = () => dayKey(new Date());
export const addDaysKey = (key, n) => { const d = new Date(key + 'T12:00:00'); d.setDate(d.getDate() + n); return dayKey(d); };

let LOCALE = { currencySymbol: '₹', numberLocale: 'en-IN', phoneCountryCode: '91', dateLocale: 'en-IN' };
export function setLocale(l) { if (l) LOCALE = { ...LOCALE, ...l, dateLocale: l.numberLocale || 'en-IN' }; }
export const getLocale = () => LOCALE;

export const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString(LOCALE.dateLocale, { hour: 'numeric', minute: '2-digit' }) : '');
export const fmtDate = (iso) => (iso ? new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString(LOCALE.dateLocale, { weekday: 'short', month: 'short', day: 'numeric' }) : '');
export const fmtDateLong = (iso) => (iso ? new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString(LOCALE.dateLocale, { weekday: 'long', month: 'long', day: 'numeric' }) : '');
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
