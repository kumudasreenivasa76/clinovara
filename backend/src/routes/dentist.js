/**
 * Dentist workspace: the operational side of a dentist's day. Who is coming, who has arrived, whose
 * intake is ready to read, what reception has passed on, and what the dentist needs reception to do
 * next. It reads and writes the same appointments, visits, form packets and tasks as the front desk,
 * so a change on one side shows on the other. Nothing here is a clinical record.
 */
import { Router } from 'express';
import { nowIso, dayKey, addDays, find, fullName, log, bad, HttpError, minutesBetween, overlaps, localDateTime } from '../lib.js';
import { arrivalsBoard, setVisitStatus, packetStatus, FORM_SECTIONS } from '../domain/visits.js';
import { customView } from '../domain/customForms.js';
import { hoursOn } from '../domain/hours.js';
import { tasksOf, addTask, taskView, TASK_TYPES } from '../domain/deskTasks.js';

const r = Router();
const WAITING = ['arrived', 'checking_in', 'needs_attention', 'ready', 'called'];

function providerFor(req) {
  if (!['dentist', 'hygienist', 'owner', 'admin'].includes(req.role)) throw new HttpError(403, 'The dentist workspace is for dentists, hygienists, admins and owners');
  // A dentist only ever sees their own day; an owner or admin may look at any dentist's.
  const own = req.membership?.providerId || null;
  const asked = req.query.providerId || req.body?.providerId || null;
  const providerId = ['owner', 'admin'].includes(req.role) ? (asked || own) : own;
  if (!providerId) throw new HttpError(400, 'This login is not linked to a dentist yet. Ask the clinic owner to link it under Settings, Team.');
  return find(req.db.settings.providers, String(providerId), 'Dentist');
}

/** One status word per appointment, the same words reception sees. */
function statusOf(a, visit) {
  if (a.status === 'cancelled') return 'cancelled';
  if (a.status === 'no_show') return 'no_show';
  if (a.status === 'completed' || visit?.status === 'done') return 'completed';
  if (visit?.status === 'brought_back' || a.status === 'in_chair') return 'in_progress';
  if (visit?.status === 'called') return 'called';
  if (visit?.status === 'ready') return 'waiting';
  if (visit) return 'checked_in';
  return 'upcoming';
}

/** Where a packet stands for the dentist: has the patient sent it, and has the dentist read it. */
function intakeOf(db, pk, a) {
  if (!pk) return { state: 'not_sent', label: 'Not sent', done: 0, total: FORM_SECTIONS.length };
  const status = packetStatus(pk);
  const custom = customView(db, pk, a, { withFields: false });
  const done = FORM_SECTIONS.filter((s) => pk.sections[s.key]?.complete).length + custom.filter((c) => c.complete).length;
  const total = FORM_SECTIONS.length + custom.length;
  const review = pk.review || null;
  // A new answer after the last review means there is something the dentist has not read.
  const lastAnswer = [...Object.values(pk.sections || {}).map((s) => s.updatedAt || ''), ...Object.values(pk.custom || {}).map((c) => c.at || '')].sort().pop() || '';
  const stale = review && lastAnswer > review.at;
  const state = done === 0 ? 'not_submitted' : review?.status === 'clarification' && !stale ? 'clarification' : review?.status === 'reviewed' && !stale ? 'reviewed' : 'pending_review';
  const label = { not_submitted: 'Not submitted', clarification: 'Clarification requested', reviewed: 'Reviewed', pending_review: status === 'complete' ? 'Pending review' : 'Partly submitted, pending review' }[state];
  return { state, label, done, total, complete: status === 'complete', review, updatedSinceReview: !!stale, channel: channelOf(pk) };
}
/** How the answers arrived, for the submissions list. */
function channelOf(pk) {
  const by = [...Object.values(pk.sections || {}).map((s) => s.by), ...Object.values(pk.custom || {}).map((c) => c.by)].filter(Boolean);
  if (!by.length) return pk.sentAt ? 'Link sent' : 'Not sent';
  if (by.every((b) => b === 'patient')) return 'Patient link';
  if (by.some((b) => b === 'kiosk')) return 'Kiosk';
  return by.some((b) => b === 'patient') ? 'Patient and front desk' : 'Front desk';
}

