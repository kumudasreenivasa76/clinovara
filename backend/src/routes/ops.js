/** Callbacks & missed calls, chair-time estimates, and calendar feeds. */
import { Router } from 'express';
import crypto from 'node:crypto';
import { nowIso, bad, find, log, fullName } from '../lib.js';
import { isOpen, nextOpening, fmtOpening, missedCall, sweepNoShows, markNoShow } from '../domain/hours.js';
import { visitTypeSuggestions, estimateAppointment, PROCEDURE_NORMS } from '../domain/estimates.js';
import { providerFeed, appointmentIcs, calendarLinks } from '../domain/calendar.js';
import { MANAGERS } from '../domain/auth.js';

export const callbacks = Router();
callbacks.get('/', (req, res) => {
  const db = req.db; sweepNoShows(db); req.store.save();
  const list = (db.callbacks || []).filter((c) => req.query.all === 'true' || c.status === 'open').map((c) => ({ ...c, patient: c.patientId ? db.patients.find((p) => p.id === c.patientId) || null : null, appointment: c.appointmentId ? db.appointments.find((a) => a.id === c.appointmentId) || null : null }));
  const opening = nextOpening(db);
  res.json({ open: isOpen(db), opensAt: opening?.at || null, opensLabel: opening ? fmtOpening(opening.at) : null, items: list, counts: { after_hours: list.filter((c) => c.source === 'after_hours' && c.status === 'open').length, missed_call: list.filter((c) => c.source === 'missed_call' && c.status === 'open').length, no_show: list.filter((c) => c.source === 'no_show' && c.status === 'open').length } });
});
callbacks.post('/:id/attempt', (req, res) => { const c = find(req.db.callbacks || [], req.params.id, 'Callback'); c.attempts.push({ at: nowIso(), by: req.user, outcome: req.body?.outcome || 'no answer', note: req.body?.note || '' }); if (req.body?.done) { c.status = 'done'; c.resolvedBy = req.user; c.resolvedAt = nowIso(); } req.store.save(); res.json(c); });
callbacks.post('/:id/done', (req, res) => { const c = find(req.db.callbacks || [], req.params.id, 'Callback'); c.status = 'done'; c.resolvedBy = req.user; c.resolvedAt = nowIso(); c.note = req.body?.note || c.note; log(req.db, 'callback', `${req.user} closed the callback for ${c.contactName}`); req.store.save(); res.json(c); });
callbacks.post('/missed-call', (req, res) => { const out = missedCall(req.db, { phone: req.body?.phone, contactName: req.body?.contactName, at: req.body?.at || nowIso(), by: req.user }); req.store.save(); res.status(201).json(out); });
callbacks.post('/no-show/:appointmentId', (req, res) => { const a = find(req.db.appointments, req.params.appointmentId, 'Appointment'); if (!['scheduled', 'confirmed', 'arrived'].includes(a.status)) bad('Appointment is not open'); markNoShow(req.db, a, { by: req.user }); req.store.save(); res.json(a); });

export const estimates = Router();
estimates.get('/visit-types', (req, res) => res.json({ suggestions: visitTypeSuggestions(req.db), norms: PROCEDURE_NORMS }));
estimates.post('/apply', (req, res) => { if (!MANAGERS.has(req.role)) bad('Only an owner or admin can change visit lengths'); const vt = find(req.db.settings.visitTypes, req.body?.visitTypeId, 'Visit type'); const m = Number(req.body?.durationMin); if (!m || m < 10) bad('Minutes must be at least 10'); const before = vt.durationMin; vt.durationMin = m; log(req.db, 'settings', `${req.user} changed ${vt.name} from ${before} to ${m} min (AI estimate)`); req.store.save(); res.json(vt); });
estimates.post('/appointment', (req, res) => res.json(estimateAppointment(req.db, req.body || {})));

export const calendar = Router();
calendar.get('/links/:appointmentId', (req, res) => { const a = find(req.db.appointments, req.params.appointmentId, 'Appointment'); res.json(calendarLinks({ ...req.db, settings: { ...req.db.settings, tenantSlug: req.tenant.slug } }, a, { base: req.frontendBase.replace(/\/$/, '').replace(':5190', ':4200') })); });
calendar.get('/appointment/:id.ics', (req, res) => { const a = find(req.db.appointments, req.params.id, 'Appointment'); res.setHeader('Content-Type', 'text/calendar; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="appointment-${a.id}.ics"`); res.send(appointmentIcs(req.db, a, { forPatient: req.role === 'public' })); });
calendar.get('/provider/:id.ics', (req, res) => { find(req.db.settings.providers, req.params.id, 'Provider'); res.setHeader('Content-Type', 'text/calendar; charset=utf-8'); res.send(providerFeed(req.db, req.params.id)); });
calendar.get('/feeds', (req, res) => {
  const db = req.db; db.settings.integrations ||= {};
  const key = db.settings.integrations.calendarKey || '';
  const base = `${req.frontendBase.replace(/\/$/, '').replace(':5190', ':4200')}/api/calendar/provider`;
  res.json({ enabled: !!key, feeds: db.settings.providers.map((p) => ({ providerId: p.id, name: p.name, url: key ? `${base}/${p.id}.ics?key=${key}` : null, webcal: key ? `${base.replace(/^https?:/, 'webcal:')}/${p.id}.ics?key=${key}` : null })) });
});
calendar.post('/key', (req, res) => { if (!MANAGERS.has(req.role)) bad('Only an owner or admin can manage calendar feeds'); req.db.settings.integrations ||= {}; req.db.settings.integrations.calendarKey = req.body?.disable ? '' : `cal_${crypto.randomBytes(12).toString('hex')}`; log(req.db, 'settings', `${req.user} ${req.body?.disable ? 'disabled' : 'rotated'} the calendar feed key`); req.store.save(); res.json({ enabled: !!req.db.settings.integrations.calendarKey }); });
