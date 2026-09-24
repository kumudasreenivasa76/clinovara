/**
 * Sending records to the clinic's EHR / HMIS.
 * Builds a FHIR R4 transaction Bundle (Patient, Practitioner, Encounter, CarePlan, Communication, plus a
 * Composition "Dental visit summary" that carries the dentist's notes) and POSTs it to the EHR's FHIR base
 * URL from Settings → Integrations. When no EHR is connected the bundle is kept in the outbox, marked
 * "queued", and can be sent later with one click. Every attempt is recorded in `db.ehrOutbox`.
 */
import { id, nowIso, fullName } from '../lib.js';
import { toPatient, toPractitioner, toEncounter, toCarePlan, toCommunication, toAppointment } from '../routes/fhir.js';
import { emit } from './webhooks.js';

const ref = (type, x) => ({ reference: `${type}/${x}` });
const ehrCfg = (db) => (db.settings.integrations ||= {}).ehr ||= { name: '', fhirBaseUrl: '' };

function notesSections(v, plan, closing) {
  const n = v?.doctorNotes || {};
  const sec = (title, text) => (text ? { title, text: { status: 'generated', div: `<div xmlns="http://www.w3.org/1999/xhtml">${escapeHtml(text)}</div>` } } : null);
  return [
    sec('Chief complaint', n.chiefComplaint), sec('Findings', n.findings), sec('Procedure done', n.procedureDone), sec('Advice', n.advice), sec('Medicines', n.medicines),
    plan ? sec('Treatment plan', plan.items.map((i) => `${i.procedure}${i.tooth ? ` (tooth ${i.tooth})` : ''} — ${i.status}${i.estCost ? `, ₹${i.estCost}` : ''}`).join('; ')) : null,
    closing ? sec('Case closing note', `${closing.outcome ? `Outcome: ${closing.outcome}. ` : ''}${closing.notes || ''}`) : null,
  ].filter(Boolean);
}
const escapeHtml = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/** The bundle for one visit (and, when given, the case being closed). */
export function visitBundle(db, { visitId = null, planId = null, closing = null, by = 'Clinovara' }) {
  const v = visitId ? db.visits.find((x) => x.id === visitId) : null;
  const plan = planId ? db.treatmentPlans.find((t) => t.id === planId) : null;
  const patientId = v?.patientId || plan?.patientId;
  const patient = db.patients.find((p) => p.id === patientId);
  const a = v ? db.appointments.find((x) => x.id === v.appointmentId) : null;
  const providerId = a?.providerId || plan?.providerId;
  const prov = db.settings.providers.find((p) => p.id === providerId);
  const entries = [toPatient(db, patient)];
  if (prov) entries.push(toPractitioner(db, prov));
  if (a) entries.push(toAppointment(db, a));
  if (v) entries.push(toEncounter(db, v));
  if (plan) entries.push(toCarePlan(db, plan));
  for (const c of db.communications.filter((c) => c.patientId === patientId && (!a || c.appointmentId === a.id) && ['aftercare', 'treatment'].includes(c.type)).slice(0, 5)) entries.push(toCommunication(db, c));
  const composition = {
    resourceType: 'Composition', id: `comp-${v?.id || plan?.id}-${Date.now().toString(36)}`, status: 'final',
    type: { coding: [{ system: 'http://loinc.org', code: '34117-2', display: 'History and physical note' }], text: closing ? 'Dental case closure' : 'Dental visit summary' },
    subject: ref('Patient', patientId), date: nowIso(), author: [prov ? ref('Practitioner', prov.id) : { display: by }], title: closing ? `Case closed — ${fullName(patient)}` : `Dental visit — ${fullName(patient)}`,
    ...(v ? { encounter: ref('Encounter', v.id) } : {}),
    section: notesSections(v, plan, closing),
  };
  entries.push(composition);
  return {
    resourceType: 'Bundle', type: 'transaction', timestamp: nowIso(),
    entry: entries.map((r) => ({ fullUrl: `urn:uuid:${r.id}`, resource: r, request: { method: r.resourceType === 'Composition' ? 'POST' : 'PUT', url: r.resourceType === 'Composition' ? 'Composition' : `${r.resourceType}/${r.id}` } })),
  };
}

/** Sends (or queues) a bundle. Returns the outbox entry immediately; delivery completes in the background. */
export function sendToEhr(db, { bundle, reason, patientId, visitId = null, planId = null, by = 'Clinovara' }) {
  db.ehrOutbox ||= [];
  const cfg = ehrCfg(db);
  const target = String(cfg.fhirBaseUrl || '').trim();
  const entry = { id: id('ehr'), at: nowIso(), reason, patientId, visitId, planId, by, target: target || null, ehrName: cfg.name || null, resourceCount: bundle.entry.length, resources: bundle.entry.map((e) => e.resource.resourceType), status: target ? 'sending' : 'queued', responseCode: null, error: null, completedAt: null, bundle };
  db.ehrOutbox.unshift(entry);
  if (db.ehrOutbox.length > 200) db.ehrOutbox.length = 200;
  emit(db, 'ehr.export', { id: entry.id, reason, patientId, visitId, planId, resources: entry.resources, bundle });
  if (target) deliver(entry, cfg);
  else entry.note = 'No EHR connected yet. Add its FHIR base URL under Settings → Integrations and this record will be sent with one click.';
  return entry;
}

function deliver(entry, cfg) {
  const headers = { 'content-type': 'application/fhir+json', accept: 'application/fhir+json' };
  if (cfg.apiKey) { headers.authorization = `Bearer ${cfg.apiKey}`; headers['x-api-key'] = cfg.apiKey; }
  entry.status = 'sending';
  const p = fetch(entry.target.replace(/\/$/, ''), { method: 'POST', headers, body: JSON.stringify(entry.bundle), signal: AbortSignal.timeout(10000) })
    .then((res) => { entry.status = res.ok ? 'sent' : 'failed'; entry.responseCode = res.status; if (!res.ok) entry.error = `EHR answered ${res.status}`; })
    .catch((err) => { entry.status = 'failed'; entry.error = err.message; })
    .finally(() => { entry.completedAt = nowIso(); inFlight = inFlight.filter((x) => x !== p); });
  inFlight.push(p);
  return p;
}
let inFlight = [];
export function ehrPending() { return Promise.allSettled(inFlight); }

/** Re-send a queued or failed entry (after the EHR URL was added or fixed). */
export function resend(db, entryId) {
  const entry = (db.ehrOutbox || []).find((e) => e.id === entryId);
  if (!entry) return null;
  const cfg = ehrCfg(db);
  entry.target = String(cfg.fhirBaseUrl || '').trim() || null; entry.ehrName = cfg.name || null; entry.error = null; entry.responseCode = null; entry.completedAt = null;
  if (entry.target) { delete entry.note; deliver(entry, cfg); } else { entry.status = 'queued'; entry.note = 'No EHR connected yet.'; }
  return entry;
}

export const outboxSummary = (e) => { const { bundle, ...rest } = e; void bundle; return rest; };