function rowsFor(db, prov, day) {
  const now = nowIso();
  const cancelled = db.appointments.filter((a) => a.providerId === prov.id && dayKey(a.start) === day && a.status === 'cancelled');
  const live = arrivalsBoard(db, day).filter((x) => x.appointment.providerId === prov.id);
  const row = (a, visit, patient) => {
    const pk = db.formPackets.find((p) => p.appointmentId === a.id) || null;
    const status = statusOf(a, visit);
    const waitFrom = visit && WAITING.includes(visit.status) ? (visit.arrivedAt || a.start) : null;
    return {
      id: a.id, start: a.start, end: a.end, status, visitId: visit?.id || null, token: visit?.token || null,
      patientId: a.patientId, patientName: fullName(patient), phone: patient?.phone || '', language: patient?.language || 'en',
      newPatient: !db.appointments.some((x) => x.patientId === a.patientId && x.id !== a.id && x.status === 'completed'),
      service: db.settings.visitTypes.find((v) => v.id === a.visitTypeId)?.name || 'Visit', branch: (db.settings.locations || []).find((l) => l.id === a.locationId)?.name || '',
      checkedInAt: visit?.arrivedAt || null, waitedMin: waitFrom ? Math.max(0, minutesBetween(waitFrom, now)) : null,
      intake: intakeOf(db, pk, a), packetId: pk?.id || null,
      handoff: visit?.handoff || null, deskVerified: visit ? !(visit.missing || []).length : false, missing: visit?.missing || [],
      lateMin: !visit && ['scheduled', 'confirmed'].includes(a.status) && a.start < now ? minutesBetween(a.start, now) : 0,
    };
  };
  return [...live.map((x) => row(x.appointment, x.visit, x.patient)), ...cancelled.map((a) => row(a, null, db.patients.find((p) => p.id === a.patientId)))].sort((x, y) => x.start.localeCompare(y.start));
}

/** Free stretches of 20 minutes or more inside today's working hours. */
function gapsFor(db, prov, day, rows) {
  const out = []; const now = nowIso();
  for (const locId of (prov.locationIds?.length ? prov.locationIds : (db.settings.locations || []).map((l) => l.id)).slice(0, 1)) {
    const h = hoursOn(db, day, locId); if (!h) continue;
    let cursor = localDateTime(day, h[0]); const close = localDateTime(day, h[1]);
    const busy = [...rows.filter((x) => !['cancelled', 'no_show'].includes(x.status)).map((x) => [x.start, x.end]), ...(db.blocks || []).filter((b) => b.providerId === prov.id && overlaps(b.start, b.end, cursor, close)).map((b) => [b.start, b.end])].sort((a, b) => a[0].localeCompare(b[0]));
    for (const [s, e] of busy) { if (s > cursor && minutesBetween(cursor, s) >= 20) out.push({ start: cursor, end: s }); if (e > cursor) cursor = e; }
    if (close > cursor && minutesBetween(cursor, close) >= 20) out.push({ start: cursor, end: close });
  }
  return out.filter((g) => g.end > now).map((g) => ({ start: g.start < now ? now : g.start, end: g.end, minutes: minutesBetween(g.start < now ? now : g.start, g.end) })).filter((g) => g.minutes >= 20).slice(0, 4);
}

r.get('/dashboard', (req, res) => {
  const db = req.db; const prov = providerFor(req); const today = dayKey(nowIso());
  const rows = rowsFor(db, prov, today); const live = rows.filter((x) => x.status !== 'cancelled');
  const tasks = tasksOf(db).filter((t) => t.providerId === prov.id);
  const queue = live.filter((x) => ['checked_in', 'waiting', 'called'].includes(x.status));
  res.json({
    provider: { id: prov.id, name: prov.name, specialty: prov.specialty || prov.role || '' }, clinic: db.settings.practice.name, date: today, at: nowIso(),
    kpis: {
      appointments: live.length, arrived: live.filter((x) => x.visitId).length, waiting: queue.length,
      inProgress: live.filter((x) => x.status === 'in_progress').length, completed: live.filter((x) => x.status === 'completed').length,
      upcoming: live.filter((x) => x.status === 'upcoming').length, noShows: live.filter((x) => x.status === 'no_show').length,
    },
    schedule: rows,
    attention: {
      intakePending: live.filter((x) => x.intake.state === 'pending_review' && !['completed', 'no_show'].includes(x.status)).length,
      waiting: queue.length,
      handoffsNew: live.filter((x) => x.handoff && !x.handoff.acknowledgedAt).length,
      tasksAnswered: tasks.filter((t) => t.status === 'done' && !t.seenByDentist).length,
      tasksOpen: tasks.filter((t) => t.status !== 'done').length,
      clarifications: live.filter((x) => x.intake.state === 'clarification').length,
    },
    gaps: gapsFor(db, prov, today, rows),
  });
});

