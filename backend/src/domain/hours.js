/** Opening-hours logic shared by the AI front desk, callbacks and no-show sweeps. */
import { nowIso, dayKey, addDays, localDateTime, id, log, fullName } from '../lib.js';
import { isHoliday } from './scheduling.js';
import { renderTemplate, sendCommunication } from './messaging.js';
import { emit } from './webhooks.js';

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function hoursOn(db, day, locationId = null) {
  if (isHoliday(db, day, locationId)) return null;
  const loc = (db.settings.locations || []).find((l) => l.id === locationId);
  const hours = loc?.hours || db.settings.practice.hours;
  return hours[DAYS[new Date(day + 'T12:00:00').getDay()]] || null;
}

/** Is any branch (or the given one) open at `at`? */
export function isOpen(db, at = nowIso(), locationId = null) {
  const day = dayKey(at);
  const locs = locationId ? [locationId] : (db.settings.locations || []).map((l) => l.id);
  if (!locs.length) locs.push(null);
  return locs.some((loc) => { const h = hoursOn(db, day, loc); return h && at >= localDateTime(day, h[0]) && at < localDateTime(day, h[1]); });
}

/** Next opening moment from `at`. */
export function nextOpening(db, at = nowIso(), locationId = null) {
  const locs = locationId ? [locationId] : (db.settings.locations || []).map((l) => l.id);
  if (!locs.length) locs.push(null);
  let best = null;
  for (let i = 0; i < 14; i++) {
    const day = dayKey(addDays(at, i));
    for (const loc of locs) {
      const h = hoursOn(db, day, loc); if (!h) continue;
      const open = localDateTime(day, h[0]);
      if (open > at && (!best || open < best.at)) best = { at: open, locationId: loc };
    }
    if (best) return best;
  }
  return null;
}

export function fmtOpening(iso) {
  const d = new Date(iso); const today = dayKey(nowIso()); const tomorrow = dayKey(addDays(nowIso(), 1));
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  if (dayKey(iso) === today) return `today at ${time}`;
  if (dayKey(iso) === tomorrow) return `tomorrow at ${time}`;
  return `${d.toLocaleDateString('en-IN', { weekday: 'long' })} at ${time}`;
}

/* ---------- Callbacks: after-hours messages, missed calls, missed appointments ---------- */

export function addCallback(db, { source, conversationId = null, patientId = null, appointmentId = null, contactName = '', contactPhone = '', reason = '', channel = 'whatsapp', priority = 'normal' }) {
  db.callbacks ||= [];
  const dup = db.callbacks.find((c) => c.status === 'open' && ((conversationId && c.conversationId === conversationId) || (appointmentId && c.appointmentId === appointmentId && c.source === source)));
  if (dup) { dup.reason = reason || dup.reason; dup.updatedAt = nowIso(); return dup; }
  const opening = nextOpening(db);
  const cb = { id: id('cb'), source, conversationId, patientId, appointmentId, contactName, contactPhone, reason, channel, priority, status: 'open', createdAt: nowIso(), dueBy: isOpen(db) ? nowIso() : (opening?.at || nowIso()), attempts: [] };
  db.callbacks.unshift(cb);
  log(db, 'callback', `${source === 'missed_call' ? 'Missed call from' : source === 'no_show' ? 'Missed appointment:' : 'After-hours message from'} ${contactName || contactPhone || 'unknown'}${reason ? ` — ${reason}` : ''}`, { conversationId, patientId });
  emit(db, 'callback.created', { callback: cb });
  return cb;
}

/** Telephony webhook or manual entry: a call went unanswered. Sends the practice-approved "sorry we missed your call" message. */
export function missedCall(db, { phone, contactName = '', at = nowIso(), by = 'Phone system', frontendBase = '' }) {
  const digitsOnly = String(phone || '').replace(/\D/g, '').slice(-10);
  const patient = db.patients.find((p) => p.phone === digitsOnly) || null;
  const name = patient ? fullName(patient) : contactName || `+91 ${digitsOnly}`;
  let conv = db.conversations.find((c) => (patient ? c.patientId === patient.id : c.contactPhone === digitsOnly) && c.status !== 'closed');
  if (!conv) {
    conv = { id: id('cnv'), patientId: patient?.id || null, contactName: name, contactPhone: digitsOnly, channel: 'call', status: 'needs_staff', reason: 'Missed call', createdAt: at, updatedAt: at, messages: [], assignedTo: null, unread: true, ai: {} };
    db.conversations.unshift(conv);
  }
  conv.messages.push({ id: id('msg'), from: 'patient', text: `[Missed call at ${new Date(at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}]`, at, intent: 'missed_call' });
  conv.unread = true; conv.updatedAt = at;
  const cb = addCallback(db, { source: 'missed_call', conversationId: conv.id, patientId: patient?.id, contactName: name, contactPhone: digitsOnly, reason: 'Missed call', channel: 'call' });
  const open = isOpen(db, at);
  const opening = nextOpening(db, at);
  const body = renderTemplate(db, open ? 'tpl_missed_call' : 'tpl_missed_call_closed', { patient: patient || { firstName: 'there' }, when: opening ? fmtOpening(opening.at) : '' }).replace('{{opens}}', opening ? fmtOpening(opening.at) : 'soon');
  if (patient) sendCommunication(db, { patientId: patient.id, type: 'missed_call', body, meta: { callbackId: cb.id }, by });
  else conv.messages.push({ id: id('msg'), from: 'ai', text: body, at: nowIso(), intent: 'missed_call', outbound: true });
  void frontendBase;
  return { callback: cb, conversation: conv, patient, sentMessage: body };
}

/** Marks scheduled appointments that never arrived as no-shows and starts the rebooking follow-up. */
export function sweepNoShows(db, { now = nowIso() } = {}) {
  const grace = db.settings.rules.noShowAfterMinutes ?? 20;
  const cutoff = new Date(new Date(now).getTime() - grace * 60000).toISOString();
  const missed = [];
  for (const a of db.appointments) {
    if (!['scheduled', 'confirmed'].includes(a.status) || a.start > cutoff) continue;
    if (db.visits.some((v) => v.appointmentId === a.id)) continue;
    markNoShow(db, a, { by: 'Clinovara (auto)', now });
    missed.push(a);
  }
  return missed;
}

export function markNoShow(db, a, { by = 'Front desk', now = nowIso() } = {}) {
  a.status = 'no_show'; a.noShowAt = now; a.noShowBy = by;
  const patient = db.patients.find((p) => p.id === a.patientId);
  const vt = db.settings.visitTypes.find((v) => v.id === a.visitTypeId);
  const prov = db.settings.providers.find((p) => p.id === a.providerId);
  const loc = (db.settings.locations || []).find((l) => l.id === a.locationId);
  if (patient) {
    sendCommunication(db, { patientId: patient.id, type: 'missed_appointment', body: renderTemplate(db, 'tpl_missed_appt', { patient, visitType: vt, provider: prov, start: a.start, location: loc }), appointmentId: a.id, by });
    addCallback(db, { source: 'no_show', appointmentId: a.id, patientId: patient.id, contactName: fullName(patient), contactPhone: patient.phone, reason: `Missed ${vt?.name || 'appointment'} at ${new Date(a.start).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} — offer to rebook`, channel: 'whatsapp' });
  }
  // Free the slot for the waitlist if it is still ahead
  emit(db, 'appointment.no_show', { appointment: a });
  log(db, 'schedule', `${by} marked ${fullName(patient)} as a no-show`, { appointmentId: a.id });
  return a;
}
