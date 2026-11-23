/**
 * Kiosk sessions. Each session is short-lived and holds only the identifiers needed for the current
 * patient. A session expires after `rules.kioskResetSeconds` of inactivity and is then purged, so the
 * next patient never sees the previous one's information. The frontend kiosk shows a privacy screen
 * on expiry. A kiosk is pinned to a branch via its kiosk code (Settings → Branches).
 */
import { Router } from 'express';
import { id, nowIso, dayKey, digits, bad, find, log, fullName, HttpError, brandOf } from '../lib.js';
import { ACTIVE, location } from '../domain/scheduling.js';
import { FORM_SECTIONS, packetFor, updateSection, arrive, syncVisitMissing, packetStatus } from '../domain/visits.js';

const r = Router();

function purge(db) { const now = Date.now(); db.kioskSessions = db.kioskSessions.filter((s) => new Date(s.expiresAt).getTime() > now); }
function touch(db, s) { const ttl = (db.settings.rules.kioskResetSeconds || 90) * 1000; s.lastActivityAt = nowIso(); s.expiresAt = new Date(Date.now() + ttl).toISOString(); }
function session(req) {
  purge(req.db);
  const s = req.db.kioskSessions.find((x) => x.id === req.params.id);
  if (!s) throw new HttpError(410, 'Session expired. Please start again.');
  touch(req.db, s);
  return s;
}
/** People already waiting for the same dentist who arrived before this visit. */
function aheadOf(db, visit, a) {
  const waiting = ['arrived', 'checking_in', 'needs_attention', 'ready', 'called'];
  return db.visits.filter((v) => v.id !== visit.id && waiting.includes(v.status) && (v.arrivedAt || '') < (visit.arrivedAt || '~')).filter((v) => { const x = db.appointments.find((y) => y.id === v.appointmentId); return x && x.providerId === a.providerId && dayKey(x.start) === dayKey(a.start); }).length;
}
function view(db, s) {
  const loc = location(db, s.locationId);
  const base = { id: s.id, step: s.step, expiresAt: s.expiresAt, secondsLeft: Math.max(0, Math.round((new Date(s.expiresAt) - Date.now()) / 1000)), practice: { name: db.settings.practice.name }, branding: brandOf(db.settings), location: loc ? { id: loc.id, name: loc.name } : null, languages: db.settings.locale?.languages || [{ code: 'en', name: 'English' }], helpRequested: !!s.helpRequested, insuranceOptions: db.settings.insuranceOptions || [] };
  if (s.candidates?.length && !s.patientId) return { ...base, choose: s.candidates };
  if (!s.patientId) return base;
  const patient = db.patients.find((p) => p.id === s.patientId);
  const a = db.appointments.find((x) => x.id === s.appointmentId);
  const pk = db.formPackets.find((p) => p.appointmentId === s.appointmentId);
  const visit = db.visits.find((v) => v.appointmentId === s.appointmentId);
  return {
    ...base,
    patient: { firstName: patient.firstName, lastInitial: patient.lastName[0] + '.', insuranceOnFile: !!(patient.insurance?.carrier || patient.insurance?.type === 'self'), insuranceCarrier: patient.insurance?.carrier || '', insuranceType: patient.insurance?.type || '', preferredLanguage: patient.preferredLanguage || 'en', abhaOnFile: !!patient.abhaNumber },
    appointment: { start: a.start, visitType: db.settings.visitTypes.find((v) => v.id === a.visitTypeId)?.name, provider: db.settings.providers.find((p) => p.id === a.providerId)?.name, location: location(db, a.locationId)?.name, fee: a.fee, paymentStatus: a.paymentStatus, currency: db.settings.locale?.currencySymbol || '₹' },
    forms: { status: packetStatus(pk), sections: FORM_SECTIONS.map((sec) => ({ key: sec.key, label: sec.label, complete: !!pk.sections[sec.key]?.complete, data: pk.sections[sec.key]?.data || {}, prefilled: !!pk.sections[sec.key]?.prefilled })) },
    consentText: db.settings.consentText,
    visit: visit ? { ahead: aheadOf(db, visit, a), status: visit.status, token: visit.token, missing: visit.missing, insuranceScannedAt: visit.insuranceScannedAt, consentSignedAt: visit.consentSignedAt } : null,
  };
}