/** Today's arrivals and the live queue: who is in the building for this dentist, in the order to see them. */
r.get('/queue', (req, res) => {
  const db = req.db; const prov = providerFor(req);
  const rows = rowsFor(db, prov, dayKey(nowIso()));
  const order = { in_progress: 0, called: 1, waiting: 2, checked_in: 3 };
  const inHouse = rows.filter((x) => x.status in order).sort((a, b) => order[a.status] - order[b.status] || (a.checkedInAt || '').localeCompare(b.checkedInAt || ''));
  let pos = 0;
  res.json({
    provider: { id: prov.id, name: prov.name }, at: nowIso(),
    queue: inHouse.map((x) => ({ ...x, position: ['waiting', 'checked_in', 'called'].includes(x.status) ? (pos += 1) : null })),
    expected: rows.filter((x) => x.status === 'upcoming'), done: rows.filter((x) => ['completed', 'no_show'].includes(x.status)),
  });
});

const mine = (req, appointmentId) => { const prov = providerFor(req); const a = find(req.db.appointments, appointmentId, 'Appointment'); if (a.providerId !== prov.id) throw new HttpError(403, 'That appointment is with another dentist'); return { prov, a }; };
const visitOf = (db, a) => db.visits.find((v) => v.appointmentId === a.id) || bad('The patient has not checked in yet');

r.post('/appointments/:id/call', (req, res) => { const { a } = mine(req, req.params.id); const v = setVisitStatus(req.db, visitOf(req.db, a).id, 'called', { by: req.user }); req.store.save(); res.json({ status: 'called', token: v.token }); });
r.post('/appointments/:id/start', (req, res) => { const { a } = mine(req, req.params.id); setVisitStatus(req.db, visitOf(req.db, a).id, 'brought_back', { by: req.user }); req.store.save(); res.json({ status: 'in_progress' }); });

/** Operational close of a visit: mark it complete and tell reception what happens next. */
r.post('/appointments/:id/complete', (req, res) => {
  const db = req.db; const { prov, a } = mine(req, req.params.id); const b = req.body || {};
  const v = visitOf(db, a);
  setVisitStatus(db, v.id, 'done', { by: req.user });
  const made = [];
  const instruction = String(b.instruction || '').trim().slice(0, 500);
  if (b.bookNext) made.push(addTask(db, { type: 'book_next', title: 'Schedule next appointment', description: instruction, patientId: a.patientId, appointmentId: a.id, providerId: prov.id, priority: b.priority, due: b.due, by: req.user }));
  if (b.followUp) made.push(addTask(db, { type: b.followUpType && TASK_TYPES[b.followUpType] ? b.followUpType : 'callback', title: TASK_TYPES[b.followUpType] || 'Call patient back', description: instruction, patientId: a.patientId, appointmentId: a.id, providerId: prov.id, priority: b.priority, due: b.due, by: req.user }));
  if (!made.length && instruction) made.push(addTask(db, { type: 'checkout', title: 'Checkout instruction', description: instruction, patientId: a.patientId, appointmentId: a.id, providerId: prov.id, by: req.user }));
  req.store.save();
  res.json({ status: 'completed', tasks: made.map((t) => taskView(db, t)) });
});

/** Tells reception the dentist is running behind, so they can warn the people waiting. */
r.post('/delay', (req, res) => {
  const prov = providerFor(req); const minutes = Math.max(5, Math.min(180, Number(req.body?.minutes) || 15));
  const t = addTask(req.db, { type: 'delay', title: `${prov.name} is running about ${minutes} minutes late`, description: String(req.body?.note || '').slice(0, 300), providerId: prov.id, priority: 'high', by: req.user });
  req.store.save();
  res.status(201).json(taskView(req.db, t));
});

r.post('/appointments/:id/handoff/acknowledge', (req, res) => {
  const { a } = mine(req, req.params.id); const v = visitOf(req.db, a);
  if (!v.handoff) bad('Reception has not left a note for this visit');
  v.handoff.acknowledgedAt ||= nowIso(); v.handoff.acknowledgedBy ||= req.user;
  req.store.save();
  res.json(v.handoff);
});

