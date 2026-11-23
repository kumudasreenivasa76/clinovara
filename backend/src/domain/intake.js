/**
 * Pre-visit intake: one engine shared by reception, dentists, owners and the patient link.
 *
 * A form packet (one per appointment) is the assignment and the submission. This module adds what turns it
 * into a tracked workflow: the delivery channel, a lifecycle status with its own timestamps, secure link
 * expiry, reminders, paper and in-clinic completion, attachments, administrative and dentist review,
 * clarification requests, an audit trail and the owner report.
 *
 * It is an administrative handoff. Nothing here diagnoses, scores risk or decides fitness for treatment:
 * health answers are shown as patient-reported and only a dentist can record that they were reviewed.
 */
import crypto from 'node:crypto';
import { id, nowIso, addDays, addMinutes, bad, fullName, log, HttpError } from '../lib.js';
import { FORM_SECTIONS } from './visits.js';
import { renderTemplate, sendCommunication } from './messaging.js';
import { formsFor } from './customForms.js';
import { ACTIVE, location } from './scheduling.js';
import { mailConfigured, sendEmail } from './mailer.js';
import { emit } from './webhooks.js';

export const CHANNELS = [
  { id: 'whatsapp', label: 'WhatsApp', message: true },
  { id: 'sms', label: 'SMS', message: true },
  { id: 'email', label: 'Email', message: true },
  { id: 'print', label: 'Print for the clinic', message: false },
  { id: 'tablet', label: 'Clinic tablet', message: false },
];
const MESSAGE_CHANNELS = new Set(CHANNELS.filter((c) => c.message).map((c) => c.id));

export const STATUS_LABEL = {
  draft: 'Not sent', scheduled: 'Scheduled', queued: 'Queued', sent: 'Sent', delivered: 'Delivered', failed: 'Failed',
  opened: 'Link opened', in_progress: 'In progress', submitted: 'Submitted', expired: 'Link expired', cancelled: 'Cancelled',
  paper_received: 'Paper received', under_review: 'Under review', reviewed: 'Reviewed',
};
const SUBMITTED = new Set(['submitted', 'under_review', 'reviewed']);
const PENDING = new Set(['draft', 'scheduled', 'queued', 'sent', 'delivered', 'opened', 'in_progress']);

const DEFAULTS = { autoRemind: true, remindHoursBefore: [24, 4], maxReminders: 3, quietStart: '21:00', quietEnd: '08:00', linkValidDaysAfter: 1, confirmOnSubmit: true };

