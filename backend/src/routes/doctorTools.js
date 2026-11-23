/**
 * Day-to-day dentist tools: safe prescribing, treatment from the tooth chart, X-rays and photos,
 * post-op check-ins, recalls and personal to-dos. Mounted under /api/doctor next to routes/doctor.js.
 */
import { Router } from 'express';
import { id, nowIso, addDays, dayKey, fullName, find, bad, log } from '../lib.js';
import { sendCommunication } from '../domain/messaging.js';
import { addCallback } from '../domain/hours.js';
import { DRUGS, checkRx } from '../domain/drugs.js';
import { procedures, feePolicy, priceItem } from '../domain/catalogue.js';

const r = Router();

function providerFor(req) {
  // A linked dentist always gets their own figures; only owners and admins may ask for another dentist's.
  const asked = req.query.providerId || req.body?.providerId || null; const own = req.membership?.providerId || null;
  const providerId = ['owner', 'admin'].includes(req.role) ? (asked || own) : (own || asked);
  return providerId ? find(req.db.settings.providers, providerId, 'Provider') : null;
}
const needProvider = (req) => providerFor(req) || bad('providerId required');
const latestPacket = (db, patientId) => db.formPackets.filter((k) => k.patientId === patientId).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))[0] || null;
const ageOf = (dob) => (dob ? Math.floor((Date.now() - new Date(dob).getTime()) / 31557600000) : null);

function factsFor(db, patient) {
  const pk = latestPacket(db, patient.id); const m = pk?.sections.medicalHistory?.data || {}; const meds = pk?.sections.medications?.data || {}; const al = pk?.sections.allergies?.data || {};
  return { allergies: al.list && !/^none$/i.test(String(al.list).trim()) ? al.list : '', conditions: m.conditions || [], bloodThinners: meds.bloodThinners === 'yes', pregnant: m.pregnant === 'yes', ageYears: ageOf(patient.dob), medicines: meds.list || '', formOnFile: !!pk };
}

/* ---------- Catalogue for pickers ---------- */
r.get('/catalogue', (req, res) => {
  const db = req.db;
  res.json({ procedures: procedures(db).filter((p) => p.active !== false), fees: feePolicy(db) });
});

/* ---------- Prescriptions ---------- */
r.get('/drugs', (req, res) => res.json({ drugs: DRUGS }));
r.post('/rx/check', (req, res) => {
  const db = req.db; const patient = find(db.patients, req.body?.patientId, 'Patient');
  const facts = factsFor(db, patient);
  res.json({ facts, warnings: checkRx(facts, req.body?.drugIds || []) });
});
r.post('/rx', (req, res) => {
  const db = req.db; const prov = needProvider(req); const b = req.body || {};
  const patient = find(db.patients, b.patientId, 'Patient');
  const lines = (Array.isArray(b.lines) ? b.lines : []).filter((l) => DRUGS.some((d) => d.id === l.drugId));
  if (!lines.length) bad('Add at least one medicine');
  const facts = factsFor(db, patient); const warnings = checkRx(facts, lines.map((l) => l.drugId));
  const high = warnings.filter((w) => w.level === 'high');
  if (high.length && !String(b.overrideReason || '').trim()) bad(`Safety check: ${high.map((w) => `${w.drug}: ${w.text}`).join(' ')} Remove the medicine or write why you are prescribing it anyway.`);
  const clinic = db.settings.practice; const date = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const age = facts.ageYears != null ? `, ${facts.ageYears} yrs` : '';
  const text = [
    clinic.name, clinic.address || '', clinic.phone || '', '',
    `${prov.name}${prov.qualifications ? `, ${prov.qualifications}` : ''}${prov.councilRegNo ? `\nReg. No. ${prov.councilRegNo}` : ''}`,
    `Date: ${date}`, `Patient: ${fullName(patient)}${age}`, facts.allergies ? `Allergies: ${facts.allergies}` : '', '', 'Rx', '',
    ...lines.map((l, i) => { const d = DRUGS.find((x) => x.id === l.drugId); return `${i + 1}. ${d.name} ${d.strength} (${d.form})\n   ${l.dose || d.dose}, ${l.frequency || d.frequency}, for ${l.days || d.days} days${l.note ? `\n   ${l.note}` : ''}`; }),
    '', b.advice ? `Advice: ${b.advice}` : '', high.length ? `Prescriber note (safety warning overridden): ${b.overrideReason}` : '',
  ].filter((x, i, a) => x !== '' || (a[i - 1] !== '' && i !== 0)).join('\n');
  const doc = { id: id('doc'), patientId: patient.id, providerId: prov.id, kind: 'prescription', title: 'Prescription', text, createdAt: nowIso(), createdBy: req.user, sentAt: null, rx: { lines, warnings, overrideReason: b.overrideReason || '' } };
  if (b.send) { sendCommunication(db, { patientId: patient.id, type: 'document', body: `Prescription from ${prov.name}:\n\n${text}`, by: prov.name }); doc.sentAt = nowIso(); }
  db.documents.push(doc);
  log(db, 'patient', `${prov.name} prescribed ${lines.length} medicine${lines.length === 1 ? '' : 's'} for ${fullName(patient)}${high.length ? ' (safety warning overridden)' : ''}`, { patientId: patient.id });
  req.store.save(); res.status(201).json({ ...doc, warnings });
});

