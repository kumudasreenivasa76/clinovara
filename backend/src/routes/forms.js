import { Router } from 'express';
import { nowIso, bad, find, log, fullName, brandOf, HttpError } from '../lib.js';
import { rateLimit } from '../lib-ratelimit.js';
import { MANAGERS } from '../domain/auth.js';
import { FORM_SECTIONS, packetFor, updateSection, packetStatus } from '../domain/visits.js';
import { ACTIVE, location } from '../domain/scheduling.js';
import { STARTERS, FIELD_TYPES, formsOf, cleanForm, formsFor, saveAnswers, customView, fieldsFromText, draftForm } from '../domain/customForms.js';
import * as intake from '../domain/intake.js';

const r = Router();

/** A packet as the staff screens see it. Attachment files and the audit trail stay out of lists. */
function expand(db, pk, { detail = false } = {}) {
  const a = db.appointments.find((x) => x.id === pk.appointmentId) || null;
  const { attachments = [], history = [], ...rest } = pk;
  return {
    ...rest, status: packetStatus(pk),
    patient: db.patients.find((p) => p.id === pk.patientId) || null,
    appointment: a, visitType: a ? db.settings.visitTypes.find((v) => v.id === a.visitTypeId) : null,
    provider: a ? db.settings.providers.find((p) => p.id === a.providerId) : null,
    location: a ? location(db, a.locationId) : null,
    missing: FORM_SECTIONS.filter((s) => !pk.sections[s.key]?.complete).map((s) => s.label),
    custom: customView(db, pk, a),
    intake: intake.lifecycle(db, pk, a),
    contactChanges: intake.contactChanges(db, pk),
    attachments: attachments.map(intake.attachmentMeta),
    ...(detail ? { history, messages: db.communications.filter((c) => c.appointmentId === pk.appointmentId && c.type === 'forms').map((c) => ({ id: c.id, channel: c.channel, body: c.body, sentAt: c.sentAt, by: c.by, kind: c.meta?.kind || 'invite', delivery: c.delivery === 'simulated' ? 'unknown' : c.delivery, error: c.deliveryError || null })) } : {}),
  };
}
const isDentist = (req) => req.role === 'dentist' || !!req.membership?.providerId;

r.get('/', (req, res) => {
  const db = req.db;
  const upcomingOnly = req.query.upcoming !== 'false';
  const list = db.formPackets.map((pk) => expand(db, pk)).filter((x) => x.appointment && (!upcomingOnly || (x.appointment.start >= nowIso().slice(0, 10) && !['cancelled', 'no_show', 'completed'].includes(x.appointment.status))));
  res.json(list.sort((a, b) => a.appointment.start.localeCompare(b.appointment.start)));
});

// ── assigning, sending and tracking ────────────────────────────────────────

/** Upcoming appointments a form can be assigned to, with the contact details reception confirms before sending. */
r.get('/candidates', (req, res) => {
  const db = req.db; const now = nowIso();
  res.json(db.appointments.filter((a) => ACTIVE.has(a.status) && a.start > now).sort((x, y) => x.start.localeCompare(y.start)).slice(0, 200).map((a) => {
    const p = db.patients.find((x) => x.id === a.patientId); const pk = db.formPackets.find((k) => k.appointmentId === a.id);
    return { appointmentId: a.id, start: a.start, patientId: a.patientId, patient: fullName(p), phone: p?.phone || '', email: p?.email || '', preferredChannel: p?.preferredChannel || db.settings.locale?.defaultChannel || 'whatsapp',
      visitType: db.settings.visitTypes.find((v) => v.id === a.visitTypeId)?.name || '', provider: db.settings.providers.find((x) => x.id === a.providerId)?.name || '', forms: formsFor(db, a).map((f) => f.name),
      packetId: pk?.id || null, status: pk ? intake.lifecycle(db, pk, a).status : null };
  }));
});

r.get('/channels', (req, res) => res.json({ channels: intake.CHANNELS, statuses: intake.STATUS_LABEL }));

