/**
 * FHIR R4 facade for EHR / HMIS integration (and ABDM HIP flows, which are FHIR-based).
 * Read: Patient, Practitioner, Location, Appointment, Encounter, Consent, QuestionnaireResponse, CarePlan, Communication, Bundle.
 * Write: Patient (create/update by identifier or phone) and Appointment (book).
 * Guarded by the API key in Settings → Integrations when one is set.
 */
import { Router } from 'express';
import { id, nowIso, bad, find, digits, HttpError, log, fullName } from '../lib.js';
import { bookAppointment } from '../domain/scheduling.js';
import { packetStatus, FORM_SECTIONS } from '../domain/visits.js';
import { emit } from '../domain/webhooks.js';

const r = Router();
const ABHA_SYSTEM = 'https://healthid.ndhm.gov.in';
const LOCAL = 'urn:clinovara:id';

const ref = (type, x) => ({ reference: `${type}/${x}` });
const phoneE164 = (db, p) => (p ? `+${db.settings.locale?.phoneCountryCode || '91'}${p}` : null);

export function toPatient(db, p) {
  return {
    resourceType: 'Patient', id: p.id,
    meta: { lastUpdated: p.updatedAt || p.createdAt, profile: ['https://nrces.in/ndhm/fhir/r4/StructureDefinition/Patient'] },
    identifier: [{ system: LOCAL, value: p.id }, ...(p.abhaNumber ? [{ system: ABHA_SYSTEM, value: p.abhaNumber }] : []), ...(p.abhaAddress ? [{ system: 'https://healthid.ndhm.gov.in/abha-address', value: p.abhaAddress }] : [])],
    active: true,
    name: [{ use: 'official', family: p.lastName, given: [p.firstName], text: fullName(p) }],
    telecom: [...(p.phone ? [{ system: 'phone', value: phoneE164(db, p.phone), use: 'mobile' }] : []), ...(p.email ? [{ system: 'email', value: p.email }] : [])],
    gender: p.gender || 'unknown', birthDate: p.dob || undefined,
    address: p.city || p.address ? [{ text: p.address || undefined, city: p.city || undefined, country: db.settings.locale?.country || 'IN' }] : undefined,
    communication: p.preferredLanguage ? [{ language: { coding: [{ system: 'urn:ietf:bcp:47', code: p.preferredLanguage }] }, preferred: true }] : undefined,
    managingOrganization: { display: db.settings.practice.name },
    extension: p.insurance?.carrier ? [{ url: 'urn:clinovara:coverage', valueString: `${p.insurance.type || ''}:${p.insurance.carrier}${p.insurance.memberId ? ` #${p.insurance.memberId}` : ''}` }] : undefined,
  };
}
export function toPractitioner(db, pr) {
  return { resourceType: 'Practitioner', id: pr.id, identifier: [{ system: LOCAL, value: pr.id }], active: true, name: [{ text: pr.name }], qualification: pr.qualifications ? [{ code: { text: pr.qualifications } }] : undefined, extension: [{ url: 'urn:clinovara:specialty', valueString: pr.specialty || pr.role }] };
}
export function toLocation(db, l) {
  return { resourceType: 'Location', id: l.id, status: 'active', name: l.name, address: { text: l.address, country: db.settings.locale?.country || 'IN' }, telecom: l.phone ? [{ system: 'phone', value: l.phone }] : undefined, managingOrganization: { display: db.settings.practice.name } };
}
const APPT_STATUS = { scheduled: 'booked', confirmed: 'booked', arrived: 'arrived', checked_in: 'checked-in', ready: 'checked-in', in_chair: 'checked-in', completed: 'fulfilled', cancelled: 'cancelled', no_show: 'noshow' };
export function toAppointment(db, a) {
  const vt = db.settings.visitTypes.find((v) => v.id === a.visitTypeId);
  return {
    resourceType: 'Appointment', id: a.id, identifier: [{ system: LOCAL, value: a.id }], status: APPT_STATUS[a.status] || 'booked',
    serviceType: [{ text: vt?.name || a.visitTypeId }], appointmentType: { text: vt?.name }, description: a.notes || undefined,
    start: a.start, end: a.end, minutesDuration: vt?.durationMin, created: a.createdAt,
    cancelationReason: a.cancelReason ? { text: a.cancelReason } : undefined,
    participant: [{ actor: ref('Patient', a.patientId), status: 'accepted' }, { actor: ref('Practitioner', a.providerId), status: 'accepted' }, ...(a.locationId ? [{ actor: ref('Location', a.locationId), status: 'accepted' }] : [])],
    extension: [{ url: 'urn:clinovara:fee', valueMoney: { value: a.fee || 0, currency: db.settings.locale?.currency || 'INR' } }, { url: 'urn:clinovara:paymentStatus', valueString: a.paymentStatus || 'unpaid' }, { url: 'urn:clinovara:source', valueString: a.source }],
  };
}
const ENC_STATUS = { arrived: 'arrived', checking_in: 'arrived', needs_attention: 'triaged', ready: 'triaged', called: 'in-progress', brought_back: 'in-progress', done: 'finished' };
export function toEncounter(db, v) {
  const a = db.appointments.find((x) => x.id === v.appointmentId);
  return {
    resourceType: 'Encounter', id: v.id, identifier: [{ system: LOCAL, value: v.id }, ...(v.token ? [{ system: 'urn:clinovara:token', value: v.token }] : [])],
    status: ENC_STATUS[v.status] || 'planned', class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' },
    subject: ref('Patient', v.patientId), appointment: [ref('Appointment', v.appointmentId)],
    participant: a ? [{ individual: ref('Practitioner', a.providerId) }] : undefined,
    period: { start: v.arrivedAt, end: v.doneAt || undefined }, location: v.locationId ? [{ location: ref('Location', v.locationId) }] : undefined,
    serviceProvider: { display: db.settings.practice.name },
  };
}
export function toConsent(db, pk) {
  const c = pk.sections.consent;
  if (!c?.complete) return null;
  return { resourceType: 'Consent', id: `consent-${pk.id}`, status: 'active', scope: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/consentscope', code: 'treatment' }] }, category: [{ coding: [{ system: 'http://loinc.org', code: '59284-0', display: 'Consent Document' }] }], patient: ref('Patient', pk.patientId), dateTime: c.data.signedAt || c.updatedAt, performer: [ref('Patient', pk.patientId)], sourceAttachment: { contentType: 'text/plain', title: 'Treatment consent', data: Buffer.from(db.settings.consentText).toString('base64') }, provision: { type: 'permit' }, extension: [{ url: 'urn:clinovara:signature', valueString: c.data.signature }, { url: 'urn:clinovara:method', valueString: c.data.method || c.by || 'web' }] };
}
export function toQuestionnaireResponse(db, pk) {
  return {
    resourceType: 'QuestionnaireResponse', id: pk.id, status: packetStatus(pk) === 'complete' ? 'completed' : 'in-progress', subject: ref('Patient', pk.patientId), authored: pk.updatedAt,
    basedOn: [ref('Appointment', pk.appointmentId)],
    item: FORM_SECTIONS.map((s) => ({ linkId: s.key, text: s.label, item: Object.entries(pk.sections[s.key]?.data || {}).map(([k, v]) => ({ linkId: `${s.key}.${k}`, text: k, answer: [{ valueString: Array.isArray(v) ? v.join(', ') : String(v) }] })) })).filter((i) => i.item.length),
  };
}
const CP_STATUS = { recommended: 'not-started', accepted: 'not-started', scheduled: 'scheduled', completed: 'completed', declined: 'cancelled' };
export function toCarePlan(db, tp) {
  return {
    resourceType: 'CarePlan', id: tp.id, status: tp.items.every((i) => ['completed', 'declined'].includes(i.status)) ? 'completed' : 'active', intent: 'plan', title: 'Dental treatment plan',
    subject: ref('Patient', tp.patientId), created: tp.createdAt, author: ref('Practitioner', tp.providerId), description: tp.nextSteps || undefined,
    activity: tp.items.map((i) => ({ detail: { kind: 'ServiceRequest', description: i.procedure + (i.tooth ? ` (tooth ${i.tooth})` : ''), status: CP_STATUS[i.status] || 'not-started', extension: [{ url: 'urn:clinovara:estimate', valueMoney: { value: i.estCost || 0, currency: db.settings.locale?.currency || 'INR' } }, { url: 'urn:clinovara:priority', valueString: i.priority }, ...(i.tooth ? [{ url: 'urn:clinovara:toothFDI', valueString: i.tooth }] : [])] } })),
    note: tp.patientQuestions.map((q) => ({ text: `Q: ${q.question}${q.answer ? ` — A: ${q.answer}` : ''}`, time: q.at })),
  };
}
export function toCommunication(db, c) {
  return { resourceType: 'Communication', id: c.id, status: 'completed', category: [{ text: c.type }], medium: [{ text: c.channel }], subject: c.patientId ? ref('Patient', c.patientId) : undefined, sent: c.sentAt, sender: { display: c.by || db.settings.practice.name }, payload: [{ contentString: c.body }], basedOn: c.appointmentId ? [ref('Appointment', c.appointmentId)] : undefined, extension: c.lang ? [{ url: 'urn:clinovara:language', valueString: c.lang }] : undefined };
}

const bundle = (entries, type = 'searchset') => ({ resourceType: 'Bundle', type, total: entries.length, timestamp: nowIso(), entry: entries.map((resource) => ({ fullUrl: `urn:uuid:${resource.id}`, resource })) });
const since = (req) => (req.query._lastUpdated ? String(req.query._lastUpdated).replace(/^(gt|ge)/, '') : null);

r.get('/metadata', (req, res) => res.json({ resourceType: 'CapabilityStatement', status: 'active', date: nowIso(), kind: 'instance', fhirVersion: '4.0.1', format: ['json'], software: { name: 'Clinovara', version: '2.0' }, implementation: { description: `${req.db.settings.practice.name} — Clinovara FHIR facade` }, rest: [{ mode: 'server', security: { description: req.db.settings.integrations?.apiKey ? 'x-api-key header required' : 'open (set an API key in Settings → Integrations)' }, resource: [
  { type: 'Patient', interaction: [{ code: 'read' }, { code: 'search-type' }, { code: 'create' }, { code: 'update' }], searchParam: [{ name: 'identifier', type: 'token' }, { name: 'phone', type: 'string' }, { name: 'name', type: 'string' }, { name: '_lastUpdated', type: 'date' }] },
  { type: 'Practitioner', interaction: [{ code: 'read' }, { code: 'search-type' }] }, { type: 'Location', interaction: [{ code: 'read' }, { code: 'search-type' }] },
  { type: 'Appointment', interaction: [{ code: 'read' }, { code: 'search-type' }, { code: 'create' }], searchParam: [{ name: 'patient', type: 'reference' }, { name: 'date', type: 'date' }, { name: 'status', type: 'token' }] },
  { type: 'Encounter', interaction: [{ code: 'read' }, { code: 'search-type' }] }, { type: 'Consent', interaction: [{ code: 'search-type' }] }, { type: 'QuestionnaireResponse', interaction: [{ code: 'search-type' }] }, { type: 'CarePlan', interaction: [{ code: 'read' }, { code: 'search-type' }] }, { type: 'Communication', interaction: [{ code: 'search-type' }] },
] }] }));

r.get('/Patient', (req, res) => {
  const db = req.db; let list = db.patients;
  if (req.query.identifier) { const v = String(req.query.identifier).split('|').pop(); list = list.filter((p) => p.id === v || p.abhaNumber === v || p.abhaAddress === v); }
  if (req.query.phone) list = list.filter((p) => digits(p.phone) === digits(req.query.phone));
  if (req.query.name) list = list.filter((p) => fullName(p).toLowerCase().includes(String(req.query.name).toLowerCase()));
  const s = since(req); if (s) list = list.filter((p) => (p.updatedAt || p.createdAt) > s);
  res.json(bundle(list.map((p) => toPatient(db, p))));
});
r.get('/Patient/:id', (req, res) => res.json(toPatient(req.db, find(req.db.patients, req.params.id, 'Patient'))));
r.get('/Patient/:id/\\$everything', (req, res) => {
  const db = req.db; const p = find(db.patients, req.params.id, 'Patient');
  const out = [toPatient(db, p), ...db.appointments.filter((a) => a.patientId === p.id).map((a) => toAppointment(db, a)), ...db.visits.filter((v) => v.patientId === p.id).map((v) => toEncounter(db, v)), ...db.formPackets.filter((k) => k.patientId === p.id).flatMap((k) => [toQuestionnaireResponse(db, k), toConsent(db, k)].filter(Boolean)), ...db.treatmentPlans.filter((t) => t.patientId === p.id).map((t) => toCarePlan(db, t)), ...db.communications.filter((c) => c.patientId === p.id).map((c) => toCommunication(db, c))];
  res.json(bundle(out, 'searchset'));
});
function upsertPatient(db, body, by) {
  if (body?.resourceType !== 'Patient') bad('Expected a FHIR Patient resource');
  const name = body.name?.[0] || {};
  const phone = digits(body.telecom?.find((t) => t.system === 'phone')?.value || '', db.settings.locale?.phoneCountryCode || '91');
  const abha = body.identifier?.find((i) => i.system === ABHA_SYSTEM)?.value || '';
  const localId = body.identifier?.find((i) => i.system === LOCAL)?.value || body.id;
  let p = (localId && db.patients.find((x) => x.id === localId)) || (abha && db.patients.find((x) => x.abhaNumber === abha)) || (phone && body.birthDate && db.patients.find((x) => x.phone === phone && x.dob === body.birthDate)) || null;
  const fields = { firstName: (name.given || [])[0] || name.text?.split(' ')[0] || p?.firstName || 'Unknown', lastName: name.family || name.text?.split(' ').slice(1).join(' ') || p?.lastName || '', dob: body.birthDate || p?.dob || '', gender: body.gender && body.gender !== 'unknown' ? body.gender : (p?.gender || ''), phone: phone || p?.phone || '', email: body.telecom?.find((t) => t.system === 'email')?.value || p?.email || '', abhaNumber: abha || p?.abhaNumber || '', abhaAddress: body.identifier?.find((i) => i.system === 'https://healthid.ndhm.gov.in/abha-address')?.value || p?.abhaAddress || '', preferredLanguage: body.communication?.find((c) => c.preferred)?.language?.coding?.[0]?.code || p?.preferredLanguage || 'en', city: body.address?.[0]?.city || p?.city || '', address: body.address?.[0]?.text || p?.address || '' };
  const created = !p;
  if (!p) { p = { id: id('pat'), locationId: db.settings.locations?.[0]?.id || null, insurance: { type: 'self', carrier: '', memberId: '', groupNumber: '', tpa: '', cardScannedAt: null, verified: false }, lastVisit: null, nextRecallDue: null, notes: `Imported via FHIR by ${by}`, tags: ['fhir'], createdAt: nowIso() }; db.patients.push(p); }
  Object.assign(p, fields, { updatedAt: nowIso() });
  log(db, 'patient', `${created ? 'Created' : 'Updated'} ${fullName(p)} via FHIR (${by})`, { patientId: p.id });
  emit(db, created ? 'patient.created' : 'patient.updated', { patient: p, via: 'fhir' });
  return { p, created };
}
r.post('/Patient', (req, res) => { const { p, created } = upsertPatient(req.db, req.body, req.user); req.store.save(); res.status(created ? 201 : 200).json(toPatient(req.db, p)); });
r.put('/Patient/:id', (req, res) => { const { p } = upsertPatient(req.db, { ...req.body, id: req.params.id }, req.user); req.store.save(); res.json(toPatient(req.db, p)); });

r.get('/Practitioner', (req, res) => res.json(bundle(req.db.settings.providers.map((p) => toPractitioner(req.db, p)))));
r.get('/Practitioner/:id', (req, res) => res.json(toPractitioner(req.db, find(req.db.settings.providers, req.params.id, 'Practitioner'))));
r.get('/Location', (req, res) => res.json(bundle((req.db.settings.locations || []).map((l) => toLocation(req.db, l)))));
r.get('/Location/:id', (req, res) => res.json(toLocation(req.db, find(req.db.settings.locations || [], req.params.id, 'Location'))));

r.get('/Appointment', (req, res) => {
  const db = req.db; let list = db.appointments;
  if (req.query.patient) list = list.filter((a) => a.patientId === String(req.query.patient).replace('Patient/', ''));
  if (req.query.date) { const d = String(req.query.date).replace(/^(ge|gt|eq)/, '').slice(0, 10); list = list.filter((a) => a.start.slice(0, 10) >= d); }
  if (req.query.status) list = list.filter((a) => APPT_STATUS[a.status] === req.query.status);
  res.json(bundle(list.map((a) => toAppointment(db, a))));
});
r.get('/Appointment/:id', (req, res) => res.json(toAppointment(req.db, find(req.db.appointments, req.params.id, 'Appointment'))));
r.post('/Appointment', (req, res) => {
  const db = req.db; const b = req.body || {};
  if (b.resourceType !== 'Appointment') bad('Expected a FHIR Appointment resource');
  const pid = b.participant?.find((x) => x.actor?.reference?.startsWith('Patient/'))?.actor.reference.split('/')[1];
  const prid = b.participant?.find((x) => x.actor?.reference?.startsWith('Practitioner/'))?.actor.reference.split('/')[1];
  const lid = b.participant?.find((x) => x.actor?.reference?.startsWith('Location/'))?.actor.reference.split('/')[1];
  const svc = (b.serviceType?.[0]?.text || b.appointmentType?.text || '').toLowerCase();
  const vt = db.settings.visitTypes.find((v) => v.name.toLowerCase() === svc || v.id === svc) || db.settings.visitTypes.find((v) => v.id === 'vt_newpatient') || db.settings.visitTypes[0];
  const a = bookAppointment(db, { patientId: pid, visitTypeId: vt.id, providerId: prid, locationId: lid, start: b.start, notes: b.description || b.comment || '', source: 'ehr', by: `EHR (${req.user})` });
  req.store.save();
  res.status(201).json(toAppointment(db, a));
});
r.get('/Encounter', (req, res) => { let list = req.db.visits; if (req.query.patient) list = list.filter((v) => v.patientId === String(req.query.patient).replace('Patient/', '')); res.json(bundle(list.map((v) => toEncounter(req.db, v)))); });
r.get('/Encounter/:id', (req, res) => res.json(toEncounter(req.db, find(req.db.visits, req.params.id, 'Encounter'))));
r.get('/Consent', (req, res) => res.json(bundle(req.db.formPackets.map((k) => toConsent(req.db, k)).filter(Boolean).filter((c) => !req.query.patient || c.patient.reference === `Patient/${String(req.query.patient).replace('Patient/', '')}`))));
r.get('/QuestionnaireResponse', (req, res) => res.json(bundle(req.db.formPackets.filter((k) => !req.query.patient || k.patientId === String(req.query.patient).replace('Patient/', '')).map((k) => toQuestionnaireResponse(req.db, k)))));
r.get('/CarePlan', (req, res) => res.json(bundle(req.db.treatmentPlans.filter((t) => !req.query.patient || t.patientId === String(req.query.patient).replace('Patient/', '')).map((t) => toCarePlan(req.db, t)))));
r.get('/CarePlan/:id', (req, res) => res.json(toCarePlan(req.db, find(req.db.treatmentPlans, req.params.id, 'CarePlan'))));
r.get('/Communication', (req, res) => res.json(bundle(req.db.communications.filter((c) => !req.query.patient || c.patientId === String(req.query.patient).replace('Patient/', '')).map((c) => toCommunication(req.db, c)))));

r.get('/Bundle', (req, res) => {
  const db = req.db;
  const out = [...db.patients.map((p) => toPatient(db, p)), ...db.settings.providers.map((p) => toPractitioner(db, p)), ...(db.settings.locations || []).map((l) => toLocation(db, l)), ...db.appointments.map((a) => toAppointment(db, a)), ...db.visits.map((v) => toEncounter(db, v)), ...db.formPackets.flatMap((k) => [toQuestionnaireResponse(db, k), toConsent(db, k)].filter(Boolean)), ...db.treatmentPlans.map((t) => toCarePlan(db, t)), ...db.communications.map((c) => toCommunication(db, c))];
  res.setHeader('Content-Disposition', `attachment; filename="clinovara-fhir-${nowIso().slice(0, 10)}.json"`);
  res.json(bundle(out, 'collection'));
});

export default r;