/** Message templates this module needs. Added to a clinic's templates the first time they are asked for. */
export const INTAKE_TEMPLATES = [
  { id: 'tpl_forms', trigger: 'Form assigned', name: 'Form invitation' },
  { id: 'tpl_forms_reminder', trigger: 'Not completed before the visit', name: 'Form reminder', body: {
    en: 'Hi {{firstName}}, a reminder from {{practice}}. Please complete your form before your visit on {{when}}: {{formsLink}} If you have already submitted it, please ignore this message.',
    hi: 'नमस्ते {{firstName}}, {{practice}} की ओर से याद दिला रहे हैं। कृपया {{when}} की मुलाक़ात से पहले अपना फ़ॉर्म भरें: {{formsLink}} अगर आप फ़ॉर्म भर चुके हैं तो इस संदेश को अनदेखा करें।',
    kn: 'ನಮಸ್ಕಾರ {{firstName}}, {{practice}} ನಿಂದ ನೆನಪಿಸುತ್ತಿದ್ದೇವೆ. {{when}} ರ ಭೇಟಿಗೆ ಮೊದಲು ನಿಮ್ಮ ಫಾರ್ಮ್ ಭರ್ತಿ ಮಾಡಿ: {{formsLink}} ಈಗಾಗಲೇ ಸಲ್ಲಿಸಿದ್ದರೆ ಈ ಸಂದೇಶವನ್ನು ಕಡೆಗಣಿಸಿ.' } },
  { id: 'tpl_forms_incomplete', trigger: 'Started but not submitted', name: 'Form incomplete', body: {
    en: 'Hi {{firstName}}, your form for {{practice}} is started but not submitted. You can continue where you left off: {{formsLink}}',
    hi: 'नमस्ते {{firstName}}, {{practice}} का आपका फ़ॉर्म शुरू हुआ है पर जमा नहीं हुआ। जहाँ छोड़ा था वहीं से जारी रखें: {{formsLink}}',
    kn: 'ನಮಸ್ಕಾರ {{firstName}}, {{practice}} ಗಾಗಿ ನಿಮ್ಮ ಫಾರ್ಮ್ ಪ್ರಾರಂಭವಾಗಿದೆ ಆದರೆ ಸಲ್ಲಿಸಿಲ್ಲ. ನಿಲ್ಲಿಸಿದ ಸ್ಥಳದಿಂದ ಮುಂದುವರಿಸಿ: {{formsLink}}' } },
  { id: 'tpl_forms_received', trigger: 'Form submitted', name: 'Form received', body: {
    en: 'Thank you {{firstName}}. {{practice}} has received your form for your visit on {{when}}. Nothing more is needed before you come in.',
    hi: 'धन्यवाद {{firstName}}। {{practice}} को {{when}} की मुलाक़ात के लिए आपका फ़ॉर्म मिल गया है। आने से पहले और कुछ करने की ज़रूरत नहीं है।',
    kn: 'ಧನ್ಯವಾದಗಳು {{firstName}}. {{when}} ರ ಭೇಟಿಗಾಗಿ ನಿಮ್ಮ ಫಾರ್ಮ್ {{practice}} ಗೆ ತಲುಪಿದೆ. ಬರುವ ಮೊದಲು ಬೇರೇನೂ ಮಾಡಬೇಕಿಲ್ಲ.' } },
  { id: 'tpl_forms_paper', trigger: 'Paper form still missing', name: 'Paper form follow-up', body: {
    en: 'Hi {{firstName}}, {{practice}} is still waiting for your paper form. Please bring it to your visit on {{when}}, or fill it online instead: {{formsLink}}',
    hi: 'नमस्ते {{firstName}}, {{practice}} को अभी आपका काग़ज़ी फ़ॉर्म नहीं मिला है। कृपया {{when}} की मुलाक़ात में साथ लाएँ, या ऑनलाइन भरें: {{formsLink}}',
    kn: 'ನಮಸ್ಕಾರ {{firstName}}, ನಿಮ್ಮ ಕಾಗದದ ಫಾರ್ಮ್ {{practice}} ಗೆ ಇನ್ನೂ ಬಂದಿಲ್ಲ. {{when}} ರ ಭೇಟಿಗೆ ತನ್ನಿ, ಅಥವಾ ಆನ್‌ಲೈನ್‌ನಲ್ಲಿ ಭರ್ತಿ ಮಾಡಿ: {{formsLink}}' } },
  { id: 'tpl_forms_expired', trigger: 'Secure link expired', name: 'Link expired', body: {
    en: 'Hi {{firstName}}, your earlier form link from {{practice}} has expired. Here is a new one for your visit on {{when}}: {{formsLink}}',
    hi: 'नमस्ते {{firstName}}, {{practice}} का आपका पुराना फ़ॉर्म लिंक समाप्त हो गया है। {{when}} की मुलाक़ात के लिए नया लिंक: {{formsLink}}',
    kn: 'ನಮಸ್ಕಾರ {{firstName}}, {{practice}} ನ ನಿಮ್ಮ ಹಳೆಯ ಫಾರ್ಮ್ ಲಿಂಕ್ ಅವಧಿ ಮುಗಿದಿದೆ. {{when}} ರ ಭೇಟಿಗಾಗಿ ಹೊಸ ಲಿಂಕ್: {{formsLink}}' } },
  { id: 'tpl_forms_clarify', trigger: 'Reception asks for missing information', name: 'More information needed', body: {
    en: 'Hi {{firstName}}, {{practice}} needs a little more information before your visit on {{when}}. {{note}} Please update your form here: {{formsLink}}',
    hi: 'नमस्ते {{firstName}}, {{when}} की मुलाक़ात से पहले {{practice}} को थोड़ी और जानकारी चाहिए। {{note}} कृपया अपना फ़ॉर्म यहाँ अपडेट करें: {{formsLink}}',
    kn: 'ನಮಸ್ಕಾರ {{firstName}}, {{when}} ರ ಭೇಟಿಗೆ ಮೊದಲು {{practice}} ಗೆ ಇನ್ನಷ್ಟು ಮಾಹಿತಿ ಬೇಕಾಗಿದೆ. {{note}} ನಿಮ್ಮ ಫಾರ್ಮ್ ಇಲ್ಲಿ ನವೀಕರಿಸಿ: {{formsLink}}' } },
];
export const TEMPLATE_VARS = ['firstName', 'practice', 'when', 'time', 'visitType', 'provider', 'location', 'phone', 'formsLink', 'note'];

