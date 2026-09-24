import { id, nowIso, addMinutes, addDays, dayKey, localDateTime, overlaps, bad, find, log, fullName } from '../lib.js';
import { renderTemplate, sendCommunication } from './messaging.js';
import { emit } from './webhooks.js';

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const ACTIVE = new Set(['scheduled', 'confirmed', 'arrived', 'checked_in', 'ready', 'in_chair']);

export function visitType(db, vtId) { return db.settings.visitTypes.find((v) => v.id === vtId) || bad('Unknown visit type'); }
export function provider(db, pId) { return db.settings.providers.find((p) => p.id === pId) || bad('Unknown provider'); }
export function location(db, lId) { return (db.settings.locations || []).find((l) => l.id === lId) || null; }
export function defaultLocationId(db) { return db.settings.locations?.[0]?.id || null; }

export function providersFor(db, vt, locationId = null) {
  let list = db.settings.providers.filter((p) => !vt || !vt.providerRole || p.role === vt.providerRole);
  if (locationId) list = list.filter((p) => !p.locationIds?.length || p.locationIds.includes(locationId));
  if (!list.length) list = db.settings.providers.filter((p) => !locationId || !p.locationIds?.length || p.locationIds.includes(locationId));
  return list;
}

export function isHoliday(db, day, locationId = null) {
  return (db.settings.holidays || []).some((h) => h.date === day && (!h.locationId || !locationId || h.locationId === locationId));
}
function hoursFor(db, day, locationId = null) {
  if (isHoliday(db, day, locationId)) return null;
  const dow = DAYS[new Date(day + 'T12:00:00').getDay()];
  const loc = location(db, locationId);
  const hours = loc?.hours || db.settings.practice.hours;
  return hours[dow] || null;
}

function blocked(db, providerId, locationId, start, end) {
  return (db.blocks || []).some((b) => b.providerId === providerId && (!b.locationId || !locationId || b.locationId === locationId) && overlaps(start, end, b.start, b.end));
}

export function slotsForDay(db, { date, visitTypeId, providerId = null, locationId = null, from = nowIso(), durationMin = null }) {
  const vt = visitType(db, visitTypeId);
  const dur = Number(durationMin) > 0 ? Number(durationMin) : vt.durationMin;
  const hours = hoursFor(db, date, locationId);
  if (!hours) return [];
  const step = db.settings.practice.slotMinutes || 15;
  const provs = providerId ? [provider(db, providerId)] : providersFor(db, vt, locationId);
  const dayStart = localDateTime(date, hours[0]);
  const dayEnd = localDateTime(date, hours[1]);
  const busy = db.appointments.filter((a) => ACTIVE.has(a.status) && dayKey(a.start) === date);
  const slots = [];
  for (const p of provs) {
    const locs = locationId ? [locationId] : (p.locationIds?.length ? p.locationIds : [defaultLocationId(db)]);
    for (const loc of locs) {
      const locHours = hoursFor(db, date, loc); if (!locHours) continue;
      const s0 = localDateTime(date, locHours[0]); const e0 = localDateTime(date, locHours[1]);
      for (let t = s0; new Date(addMinutes(t, dur)) <= new Date(e0); t = addMinutes(t, step)) {
        const end = addMinutes(t, dur);
        if (new Date(t) < new Date(from)) continue;
        // A provider working at two branches cannot be in both at once: any active appointment anywhere blocks the slot.
        const clash = busy.some((a) => a.providerId === p.id && overlaps(t, end, a.start, a.end));
        if (clash || blocked(db, p.id, loc, t, end)) continue;
        slots.push({ start: t, end, providerId: p.id, providerName: p.name, locationId: loc, locationName: location(db, loc)?.name || '' });
      }
    }
  }
  void dayStart; void dayEnd;
  return slots.sort((a, b) => a.start.localeCompare(b.start) || a.providerName.localeCompare(b.providerName));
}