r.post('/sessions', (req, res) => {
  purge(req.db);
  const db = req.db; const b = req.body || {};
  const loc = (db.settings.locations || []).find((l) => l.kioskCode && l.kioskCode === b.kioskCode) || (b.locationId ? location(db, b.locationId) : null) || db.settings.locations?.[0] || null;
  const s = { id: id('ks'), startedAt: nowIso(), step: 'welcome', patientId: null, appointmentId: null, locationId: loc?.id || null, helpRequested: false, lang: b.lang || db.settings.locale?.defaultLanguage || 'en' };
  touch(db, s);
  db.kioskSessions.push(s);
  req.store.save();
  res.status(201).json(view(db, s));
});

r.get('/sessions/:id', (req, res) => { const s = session(req); req.store.save(); res.json(view(req.db, s)); });

function checkIn(db, s, p, a) {
  s.patientId = p.id; s.appointmentId = a.id; s.step = 'checkin'; s.candidates = null;
  packetFor(db, a.id, { create: true });
  const v = arrive(db, a.id, { source: 'kiosk' });
  if (v.status === 'arrived') v.status = 'checking_in';
  v.checkInSource = v.checkInSource || 'kiosk';
  syncVisitMissing(db, a.id);
}

r.post('/sessions/:id/identify', (req, res) => {
  const db = req.db; const s = session(req);
  const b = req.body || {};
  const today = dayKey(nowIso());
  const todays = db.appointments.filter((a) => dayKey(a.start) === today && ACTIVE.has(a.status));
  if (b.patientId && s.candidates?.some((c) => c.id === b.patientId)) {
    const p = find(db.patients, b.patientId, 'Patient'); const a = todays.find((x) => x.patientId === p.id) || bad('No appointment today');
    checkIn(db, s, p, a); req.store.save(); return res.json(view(db, s));
  }
  let matches = [];
  const cc = db.settings.locale?.phoneCountryCode || '91';
  if (b.phone) matches = db.patients.filter((p) => digits(p.phone, cc) === digits(b.phone, cc));
  else if (b.lastName && b.dob) matches = db.patients.filter((p) => p.lastName.toLowerCase() === String(b.lastName).toLowerCase().trim() && p.dob === b.dob);
  else if (b.abha) matches = db.patients.filter((p) => p.abhaNumber && (p.abhaNumber.replace(/\D/g, '') === String(b.abha).replace(/\D/g, '') || p.abhaAddress === b.abha));
  else bad('Enter your mobile number, ABHA number, or last name and date of birth');
  const withAppt = matches.map((p) => ({ p, a: todays.find((a) => a.patientId === p.id) })).filter((x) => x.a);
  if (!withAppt.length) {
    s.failedAttempts = (s.failedAttempts || 0) + 1;
    req.store.save();
    return res.status(404).json({ error: matches.length ? 'We found you, but there is no appointment today under these details. Please tap "Ask for help".' : 'We could not find a match. Check the details, or tap "Ask for help".', attempts: s.failedAttempts });
  }
  if (withAppt.length > 1) {
    // Family members sharing one phone: let the patient pick without exposing full names.
    s.candidates = withAppt.map(({ p, a }) => ({ id: p.id, firstName: p.firstName, lastInitial: p.lastName[0] + '.', time: a.start }));
    s.step = 'choose';
    req.store.save();
    return res.json(view(db, s));
  }
  const { p, a } = withAppt[0];
  checkIn(db, s, p, a);
  req.store.save();
  res.json(view(db, s));
});

r.post('/sessions/:id/language', (req, res) => { const s = session(req); s.lang = req.body?.lang || 'en'; if (s.patientId) { const p = req.db.patients.find((x) => x.id === s.patientId); if (p) p.preferredLanguage = s.lang; } req.store.save(); res.json(view(req.db, s)); });

r.post('/sessions/:id/forms/:key', (req, res) => {
  const db = req.db; const s = session(req);
  if (!s.appointmentId) bad('Identify first');
  const pk = packetFor(db, s.appointmentId, { create: true });
  updateSection(db, pk, req.params.key, req.body?.data || {}, { by: 'kiosk' });
  s.step = 'forms';
  req.store.save();
  res.json(view(db, s));
});

