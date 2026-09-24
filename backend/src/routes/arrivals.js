import { Router } from 'express';
import { nowIso, dayKey, find, log, fullName } from '../lib.js';
import { arrivalsBoard, arrive, setVisitStatus, syncVisitMissing, recordPayment, queueBoard } from '../domain/visits.js';
import { location } from '../domain/scheduling.js';
import { sweepNoShows, markNoShow, isOpen, nextOpening, fmtOpening } from '../domain/hours.js';

const r = Router();

r.get('/', (req, res) => {
  const date = req.query.date ? String(req.query.date) : dayKey(nowIso());
  const locationId = req.query.locationId ? String(req.query.locationId) : null;
  const swept = date === dayKey(nowIso()) ? sweepNoShows(req.db) : [];
  const board = arrivalsBoard(req.db, date, locationId);
  const helpRequests = req.db.activity.filter((a) => a.type === 'kiosk_help' && a.open && (!locationId || !a.locationId || a.locationId === locationId));
  const collected = board.filter((r) => r.appointment.paymentStatus === 'paid' && (r.appointment.paidAt || '').slice(0, 10) === date).reduce((s, r) => s + (r.appointment.paidAmount || 0), 0);
  const opening = nextOpening(req.db);
  res.json({ date, locationId, board, helpRequests, swept: swept.length, open: isOpen(req.db), opensLabel: opening ? fmtOpening(opening.at) : null, callbacks: (req.db.callbacks || []).filter((c) => c.status === 'open').length, missedToday: board.filter((r) => r.stage === 'no_show').length, kioskSessions: req.db.kioskSessions.filter((s) => new Date(s.expiresAt) > new Date()).length, collected, currency: req.db.settings.locale?.currencySymbol || '₹' });
});

r.post('/:appointmentId/arrive', (req, res) => {
  const v = arrive(req.db, req.params.appointmentId, { source: 'desk', by: req.user });
  syncVisitMissing(req.db, v.appointmentId);
  if (v.status === 'arrived') { v.status = v.missing.length ? 'needs_attention' : 'ready'; if (v.status === 'ready') v.readyAt ||= nowIso(); }
  req.store.save();
  res.json(v);
});

r.patch('/visits/:visitId', (req, res) => {
  const db = req.db;
  const v = find(db.visits, req.params.visitId, 'Visit');
  const b = req.body || {};
  if (b.resolveHelp) { v.helpRequested = false; v.helpNote = null; syncVisitMissing(db, v.appointmentId); log(db, 'arrival', `${req.user} helped ${fullName(db.patients.find((p) => p.id === v.patientId))} at the kiosk`, { appointmentId: v.appointmentId }); }
  if (b.insuranceVerified !== undefined) {
    const p = find(db.patients, v.patientId, 'Patient');
    p.insurance = { ...p.insurance, verified: !!b.insuranceVerified, verifiedBy: req.user, verifiedAt: nowIso() };
    syncVisitMissing(db, v.appointmentId);
  }
  if (b.status) setVisitStatus(db, v.id, b.status, { by: req.user });
  req.store.save();
  res.json(v);
});

/** Calls the next ready patient for a provider (token display + status). */
r.post('/call-next', (req, res) => {
  const db = req.db; const { providerId, locationId } = req.body || {};
  const date = dayKey(nowIso());
  const rows = arrivalsBoard(db, date, locationId || null).filter((r) => r.visit && (!providerId || r.appointment.providerId === providerId) && ['ready', 'arrived', 'checking_in', 'needs_attention'].includes(r.visit.status)).sort((x, y) => (x.visit.status === 'ready' ? 0 : 1) - (y.visit.status === 'ready' ? 0 : 1) || x.visit.arrivedAt.localeCompare(y.visit.arrivedAt));
  if (!rows.length) return res.json({ called: null });
  const v = setVisitStatus(db, rows[0].visit.id, 'called', { by: req.user });
  req.store.save();
  res.json({ called: { visit: v, patient: rows[0].patient, token: v.token } });
});

r.post('/:appointmentId/payment', (req, res) => {
  const a = recordPayment(req.db, req.params.appointmentId, { amount: req.body?.amount, mode: req.body?.mode, reference: req.body?.reference, by: req.user });
  req.store.save();
  res.json(a);
});

r.post('/:appointmentId/no-show', (req, res) => {
  const a = find(req.db.appointments, req.params.appointmentId, 'Appointment');
  markNoShow(req.db, a, { by: req.user });
  req.store.save();
  res.json(a);
});

/** Public waiting-room display board (no patient names beyond first name of the person being called). */
r.get('/board', (req, res) => {
  const db = req.db;
  const locationId = req.query.locationId ? String(req.query.locationId) : (db.settings.locations?.[0]?.id || null);
  res.json({ practice: db.settings.practice.name, location: location(db, locationId), at: nowIso(), lanes: queueBoard(db, locationId) });
});

export default r;
