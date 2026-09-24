import { Router } from 'express';
import { id, nowIso, bad, find, digits, log, fullName, csvCell, parseCsv } from '../lib.js';
import { packetStatus } from '../domain/visits.js';
import { emit } from '../domain/webhooks.js';

const r = Router();
const FIELDS = ['firstName', 'lastName', 'dob', 'gender', 'phone', 'email', 'abhaNumber', 'abhaAddress', 'preferredLanguage', 'locationId', 'city', 'address', 'lastVisit', 'nextRecallDue', 'notes'];
const CSV_COLUMNS = ['firstName', 'lastName', 'dob', 'gender', 'phone', 'email', 'abhaNumber', 'preferredLanguage', 'branch', 'city', 'insuranceType', 'insuranceCarrier', 'memberId', 'tpa', 'lastVisit', 'nextRecallDue', 'notes'];

function newPatient(db, b) {
  const cc = db.settings.locale?.phoneCountryCode || '91';
  return { id: id('pat'), firstName: String(b.firstName || '').trim(), lastName: String(b.lastName || '').trim(), dob: b.dob || '', gender: b.gender || '', phone: digits(b.phone, cc), email: b.email || '', abhaNumber: b.abhaNumber || '', abhaAddress: b.abhaAddress || '', preferredLanguage: b.preferredLanguage || db.settings.locale?.defaultLanguage || 'en', locationId: b.locationId || db.settings.locations?.[0]?.id || null, city: b.city || '', address: b.address || '', insurance: { type: 'self', carrier: '', memberId: '', groupNumber: '', tpa: '', cardScannedAt: null, verified: false, ...(b.insurance || {}) }, lastVisit: b.lastVisit || null, nextRecallDue: b.nextRecallDue || null, notes: b.notes || '', tags: b.tags || [], createdAt: nowIso() };
}

r.get('/', (req, res) => {
  const db = req.db;
  const q = String(req.query.q || '').toLowerCase().trim();
  const cc = db.settings.locale?.phoneCountryCode || '91';
  let list = db.patients;
  if (req.query.locationId) list = list.filter((p) => p.locationId === req.query.locationId);
  if (q) list = list.filter((p) => fullName(p).toLowerCase().includes(q) || (digits(q, cc) && digits(p.phone, cc).includes(digits(q, cc))) || (p.email || '').toLowerCase().includes(q) || p.dob === q || (p.abhaNumber || '').replace(/\D/g, '').includes(q.replace(/\D/g, '') || '§'));
  const now = nowIso();
  res.json(list.map((p) => ({ ...p, upcoming: db.appointments.filter((a) => a.patientId === p.id && ['scheduled', 'confirmed'].includes(a.status) && a.start > now).sort((a, b) => a.start.localeCompare(b.start))[0] || null, family: db.patients.filter((x) => x.id !== p.id && x.phone && x.phone === p.phone).map((x) => ({ id: x.id, name: fullName(x) })) })));
});