export function nextSlots(db, { visitTypeId, providerId = null, locationId = null, fromDate = null, preferredTime = 'any', limit = 4, days = 21, durationMin = null }) {
  const startDay = fromDate || dayKey(nowIso());
  const out = [];
  for (let i = 0; i < days && out.length < limit; i++) {
    const date = dayKey(addDays(startDay + 'T12:00:00', i));
    let slots = slotsForDay(db, { date, visitTypeId, providerId, locationId, durationMin });
    if (preferredTime === 'morning') slots = slots.filter((s) => new Date(s.start).getHours() < 12);
    if (preferredTime === 'afternoon') slots = slots.filter((s) => new Date(s.start).getHours() >= 12 && new Date(s.start).getHours() < 16);
    if (preferredTime === 'evening') slots = slots.filter((s) => new Date(s.start).getHours() >= 16);
    const picked = [];
    for (const s of slots) {
      if (picked.length && new Date(s.start) - new Date(picked[picked.length - 1].start) < 120 * 60000) continue;
      picked.push(s);
      if (picked.length === 2) break;
    }
    out.push(...picked);
  }
  return out.slice(0, limit);
}

export function feeFor(db, vt, prov) {
  if (vt.fee) return vt.fee;
  return prov?.consultationFee || 0;
}

export function bookAppointment(db, { patientId, visitTypeId, providerId, locationId, start, source = 'staff', notes = '', by = 'Staff', fee, durationMin = null }) {
  const patient = find(db.patients, patientId, 'Patient');
  const vt = visitType(db, visitTypeId);
  if (!start) bad('start is required');
  const loc = locationId || patient.locationId || defaultLocationId(db);
  const end = addMinutes(start, Number(durationMin) > 0 ? Number(durationMin) : vt.durationMin);
  if (!hoursFor(db, dayKey(start), loc)) bad(isHoliday(db, dayKey(start), loc) ? 'The clinic is closed for a holiday that day' : 'The branch is closed that day');
  const isFree = (p) => !db.appointments.some((a) => ACTIVE.has(a.status) && a.providerId === p.id && overlaps(start, end, a.start, a.end)) && !blocked(db, p.id, loc, start, end);
  let prov;
  if (providerId) {
    prov = provider(db, providerId);
    const clash = db.appointments.find((a) => ACTIVE.has(a.status) && a.providerId === prov.id && overlaps(start, end, a.start, a.end));
    if (clash) bad(`${prov.name} already has an appointment at that time`);
    if (blocked(db, prov.id, loc, start, end)) bad(`${prov.name} is not available then (blocked time)`);
  } else {
    // No provider named: pick the first one of the right role at this branch who is free then.
    const candidates = providersFor(db, vt, loc);
    prov = candidates.find(isFree);
    if (!prov) bad(candidates.length ? 'No provider is free at that time at this branch' : 'No provider available for this visit type at this branch');
  }
  const appointment = {
    id: id('apt'), patientId, visitTypeId, providerId: prov.id, locationId: loc, start, end, status: 'scheduled', source, notes,
    reminders: [], createdAt: nowIso(), createdBy: by, confirmedAt: null, cancelledAt: null, cancelReason: null,
    fee: fee ?? feeFor(db, vt, prov), paymentStatus: 'unpaid', paymentMode: null, durationMin: Number(durationMin) > 0 ? Number(durationMin) : vt.durationMin,
  };
  db.appointments.push(appointment);
  log(db, source === 'ai' ? 'ai' : 'schedule', `${by} booked ${vt.name} for ${fullName(patient)} on ${fmtWhen(start)} at ${location(db, loc)?.name || 'clinic'}`, { patientId, appointmentId: appointment.id });
  for (const tp of db.treatmentPlans.filter((t) => t.patientId === patientId && !t.nextVisitScheduled)) {
    if (visitTypeId === 'vt_procedure' || visitTypeId === 'vt_followup') { tp.nextVisitScheduled = true; tp.nextAppointmentId = appointment.id; }
  }
  emit(db, 'appointment.booked', { appointment, patient: publicPatient(patient) });
  return appointment;
}