r.post('/assign', (req, res) => {
  const db = req.db; const b = req.body || {};
  const a = find(db.appointments, b.appointmentId, 'Appointment');
  const patient = find(db.patients, a.patientId, 'Patient');
  if (b.phone !== undefined && String(b.phone).trim() && String(b.phone).trim() !== patient.phone) { if (String(b.phone).replace(/\D/g, '').length < 10) bad('Enter a mobile number with at least 10 digits'); patient.phone = String(b.phone).trim(); }
  if (b.email !== undefined && String(b.email).trim() !== (patient.email || '')) { if (b.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(b.email).trim())) bad('That email address does not look right'); patient.email = String(b.email).trim(); }
  const pk = packetFor(db, a.id, { create: true });
  const c = intake.assign(db, pk, { channel: b.channel, when: b.when, scheduleAt: b.scheduleAt, by: req.user, frontendBase: req.frontendBase });
  log(db, 'forms', `${req.user} assigned the intake form to ${fullName(patient)} (${intake.CHANNELS.find((x) => x.id === pk.channel).label}${pk.scheduledFor ? ', scheduled' : ''})`, { appointmentId: a.id });
  req.store.save();
  res.status(201).json({ packet: expand(db, pk), communication: c });
});

r.get('/report', (req, res) => {
  if (!MANAGERS.has(req.role)) throw new HttpError(403, 'The forms report is for clinic owners and admins');
  const q = req.query;
  res.json(intake.report(req.db, { from: q.from, to: q.to, providerId: q.providerId, channel: q.channel, locationId: q.locationId, formId: q.formId }));
});

r.get('/intake-settings', (req, res) => {
  const s = intake.intakeSettings(req.db);
  res.json({ settings: s, channels: intake.CHANNELS, variables: intake.TEMPLATE_VARS,
    templates: intake.INTAKE_TEMPLATES.map((t) => { const tpl = req.db.settings.templates.find((x) => x.id === t.id); return { id: t.id, name: t.name, trigger: t.trigger, body: typeof tpl?.body === 'string' ? { en: tpl.body } : (tpl?.body || {}) }; }),
    languages: req.db.settings.locale?.languages || [{ code: 'en', name: 'English' }], canEdit: MANAGERS.has(req.role) });
});
r.put('/intake-settings', (req, res) => {
  if (!MANAGERS.has(req.role)) throw new HttpError(403, 'Only clinic owners and admins can change reminder settings');
  const s = intake.saveIntakeSettings(req.db, req.body || {});
  log(req.db, 'settings', `${req.user} changed the intake reminder settings`);
  req.store.save(); res.json({ settings: s });
});
r.put('/message-templates/:id', (req, res) => {
  if (!MANAGERS.has(req.role)) throw new HttpError(403, 'Only clinic owners and admins can edit message templates');
  intake.intakeSettings(req.db);
  if (!intake.INTAKE_TEMPLATES.some((t) => t.id === req.params.id)) bad('Unknown template');
  const tpl = req.db.settings.templates.find((x) => x.id === req.params.id); if (!tpl) bad('Unknown template');
  const body = {};
  for (const [lang, text] of Object.entries(req.body?.body || {})) { const t = String(text || '').trim().slice(0, 700); if (t) body[String(lang).slice(0, 8)] = t; }
  if (!body.en) bad('The English wording is required: it is used when a language is missing');
  const unknown = [...new Set(Object.values(body).flatMap((t) => [...t.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1])))].filter((v) => !intake.TEMPLATE_VARS.includes(v));
  if (unknown.length) bad(`These placeholders are not available: ${unknown.map((v) => `{{${v}}}`).join(', ')}`);
  if (req.params.id !== 'tpl_forms_received' && Object.values(body).some((t) => !t.includes('{{formsLink}}'))) bad('Keep {{formsLink}} in every language, or the patient gets no link');
  tpl.body = body;
  log(req.db, 'settings', `${req.user} edited the message template "${tpl.name}"`);
  req.store.save(); res.json({ id: tpl.id, body });
});

