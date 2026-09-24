import { Router } from 'express';
import { nowIso, bad, find, log, fullName } from '../lib.js';
import { FORM_SECTIONS, packetFor, sendPacket, updateSection, packetStatus } from '../domain/visits.js';

const r = Router();

function expand(db, pk) {
  const a = db.appointments.find((x) => x.id === pk.appointmentId) || null;
  return {
    ...pk, status: packetStatus(pk),
    patient: db.patients.find((p) => p.id === pk.patientId) || null,
    appointment: a, visitType: a ? db.settings.visitTypes.find((v) => v.id === a.visitTypeId) : null,
    provider: a ? db.settings.providers.find((p) => p.id === a.providerId) : null,
    missing: FORM_SECTIONS.filter((s) => !pk.sections[s.key]?.complete).map((s) => s.label),
  };
}

r.get('/', (req, res) => {
  const db = req.db;
  const upcomingOnly = req.query.upcoming !== 'false';
  const list = db.formPackets.map((pk) => expand(db, pk)).filter((x) => x.appointment && (!upcomingOnly || (x.appointment.start >= nowIso().slice(0, 10) && !['cancelled', 'no_show', 'completed'].includes(x.appointment.status))));
  res.json(list.sort((a, b) => a.appointment.start.localeCompare(b.appointment.start)));
});

r.get('/sections', (req, res) => res.json({ sections: FORM_SECTIONS, consentText: req.db.settings.consentText }));

r.post('/send', (req, res) => {
  const pk = packetFor(req.db, req.body?.appointmentId, { create: true });
  const c = sendPacket(req.db, pk, { frontendBase: req.frontendBase });
  log(req.db, 'forms', `${req.user} sent pre-visit forms to ${fullName(req.db.patients.find((p) => p.id === pk.patientId))}`, { appointmentId: pk.appointmentId });
  req.store.save();
  res.json({ packet: expand(req.db, pk), communication: c });
});

r.post('/:id/remind', (req, res) => {
  const pk = find(req.db.formPackets, req.params.id, 'Form packet');
  const c = sendPacket(req.db, pk, { frontendBase: req.frontendBase });
  req.store.save();
  res.json({ packet: expand(req.db, pk), communication: c });
});

// Staff editing a section on behalf of a patient
r.put('/:id/sections/:key', (req, res) => {
  const pk = find(req.db.formPackets, req.params.id, 'Form packet');
  updateSection(req.db, pk, req.params.key, req.body?.data || {}, { by: req.user });
  req.store.save();
  res.json(expand(req.db, pk));
});

// Patient-facing (token) endpoints: expose only what the patient needs
r.get('/token/:token', (req, res) => {
  const db = req.db;
  const pk = db.formPackets.find((p) => p.token === req.params.token);
  if (!pk) bad('This forms link is not valid');
  const x = expand(db, pk);
  res.json({
    id: pk.id, token: pk.token, status: x.status, sections: pk.sections, missing: x.missing,
    patient: x.patient ? { firstName: x.patient.firstName, lastName: x.patient.lastName, dob: x.patient.dob } : null,
    appointment: x.appointment ? { start: x.appointment.start, status: x.appointment.status } : null,
    visitType: x.visitType?.name || null, provider: x.provider?.name || null,
    location: x.appointment ? (db.settings.locations || []).find((l) => l.id === x.appointment.locationId)?.name || null : null,
    practice: { name: db.settings.practice.name, phone: db.settings.practice.phone, address: db.settings.practice.address },
    consentText: db.settings.consentText, sectionList: FORM_SECTIONS,
    languages: db.settings.locale?.languages || [{ code: 'en', name: 'English' }], insuranceOptions: db.settings.insuranceOptions || [],
  });
});

r.put('/token/:token/sections/:key', (req, res) => {
  const db = req.db;
  const pk = db.formPackets.find((p) => p.token === req.params.token);
  if (!pk) bad('This forms link is not valid');
  updateSection(db, pk, req.params.key, req.body?.data || {}, { by: 'patient' });
  if (packetStatus(pk) === 'complete') log(db, 'forms', `${fullName(db.patients.find((p) => p.id === pk.patientId))} completed pre-visit forms`, { appointmentId: pk.appointmentId });
  req.store.save();
  res.json({ status: packetStatus(pk), sections: pk.sections, missing: FORM_SECTIONS.filter((s) => !pk.sections[s.key]?.complete).map((s) => s.label) });
});

export default r;