/** The clinic's intake settings, with defaults filled in and the message templates present. */
export function intakeSettings(db) {
  const s = (db.settings.intake = { ...DEFAULTS, ...(db.settings.intake || {}) });
  db.settings.templates ||= [];
  for (const t of INTAKE_TEMPLATES) if (t.body && !db.settings.templates.some((x) => x.id === t.id)) db.settings.templates.push({ id: t.id, type: 'forms', name: t.name, body: { ...t.body } });
  return s;
}

export function saveIntakeSettings(db, input = {}) {
  const s = intakeSettings(db);
  const hhmm = (v, d) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || '')) ? String(v) : d);
  if (input.autoRemind !== undefined) s.autoRemind = !!input.autoRemind;
  if (input.confirmOnSubmit !== undefined) s.confirmOnSubmit = !!input.confirmOnSubmit;
  if (Array.isArray(input.remindHoursBefore)) s.remindHoursBefore = [...new Set(input.remindHoursBefore.map(Number).filter((h) => h >= 1 && h <= 168))].sort((a, b) => b - a).slice(0, 4);
  if (input.maxReminders !== undefined) s.maxReminders = Math.max(0, Math.min(6, Number(input.maxReminders) || 0));
  if (input.linkValidDaysAfter !== undefined) s.linkValidDaysAfter = Math.max(0, Math.min(30, Number(input.linkValidDaysAfter) || 0));
  s.quietStart = hhmm(input.quietStart, s.quietStart); s.quietEnd = hhmm(input.quietEnd, s.quietEnd);
  return s;
}

const stamp = (pk, by, action, detail = '') => { (pk.history ||= []).unshift({ at: nowIso(), by, action, detail }); if (pk.history.length > 120) pk.history.length = 120; };
export { stamp as audit };

const appointmentOf = (db, pk) => db.appointments.find((a) => a.id === pk.appointmentId) || null;
const messagesOf = (db, pk) => db.communications.filter((c) => c.appointmentId === pk.appointmentId && c.type === 'forms');

/** What the messaging provider told us about the last message. "unknown" when no provider can confirm anything. */
function deliveryOf(c) {
  if (!c) return null;
  return { failed: 'failed', delivered: 'delivered', sent: 'sent', queued: 'queued' }[c.delivery] || 'unknown';
}

/** Everything the screens need to know about where a packet stands. */
export function lifecycle(db, pk, a = appointmentOf(db, pk)) {
  const s = intakeSettings(db);
  const custom = formsFor(db, a);
  const doneSections = FORM_SECTIONS.filter((x) => pk.sections[x.key]?.complete).length;
  const doneCustom = custom.filter((f) => pk.custom?.[f.id]?.complete).length;
  const total = FORM_SECTIONS.length + custom.length; const done = doneSections + doneCustom;
  const submittedAt = pk.submittedAt || (done === total ? pk.updatedAt : null);
  const expiresAt = pk.expiresAt || (a ? addDays(a.end || a.start, s.linkValidDaysAfter) : null);
  const expired = !submittedAt && !!expiresAt && nowIso() > expiresAt;
  const msgs = messagesOf(db, pk); const last = msgs[0] || null; const delivery = deliveryOf(last) || (pk.sentAt ? 'unknown' : null);
  const patient = db.patients.find((p) => p.id === pk.patientId);
  const channel = pk.channel || last?.channel || patient?.preferredChannel || db.settings.locale?.defaultChannel || 'sms';
  let status;
  if (pk.cancelledAt) status = 'cancelled';
  else if (submittedAt && pk.review?.dentist) status = 'reviewed';
  else if (submittedAt && pk.review?.admin) status = 'under_review';
  else if (submittedAt) status = 'submitted';
  else if (pk.paper?.receivedAt) status = 'paper_received';
  else if (expired) status = 'expired';
  else if (done > 0 || pk.firstSavedAt) status = 'in_progress';
  else if (pk.openedAt) status = 'opened';
  else if (pk.sentAt && delivery === 'failed') status = 'failed';
  else if (pk.sentAt) status = delivery === 'delivered' ? 'delivered' : delivery === 'queued' ? 'queued' : 'sent';
  else if (pk.scheduledFor) status = 'scheduled';
  else status = 'draft';
  const openClarifications = (pk.clarifications || []).filter((c) => c.status === 'open' || c.status === 'sent').length;
  const soon = a && a.start < addMinutes(nowIso(), 240);
  const attention = !pk.cancelledAt && (status === 'failed' || status === 'expired' || status === 'paper_received' || openClarifications > 0 || (PENDING.has(status) && soon));
  const lastBy = FORM_SECTIONS.map((x) => pk.sections[x.key]).filter((x) => x?.complete).sort((x, y) => (y.updatedAt || '').localeCompare(x.updatedAt || ''))[0]?.by;
  const source = pk.source || (pk.paper?.receivedAt ? 'paper' : !done ? null : lastBy === 'kiosk' ? 'tablet' : !lastBy || lastBy === 'patient' ? 'digital' : 'staff');
  return {
    status, label: STATUS_LABEL[status], group: pk.cancelledAt ? 'cancelled' : SUBMITTED.has(status) ? 'submitted' : attention ? 'attention' : 'pending', attention,
    channel, source, delivery, percent: total ? Math.round((done / total) * 100) : 0, done, total, expired, expiresAt,
    assignedAt: pk.assignedAt || pk.sentAt || pk.updatedAt, scheduledFor: pk.scheduledFor || null, sentAt: pk.sentAt || null, lastMessageAt: last?.sentAt || null,
    deliveredAt: last?.deliveredAt || null, openedAt: pk.openedAt || null, firstSavedAt: pk.firstSavedAt || null, submittedAt, cancelledAt: pk.cancelledAt || null,
    messages: msgs.length, reminders: pk.remindersSent || 0, paper: pk.paper || null, attachments: (pk.attachments || []).length,
    review: { admin: pk.review?.admin || null, dentist: pk.review?.dentist || null }, openClarifications,
  };
}