// ── clinic forms: written by the clinic, sent with the standard packet ─────
const stats = (db, f) => {
  const packets = db.formPackets.filter((pk) => { const a = db.appointments.find((x) => x.id === pk.appointmentId); return a && formsFor(db, a).some((x) => x.id === f.id); });
  return { ...f, sentTo: packets.filter((pk) => pk.sentAt).length, answered: db.formPackets.filter((pk) => pk.custom?.[f.id]?.complete).length };
};
r.get('/templates', (req, res) => res.json({ forms: formsOf(req.db).map((f) => stats(req.db, f)), starters: STARTERS, fieldTypes: FIELD_TYPES, visitTypes: req.db.settings.visitTypes.map((v) => ({ id: v.id, name: v.name })) }));

r.post('/templates', (req, res) => {
  const f = cleanForm(req.body || {});
  formsOf(req.db).push(f);
  log(req.db, 'forms', `${req.user} added the form "${f.name}"`);
  req.store.save();
  res.status(201).json(stats(req.db, f));
});

/** A draft from a one-line description. Nothing is saved: staff edit the draft, then save it as a form. */
r.post('/templates/draft', async (req, res) => {
  const { engine, form } = await draftForm(req.db, req.body?.prompt);
  const clean = cleanForm({ ...form, active: true });
  res.json({ engine, form: { name: clean.name, description: clean.description, fields: clean.fields } });
});

/** Questions from an uploaded text or CSV file. Also a draft: nothing is saved here. */
r.post('/templates/import', (req, res) => {
  const fields = fieldsFromText(req.body?.text);
  const clean = cleanForm({ name: String(req.body?.name || 'Imported form').replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim() || 'Imported form', fields });
  res.json({ form: { name: clean.name, description: '', fields: clean.fields } });
});

r.put('/templates/:id', (req, res) => {
  const list = formsOf(req.db); const i = list.findIndex((f) => f.id === req.params.id);
  if (i < 0) bad('That form no longer exists');
  list[i] = cleanForm(req.body || {}, list[i]);
  log(req.db, 'forms', `${req.user} edited the form "${list[i].name}" (now version ${list[i].version})`);
  req.store.save();
  res.json(stats(req.db, list[i]));
});

r.post('/templates/:id/duplicate', (req, res) => {
  const f = formsOf(req.db).find((x) => x.id === req.params.id); if (!f) bad('That form no longer exists');
  const copy = cleanForm({ ...f, name: `${f.name} (copy)`.slice(0, 80), active: false, fields: f.fields.map((x) => ({ ...x, id: undefined, showIf: null })) });
  formsOf(req.db).push(copy);
  log(req.db, 'forms', `${req.user} duplicated the form "${f.name}"`);
  req.store.save(); res.status(201).json(stats(req.db, copy));
});

r.delete('/templates/:id', (req, res) => {
  const list = formsOf(req.db); const f = list.find((x) => x.id === req.params.id);
  if (!f) bad('That form no longer exists');
  req.db.settings.customForms = list.filter((x) => x.id !== f.id);
  log(req.db, 'forms', `${req.user} deleted the form "${f.name}". Answers already given are kept on each patient's packet.`);
  req.store.save();
  res.json({ ok: true });
});

/** Sends the forms link to everyone with an upcoming appointment this form applies to, who has not answered it yet. */
r.post('/templates/:id/send', (req, res) => {
  const db = req.db; const f = formsOf(db).find((x) => x.id === req.params.id);
  if (!f) bad('That form no longer exists');
  if (!f.active) bad('Switch the form on before sending it');
  const now = nowIso(); let sent = 0; let already = 0; let skipped = 0;
  for (const a of db.appointments.filter((x) => ACTIVE.has(x.status) && x.start > now).sort((x, y) => x.start.localeCompare(y.start))) {
    if (!formsFor(db, a).some((x) => x.id === f.id)) continue;
    const pk = packetFor(db, a.id, { create: true });
    if (pk.custom?.[f.id]?.complete) { already += 1; continue; }
    if (pk.cancelledAt) { skipped += 1; continue; }
    try { if (intake.sendForm(db, pk, { frontendBase: req.frontendBase, by: req.user })) sent += 1; else skipped += 1; } catch { skipped += 1; }
  }
  log(db, 'forms', `${req.user} sent the form "${f.name}" to ${sent} ${sent === 1 ? 'patient' : 'patients'} with upcoming visits`);
  req.store.save();
  res.json({ sent, already, skipped });
});