export function rescheduleAppointment(db, apptId, { start, providerId, locationId, by = 'Staff' }) {
  const a = find(db.appointments, apptId, 'Appointment');
  if (!ACTIVE.has(a.status)) bad('Only active appointments can be rescheduled');
  const vt = visitType(db, a.visitTypeId);
  const prov = providerId ? provider(db, providerId) : provider(db, a.providerId);
  const loc = locationId || a.locationId;
  const end = addMinutes(start, vt.durationMin);
  const clash = db.appointments.find((x) => x.id !== a.id && ACTIVE.has(x.status) && x.providerId === prov.id && overlaps(start, end, x.start, x.end));
  if (clash) bad(`${prov.name} already has an appointment at that time`);
  if (blocked(db, prov.id, loc, start, end)) bad(`${prov.name} is not available then (blocked time)`);
  const oldStart = a.start; const oldLoc = a.locationId; const oldProv = a.providerId;
  Object.assign(a, { start, end, providerId: prov.id, locationId: loc, status: 'scheduled', confirmedAt: null, reminders: [], rescheduledFrom: oldStart, updatedAt: nowIso() });
  log(db, 'schedule', `${by} moved ${fullName(find(db.patients, a.patientId, 'Patient'))} from ${fmtWhen(oldStart)} to ${fmtWhen(start)}`, { appointmentId: a.id });
  if (db.settings.rules.waitlistAutoOffer) offerToWaitlist(db, { visitTypeId: a.visitTypeId, providerId: oldProv, locationId: oldLoc, start: oldStart, end: addMinutes(oldStart, vt.durationMin) });
  emit(db, 'appointment.rescheduled', { appointment: a, previousStart: oldStart });
  return a;
}

export function cancelAppointment(db, apptId, { reason = '', by = 'Staff', source = 'staff' }) {
  const a = find(db.appointments, apptId, 'Appointment');
  if (!ACTIVE.has(a.status)) bad('Appointment is not active');
  const hoursNotice = (new Date(a.start) - new Date()) / 3600000;
  a.status = 'cancelled'; a.cancelledAt = nowIso(); a.cancelReason = reason; a.cancelledBy = by;
  a.cancelledLate = hoursNotice < db.settings.rules.cancelNoticeHours;
  log(db, 'schedule', `${by} cancelled ${fullName(find(db.patients, a.patientId, 'Patient'))}'s ${visitType(db, a.visitTypeId).name} on ${fmtWhen(a.start)}${a.cancelledLate ? ' (late)' : ''}`, { appointmentId: a.id });
  let offers = [];
  if (db.settings.rules.waitlistAutoOffer) offers = offerToWaitlist(db, { visitTypeId: a.visitTypeId, providerId: a.providerId, locationId: a.locationId, start: a.start, end: a.end });
  emit(db, 'appointment.cancelled', { appointment: a, source });
  return { appointment: a, offers };
}

export function offerToWaitlist(db, { visitTypeId, providerId, locationId, start, end }) {
  if (new Date(start) < new Date()) return [];
  const dow = DAYS[new Date(start).getDay()];
  const hour = new Date(start).getHours();
  const candidates = db.waitlist.filter((w) => w.status === 'waiting' && w.visitTypeId === visitTypeId
    && (!w.locationId || !locationId || w.locationId === locationId)
    && (w.preferredDays.includes('any') || w.preferredDays.includes(dow))
    && (w.preferredTime === 'any' || (w.preferredTime === 'morning' ? hour < 12 : w.preferredTime === 'evening' ? hour >= 16 : hour >= 12)));
  const offers = [];
  for (const w of candidates.slice(0, 1)) {
    const patient = find(db.patients, w.patientId, 'Patient');
    const vt = visitType(db, visitTypeId);
    w.status = 'offered';
    w.offer = { start, end, providerId, locationId, offeredAt: nowIso(), expiresAt: addMinutes(nowIso(), 120) };
    const body = renderTemplate(db, 'tpl_waitlist', { patient, visitType: vt, provider: provider(db, providerId), start, location: location(db, locationId) });
    sendCommunication(db, { patientId: patient.id, type: 'waitlist', body, meta: { waitlistId: w.id } });
    log(db, 'waitlist', `Offered ${fmtWhen(start)} to ${fullName(patient)} from the waitlist`, { patientId: patient.id });
    offers.push(w);
  }
  return offers;
}