const formsLink = (frontendBase, pk) => `${frontendBase}#/forms/${pk.token}`;

/**
 * Sends the invitation, a reminder or a follow-up on the packet's channel. Print and tablet send nothing.
 * Messages go to the outbox; WhatsApp, SMS and email leave the building only when a provider is configured.
 */
export function sendForm(db, pk, { frontendBase = '', channel, kind = 'auto', by = 'Clinovara', note = '' } = {}) {
  intakeSettings(db);
  const a = appointmentOf(db, pk); if (!a) bad('This form has no appointment');
  if (pk.cancelledAt) bad('This form assignment was cancelled. Assign the form again to send it.');
  const patient = db.patients.find((p) => p.id === pk.patientId); if (!patient) bad('Patient not found');
  if (channel) { if (!CHANNELS.some((c) => c.id === channel)) bad('Unknown delivery channel'); pk.channel = channel; }
  const life = lifecycle(db, pk, a); const ch = life.channel;
  if (!MESSAGE_CHANNELS.has(ch)) { pk.updatedAt = nowIso(); stamp(pk, by, 'in_clinic', ch === 'print' ? 'Set to be printed and completed at the clinic' : 'Set to be completed on the clinic tablet'); return null; }
  if (ch === 'email' && !patient.email) bad(`${fullName(patient)} has no email address on file. Add one or choose another channel.`);
  if (ch !== 'email' && !patient.phone) bad(`${fullName(patient)} has no mobile number on file. Add one or choose another channel.`);
  if (life.expired) { pk.token = crypto.randomBytes(24).toString('base64url'); pk.expiresAt = addDays(nowIso(), 3); if (kind === 'auto') kind = 'expired'; }
  if (kind === 'auto') kind = !pk.sentAt ? 'invite' : life.status === 'in_progress' ? 'incomplete' : 'reminder';
  const tpl = { invite: 'tpl_forms', reminder: 'tpl_forms_reminder', incomplete: 'tpl_forms_incomplete', paper: 'tpl_forms_paper', expired: 'tpl_forms_expired', clarify: 'tpl_forms_clarify', received: 'tpl_forms_received' }[kind] || 'tpl_forms';
  const body = renderTemplate(db, tpl, { patient, visitType: db.settings.visitTypes.find((v) => v.id === a.visitTypeId), provider: db.settings.providers.find((p) => p.id === a.providerId), start: a.start, formsLink: formsLink(frontendBase, pk), location: location(db, a.locationId), note: note ? `${String(note).trim().replace(/[.!?]*$/, '.')}` : '' }).replace(/\s{2,}/g, ' ');
  const c = sendCommunication(db, { patientId: patient.id, type: 'forms', body, channel: ch, appointmentId: a.id, by, meta: { kind, packetId: pk.id } });
  if (ch === 'email' && mailConfigured()) {
    c.delivery = 'queued';
    sendEmail({ to: patient.email, subject: `${db.settings.practice.name}: ${kind === 'received' ? 'we received your form' : 'please complete your form'}`, text: body })
      .then(() => { c.delivery = 'sent'; }).catch((e) => { c.delivery = 'failed'; c.deliveryError = e.message; });
  }
  if (kind !== 'received') { if (pk.sentAt) pk.remindersSent = (pk.remindersSent || 0) + 1; else pk.sentAt = c.sentAt; }
  pk.scheduledFor = null; pk.updatedAt = nowIso();
  stamp(pk, by, kind === 'invite' ? 'sent' : kind, `${CHANNELS.find((x) => x.id === ch).label} to ${ch === 'email' ? patient.email : patient.phone}`);
  return c;
}