r.get('/sections', (req, res) => res.json({ sections: FORM_SECTIONS, consentText: req.db.settings.consentText }));

r.post('/send', (req, res) => {
  const pk = packetFor(req.db, req.body?.appointmentId, { create: true });
  const c = intake.sendForm(req.db, pk, { frontendBase: req.frontendBase, by: req.user, channel: req.body?.channel });
  log(req.db, 'forms', `${req.user} sent pre-visit forms to ${fullName(req.db.patients.find((p) => p.id === pk.patientId))}`, { appointmentId: pk.appointmentId });
  req.store.save();
  res.json({ packet: expand(req.db, pk), communication: c });
});

r.post('/:id/remind', (req, res) => {
  const pk = find(req.db.formPackets, req.params.id, 'Form packet');
  if (intake.lifecycle(req.db, pk).submittedAt) bad('This form is already submitted. No reminder is needed.');
  const c = intake.sendForm(req.db, pk, { frontendBase: req.frontendBase, by: req.user, channel: req.body?.channel, kind: req.body?.kind === 'paper' ? 'paper' : 'auto' });
  req.store.save();
  res.json({ packet: expand(req.db, pk), communication: c });
});

/** One submission with its messages, files and audit trail. Opening it is itself recorded. */
r.get('/:id/detail', (req, res) => {
  const pk = find(req.db.formPackets, req.params.id, 'Form packet');
  const last = (pk.history || [])[0];
  if (!(last && last.action === 'viewed' && last.by === req.user && Date.now() - new Date(last.at) < 600000)) { intake.audit(pk, req.user, 'viewed', 'Opened the submission'); req.store.save(); }
  res.json(expand(req.db, pk, { detail: true }));
});

r.post('/:id/cancel', (req, res) => {
  const pk = find(req.db.formPackets, req.params.id, 'Form packet');
  intake.cancel(req.db, pk, req.user);
  log(req.db, 'forms', `${req.user} cancelled the intake form for ${fullName(req.db.patients.find((p) => p.id === pk.patientId))}`, { appointmentId: pk.appointmentId });
  req.store.save(); res.json(expand(req.db, pk, { detail: true }));
});

r.post('/:id/paper', (req, res) => {
  const pk = find(req.db.formPackets, req.params.id, 'Form packet');
  intake.paper(req.db, pk, req.body || {}, req.user);
  req.store.save(); res.json(expand(req.db, pk, { detail: true }));
});

r.post('/:id/attachments', (req, res) => {
  const pk = find(req.db.formPackets, req.params.id, 'Form packet');
  intake.addAttachment(req.db, pk, req.body || {}, req.user);
  req.store.save(); res.status(201).json(expand(req.db, pk, { detail: true }));
});
r.get('/:id/attachments/:attId', (req, res) => {
  const pk = find(req.db.formPackets, req.params.id, 'Form packet');
  const att = (pk.attachments || []).find((x) => x.id === req.params.attId); if (!att) throw new HttpError(404, 'That file is no longer attached');
  intake.audit(pk, req.user, 'downloaded', att.name); req.store.save();
  res.json({ ...intake.attachmentMeta(att), dataUrl: att.dataUrl });
});
r.delete('/:id/attachments/:attId', (req, res) => {
  const pk = find(req.db.formPackets, req.params.id, 'Form packet');
  const att = (pk.attachments || []).find((x) => x.id === req.params.attId); if (!att) throw new HttpError(404, 'That file is no longer attached');
  pk.attachments = pk.attachments.filter((x) => x.id !== att.id);
  intake.audit(pk, req.user, 'attachment_removed', att.name);
  req.store.save(); res.json(expand(req.db, pk, { detail: true }));
});

r.post('/:id/review', (req, res) => {
  const pk = find(req.db.formPackets, req.params.id, 'Form packet');
  intake.review(req.db, pk, { kind: req.body?.kind, note: req.body?.note, by: req.user, role: req.role, isDentist: isDentist(req) });
  log(req.db, 'forms', `${req.user} recorded the ${req.body?.kind === 'dentist' ? 'dentist review' : 'administrative check'} for ${fullName(req.db.patients.find((p) => p.id === pk.patientId))}`, { appointmentId: pk.appointmentId });
  req.store.save(); res.json(expand(req.db, pk, { detail: true }));
});

