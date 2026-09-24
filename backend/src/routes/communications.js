import { Router } from 'express';
import { id, bad, find, log, fullName } from '../lib.js';
import { renderTemplate, sendCommunication, dueRecalls, duePostVisit, templateBody } from '../domain/messaging.js';
import { dueReminders, sendReminder, location } from '../domain/scheduling.js';

const r = Router();

r.get('/', (req, res) => {
  const db = req.db;
  let list = db.communications;
  if (req.query.patientId) list = list.filter((c) => c.patientId === req.query.patientId);
  if (req.query.type) list = list.filter((c) => c.type === req.query.type);
  res.json(list.slice(0, Number(req.query.limit || 200)).map((c) => ({ ...c, patient: db.patients.find((p) => p.id === c.patientId) || null })));
});

r.get('/templates', (req, res) => res.json(req.db.settings.templates.map((t) => ({ ...t, body: typeof t.body === 'string' ? { en: t.body } : t.body }))));
r.put('/templates/:id', (req, res) => {
  const t = find(req.db.settings.templates, req.params.id, 'Template');
  if (req.body?.body !== undefined) t.body = typeof req.body.body === 'string' ? { ...(typeof t.body === 'object' ? t.body : {}), en: req.body.body } : { ...(typeof t.body === 'object' ? t.body : { en: t.body }), ...req.body.body };
  if (req.body?.name !== undefined) t.name = req.body.name;
  req.store.save();
  res.json(t);
});
r.post('/templates', (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.body) bad('name and body are required');
  const t = { id: id('tpl'), type: b.type || 'custom', name: b.name, body: typeof b.body === 'string' ? { en: b.body } : b.body };
  req.db.settings.templates.push(t);
  req.store.save();
  res.status(201).json(t);
});

function ctxFor(db, b) {
  const patient = b.patientId ? db.patients.find((p) => p.id === b.patientId) : null;
  const a = b.appointmentId ? db.appointments.find((x) => x.id === b.appointmentId) : null;
  return { patient, a, ctx: { patient, visitType: a ? db.settings.visitTypes.find((v) => v.id === a.visitTypeId) : null, provider: a ? db.settings.providers.find((p) => p.id === a.providerId) : null, start: a?.start, location: a ? location(db, a.locationId) : location(db, patient?.locationId), lang: b.lang } };
}

r.post('/preview', (req, res) => {
  const b = req.body || {};
  const { ctx } = ctxFor(req.db, b);
  res.json({ body: renderTemplate(req.db, b.templateId || b.body || '', ctx), lang: ctx.lang || ctx.patient?.preferredLanguage || 'en' });
});

r.post('/send', (req, res) => {
  const db = req.db; const b = req.body || {};
  const { patient, a, ctx } = ctxFor(db, b);
  if (!patient) bad('patientId is required');
  const body = renderTemplate(db, b.templateId || b.body || '', ctx);
  if (!body.trim()) bad('Message body is empty');
  const tpl = db.settings.templates.find((t) => t.id === b.templateId);
  const c = sendCommunication(db, { patientId: patient.id, type: b.type || tpl?.type || 'custom', body, channel: b.channel, appointmentId: a?.id || null, by: req.user });
  log(db, 'comms', `${req.user} sent a ${c.type.replace('_', ' ')} message to ${fullName(patient)}`, { patientId: patient.id });
  req.store.save();
  res.status(201).json(c);
});

r.get('/due', (req, res) => {
  const db = req.db;
  const ex = (a) => ({ ...a, patient: db.patients.find((p) => p.id === a.patientId), visitType: db.settings.visitTypes.find((v) => v.id === a.visitTypeId), location: location(db, a.locationId) });
  res.json({
    reminders: dueReminders(db).map(({ appointment, hoursBefore }) => ({ hoursBefore, appointment: ex(appointment) })),
    recalls: dueRecalls(db).map((p) => ({ patient: p })),
    postVisit: duePostVisit(db).map((a) => ({ appointment: ex(a) })),
  });
});

r.post('/run', (req, res) => {
  const db = req.db;
  const kind = req.body?.kind || 'all';
  const out = { reminders: 0, recalls: 0, postVisit: 0 };
  if (kind === 'all' || kind === 'reminders') for (const { appointment, hoursBefore } of dueReminders(db)) { sendReminder(db, appointment, hoursBefore); out.reminders++; }
  if (kind === 'all' || kind === 'recalls') for (const p of dueRecalls(db)) { sendCommunication(db, { patientId: p.id, type: 'recall', body: renderTemplate(db, 'tpl_recall', { patient: p, location: location(db, p.locationId) }) }); out.recalls++; }
  if (kind === 'all' || kind === 'post_visit') for (const a of duePostVisit(db)) { const p = db.patients.find((x) => x.id === a.patientId); sendCommunication(db, { patientId: p.id, type: 'post_visit', body: renderTemplate(db, 'tpl_postvisit', { patient: p, location: location(db, a.locationId) }), appointmentId: a.id }); out.postVisit++; }
  const total = out.reminders + out.recalls + out.postVisit;
  if (total) log(db, 'comms', `${req.user} ran outreach: ${out.reminders} reminders, ${out.recalls} recalls, ${out.postVisit} post-visit check-ins`);
  req.store.save();
  res.json(out);
});

export { templateBody };
export default r;