/** Assigns a form to an appointment: choose the channel, then send now or at a set time. */
export function assign(db, packet, { channel, when = 'now', scheduleAt, by = 'Front desk', frontendBase = '' } = {}) {
  if (!CHANNELS.some((c) => c.id === channel)) bad('Choose how the form should reach the patient');
  const a = appointmentOf(db, packet);
  if (packet.cancelledAt) { packet.cancelledAt = null; packet.cancelledBy = null; stamp(packet, by, 'reassigned'); }
  packet.channel = channel; packet.assignedAt ||= nowIso(); packet.assignedBy = by;
  if (when === 'schedule' && MESSAGE_CHANNELS.has(channel)) {
    const at = new Date(scheduleAt || '');
    if (Number.isNaN(at.getTime()) || at.toISOString() <= nowIso()) bad('Choose a send time in the future');
    if (a && at.toISOString() >= a.start) bad('The send time must be before the appointment');
    packet.scheduledFor = at.toISOString(); packet.updatedAt = nowIso();
    stamp(packet, by, 'scheduled', `${CHANNELS.find((x) => x.id === channel).label}, to send ${at.toISOString()}`);
    return null;
  }
  return sendForm(db, packet, { frontendBase, by, kind: packet.sentAt ? 'auto' : 'invite' });
}

/** The patient opened the link. */
export function markOpened(pk) { if (!pk.openedAt) { pk.openedAt = nowIso(); stamp(pk, 'Patient', 'opened', 'Opened the secure link'); return true; } return false; }

/** Call after any answers are saved. Records the first save and, when nothing is left, the submission. */
export function afterSave(db, pk, { by = 'patient', frontendBase = '' } = {}) {
  const a = appointmentOf(db, pk);
  pk.firstSavedAt ||= nowIso();
  for (const c of pk.clarifications || []) if (c.status === 'sent' && by === 'patient') { c.status = 'answered'; c.answeredAt = nowIso(); }
  const custom = formsFor(db, a);
  const all = FORM_SECTIONS.every((x) => pk.sections[x.key]?.complete) && custom.every((f) => pk.custom?.[f.id]?.complete);
  if (!all || pk.submittedAt) return false;
  pk.submittedAt = nowIso();
  pk.source = by === 'patient' ? 'digital' : by === 'kiosk' ? 'tablet' : pk.paper?.receivedAt ? 'paper' : 'staff';
  stamp(pk, by === 'patient' ? 'Patient' : by, 'submitted', { digital: 'Submitted online', tablet: 'Completed on the clinic tablet', paper: 'Paper answers entered by staff', staff: 'Answers entered by staff' }[pk.source]);
  log(db, 'forms', `${fullName(db.patients.find((p) => p.id === pk.patientId))}: intake form submitted (${pk.source})`, { appointmentId: pk.appointmentId });
  emit(db, 'forms.submitted', { packetId: pk.id, patientId: pk.patientId, appointmentId: pk.appointmentId, source: pk.source });
  const life = lifecycle(db, pk, a);
  if (by === 'patient' && intakeSettings(db).confirmOnSubmit && MESSAGE_CHANNELS.has(life.channel) && a && ACTIVE.has(a.status)) {
    try { sendForm(db, pk, { frontendBase, kind: 'received' }); } catch { /* the confirmation is a courtesy; a missing number must not undo the submission */ }
  }
  return true;
}

export function cancel(db, pk, by) {
  if (lifecycle(db, pk).submittedAt) bad('This form is already submitted. It cannot be cancelled.');
  pk.cancelledAt = nowIso(); pk.cancelledBy = by; pk.scheduledFor = null; pk.updatedAt = nowIso();
  stamp(pk, by, 'cancelled', 'Assignment cancelled. No more reminders will go out and the link stops working.');
}