r.post('/:id/clarify', (req, res) => {
  const pk = find(req.db.formPackets, req.params.id, 'Form packet');
  const fromDentist = req.role === 'dentist';
  intake.clarify(req.db, pk, { note: req.body?.note, send: !fromDentist && req.body?.send !== false, by: req.user, fromDentist, frontendBase: req.frontendBase });
  req.store.save(); res.status(201).json(expand(req.db, pk, { detail: true }));
});
r.post('/:id/clarify/:cid', (req, res) => {
  const pk = find(req.db.formPackets, req.params.id, 'Form packet');
  if (req.body?.action === 'send') intake.sendClarification(req.db, pk, req.params.cid, { by: req.user, frontendBase: req.frontendBase });
  else intake.resolveClarification(pk, req.params.cid, req.user);
  req.store.save(); res.json(expand(req.db, pk, { detail: true }));
});

r.post('/:id/apply-contact', (req, res) => {
  const pk = find(req.db.formPackets, req.params.id, 'Form packet');
  const n = intake.applyContact(req.db, pk, req.user);
  req.store.save(); res.json({ applied: n, packet: expand(req.db, pk, { detail: true }) });
});

// Staff editing a section on behalf of a patient
r.put('/:id/sections/:key', (req, res) => {
  const pk = find(req.db.formPackets, req.params.id, 'Form packet');
  updateSection(req.db, pk, req.params.key, req.body?.data || {}, { by: req.user });
  intake.audit(pk, req.user, 'staff_entry', `Entered "${FORM_SECTIONS.find((s) => s.key === req.params.key)?.label}" on the patient's behalf`);
  intake.afterSave(req.db, pk, { by: req.user, frontendBase: req.frontendBase });
  req.store.save();
  res.json(expand(req.db, pk));
});

// Staff answering a clinic form on a patient's behalf
r.put('/:id/custom/:formId', (req, res) => {
  const pk = find(req.db.formPackets, req.params.id, 'Form packet');
  const ans = saveAnswers(req.db, pk, req.params.formId, req.body?.data || {}, { by: req.user });
  intake.audit(pk, req.user, 'staff_entry', `Entered "${ans.formName}" on the patient's behalf`);
  intake.afterSave(req.db, pk, { by: req.user, frontendBase: req.frontendBase });
  req.store.save();
  res.json(expand(req.db, pk));
});

// ── patient link (token) endpoints: expose only what the patient needs ─────
const linkLimit = rateLimit({ windowMs: 10 * 60000, max: 120, name: 'forms-link' });

/** Finds the packet for a link, refusing links that were cancelled or have expired. */
function packetForLink(db, token) {
  const pk = db.formPackets.find((p) => p.token === token);
  if (!pk) throw new HttpError(404, 'This forms link is not valid');
  if (pk.cancelledAt) throw new HttpError(410, 'This form is no longer needed');
  if (intake.lifecycle(db, pk).expired) throw new HttpError(410, 'This form link has expired');
  return pk;
}

