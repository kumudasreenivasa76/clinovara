import crypto from 'node:crypto';
import { id, nowIso, dayKey, log, fullName, find, bad } from '../lib.js';
import { renderTemplate, sendCommunication } from './messaging.js';
import { ACTIVE, location } from './scheduling.js';
import { emit } from './webhooks.js';
import { assignReceiptNo } from './billing.js';
import { queueVisitFollowups } from './marketing.js';

export const FORM_SECTIONS = [
  { key: 'medicalHistory', label: 'Medical history' },
  { key: 'dentalConcerns', label: 'Dental concerns' },
  { key: 'medications', label: 'Medications' },
  { key: 'allergies', label: 'Allergies' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'consent', label: 'Consent' },
];

export function emptyPacket(patientId, appointmentId) {
  const sections = {};
  for (const s of FORM_SECTIONS) sections[s.key] = { complete: false, updatedAt: null, data: {} };
  // The link token is the only thing protecting a patient's answers, so it is long and random, never derived from time.
  return { id: id('pkt'), patientId, appointmentId, token: crypto.randomBytes(24).toString('base64url'), assignedAt: nowIso(), sentAt: null, status: 'created', updatedAt: nowIso(), remindersSent: 0, sections };
}

export function packetStatus(pk) {
  const done = FORM_SECTIONS.filter((s) => pk.sections[s.key]?.complete).length;
  if (done === FORM_SECTIONS.length) return 'complete';
  if (done > 0) return 'partial';
  return pk.sentAt ? 'sent' : 'created';
}

export function packetFor(db, appointmentId, { create = false } = {}) {
  let pk = db.formPackets.find((p) => p.appointmentId === appointmentId);
  if (!pk && create) {
    const a = find(db.appointments, appointmentId, 'Appointment');
    pk = emptyPacket(a.patientId, a.id);
    const prev = db.formPackets.filter((p) => p.patientId === a.patientId && p.id !== pk.id).sort((x, y) => (y.updatedAt || '').localeCompare(x.updatedAt || ''))[0];
    if (prev) for (const k of ['medicalHistory', 'medications', 'allergies', 'insurance']) if (prev.sections[k]?.complete) pk.sections[k] = { complete: false, updatedAt: null, data: { ...prev.sections[k].data }, prefilled: true };
    db.formPackets.push(pk);
  }
  return pk;
}

export function sendPacket(db, pk, { frontendBase = '' } = {}) {
  const a = find(db.appointments, pk.appointmentId, 'Appointment');
  const patient = find(db.patients, pk.patientId, 'Patient');
  const vt = db.settings.visitTypes.find((v) => v.id === a.visitTypeId);
  const formsLink = `${frontendBase}#/forms/${pk.token}`;
  const body = renderTemplate(db, 'tpl_forms', { patient, visitType: vt, start: a.start, formsLink, location: location(db, a.locationId) });
  const c = sendCommunication(db, { patientId: patient.id, type: 'forms', body, appointmentId: a.id });
  if (pk.sentAt) pk.remindersSent = (pk.remindersSent || 0) + 1; else pk.sentAt = c.sentAt;
  pk.status = packetStatus(pk); pk.updatedAt = nowIso();
  return c;
}

export function updateSection(db, pk, sectionKey, data, { by = 'patient' } = {}) {
  if (!FORM_SECTIONS.some((s) => s.key === sectionKey)) bad('Unknown form section');
  const sec = pk.sections[sectionKey] || (pk.sections[sectionKey] = { complete: false, updatedAt: null, data: {} });
  sec.data = { ...sec.data, ...data }; sec.complete = true; sec.prefilled = false; sec.updatedAt = nowIso(); sec.by = by;
  const wasComplete = pk.status === 'complete';
  pk.status = packetStatus(pk); pk.updatedAt = nowIso();
  const patient = db.patients.find((p) => p.id === pk.patientId);
  if (sectionKey === 'insurance' && patient) {
    patient.insurance = { ...patient.insurance, type: data.type ?? patient.insurance.type, carrier: data.carrier ?? patient.insurance.carrier, memberId: data.memberId ?? patient.insurance.memberId, groupNumber: data.groupNumber ?? patient.insurance.groupNumber, tpa: data.tpa ?? patient.insurance.tpa, verified: false };
    if (data.abhaNumber) patient.abhaNumber = data.abhaNumber;
    if (data.abhaAddress) patient.abhaAddress = data.abhaAddress;
  }
  if (sectionKey === 'consent') {
    if (patient && data.marketingOptIn !== undefined) { patient.marketingOptIn = !!data.marketingOptIn; patient.marketingOptChangedAt = nowIso(); }
    const v = db.visits.find((x) => x.appointmentId === pk.appointmentId);
    if (v) v.consentSignedAt = sec.updatedAt;
    emit(db, 'consent.signed', { patientId: pk.patientId, appointmentId: pk.appointmentId, signedAt: sec.updatedAt, by });
  }
  if (!wasComplete && pk.status === 'complete') emit(db, 'forms.completed', { packetId: pk.id, patientId: pk.patientId, appointmentId: pk.appointmentId });
  syncVisitMissing(db, pk.appointmentId);
  return pk;
}