/** Paper: the clinic printed it, got it back, and either keys in the answers or keeps the signed scan as the record. */
export function paper(db, pk, { printed, received, submitted, note = '' } = {}, by) {
  pk.paper ||= {};
  if (printed) { pk.paper.printedAt = nowIso(); pk.paper.printedBy = by; pk.channel = 'print'; stamp(pk, by, 'printed', 'Paper form printed'); }
  if (received) { pk.paper.receivedAt ||= nowIso(); pk.paper.receivedBy = by; if (note) pk.paper.note = String(note).slice(0, 300); stamp(pk, by, 'paper_received', 'Original paper form received at the clinic'); }
  if (submitted) {
    if (!pk.paper.receivedAt) bad('Record that the paper form was received first');
    if (!(pk.attachments || []).some((x) => x.kind === 'paper_scan')) bad('Attach a scan or photo of the signed paper form first');
    pk.submittedAt ||= nowIso(); pk.source = 'paper';
    stamp(pk, by, 'submitted', 'Signed paper form kept as the record. Answers were not typed in.');
  }
  pk.updatedAt = nowIso();
}

const MIME = /^data:(image\/(?:png|jpeg|webp)|application\/pdf);base64,[A-Za-z0-9+/=]+$/;
export function addAttachment(db, pk, { name, dataUrl, kind = 'document' } = {}, by) {
  const m = String(dataUrl || '').match(MIME);
  if (!m) bad('Attach a photo (PNG, JPG, WebP) or a PDF');
  if (dataUrl.length > 2_800_000) bad('That file is too large. Keep each file under 2 MB.');
  if ((pk.attachments || []).length >= 8) bad('This form already has 8 files attached');
  const att = { id: id('att'), name: String(name || 'Attachment').replace(/[^\w .()-]/g, '').slice(0, 80) || 'Attachment', mime: m[1], size: Math.round(dataUrl.length * 0.75), kind: ['paper_scan', 'document'].includes(kind) ? kind : 'document', by, at: nowIso(), dataUrl };
  (pk.attachments ||= []).push(att); pk.updatedAt = nowIso();
  stamp(pk, by, 'attachment', `${att.kind === 'paper_scan' ? 'Scan of paper form' : 'Document'} attached: ${att.name}`);
  return att;
}
export const attachmentMeta = (x) => ({ id: x.id, name: x.name, mime: x.mime, size: x.size, kind: x.kind, by: x.by, at: x.at });

/**
 * Reviews. Reception records an administrative check (details present, contact confirmed). Only a dentist
 * records that the patient-reported answers were reviewed. Neither is a clinical verification of the answers.
 */
export function review(db, pk, { kind, note = '', by, role, isDentist }) {
  const life = lifecycle(db, pk);
  if (!life.submittedAt) bad('This form has not been submitted yet');
  pk.review ||= {};
  if (kind === 'admin') {
    if (!['owner', 'admin', 'front_desk'].includes(role)) throw new HttpError(403, 'The administrative check is recorded by reception');
    pk.review.admin = { by, at: nowIso(), note: String(note).slice(0, 400) };
    stamp(pk, by, 'admin_check', 'Administrative check complete');
  } else if (kind === 'dentist') {
    if (!isDentist) throw new HttpError(403, 'Only a dentist can record that the patient-reported answers were reviewed');
    pk.review.dentist = { by, at: nowIso(), note: String(note).slice(0, 400) };
    stamp(pk, by, 'dentist_review', 'Dentist recorded that the submission was reviewed');
  } else bad('Unknown review type');
  pk.updatedAt = nowIso();
  emit(db, 'forms.reviewed', { packetId: pk.id, kind, by });
}

/** A request for missing information. A dentist's request goes to reception; reception sends the patient a link. */
export function clarify(db, pk, { note, send, by, fromDentist, frontendBase }) {
  const text = String(note || '').trim().slice(0, 300);
  if (text.length < 3) bad('Say what information is missing');
  const c = { id: id('clr'), note: text, by, fromDentist: !!fromDentist, at: nowIso(), status: 'open' };
  (pk.clarifications ||= []).unshift(c);
  stamp(pk, by, 'clarification', `${fromDentist ? 'Dentist asked reception' : 'Reception noted'}: ${text}`);
  if (send) sendClarification(db, pk, c.id, { by, frontendBase });
  pk.updatedAt = nowIso();
  return c;
}
export function sendClarification(db, pk, cid, { by, frontendBase }) {
  const c = (pk.clarifications || []).find((x) => x.id === cid); if (!c) bad('That request no longer exists');
  sendForm(db, pk, { frontendBase, kind: 'clarify', note: c.note, by });
  c.status = 'sent'; c.sentAt = nowIso(); c.sentBy = by;
}
export function resolveClarification(pk, cid, by) {
  const c = (pk.clarifications || []).find((x) => x.id === cid); if (!c) bad('That request no longer exists');
  c.status = 'resolved'; c.resolvedAt = nowIso(); c.resolvedBy = by; stamp(pk, by, 'clarification_resolved', c.note);
}