// ── pre-visit forms: read, mark reviewed, ask reception to clarify ──────────
r.get('/intake', (req, res) => {
  const db = req.db; const prov = providerFor(req); const today = dayKey(nowIso()); const until = dayKey(addDays(nowIso(), 7));
  const items = db.appointments.filter((a) => a.providerId === prov.id && dayKey(a.start) >= today && dayKey(a.start) <= until && !['cancelled', 'no_show'].includes(a.status))
    .sort((x, y) => x.start.localeCompare(y.start)).map((a) => {
      const pk = db.formPackets.find((p) => p.appointmentId === a.id) || null; const p = db.patients.find((x) => x.id === a.patientId);
      return { appointmentId: a.id, packetId: pk?.id || null, start: a.start, today: dayKey(a.start) === today, patientName: fullName(p), service: db.settings.visitTypes.find((v) => v.id === a.visitTypeId)?.name || 'Visit', intake: intakeOf(db, pk, a) };
    });
  const count = (s) => items.filter((x) => x.intake.state === s).length;
  res.json({ items, counts: { submitted: items.filter((x) => x.intake.done > 0).length, pending: count('pending_review'), clarification: count('clarification'), reviewed: count('reviewed'), notSubmitted: items.filter((x) => x.intake.done === 0).length } });
});

const LABEL = (k) => String(k).replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
r.get('/intake/:packetId', (req, res) => {
  const db = req.db; const prov = providerFor(req);
  const pk = find(db.formPackets, req.params.packetId, 'Submission'); const a = find(db.appointments, pk.appointmentId, 'Appointment');
  if (a.providerId !== prov.id) throw new HttpError(403, 'That submission is for another dentist');
  const p = db.patients.find((x) => x.id === pk.patientId);
  const age = p?.dob ? Math.floor((Date.now() - new Date(p.dob).getTime()) / 31557600000) : null;
  const answers = (key) => Object.entries(pk.sections[key]?.data || {}).filter(([k, v]) => v !== '' && v != null && !(Array.isArray(v) && !v.length) && !['scanned', 'signature', 'drawn'].includes(k)).map(([k, v]) => ({ label: LABEL(k), value: Array.isArray(v) ? v.join(', ') : v === true ? 'Yes' : v === false ? 'No' : String(v) }));
  const section = (key) => ({ key, label: FORM_SECTIONS.find((s) => s.key === key)?.label || key, complete: !!pk.sections[key]?.complete, by: pk.sections[key]?.by || null, at: pk.sections[key]?.updatedAt || null, carriedForward: !!pk.sections[key]?.prefilled, answers: answers(key) });
  const consent = pk.sections.consent || {};
  res.json({
    packetId: pk.id, appointmentId: a.id, start: a.start, service: db.settings.visitTypes.find((v) => v.id === a.visitTypeId)?.name || 'Visit',
    intake: intakeOf(db, pk, a),
    patient: { id: p?.id, name: fullName(p), phone: p?.phone || '', age, language: p?.language || 'en', email: p?.email || '' },
    questionnaire: [section('dentalConcerns')],
    health: ['medicalHistory', 'medications', 'allergies'].map(section),
    administrative: [section('insurance')],
    clinicForms: customView(db, pk, a).map((c) => ({ id: c.id, name: c.name, complete: c.complete, by: c.by, at: c.at, answers: c.fields.filter((f) => f.type !== 'info' && c.data[f.id]).map((f) => ({ label: f.label, value: c.data[f.id] === 'yes' ? 'Yes' : c.data[f.id] === 'no' ? 'No' : c.data[f.id] })) })),
    consent: { recorded: !!consent.complete, at: consent.updatedAt || null, by: consent.by || null, signature: consent.data?.signature ? 'Available' : consent.complete ? 'Recorded' : 'Not signed' },
    documents: (db.images || []).filter((i) => i.patientId === pk.patientId).map((i) => ({ id: i.id, name: i.label || i.kind || 'Attachment', at: i.createdAt || null })),
    history: [
      pk.sentAt && { at: pk.sentAt, text: 'Forms link sent to the patient' },
      ...FORM_SECTIONS.filter((s) => pk.sections[s.key]?.updatedAt).map((s) => ({ at: pk.sections[s.key].updatedAt, text: `${s.label} answered by ${pk.sections[s.key].by === 'patient' ? 'the patient' : pk.sections[s.key].by || 'the patient'}` })),
      ...Object.values(pk.custom || {}).map((c) => ({ at: c.at, text: `${c.formName} answered by ${c.by === 'patient' ? 'the patient' : c.by}` })),
      ...(pk.reviews || []).map((x) => ({ at: x.at, text: x.status === 'reviewed' ? `Reviewed by ${x.by}${x.note ? `: ${x.note}` : ''}` : `${x.by} asked reception to clarify: ${x.note}` })),
    ].filter(Boolean).sort((x, y) => (x.at || '').localeCompare(y.at || '')),
  });
});