r.post('/sessions/:id/insurance', (req, res) => {
  const db = req.db; const s = session(req);
  if (!s.patientId) bad('Identify first');
  const p = find(db.patients, s.patientId, 'Patient');
  const b = req.body || {};
  // "Scan" = the kiosk camera captured the card. We store the extracted fields and the scan time, not the image.
  p.insurance = { ...p.insurance, type: b.type || (b.carrier === 'Self-pay' ? 'self' : p.insurance.type || 'private'), carrier: b.carrier ?? p.insurance.carrier, memberId: b.memberId ?? p.insurance.memberId, groupNumber: b.groupNumber ?? p.insurance.groupNumber, tpa: b.tpa ?? p.insurance.tpa, cardScannedAt: nowIso(), verified: false };
  if (b.abhaNumber) p.abhaNumber = b.abhaNumber;
  const v = db.visits.find((x) => x.appointmentId === s.appointmentId);
  if (v) v.insuranceScannedAt = p.insurance.cardScannedAt;
  const pk = packetFor(db, s.appointmentId, { create: true });
  updateSection(db, pk, 'insurance', { type: p.insurance.type, carrier: p.insurance.carrier, memberId: p.insurance.memberId, groupNumber: p.insurance.groupNumber, tpa: p.insurance.tpa, abhaNumber: p.abhaNumber, scanned: !!b.scanned }, { by: 'kiosk' });
  log(db, 'kiosk', `${fullName(p)} ${b.scanned ? 'scanned an insurance card' : 'entered insurance details'} at the kiosk`, { patientId: p.id });
  req.store.save();
  res.json(view(db, s));
});

r.post('/sessions/:id/consent', (req, res) => {
  const db = req.db; const s = session(req);
  if (!s.appointmentId) bad('Identify first');
  if (!req.body?.signature) bad('Signature is required');
  const pk = packetFor(db, s.appointmentId, { create: true });
  updateSection(db, pk, 'consent', { signature: req.body.signature, signedAt: nowIso(), method: 'kiosk', lang: s.lang }, { by: 'kiosk' });
  req.store.save();
  res.json(view(db, s));
});

r.post('/sessions/:id/help', (req, res) => {
  const db = req.db; const s = session(req);
  s.helpRequested = true;
  const v = s.appointmentId ? db.visits.find((x) => x.appointmentId === s.appointmentId) : null;
  const who = s.patientId ? fullName(db.patients.find((p) => p.id === s.patientId)) : `A patient at the ${location(db, s.locationId)?.name || ''} kiosk`;
  if (v) { v.helpRequested = true; v.helpNote = req.body?.note || 'Asked for help at the kiosk'; v.status = 'needs_attention'; }
  else db.activity.unshift({ id: id('act'), type: 'kiosk_help', text: `${who} asked for help${req.body?.note ? `: ${req.body.note}` : ''}`, at: nowIso(), open: true, locationId: s.locationId });
  log(db, 'kiosk', `${who} asked for help at the kiosk`, { appointmentId: s.appointmentId });
  req.store.save();
  res.json(view(db, s));
});

r.post('/sessions/:id/complete', (req, res) => {
  const db = req.db; const s = session(req);
  if (!s.appointmentId) bad('Identify first');
  const v = syncVisitMissing(db, s.appointmentId);
  if (v && !v.helpRequested) { v.status = v.missing.length ? 'needs_attention' : 'ready'; if (v.status === 'ready') v.readyAt ||= nowIso(); }
  s.step = 'done';
  log(db, 'kiosk', `${fullName(db.patients.find((p) => p.id === s.patientId))} finished kiosk check-in (token ${v?.token})${v?.missing?.length ? ` — missing: ${v.missing.join(', ')}` : ''}`, { appointmentId: s.appointmentId });
  req.store.save();
  res.json(view(db, s));
});

r.post('/sessions/:id/end', (req, res) => {
  purge(req.db);
  req.db.kioskSessions = req.db.kioskSessions.filter((x) => x.id !== req.params.id);
  req.store.save();
  res.json({ ok: true });
});

r.get('/help', (req, res) => res.json(req.db.activity.filter((a) => a.type === 'kiosk_help' && a.open)));
r.post('/help/:id/resolve', (req, res) => { const a = find(req.db.activity, req.params.id, 'Help request'); a.open = false; a.resolvedBy = req.user; a.resolvedAt = nowIso(); req.store.save(); res.json(a); });

export default r;