/** Contact details the patient typed that differ from the clinic's record. Reception decides whether to apply them. */
export function contactChanges(db, pk) {
  const p = db.patients.find((x) => x.id === pk.patientId); const d = pk.personal?.data; if (!p || !d) return [];
  const norm = (k, v) => (k === 'phone' ? String(v || '').replace(/\D/g, '').slice(-10) : String(v || '').trim().toLowerCase());
  return ['firstName', 'lastName', 'dob', 'phone', 'email'].filter((k) => d[k] && norm(k, d[k]) !== norm(k, p[k])).map((k) => ({ field: k, onRecord: p[k] || '', reported: d[k] }));
}
export function applyContact(db, pk, by) {
  const p = db.patients.find((x) => x.id === pk.patientId); const changes = contactChanges(db, pk);
  for (const c of changes) p[c.field] = c.reported;
  if (changes.length) stamp(pk, by, 'contact_updated', `Patient record updated from the form: ${changes.map((c) => c.field).join(', ')}`);
  return changes.length;
}

/** The patient's own details and preferences, typed on the link. Language and reminder choices apply at once. */
export function saveProfile(db, pk, section, data = {}) {
  const p = db.patients.find((x) => x.id === pk.patientId);
  const str = (v, n = 80) => String(v ?? '').trim().slice(0, n);
  if (section === 'personal') {
    const d = { firstName: str(data.firstName, 40), lastName: str(data.lastName, 40), dob: /^\d{4}-\d{2}-\d{2}$/.test(str(data.dob)) ? str(data.dob) : '', phone: str(data.phone, 20), email: str(data.email, 120), preferredLanguage: str(data.preferredLanguage, 8) };
    if (!d.firstName) bad('Please enter your full name');
    if (!d.dob) bad('Please enter your date of birth');
    if (d.phone.replace(/\D/g, '').length < 10) bad('Please enter a mobile number with at least 10 digits');
    if (d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) bad('That email address does not look right');
    pk.personal = { complete: true, data: d, at: nowIso() };
    if (p && d.preferredLanguage) p.preferredLanguage = d.preferredLanguage;
  } else if (section === 'preferences') {
    const channel = ['whatsapp', 'sms', 'email', 'call'].includes(data.channel) ? data.channel : '';
    pk.preferences = { complete: true, data: { channel, reminders: data.reminders !== false, bestTime: str(data.bestTime, 40) }, at: nowIso() };
    if (p) { p.formRemindersOff = data.reminders === false; if (channel && channel !== 'call') p.preferredChannel = channel; }
  } else bad('Unknown section');
  pk.firstSavedAt ||= nowIso(); pk.updatedAt = nowIso();
  return pk[section];
}

// ── reminders ───────────────────────────────────────────────────────────────

const minutesOfDay = (iso) => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes(); };
const hm = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + m; };
export function inQuietHours(s, iso = nowIso()) {
  const a = hm(s.quietStart); const b = hm(s.quietEnd); const t = minutesOfDay(iso);
  return a === b ? false : a < b ? t >= a && t < b : t >= a || t < b;
}

/**
 * Runs every minute. Sends scheduled invitations that have come due and reminders for forms that are still
 * not submitted. Never reminds after a submission, a cancellation, an opt-out, during quiet hours, or twice
 * for the same window. Returns how many messages went out.
 */
export function runIntakeAutomation(db, { frontendBase = '', now = nowIso() } = {}) {
  const s = intakeSettings(db); let sent = 0; let touched = 0;
  const quiet = inQuietHours(s, now);
  for (const pk of db.formPackets) {
    if (pk.cancelledAt) continue;
    const a = appointmentOf(db, pk); if (!a || !ACTIVE.has(a.status) || a.start <= now) continue;
    const life = lifecycle(db, pk, a); if (life.submittedAt || life.paper?.receivedAt) continue;
    if (!MESSAGE_CHANNELS.has(life.channel)) continue;
    const patient = db.patients.find((p) => p.id === pk.patientId);
    if (pk.scheduledFor && pk.scheduledFor <= now && !quiet) {
      try { sendForm(db, pk, { frontendBase, kind: 'invite' }); sent += 1; } catch (e) { pk.scheduledFor = null; stamp(pk, 'Clinovara', 'failed', `Scheduled send did not go out: ${e.message}`); touched += 1; }
      continue;
    }
    if (!s.autoRemind || !pk.sentAt || patient?.formRemindersOff || (pk.remindersSent || 0) >= s.maxReminders) continue;
    const due = s.remindHoursBefore.filter((h) => now >= addMinutes(a.start, -h * 60) && !(pk.reminderLog || []).includes(`${h}:${a.start}`));
    if (!due.length || quiet) continue;
    for (const h of due) (pk.reminderLog ||= []).push(`${h}:${a.start}`);   // one message covers every window that has passed
    touched += 1;
    if (addMinutes(life.lastMessageAt || pk.sentAt, 60) > now) continue;      // the invitation only just went out
    try { sendForm(db, pk, { frontendBase, kind: 'auto' }); sent += 1; } catch (e) { stamp(pk, 'Clinovara', 'failed', `Reminder did not go out: ${e.message}`); }
  }
  return sent + touched;
}