r.get('/export.csv', (req, res) => {
  const db = req.db;
  const rows = [CSV_COLUMNS.join(',')];
  for (const p of db.patients) rows.push(CSV_COLUMNS.map((c) => csvCell(c === 'branch' ? (db.settings.locations || []).find((l) => l.id === p.locationId)?.name || '' : c === 'insuranceType' ? p.insurance?.type : c === 'insuranceCarrier' ? p.insurance?.carrier : c === 'memberId' ? p.insurance?.memberId : c === 'tpa' ? p.insurance?.tpa : p[c])).join(','));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="patients-${nowIso().slice(0, 10)}.csv"`);
  res.send('﻿' + rows.join('\n'));
});

const ALIASES ={ 'first name': 'firstName', firstname: 'firstName', name: 'fullName', 'patient name': 'fullName', 'last name': 'lastName', lastname: 'lastName', surname: 'lastName', 'date of birth': 'dob', birthdate: 'dob', 'dob (yyyy-mm-dd)': 'dob', mobile: 'phone', 'mobile number': 'phone', 'phone number': 'phone', contact: 'phone', sex: 'gender', 'abha number': 'abhaNumber', 'abha id': 'abhaNumber', 'health id': 'abhaNumber', abha: 'abhaNumber', language: 'preferredLanguage', 'preferred language': 'preferredLanguage', insurer: 'insuranceCarrier', 'insurance company': 'insuranceCarrier', carrier: 'insuranceCarrier', 'policy number': 'memberId', 'member id': 'memberId', 'policy no': 'memberId', 'last visit': 'lastVisit', 'recall due': 'nextRecallDue', 'next recall': 'nextRecallDue', location: 'branch', clinic: 'branch', remarks: 'notes', note: 'notes' };

r.post('/import', (req, res) => {
  const db = req.db; const text = String(req.body?.csv || '').replace(/^﻿/, '');
  if (!text.trim()) bad('csv is required');
  const rows = parseCsv(text);
  if (rows.length < 2) bad('CSV needs a header row and at least one patient');
  const header = rows[0].map((h) => { const k = h.trim(); const lk = k.toLowerCase(); return ALIASES[lk] || (CSV_COLUMNS.includes(k) ? k : (CSV_COLUMNS.find((c) => c.toLowerCase() === lk) || k)); });
  const cc = db.settings.locale?.phoneCountryCode || '91';
  let created = 0; let updated = 0; const errors = [];
  rows.slice(1).forEach((cells, i) => {
    const rec = {}; header.forEach((h, j) => { rec[h] = (cells[j] || '').trim(); });
    if (rec.fullName && !rec.firstName) { const parts = rec.fullName.split(/\s+/); rec.firstName = parts[0]; rec.lastName = parts.slice(1).join(' '); }
    if (!rec.firstName) { errors.push(`Row ${i + 2}: missing name`); return; }
    if (rec.dob && /^\d{2}[\/-]\d{2}[\/-]\d{4}$/.test(rec.dob)) { const [d, m, y] = rec.dob.split(/[\/-]/); rec.dob = `${y}-${m}-${d}`; }
    const phone = digits(rec.phone, cc);
    let p = (rec.abhaNumber && db.patients.find((x) => x.abhaNumber === rec.abhaNumber)) || (phone && db.patients.find((x) => x.phone === phone && (!rec.dob || x.dob === rec.dob) && x.firstName.toLowerCase() === rec.firstName.toLowerCase())) || null;
    const loc = rec.branch ? (db.settings.locations || []).find((l) => l.name.toLowerCase() === rec.branch.toLowerCase()) : null;
    const ins = { type: rec.insuranceType || (rec.insuranceCarrier ? 'private' : undefined), carrier: rec.insuranceCarrier, memberId: rec.memberId, tpa: rec.tpa };
    for (const k of Object.keys(ins)) if (ins[k] === undefined || ins[k] === '') delete ins[k];
    if (p) { for (const k of FIELDS) if (rec[k]) p[k] = k === 'phone' ? phone : rec[k]; if (loc) p.locationId = loc.id; p.insurance = { ...p.insurance, ...ins }; p.updatedAt = nowIso(); updated++; emit(db, 'patient.updated', { patient: p, via: 'csv' }); }
    else { p = newPatient(db, { ...rec, phone, locationId: loc?.id, insurance: ins, tags: ['imported'] }); db.patients.push(p); created++; emit(db, 'patient.created', { patient: p, via: 'csv' }); }
  });
  log(db, 'patient', `${req.user} imported patients from CSV: ${created} created, ${updated} updated${errors.length ? `, ${errors.length} skipped` : ''}`);
  req.store.save();
  res.json({ created, updated, errors, columns: CSV_COLUMNS });
});

r.post('/', (req, res) => {
  const b = req.body || {};
  if (!b.firstName || !b.lastName) bad('firstName and lastName are required');
  const p = newPatient(req.db, b);
  req.db.patients.push(p);
  log(req.db, 'patient', `${req.user} added patient ${fullName(p)}`, { patientId: p.id });
  emit(req.db, 'patient.created', { patient: p, via: 'staff' });
  req.store.save();
  res.status(201).json(p);
});

r.get('/:id', (req, res) => {
  const db = req.db;
  const p = find(db.patients, req.params.id, 'Patient');
  const appointments = db.appointments.filter((a) => a.patientId === p.id).sort((a, b) => b.start.localeCompare(a.start)).map((a) => ({ ...a, visitType: db.settings.visitTypes.find((v) => v.id === a.visitTypeId), provider: db.settings.providers.find((x) => x.id === a.providerId), location: (db.settings.locations || []).find((l) => l.id === a.locationId) }));
  res.json({
    ...p, appointments,
    packets: db.formPackets.filter((k) => k.patientId === p.id).map((k) => ({ ...k, status: packetStatus(k) })),
    treatmentPlans: db.treatmentPlans.filter((t) => t.patientId === p.id),
    communications: db.communications.filter((c) => c.patientId === p.id),
    conversations: db.conversations.filter((c) => c.patientId === p.id).map((c) => ({ id: c.id, status: c.status, channel: c.channel, reason: c.reason, updatedAt: c.updatedAt })),
    visits: db.visits.filter((v) => v.patientId === p.id),
    family: db.patients.filter((x) => x.id !== p.id && x.phone && x.phone === p.phone).map((x) => ({ id: x.id, name: fullName(x), dob: x.dob })),
    totalPaid: appointments.filter((a) => a.paymentStatus === 'paid').reduce((s, a) => s + (a.paidAmount || 0), 0),
  });
});

r.patch('/:id', (req, res) => {
  const p = find(req.db.patients, req.params.id, 'Patient');
  const b = req.body || {};
  for (const k of FIELDS) if (b[k] !== undefined) p[k] = k === 'phone' ? digits(b[k], req.db.settings.locale?.phoneCountryCode || '91') : b[k];
  if (b.insurance) p.insurance = { ...p.insurance, ...b.insurance };
  if (Array.isArray(b.tags)) p.tags = b.tags;
  p.updatedAt = nowIso();
  emit(req.db, 'patient.updated', { patient: p, via: 'staff' });
  req.store.save();
  res.json(p);
});

export default r;