export function missingFor(db, appointment) {
  const pk = db.formPackets.find((p) => p.appointmentId === appointment.id);
  const patient = db.patients.find((p) => p.id === appointment.patientId);
  const missing = [];
  for (const s of FORM_SECTIONS) {
    if (s.key === 'insurance') continue;
    if (!pk || !pk.sections[s.key]?.complete) missing.push(s.label);
  }
  const ins = patient?.insurance || {};
  const insuranceKnown = ins.type === 'self' && pk?.sections.insurance?.complete || (ins.carrier && (ins.verified || ins.cardScannedAt)) || pk?.sections.insurance?.complete;
  if (!insuranceKnown) missing.push('Insurance');
  return missing;
}

export function syncVisitMissing(db, appointmentId) {
  const v = db.visits.find((x) => x.appointmentId === appointmentId);
  if (!v) return null;
  const a = db.appointments.find((x) => x.id === appointmentId);
  v.missing = missingFor(db, a);
  if (['checking_in', 'needs_attention', 'ready'].includes(v.status) && !v.helpRequested) {
    const before = v.status;
    v.status = v.missing.length ? 'needs_attention' : 'ready';
    if (v.status === 'ready' && !v.readyAt) v.readyAt = nowIso();
    if (before !== 'ready' && v.status === 'ready') emit(db, 'visit.ready', { visit: v });
  }
  return v;
}

/** OPD token: per branch per day, letter prefix from the branch order (A, B, …) + running number. */
export function nextToken(db, locationId) {
  const today = dayKey(nowIso());
  const locs = db.settings.locations || [];
  const idx = Math.max(0, locs.findIndex((l) => l.id === locationId));
  const prefix = db.settings.rules.tokensPerLocation === false ? 'T' : String.fromCharCode(65 + (idx % 26));
  const todays = db.visits.filter((v) => dayKey(v.arrivedAt) === today && (db.settings.rules.tokensPerLocation === false || v.locationId === locationId) && v.token);
  const n = todays.reduce((m, v) => Math.max(m, Number(String(v.token).replace(/\D/g, '')) || 0), 0) + 1;
  return `${prefix}${String(n).padStart(2, '0')}`;
}

export function arrive(db, appointmentId, { source = 'desk', by = 'Front desk' }) {
  const a = find(db.appointments, appointmentId, 'Appointment');
  if (!ACTIVE.has(a.status)) bad('Appointment is not active');
  let v = db.visits.find((x) => x.appointmentId === a.id);
  if (v) return v;
  const patient = find(db.patients, a.patientId, 'Patient');
  const token = nextToken(db, a.locationId);
  v = { id: id('vis'), appointmentId: a.id, patientId: a.patientId, locationId: a.locationId, token, arrivedAt: nowIso(), checkInSource: source, status: 'arrived', missing: missingFor(db, a), helpRequested: false, helpNote: null, insuranceScannedAt: patient.insurance?.cardScannedAt || null, consentSignedAt: null, readyAt: null, calledAt: null, broughtBackAt: null, doneAt: null };
  db.visits.push(v);
  a.status = 'arrived'; a.arrivedAt = v.arrivedAt;
  log(db, source === 'kiosk' ? 'kiosk' : 'arrival', `${fullName(patient)} arrived at ${location(db, a.locationId)?.name || 'clinic'} (${source === 'kiosk' ? 'kiosk' : by}) — token ${token}`, { patientId: patient.id, appointmentId: a.id });
  const tpl = db.settings.templates.find((t) => t.id === 'tpl_token');
  if (tpl) sendCommunication(db, { patientId: patient.id, type: 'token', body: renderTemplate(db, 'tpl_token', { patient, token, location: location(db, a.locationId) }), appointmentId: a.id });
  emit(db, 'patient.arrived', { visit: v, appointmentId: a.id, patientId: a.patientId, token });
  return v;
}