// ── owner report ────────────────────────────────────────────────────────────

const pct = (n, d) => (d ? Math.round((n / d) * 100) : null);
export function report(db, { from, to, providerId, channel, locationId, formId } = {}) {
  const rows = [];
  for (const pk of db.formPackets) {
    const a = appointmentOf(db, pk); if (!a) continue;
    const day = a.start.slice(0, 10);
    if ((from && day < from) || (to && day > to) || (providerId && a.providerId !== providerId) || (locationId && a.locationId !== locationId)) continue;
    if (formId && !formsFor(db, a).some((f) => f.id === formId)) continue;
    const life = lifecycle(db, pk, a);
    if (channel && life.channel !== channel) continue;
    rows.push({ pk, a, life });
  }
  const live = rows.filter((r) => r.life.status !== 'cancelled');
  const messaged = live.filter((r) => r.life.sentAt);
  const submitted = live.filter((r) => r.life.submittedAt);
  const times = submitted.map((r) => (new Date(r.life.submittedAt) - new Date(r.life.firstSavedAt || r.life.openedAt || r.life.submittedAt)) / 60000).filter((m) => m > 0 && m < 24 * 60);
  const reminded = live.filter((r) => r.life.reminders > 0);
  const by = (list, key) => Object.entries(list.reduce((m, r) => { const k = key(r) || 'unknown'; (m[k] ||= []).push(r); return m; }, {}));
  return {
    assigned: live.length, cancelled: rows.length - live.length, messaged: messaged.length,
    deliveryConfirmed: messaged.filter((r) => r.life.delivery === 'delivered').length,
    deliveryUnknown: messaged.filter((r) => r.life.delivery === 'unknown' || r.life.delivery === 'sent').length,
    failed: messaged.filter((r) => r.life.delivery === 'failed').length,
    opened: live.filter((r) => r.life.openedAt).length, openRate: pct(messaged.filter((r) => r.life.openedAt).length, messaged.length),
    submitted: submitted.length, completionRate: pct(submitted.length, live.length),
    avgMinutesToComplete: times.length ? Math.round(times.reduce((x, y) => x + y, 0) / times.length) : null,
    beforeAppointment: submitted.filter((r) => r.life.submittedAt < r.a.start).length, beforeAppointmentRate: pct(submitted.filter((r) => r.life.submittedAt < r.a.start).length, live.length),
    pending: live.filter((r) => !r.life.submittedAt).length,
    awaitingReview: submitted.filter((r) => !r.life.review.dentist).length, awaitingAdminCheck: submitted.filter((r) => !r.life.review.admin).length,
    reminded: reminded.length, submittedAfterReminder: reminded.filter((r) => r.life.submittedAt).length, reminderEffect: pct(reminded.filter((r) => r.life.submittedAt).length, reminded.length),
    bySource: by(submitted, (r) => r.life.source).map(([k, v]) => ({ source: k, count: v.length })),
    byChannel: by(live, (r) => r.life.channel).map(([k, v]) => ({ channel: k, label: CHANNELS.find((c) => c.id === k)?.label || k, assigned: v.length, submitted: v.filter((r) => r.life.submittedAt).length, failed: v.filter((r) => r.life.delivery === 'failed').length, completionRate: pct(v.filter((r) => r.life.submittedAt).length, v.length) })),
    pendingByBranch: by(live.filter((r) => !r.life.submittedAt), (r) => r.a.locationId).map(([k, v]) => ({ locationId: k, name: location(db, k)?.name || 'Clinic', pending: v.length })),
    byProvider: by(live, (r) => r.a.providerId).map(([k, v]) => ({ providerId: k, name: db.settings.providers.find((p) => p.id === k)?.name || 'Unassigned', assigned: v.length, submitted: v.filter((r) => r.life.submittedAt).length, awaitingReview: v.filter((r) => r.life.submittedAt && !r.life.review.dentist).length })),
  };
}
