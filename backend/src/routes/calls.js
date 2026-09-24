/**
 * Virtual assistant for phone calls (after hours, and during hours when the front desk is busy).
 * A phone system (or the "Try a call" simulator in Settings) posts each caller turn here; the assistant
 * answers, books/reschedules/cancels through the same rules as WhatsApp, and never gives clinical advice.
 */
import { Router } from 'express';
import { find, bad } from '../lib.js';
import { startCall, callerSays, endCall, assistantSettings, LANGUAGES } from '../domain/assistant.js';

const r = Router();

r.get('/languages', (req, res) => res.json(LANGUAGES));

function summary(db, c) { return { ...c, patient: c.patientId ? db.patients.find((p) => p.id === c.patientId) || null : null }; }

r.get('/', (req, res) => {
  const db = req.db;
  let list = (db.calls || []);
  if (req.query.status) list = list.filter((c) => c.status === req.query.status);
  res.json(list.slice(0, Number(req.query.limit) || 100).map((c) => summary(db, c)));
});

r.get('/:id', (req, res) => res.json(summary(req.db, find(req.db.calls || [], req.params.id, 'Call'))));

r.post('/', (req, res) => {
  const db = req.db; const b = req.body || {};
  if (!assistantSettings(db).enabled) bad('The virtual assistant is turned off in Settings');
  const { call, say, language, open } = startCall(db, { phone: b.phone || '', contactName: b.contactName || '', language: b.language || null, externalId: b.externalId || null });
  req.store.save();
  res.status(201).json({ call: summary(db, call), say, language, open });
});

r.post('/:id/messages', async (req, res) => {
  const db = req.db; const call = find(db.calls || [], req.params.id, 'Call');
  if (call.status === 'ended') bad('This call has already ended');
  if (!req.body?.text) bad('text is required');
  const out = await callerSays(db, call, req.body.text, { frontendBase: req.frontendBase });
  req.store.save();
  res.json({ call: summary(db, call), ...out });
});

r.post('/:id/end', (req, res) => {
  const db = req.db; const call = find(db.calls || [], req.params.id, 'Call');
  const { say } = endCall(db, call, { by: req.user || 'Assistant', reason: req.body?.reason || 'hangup' });
  req.store.save();
  res.json({ call: summary(db, call), say });
});

export default r;