export function setVisitStatus(db, visitId, status, { by = 'Front desk' } = {}) {
  const v = find(db.visits, visitId, 'Visit');
  const a = find(db.appointments, v.appointmentId, 'Appointment');
  const patient = find(db.patients, v.patientId, 'Patient');
  const allowed = ['arrived', 'checking_in', 'needs_attention', 'ready', 'called', 'brought_back', 'done'];
  if (!allowed.includes(status)) bad('Unknown visit status');
  const now = nowIso();
  if (status === 'called') { v.calledAt = now; v.readyAt ||= now; v.status = 'called'; v.helpRequested = false; }
  else v.status = status;
  if (status === 'ready') { v.readyAt ||= now; v.helpRequested = false; }
  if (status === 'brought_back') { v.readyAt ||= now; v.calledAt ||= now; v.broughtBackAt ||= now; a.status = 'in_chair'; v.helpRequested = false; }
  if (status === 'done') {
    v.doneAt ||= now; a.status = 'completed'; a.completedAt = now;
    patient.lastVisit = dayKey(now);
    if (['vt_cleaning', 'vt_newpatient'].includes(a.visitTypeId)) {
      const d = new Date(now); d.setMonth(d.getMonth() + (db.settings.rules.recallIntervalMonths || 6)); patient.nextRecallDue = dayKey(d.toISOString());
    }
    emit(db, 'visit.completed', { visit: v, appointment: a });
    queueVisitFollowups(db, a);
  }
  log(db, 'arrival', `${by} marked ${fullName(patient)}${v.token ? ` (${v.token})` : ''} as ${status.replace('_', ' ')}`, { patientId: patient.id, appointmentId: a.id });
  return v;
}

export function recordPayment(db, appointmentId, { amount, mode, by = 'Front desk', reference = '' }) {
  const a = find(db.appointments, appointmentId, 'Appointment');
  if (!mode) bad('Payment mode is required');
  a.paymentStatus = mode === 'Insurance / cashless' ? 'insurance' : 'paid';
  a.paymentMode = mode; a.paidAmount = amount ?? a.fee; a.paidAt = nowIso(); a.paymentReference = reference; a.paymentBy = by;
  assignReceiptNo(db, a);
  log(db, 'payment', `${by} recorded ${db.settings.locale?.currencySymbol || '₹'}${a.paidAmount} via ${mode} for ${fullName(find(db.patients, a.patientId, 'Patient'))}`, { appointmentId: a.id });
  emit(db, 'payment.recorded', { appointmentId: a.id, receiptNo: a.receiptNo, patientId: a.patientId, amount: a.paidAmount, mode, reference });
  return a;
}

export function arrivalsBoard(db, date = dayKey(nowIso()), locationId = null) {
  const appts = db.appointments.filter((a) => dayKey(a.start) === date && a.status !== 'cancelled' && (!locationId || a.locationId === locationId)).sort((x, y) => x.start.localeCompare(y.start));
  return appts.map((a) => {
    const patient = db.patients.find((p) => p.id === a.patientId);
    const visit = db.visits.find((v) => v.appointmentId === a.id) || null;
    const packet = db.formPackets.find((p) => p.appointmentId === a.id) || null;
    const missing = missingFor(db, a);
    return {
      appointment: a, patient, visit, packet: packet ? { id: packet.id, status: packetStatus(packet), token: packet.token, sentAt: packet.sentAt } : null,
      visitType: db.settings.visitTypes.find((v) => v.id === a.visitTypeId), provider: db.settings.providers.find((p) => p.id === a.providerId), location: location(db, a.locationId),
      missing, insurance: patient?.insurance || null,
      stage: !visit ? (a.status === 'completed' ? 'done' : a.status === 'no_show' ? 'no_show' : 'expected') : visit.status,
    };
  });
}

/** Waiting-room display: per provider, who is being called / in chair and who is next. */
export function queueBoard(db, locationId = null, date = dayKey(nowIso())) {
  const rows = arrivalsBoard(db, date, locationId).filter((r) => r.visit);
  const provs = db.settings.providers.filter((p) => !locationId || !p.locationIds?.length || p.locationIds.includes(locationId));
  return provs.map((p) => {
    const mine = rows.filter((r) => r.appointment.providerId === p.id);
    const nowServing = mine.filter((r) => ['called', 'brought_back'].includes(r.visit.status)).sort((x, y) => (y.visit.calledAt || '').localeCompare(x.visit.calledAt || ''))[0] || null;
    const waiting = mine.filter((r) => ['arrived', 'checking_in', 'needs_attention', 'ready'].includes(r.visit.status)).sort((x, y) => x.visit.arrivedAt.localeCompare(y.visit.arrivedAt));
    return { provider: { id: p.id, name: p.name, specialty: p.specialty || p.role }, nowServing: nowServing ? { token: nowServing.visit.token, status: nowServing.visit.status, firstName: nowServing.patient?.firstName } : null, waiting: waiting.map((r) => ({ token: r.visit.token, status: r.visit.status })), done: mine.filter((r) => r.visit.status === 'done').length };
  });
}