r.get('/token/:token', linkLimit, (req, res) => {
  const db = req.db;
  const pk = packetForLink(db, req.params.token);
  if (req.role === 'public' && intake.markOpened(pk)) req.store.save();
  const x = expand(db, pk);
  const p = x.patient;
  res.json({
    id: pk.id, token: pk.token, status: x.status, sections: pk.sections, missing: x.missing,
    patient: p ? { firstName: p.firstName, lastName: p.lastName, dob: p.dob } : null,
    personal: pk.personal || { complete: false, data: p ? { firstName: p.firstName, lastName: p.lastName, dob: p.dob || '', phone: p.phone || '', email: p.email || '', preferredLanguage: p.preferredLanguage || 'en' } : {} },
    preferences: pk.preferences || { complete: false, data: { channel: p?.preferredChannel || x.intake.channel, reminders: !p?.formRemindersOff, bestTime: '' } },
    appointment: x.appointment ? { start: x.appointment.start, status: x.appointment.status } : null,
    visitType: x.visitType?.name || null, provider: x.provider?.name || null,
    location: x.location?.name || null,
    practice: { name: db.settings.practice.name, phone: db.settings.practice.phone, address: db.settings.practice.address }, branding: brandOf(db.settings),
    consentText: db.settings.consentText, sectionList: FORM_SECTIONS,
    languages: db.settings.locale?.languages || [{ code: 'en', name: 'English' }], insuranceOptions: db.settings.insuranceOptions || [],
    custom: x.custom,
    intake: { percent: x.intake.percent, submittedAt: x.intake.submittedAt, expiresAt: x.intake.expiresAt },
    attachments: x.attachments.filter((f) => f.by === 'Patient').map((f) => ({ id: f.id, name: f.name, size: f.size })),
    clarifications: (pk.clarifications || []).filter((c) => c.status === 'sent').map((c) => c.note),
  });
});

r.put('/token/:token/sections/:key', linkLimit, (req, res) => {
  const db = req.db;
  const pk = packetForLink(db, req.params.token);
  updateSection(db, pk, req.params.key, req.body?.data || {}, { by: 'patient' });
  if (packetStatus(pk) === 'complete') log(db, 'forms', `${fullName(db.patients.find((p) => p.id === pk.patientId))} completed pre-visit forms`, { appointmentId: pk.appointmentId });
  intake.afterSave(db, pk, { by: 'patient', frontendBase: req.frontendBase });
  req.store.save();
  res.json({ status: packetStatus(pk), sections: pk.sections, missing: FORM_SECTIONS.filter((s) => !pk.sections[s.key]?.complete).map((s) => s.label) });
});

r.put('/token/:token/custom/:formId', linkLimit, (req, res) => {
  const db = req.db;
  const pk = packetForLink(db, req.params.token);
  const a = db.appointments.find((x) => x.id === pk.appointmentId);
  if (!formsFor(db, a).some((f) => f.id === req.params.formId)) bad('That form is not part of this visit');
  const ans = saveAnswers(db, pk, req.params.formId, req.body?.data || {}, { by: 'patient' });
  log(db, 'forms', `${fullName(db.patients.find((p) => p.id === pk.patientId))} completed "${ans.formName}"`, { appointmentId: pk.appointmentId });
  intake.afterSave(db, pk, { by: 'patient', frontendBase: req.frontendBase });
  req.store.save();
  res.json({ custom: customView(db, pk, a) });
});

/** The patient's own details and how they want to be contacted. */
r.put('/token/:token/profile/:section', linkLimit, (req, res) => {
  const pk = packetForLink(req.db, req.params.token);
  const saved = intake.saveProfile(req.db, pk, req.params.section, req.body?.data || {});
  req.store.save();
  res.json(saved);
});

r.post('/token/:token/attachments', linkLimit, (req, res) => {
  const pk = packetForLink(req.db, req.params.token);
  if ((pk.attachments || []).filter((f) => f.by === 'Patient').length >= 3) bad('You can attach up to 3 files');
  const att = intake.addAttachment(req.db, pk, { ...req.body, kind: 'document' }, 'Patient');
  req.store.save();
  res.status(201).json({ id: att.id, name: att.name, size: att.size });
});

/** The final "Submit" on the review screen. Refuses while required parts are missing and says which. */
r.post('/token/:token/submit', linkLimit, (req, res) => {
  const db = req.db; const pk = packetForLink(db, req.params.token);
  const a = db.appointments.find((x) => x.id === pk.appointmentId);
  const missing = [...FORM_SECTIONS.filter((s) => !pk.sections[s.key]?.complete).map((s) => s.label), ...formsFor(db, a).filter((f) => !pk.custom?.[f.id]?.complete).map((f) => f.name)];
  if (missing.length) bad(`Please complete: ${missing.join(', ')}`);
  intake.afterSave(db, pk, { by: 'patient', frontendBase: req.frontendBase });
  req.store.save();
  res.json({ submittedAt: intake.lifecycle(db, pk, a).submittedAt });
});

export default r;