export function acceptWaitlistOffer(db, waitlistId, { by = 'Patient' }) {
  const w = find(db.waitlist, waitlistId, 'Waitlist entry');
  if (w.status !== 'offered' || !w.offer) bad('No open offer for this entry');
  const appointment = bookAppointment(db, { patientId: w.patientId, visitTypeId: w.visitTypeId, providerId: w.offer.providerId, locationId: w.offer.locationId, start: w.offer.start, source: 'patient', by });
  w.status = 'booked'; w.bookedAppointmentId = appointment.id;
  const later = db.appointments.find((a) => a.id !== appointment.id && a.patientId === w.patientId && a.visitTypeId === w.visitTypeId && ACTIVE.has(a.status) && new Date(a.start) > new Date(appointment.start));
  if (later) { later.status = 'cancelled'; later.cancelledAt = nowIso(); later.cancelReason = 'Moved earlier via waitlist'; later.cancelledLate = false; }
  return appointment;
}

export function addBlock(db, { providerId, locationId = null, start, end, reason = '', by = 'Staff' }) {
  const prov = provider(db, providerId);
  if (!start || !end || new Date(end) <= new Date(start)) bad('Block needs a start and an end');
  const clashes = db.appointments.filter((a) => ACTIVE.has(a.status) && a.providerId === prov.id && overlaps(start, end, a.start, a.end));
  const block = { id: id('blk'), providerId, locationId, start, end, reason, createdAt: nowIso(), createdBy: by };
  db.blocks.push(block);
  log(db, 'schedule', `${by} blocked ${prov.name} ${fmtWhen(start)} – ${fmtTime(end)}${reason ? ` (${reason})` : ''}`);
  return { block, affectedAppointments: clashes };
}

export function dueReminders(db, now = nowIso()) {
  const hoursList = db.settings.rules.reminderHoursBefore || [24, 2];
  const due = [];
  for (const a of db.appointments) {
    if (!['scheduled', 'confirmed'].includes(a.status)) continue;
    const hoursUntil = (new Date(a.start) - new Date(now)) / 3600000;
    if (hoursUntil < 0) continue;
    for (const h of hoursList) {
      const already = (a.reminders || []).some((r) => r.hoursBefore === h);
      if (!already && hoursUntil <= h) due.push({ appointment: a, hoursBefore: h });
    }
  }
  return due;
}

export function sendReminder(db, appointment, hoursBefore) {
  const patient = find(db.patients, appointment.patientId, 'Patient');
  const vt = visitType(db, appointment.visitTypeId);
  const prov = provider(db, appointment.providerId);
  const tplId = hoursBefore <= 4 ? 'tpl_reminder2' : (db.settings.templates.find((t) => t.id === 'tpl_reminder24') ? 'tpl_reminder24' : 'tpl_reminder48');
  const body = renderTemplate(db, tplId, { patient, visitType: vt, provider: prov, start: appointment.start, location: location(db, appointment.locationId) });
  const c = sendCommunication(db, { patientId: patient.id, type: 'reminder', body, appointmentId: appointment.id });
  appointment.reminders = appointment.reminders || [];
  appointment.reminders.push({ hoursBefore, sentAt: c.sentAt, communicationId: c.id });
  return c;
}

export function publicPatient(p) {
  if (!p) return null;
  const { notes, ...rest } = p; void notes;
  return rest;
}

export function fmtWhen(iso) {
  return new Date(iso).toLocaleString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
export function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}
