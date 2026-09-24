import { Router } from 'express';
import { id, nowIso, dayKey, bad, find, log, fullName } from '../lib.js';
import { slotsForDay, nextSlots, bookAppointment, rescheduleAppointment, cancelAppointment, acceptWaitlistOffer, dueReminders, sendReminder, addBlock } from '../domain/scheduling.js';
import { packetFor, sendPacket } from '../domain/visits.js';
import { emit } from '../domain/webhooks.js';

const r = Router();

export function expand(db, a) {
  return {
    ...a,
    patient: db.patients.find((p) => p.id === a.patientId) || null,
    visitType: db.settings.visitTypes.find((v) => v.id === a.visitTypeId) || null,
    provider: db.settings.providers.find((p) => p.id === a.providerId) || null,
    location: (db.settings.locations || []).find((l) => l.id === a.locationId) || null,
    packetStatus: (() => { const pk = db.formPackets.find((p) => p.appointmentId === a.id); if (!pk) return null; const n = Object.values(pk.sections).filter((s) => s.complete).length; return n === 6 ? 'complete' : n ? 'partial' : 'sent'; })(),
    visit: db.visits.find((v) => v.appointmentId === a.id) || null,
  };
}

r.get('/appointments', (req, res) => {
  const db = req.db;
  const from = req.query.from ? String(req.query.from) : null;
  const to = req.query.to ? String(req.query.to) : null;
  let list = db.appointments;
  if (from) list = list.filter((a) => dayKey(a.start) >= from);
  if (to) list = list.filter((a) => dayKey(a.start) <= to);
  if (req.query.status) list = list.filter((a) => a.status === req.query.status);
  if (req.query.patientId) list = list.filter((a) => a.patientId === req.query.patientId);
  if (req.query.providerId) list = list.filter((a) => a.providerId === req.query.providerId);
  if (req.query.locationId) list = list.filter((a) => a.locationId === req.query.locationId);
  res.json(list.sort((a, b) => a.start.localeCompare(b.start)).map((a) => expand(db, a)));
});

r.get('/appointments/:id', (req, res) => res.json(expand(req.db, find(req.db.appointments, req.params.id, 'Appointment'))));

r.get('/availability', (req, res) => {
  const { date, visitTypeId, providerId, locationId } = req.query;
  if (!visitTypeId) bad('visitTypeId is required');
  const opts = { visitTypeId: String(visitTypeId), providerId: providerId ? String(providerId) : null, locationId: locationId ? String(locationId) : null, durationMin: req.query.durationMin ? Number(req.query.durationMin) : null };
  if (date) return res.json(slotsForDay(req.db, { ...opts, date: String(date) }));
  res.json(nextSlots(req.db, { ...opts, preferredTime: String(req.query.preferredTime || 'any'), limit: Number(req.query.limit || 8) }));
});

r.post('/appointments', (req, res) => {
  const b = req.body || {};
  const a = bookAppointment(req.db, { patientId: b.patientId, visitTypeId: b.visitTypeId, providerId: b.providerId, locationId: b.locationId, start: b.start, notes: b.notes, source: b.source || 'staff', by: req.user, fee: b.fee, durationMin: b.durationMin });
  if (b.sendForms !== false) { const pk = packetFor(req.db, a.id, { create: true }); sendPacket(req.db, pk, { frontendBase: req.frontendBase }); }
  req.store.save();
  res.status(201).json(expand(req.db, a));
});

r.patch('/appointments/:id', (req, res) => {
  const a = find(req.db.appointments, req.params.id, 'Appointment');
  const b = req.body || {};
  if (b.notes !== undefined) a.notes = b.notes;
  if (b.fee !== undefined) a.fee = Number(b.fee) || 0;
  if (b.status) {
    if (!['scheduled', 'confirmed', 'no_show', 'completed'].includes(b.status)) bad('Use the dedicated endpoints for cancel/reschedule/arrivals');
    a.status = b.status;
    if (b.status === 'confirmed') { a.confirmedAt = nowIso(); emit(req.db, 'appointment.confirmed', { appointment: a }); }
    if (b.status === 'completed') a.completedAt = nowIso();
    log(req.db, 'schedule', `${req.user} marked ${fullName(req.db.patients.find((p) => p.id === a.patientId))} as ${b.status}`, { appointmentId: a.id });
  }
  req.store.save();
  res.json(expand(req.db, a));
});