/* ---------- Treatment straight from the tooth chart ---------- */
r.post('/teeth/:patientId/plan', (req, res) => {
  const db = req.db; const prov = needProvider(req); const patient = find(db.patients, req.params.patientId, 'Patient'); const b = req.body || {};
  if (!b.tooth) bad('Choose a tooth');
  const item = { procedureId: b.procedureId || null, procedure: b.procedure || '', estCost: b.estCost, note: b.note || '' };
  if (!item.procedureId && !item.procedure) bad('Choose a procedure');
  const priced = priceItem(db, item, { by: 'dentist' });
  let tp = db.treatmentPlans.find((t) => t.patientId === patient.id && t.providerId === prov.id && !t.nextVisitScheduled && t.status !== 'closed' && t.items.some((i) => ['recommended', 'accepted'].includes(i.status)));
  if (!tp) { tp = { id: id('tp'), patientId: patient.id, appointmentId: null, providerId: prov.id, createdAt: nowIso(), createdBy: req.user, approvedBy: prov.name, approvedAt: nowIso(), items: [], patientQuestions: [], nextSteps: '', nextVisitScheduled: false, nextAppointmentId: null, followUps: [] }; db.treatmentPlans.push(tp); }
  tp.items.push({ id: id('tpi'), ...priced, tooth: String(b.tooth), priority: b.priority || 'recommended', status: 'recommended' });
  log(db, 'patient', `${prov.name} planned ${priced.procedure} on tooth ${b.tooth} for ${fullName(patient)}`, { patientId: patient.id });
  req.store.save(); res.status(201).json({ planId: tp.id, item: tp.items[tp.items.length - 1] });
});

