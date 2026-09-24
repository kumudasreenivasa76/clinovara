import { Router } from 'express';
import { id, nowIso, bad, find, log, fullName } from '../lib.js';
import { bookAppointment } from '../domain/scheduling.js';
import { renderTemplate, sendCommunication } from '../domain/messaging.js';
import { packetFor, sendPacket } from '../domain/visits.js';
import { visitBundle, sendToEhr } from '../domain/ehr.js';

const r = Router();

function expand(db, tp) {
  const next = tp.nextAppointmentId ? db.appointments.find((a) => a.id === tp.nextAppointmentId) : null;
  return {
    ...tp,
    patient: db.patients.find((p) => p.id === tp.patientId) || null,
    provider: db.settings.providers.find((p) => p.id === tp.providerId) || null,
    nextAppointment: next && !['cancelled', 'no_show'].includes(next.status) ? next : null,
    openItems: tp.items.filter((i) => ['recommended', 'accepted'].includes(i.status)),
    openQuestions: tp.patientQuestions.filter((q) => !q.answer).length,
    value: tp.items.filter((i) => i.status !== 'declined' && i.status !== 'completed').reduce((s, i) => s + (Number(i.estCost) || 0), 0),
  };
}

r.get('/', (req, res) => {
  const db = req.db;
  let list = db.treatmentPlans.map((tp) => expand(db, tp));
  if (req.query.unscheduled === 'true') list = list.filter((x) => !x.nextVisitScheduled && x.openItems.length);
  if (req.query.patientId) list = list.filter((x) => x.patientId === req.query.patientId);
  res.json(list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
});

r.get('/:id', (req, res) => res.json(expand(req.db, find(req.db.treatmentPlans, req.params.id, 'Treatment plan'))));

r.post('/', (req, res) => {
  const db = req.db; const b = req.body || {};
  const patient = find(db.patients, b.patientId, 'Patient');
  if (!b.providerId) bad('providerId (approving dentist) is required');
  const provider = find(db.settings.providers, b.providerId, 'Provider');
  const tp = { id: id('tp'), patientId: patient.id, appointmentId: b.appointmentId || null, providerId: provider.id, createdAt: nowIso(), createdBy: req.user, approvedBy: provider.name, approvedAt: nowIso(),
    items: (b.items || []).map((i) => ({ id: id('tpi'), procedure: i.procedure, tooth: i.tooth || '', priority: i.priority || 'recommended', status: i.status || 'recommended', estCost: Number(i.estCost) || 0, note: i.note || '' })),
    patientQuestions: [], nextSteps: b.nextSteps || '', nextVisitScheduled: false, nextAppointmentId: null, followUps: [] };
  if (!tp.items.length) bad('Add at least one recommended item');
  db.treatmentPlans.unshift(tp);
  log(db, 'treatment', `${req.user} recorded a treatment plan for ${fullName(patient)} (approved by ${provider.name})`, { patientId: patient.id });
  req.store.save();
  res.status(201).json(expand(db, tp));
});

r.patch('/:id', (req, res) => {
  const tp = find(req.db.treatmentPlans, req.params.id, 'Treatment plan');
  const b = req.body || {};
  for (const k of ['nextSteps', 'providerId', 'appointmentId']) if (b[k] !== undefined) tp[k] = b[k];
  if (b.nextVisitScheduled !== undefined) { tp.nextVisitScheduled = !!b.nextVisitScheduled; if (!tp.nextVisitScheduled) tp.nextAppointmentId = null; }
  if (b.nextAppointmentId !== undefined) { tp.nextAppointmentId = b.nextAppointmentId; tp.nextVisitScheduled = !!b.nextAppointmentId; }
  tp.updatedAt = nowIso();
  req.store.save();
  res.json(expand(req.db, tp));
});

r.post('/:id/items', (req, res) => {
  const tp = find(req.db.treatmentPlans, req.params.id, 'Treatment plan');
  const i = req.body || {};
  if (!i.procedure) bad('procedure is required');
  const item = { id: id('tpi'), procedure: i.procedure, tooth: i.tooth || '', priority: i.priority || 'recommended', status: i.status || 'recommended', estCost: Number(i.estCost) || 0, note: i.note || '' };
  tp.items.push(item);
  req.store.save();
  res.status(201).json(expand(req.db, tp));
});
r.patch('/:id/items/:itemId', (req, res) => {
  const tp = find(req.db.treatmentPlans, req.params.id, 'Treatment plan');
  const item = find(tp.items, req.params.itemId, 'Item');
  for (const k of ['procedure', 'tooth', 'priority', 'status', 'note']) if (req.body?.[k] !== undefined) item[k] = req.body[k];
  if (req.body?.estCost !== undefined) item.estCost = Number(req.body.estCost) || 0;
  req.store.save();
  res.json(expand(req.db, tp));
});
r.delete('/:id/items/:itemId', (req, res) => {
  const tp = find(req.db.treatmentPlans, req.params.id, 'Treatment plan');
  tp.items = tp.items.filter((i) => i.id !== req.params.itemId);
  req.store.save();
  res.json(expand(req.db, tp));
});

r.post('/:id/questions', (req, res) => {
  const tp = find(req.db.treatmentPlans, req.params.id, 'Treatment plan');
  if (!req.body?.question) bad('question is required');
  tp.patientQuestions.push({ id: id('q'), question: req.body.question, answer: req.body.answer || '', at: nowIso(), answeredBy: req.body.answer ? req.user : null });
  req.store.save();
  res.status(201).json(expand(req.db, tp));
});
r.patch('/:id/questions/:qId', (req, res) => {
  const tp = find(req.db.treatmentPlans, req.params.id, 'Treatment plan');
  const q = find(tp.patientQuestions, req.params.qId, 'Question');
  if (req.body?.answer !== undefined) { q.answer = req.body.answer; q.answeredBy = req.user; q.answeredAt = nowIso(); }
  if (req.body?.question !== undefined) q.question = req.body.question;
  req.store.save();
  res.json(expand(req.db, tp));
});

r.post('/:id/follow-ups', (req, res) => {
  const tp = find(req.db.treatmentPlans, req.params.id, 'Treatment plan');
  if (!req.body?.note) bad('note is required');
  tp.followUps.push({ at: nowIso(), by: req.user, note: req.body.note, outcome: req.body.outcome || '' });
  req.store.save();
  res.status(201).json(expand(req.db, tp));
});

// Send the practice-approved follow-up message for unscheduled treatment
r.post('/:id/nudge', (req, res) => {
  const db = req.db;
  const tp = find(db.treatmentPlans, req.params.id, 'Treatment plan');
  const patient = find(db.patients, tp.patientId, 'Patient');
  const provider = db.settings.providers.find((p) => p.id === tp.providerId);
  const treatment = tp.items.filter((i) => ['recommended', 'accepted'].includes(i.status)).map((i) => i.procedure).join(', ') || 'treatment';
  const body = req.body?.body || renderTemplate(db, 'tpl_unscheduled', { patient, provider, treatment });
  const c = sendCommunication(db, { patientId: patient.id, type: 'treatment', body, meta: { treatmentPlanId: tp.id }, by: req.user });
  tp.followUps.push({ at: c.sentAt, by: req.user, note: `Sent follow-up message: "${body.slice(0, 80)}${body.length > 80 ? '…' : ''}"`, outcome: 'message_sent' });
  req.store.save();
  res.json({ plan: expand(db, tp), communication: c });
});

// Book the next visit straight from the plan
r.post('/:id/schedule', (req, res) => {
  const db = req.db;
  const tp = find(db.treatmentPlans, req.params.id, 'Treatment plan');
  const b = req.body || {};
  const a = bookAppointment(db, { patientId: tp.patientId, visitTypeId: b.visitTypeId || 'vt_procedure', providerId: b.providerId || tp.providerId, start: b.start, notes: b.notes || `Treatment plan: ${tp.items.filter((i) => i.status !== 'completed').map((i) => i.procedure).join(', ')}`, by: req.user });
  tp.nextVisitScheduled = true; tp.nextAppointmentId = a.id;
  for (const i of tp.items) if (i.status === 'accepted' || (i.status === 'recommended' && b.markScheduled)) i.status = 'scheduled';
  if (b.sendForms !== false) { const pk = packetFor(db, a.id, { create: true }); sendPacket(db, pk, { frontendBase: req.frontendBase }); }
  req.store.save();
  res.status(201).json({ plan: expand(db, tp), appointment: a });
});

/** Closes a case: marks the plan closed with an outcome and notes, and sends the full record to the EHR. */
r.post('/:id/close', (req, res) => {
  const db = req.db;
  const tp = find(db.treatmentPlans, req.params.id, 'Treatment plan');
  const b = req.body || {};
  const patient = find(db.patients, tp.patientId, 'Patient');
  tp.status = 'closed'; tp.closedAt = nowIso(); tp.closedBy = req.user; tp.closingOutcome = b.outcome || ''; tp.closingNotes = b.notes || '';
  if (b.notes) tp.followUps.push({ at: nowIso(), by: req.user, note: `Case closed: ${b.notes}`, outcome: b.outcome || 'closed' });
  let ehr = null;
  if (b.sendToEhr !== false) {
    const bundle = visitBundle(db, { planId: tp.id, closing: { outcome: b.outcome || '', notes: b.notes || '' }, by: req.user });
    const entry = sendToEhr(db, { bundle, reason: 'Case closed', patientId: patient.id, planId: tp.id, by: req.user });
    ehr = { id: entry.id, status: entry.status, target: entry.target, note: entry.note || null };
  }
  log(db, 'treatment', `${req.user} closed the case for ${fullName(patient)}${b.outcome ? ` (${b.outcome})` : ''}`, { patientId: patient.id });
  req.store.save();
  res.json({ plan: expand(db, tp), ehr });
});

export default r;