function packetForReview(req) {
  const prov = providerFor(req); const pk = find(req.db.formPackets, req.params.packetId, 'Submission'); const a = find(req.db.appointments, pk.appointmentId, 'Appointment');
  if (a.providerId !== prov.id) throw new HttpError(403, 'That submission is for another dentist');
  return { prov, pk, a };
}
/** Records that the dentist has read the submission. The patient's answers are never changed here. */
r.post('/intake/:packetId/review', (req, res) => {
  const { pk, a } = packetForReview(req);
  pk.review = { status: 'reviewed', by: req.user, at: nowIso(), note: String(req.body?.note || '').trim().slice(0, 300) };
  (pk.reviews ||= []).push(pk.review);
  log(req.db, 'forms', `${req.user} reviewed the pre-visit forms of ${fullName(req.db.patients.find((p) => p.id === pk.patientId))}`, { appointmentId: a.id, patientId: pk.patientId });
  req.store.save();
  res.json(intakeOf(req.db, pk, a));
});
/** Asks reception to check something with the patient. Reception gets a task; the original answers stay as submitted. */
r.post('/intake/:packetId/clarification', (req, res) => {
  const { prov, pk, a } = packetForReview(req);
  const note = String(req.body?.note || '').trim().slice(0, 400);
  if (note.length < 3) bad('Say what reception should check with the patient');
  pk.review = { status: 'clarification', by: req.user, at: nowIso(), note };
  (pk.reviews ||= []).push(pk.review);
  const t = addTask(req.db, { type: 'clarification', title: 'Clarify pre-visit form with patient', description: note, patientId: pk.patientId, appointmentId: a.id, providerId: prov.id, priority: 'high', by: req.user });
  req.store.save();
  res.status(201).json({ intake: intakeOf(req.db, pk, a), task: taskView(req.db, t) });
});

// ── follow-up tasks the dentist gives reception ─────────────────────────────
r.get('/followups', (req, res) => {
  const db = req.db; const prov = providerFor(req);
  const list = tasksOf(db).filter((t) => t.providerId === prov.id).sort((x, y) => (x.status === 'done') - (y.status === 'done') || y.createdAt.localeCompare(x.createdAt));
  // Opening the list is how a dentist sees that reception has finished something.
  let changed = false; for (const t of list) if (t.status === 'done' && !t.seenByDentist) { t.seenByDentist = true; changed = true; }
  if (changed) req.store.save();
  const today = rowsFor(db, prov, dayKey(nowIso()));
  res.json({ tasks: list.slice(0, 100).map((t) => taskView(db, t)), types: TASK_TYPES, counts: { pending: list.filter((t) => t.status === 'pending').length, inProgress: list.filter((t) => t.status === 'in_progress').length, done: list.filter((t) => t.status === 'done').length }, patients: [...new Map(today.map((x) => [x.patientId, { id: x.patientId, name: x.patientName, appointmentId: x.id }])).values()] });
});
r.post('/followups', (req, res) => {
  const db = req.db; const prov = providerFor(req); const b = req.body || {};
  if (!TASK_TYPES[b.type]) bad('Choose what reception should do');
  if (b.patientId) find(db.patients, b.patientId, 'Patient');
  const t = addTask(db, { type: b.type, title: String(b.title || TASK_TYPES[b.type]).slice(0, 120), description: String(b.description || '').slice(0, 500), patientId: b.patientId || null, appointmentId: b.appointmentId || null, providerId: prov.id, priority: b.priority, due: b.due, by: req.user });
  req.store.save();
  res.status(201).json(taskView(db, t));
});

export default r;
