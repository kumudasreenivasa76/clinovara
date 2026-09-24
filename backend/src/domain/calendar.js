/** iCalendar feeds and add-to-calendar links so appointments show up in Google, Outlook and Apple calendars. */
import { fullName } from '../lib.js';

const ics = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const stamp = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const fold = (line) => { const out = []; while (line.length > 73) { out.push(line.slice(0, 73)); line = ' ' + line.slice(73); } out.push(line); return out.join('\r\n'); };

function event(db, a, { forPatient = false } = {}) {
  const patient = db.patients.find((p) => p.id === a.patientId);
  const vt = db.settings.visitTypes.find((v) => v.id === a.visitTypeId);
  const prov = db.settings.providers.find((p) => p.id === a.providerId);
  const loc = (db.settings.locations || []).find((l) => l.id === a.locationId);
  const summary = forPatient ? `${vt?.name || 'Dental visit'} — ${db.settings.practice.name}` : `${fullName(patient)} · ${vt?.name || 'Visit'}${a.visit?.token ? ` · ${a.visit.token}` : ''}`;
  const desc = forPatient ? `${vt?.name || 'Visit'} with ${prov?.name || 'our team'}.\nPlease arrive 10 minutes early and check in at the kiosk.\n${db.settings.practice.phone}` : `${vt?.name || ''}${a.notes ? `\n${a.notes}` : ''}\nStatus: ${a.status}${patient?.phone ? `\n+91 ${patient.phone}` : ''}`;
  return [
    'BEGIN:VEVENT', `UID:${a.id}@clinovara`, `DTSTAMP:${stamp(a.updatedAt || a.createdAt || a.start)}`, `DTSTART:${stamp(a.start)}`, `DTEND:${stamp(a.end)}`,
    fold(`SUMMARY:${ics(summary)}`), fold(`DESCRIPTION:${ics(desc)}`), fold(`LOCATION:${ics(loc ? `${db.settings.practice.name}, ${loc.address || loc.name}` : db.settings.practice.address)}`),
    `STATUS:${a.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`, ...(a.status === 'cancelled' ? ['METHOD:CANCEL'] : []), 'END:VEVENT',
  ].join('\r\n');
}

export function providerFeed(db, providerId) {
  const prov = db.settings.providers.find((p) => p.id === providerId);
  const appts = db.appointments.filter((a) => a.providerId === providerId && a.status !== 'cancelled');
  const blocks = (db.blocks || []).filter((b) => b.providerId === providerId).map((b) => ['BEGIN:VEVENT', `UID:${b.id}@clinovara`, `DTSTAMP:${stamp(b.createdAt || b.start)}`, `DTSTART:${stamp(b.start)}`, `DTEND:${stamp(b.end)}`, fold(`SUMMARY:${ics(b.reason || 'Blocked')}`), 'TRANSP:OPAQUE', 'END:VEVENT'].join('\r\n'));
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Clinovara//Schedule//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', fold(`X-WR-CALNAME:${ics(`${db.settings.practice.name} — ${prov?.name || 'Schedule'}`)}`), 'X-WR-TIMEZONE:Asia/Kolkata', 'REFRESH-INTERVAL;VALUE=DURATION:PT15M', ...appts.map((a) => event(db, a)), ...blocks, 'END:VCALENDAR'].join('\r\n') + '\r\n';
}

export function appointmentIcs(db, a, opts = {}) {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Clinovara//Appointment//EN', 'METHOD:PUBLISH', event(db, a, opts), 'END:VCALENDAR'].join('\r\n') + '\r\n';
}

export function calendarLinks(db, a, { base = '' } = {}) {
  const vt = db.settings.visitTypes.find((v) => v.id === a.visitTypeId);
  const prov = db.settings.providers.find((p) => p.id === a.providerId);
  const loc = (db.settings.locations || []).find((l) => l.id === a.locationId);
  const title = `${vt?.name || 'Dental visit'} — ${db.settings.practice.name}`;
  const details = `With ${prov?.name || 'our team'}. Please arrive 10 minutes early.`;
  const where = loc ? `${db.settings.practice.name}, ${loc.address || loc.name}` : db.settings.practice.address;
  const google = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${stamp(a.start)}/${stamp(a.end)}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(where)}`;
  const outlook = `https://outlook.live.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(title)}&startdt=${encodeURIComponent(a.start)}&enddt=${encodeURIComponent(a.end)}&body=${encodeURIComponent(details)}&location=${encodeURIComponent(where)}`;
  return { google, outlook, ics: `${base}/api/calendar/appointment/${a.id}.ics?t=${db.settings.tenantSlug || ''}` };
}