/* ---------- X-rays and photos ---------- */
const IMAGE_KINDS = ['xray', 'photo', 'scan', 'other'];
r.get('/images/:patientId', (req, res) => {
  const db = req.db; find(db.patients, req.params.patientId, 'Patient');
  res.json({ kinds: IMAGE_KINDS, images: db.images.filter((i) => i.patientId === req.params.patientId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
});
r.post('/images/:patientId', (req, res) => {
  const db = req.db; const patient = find(db.patients, req.params.patientId, 'Patient'); const b = req.body || {};
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(String(b.dataUrl || ''))) bad('Upload a JPEG, PNG or WebP image');
  if (b.dataUrl.length > 1_800_000) bad('This image is too large. Use a smaller photo (under about 1.3 MB).');
  const img = { id: id('img'), patientId: patient.id, providerId: req.membership?.providerId || b.providerId || null, kind: IMAGE_KINDS.includes(b.kind) ? b.kind : 'photo', title: String(b.title || '').slice(0, 80), tooth: String(b.tooth || '').slice(0, 8), dataUrl: b.dataUrl, createdAt: nowIso(), by: req.user };
  db.images.push(img);
  log(db, 'patient', `${req.user} added a ${img.kind} for ${fullName(patient)}${img.tooth ? ` (tooth ${img.tooth})` : ''}`, { patientId: patient.id });
  req.store.save(); res.status(201).json(img);
});
r.delete('/images/:patientId/:imageId', (req, res) => {
  const db = req.db; const i = db.images.findIndex((x) => x.id === req.params.imageId && x.patientId === req.params.patientId);
  if (i < 0) bad('Image not found');
  db.images.splice(i, 1); req.store.save(); res.json({ ok: true });
});

/* ---------- Follow-ups: post-op calls, recalls, to-dos ---------- */
const POSTOP = /extract|root canal|\brct\b|implant|surgery|surgical|wisdom|graft|flap|pulpotomy|pulpectomy|biopsy|frenectomy|apicectomy/i;
r.get('/followups', (req, res) => {
  const db = req.db; const prov = needProvider(req); const now = nowIso(); const today = dayKey(now);
  const since = addDays(now, -4);
  const postOp = db.visits.filter((v) => {
    const a = db.appointments.find((x) => x.id === v.appointmentId);
    return a?.providerId === prov.id && v.status === 'done' && !v.postOpCheck && v.doctorNotes?.updatedAt >= since && POSTOP.test(`${v.doctorNotes?.procedureDone || ''} ${a.notes || ''}`);
  }).map((v) => { const patient = db.patients.find((p) => p.id === v.patientId); return { visitId: v.id, patientId: v.patientId, patient: fullName(patient), phone: patient?.phone || '', procedure: v.doctorNotes.procedureDone, doneAt: v.doctorNotes.updatedAt, messaged: !!v.postOpMessagedAt }; });
  const mineIds = new Set(db.appointments.filter((a) => a.providerId === prov.id).map((a) => a.patientId));
  const recalls = db.patients.filter((p) => mineIds.has(p.id) && p.nextRecallDue && p.nextRecallDue <= today && !db.appointments.some((a) => a.patientId === p.id && ['scheduled', 'confirmed'].includes(a.status) && a.start > now)).map((p) => ({ patientId: p.id, patient: fullName(p), phone: p.phone, dueOn: p.nextRecallDue, lastMessaged: p.recallMessagedAt || null }));
  const tasks = db.tasks.filter((t) => t.providerId === prov.id).sort((a, b) => Number(a.done) - Number(b.done) || (a.due || '9').localeCompare(b.due || '9'));
  const labBack = db.labCases.filter((c) => c.providerId === prov.id && c.status === 'received' && !c.archived).map((c) => ({ id: c.id, patient: fullName(db.patients.find((p) => p.id === c.patientId)), kind: c.kind, tooth: c.tooth }));
  res.json({ postOp, recalls, tasks, labBack, today });
});
r.post('/followups/postop/:visitId/message', (req, res) => {
  const db = req.db; const prov = needProvider(req); const v = find(db.visits, req.params.visitId, 'Visit'); const patient = find(db.patients, v.patientId, 'Patient');
  sendCommunication(db, { patientId: patient.id, type: 'checkin', body: `Hi ${patient.firstName}, this is ${prov.name}'s clinic checking in after your ${v.doctorNotes?.procedureDone || 'treatment'}. How are you feeling? Reply here if you have pain that is getting worse, swelling, fever or bleeding that will not stop, and we will help right away.`, by: prov.name });
  v.postOpMessagedAt = nowIso(); req.store.save(); res.json({ ok: true });
});
r.post('/followups/postop/:visitId/done', (req, res) => {
  const db = req.db; const prov = needProvider(req); const v = find(db.visits, req.params.visitId, 'Visit'); const patient = find(db.patients, v.patientId, 'Patient'); const b = req.body || {};
  v.postOpCheck = { outcome: b.outcome === 'concern' ? 'concern' : 'ok', note: String(b.note || '').slice(0, 300), at: nowIso(), by: req.user };
  if (v.postOpCheck.outcome === 'concern') addCallback(db, { source: 'no_show', patientId: patient.id, contactName: fullName(patient), contactPhone: patient.phone, reason: `${prov.name} is worried after ${v.doctorNotes?.procedureDone || 'treatment'}: ${v.postOpCheck.note || 'please book a review visit'}`, priority: 'high' });
  log(db, 'visit', `${prov.name} did the post-op check for ${fullName(patient)}: ${v.postOpCheck.outcome}`, { patientId: patient.id });
  req.store.save(); res.json({ ok: true });
});
r.post('/followups/recall/:patientId/send', (req, res) => {
  const db = req.db; const prov = needProvider(req); const p = find(db.patients, req.params.patientId, 'Patient');
  sendCommunication(db, { patientId: p.id, type: 'recall', body: `Hi ${p.firstName}, it is time for your check-up at ${db.settings.practice.name}. Reply here and we will find a time that suits you.`, by: prov.name });
  p.recallMessagedAt = nowIso(); req.store.save(); res.json({ ok: true });
});
r.post('/tasks', (req, res) => {
  const db = req.db; const prov = needProvider(req); const b = req.body || {};
  if (!String(b.text || '').trim()) bad('Write what needs doing');
  const t = { id: id('task'), providerId: prov.id, text: String(b.text).trim().slice(0, 200), due: b.due || '', patientId: b.patientId || null, done: false, createdAt: nowIso() };
  db.tasks.push(t); req.store.save(); res.status(201).json(t);
});
r.patch('/tasks/:id', (req, res) => {
  const t = find(req.db.tasks, req.params.id, 'Task'); if ('done' in (req.body || {})) { t.done = !!req.body.done; t.doneAt = t.done ? nowIso() : null; }
  req.store.save(); res.json(t);
});
r.delete('/tasks/:id', (req, res) => {
  const db = req.db; const i = db.tasks.findIndex((x) => x.id === req.params.id); if (i >= 0) db.tasks.splice(i, 1); req.store.save(); res.json({ ok: true });
});

export default r;