r.post('/appointments/:id/reschedule', (req, res) => {
  const a = rescheduleAppointment(req.db, req.params.id, { start: req.body?.start, providerId: req.body?.providerId, locationId: req.body?.locationId, by: req.user });
  req.store.save();
  res.json(expand(req.db, a));
});

r.post('/appointments/:id/cancel', (req, res) => {
  const out = cancelAppointment(req.db, req.params.id, { reason: req.body?.reason || '', by: req.user });
  req.store.save();
  res.json({ appointment: expand(req.db, out.appointment), offers: out.offers });
});

r.post('/appointments/:id/confirm', (req, res) => {
  const a = find(req.db.appointments, req.params.id, 'Appointment');
  if (a.status === 'scheduled') { a.status = 'confirmed'; a.confirmedAt = nowIso(); emit(req.db, 'appointment.confirmed', { appointment: a }); }
  req.store.save();
  res.json(expand(req.db, a));
});

// Provider blocks (leave, lunch, lab time, conferences)
r.get('/blocks', (req, res) => {
  const db = req.db; let list = db.blocks || [];
  if (req.query.from) list = list.filter((b) => dayKey(b.end) >= String(req.query.from));
  if (req.query.to) list = list.filter((b) => dayKey(b.start) <= String(req.query.to));
  res.json(list.map((b) => ({ ...b, provider: db.settings.providers.find((p) => p.id === b.providerId) || null, location: (db.settings.locations || []).find((l) => l.id === b.locationId) || null })));
});
r.post('/blocks', (req, res) => {
  const out = addBlock(req.db, { ...req.body, by: req.user });
  req.store.save();
  res.status(201).json({ ...out, affectedAppointments: out.affectedAppointments.map((a) => expand(req.db, a)) });
});
r.delete('/blocks/:id', (req, res) => { req.db.blocks = (req.db.blocks || []).filter((b) => b.id !== req.params.id); req.store.save(); res.json({ ok: true }); });

// Waitlist
r.get('/waitlist', (req, res) => {
  const db = req.db;
  res.json(db.waitlist.map((w) => ({ ...w, patient: db.patients.find((p) => p.id === w.patientId) || null, visitType: db.settings.visitTypes.find((v) => v.id === w.visitTypeId) || null, location: (db.settings.locations || []).find((l) => l.id === w.locationId) || null })));
});
r.post('/waitlist', (req, res) => {
  const b = req.body || {};
  find(req.db.patients, b.patientId, 'Patient');
  if (!b.visitTypeId) bad('visitTypeId is required');
  const w = { id: id('wl'), patientId: b.patientId, visitTypeId: b.visitTypeId, locationId: b.locationId || null, preferredDays: b.preferredDays?.length ? b.preferredDays : ['any'], preferredTime: b.preferredTime || 'any', note: b.note || '', createdAt: nowIso(), status: 'waiting', offer: null };
  req.db.waitlist.push(w);
  req.store.save();
  res.status(201).json(w);
});
r.post('/waitlist/:id/accept', (req, res) => { const a = acceptWaitlistOffer(req.db, req.params.id, { by: req.user }); req.store.save(); res.json(expand(req.db, a)); });
r.post('/waitlist/:id/decline', (req, res) => { const w = find(req.db.waitlist, req.params.id, 'Waitlist entry'); w.status = 'waiting'; w.offer = null; req.store.save(); res.json(w); });
r.delete('/waitlist/:id', (req, res) => { const i = req.db.waitlist.findIndex((w) => w.id === req.params.id); if (i >= 0) req.db.waitlist.splice(i, 1); req.store.save(); res.json({ ok: true }); });

// Reminders
r.get('/reminders/due', (req, res) => { const db = req.db; res.json(dueReminders(db).map(({ appointment, hoursBefore }) => ({ hoursBefore, appointment: expand(db, appointment) }))); });
r.post('/reminders/send', (req, res) => {
  const db = req.db; const only = req.body?.appointmentId; const sent = [];
  for (const { appointment, hoursBefore } of dueReminders(db)) { if (only && appointment.id !== only) continue; sent.push(sendReminder(db, appointment, hoursBefore)); }
  if (sent.length) log(db, 'comms', `${req.user} sent ${sent.length} reminder${sent.length === 1 ? '' : 's'}`);
  req.store.save();
  res.json({ sent: sent.length, communications: sent });
});

export default r;
