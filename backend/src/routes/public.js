/**
 * The clinic's public website API: profile, fees, live slots and online booking.
 * Reachable without a staff session (clinic chosen by ?t=slug). Slots come from the same
 * scheduling engine the front desk uses, so online and desk bookings can never double-book.
 */
import { Router } from 'express';
import { brandOf, id, nowIso, digits, bad, log, fullName, dayKey, addDays } from '../lib.js';
import { slotsForDay, bookAppointment, bookingRules, feeFor, visitType, provider, location, fmtWhen } from '../domain/scheduling.js';
import { sendCommunication } from '../domain/messaging.js';
import { procedures, feePolicy } from '../domain/catalogue.js';
import { emit } from '../domain/webhooks.js';
import { trackSite } from '../domain/marketingAnalytics.js';

const r = Router();

r.get('/clinic', (req, res) => {
  const db = req.db;
  trackSite(db, 'view', String(req.query.src || '').toLowerCase().replace(/[^a-z0-9 _-]/g, '').slice(0, 24)); req.store.save(); const s = db.settings; const rules = bookingRules(db); const pol = feePolicy(db);
  const showFees = rules.showFees !== false;
  const types = s.visitTypes.filter((v) => v.onlineBookable !== false).map((v) => ({ id: v.id, name: v.name, durationMin: v.durationMin, providerRole: v.providerRole, fee: showFees ? feeFor(db, v, null) : null }));
  res.json({
    branding: brandOf(db.settings),
    practice: { name: s.practice.name, tagline: s.practice.tagline, phone: s.practice.phone, whatsapp: s.practice.whatsapp, email: s.practice.email, address: s.practice.address, hours: s.practice.hours },
    currency: s.locale?.currencySymbol || '₹', timezone: s.locale?.timezone || 'Asia/Kolkata',
    onlineBooking: rules.onlineBooking, showFees, cancelNoticeHours: s.rules?.cancelNoticeHours,
    locations: (s.locations || []).map((l) => ({ id: l.id, name: l.name, address: l.address, phone: l.phone, hours: l.hours || s.practice.hours })),
    providers: s.providers.map((p) => ({ id: p.id, name: p.name, role: p.role, specialty: p.specialty, qualifications: p.qualifications, locationIds: p.locationIds || [], fee: showFees ? p.consultationFee || 0 : null })),
    visitTypes: types.map((v) => ({ ...v, fees: showFees ? Object.fromEntries(s.providers.filter((p) => !v.providerRole || p.role === v.providerRole).map((p) => [p.id, feeFor(db, s.visitTypes.find((x) => x.id === v.id), p)])) : null })),
    procedures: showFees && pol.quoteToPatients ? procedures(db).filter((p) => p.active !== false && p.quote !== false).map((p) => ({ id: p.id, name: p.name, category: p.category, fee: p.fee, minFee: pol.mode === 'fixed' ? null : p.minFee, maxFee: pol.mode === 'fixed' ? null : p.maxFee })) : [],
    feeNote: pol.quoteNote || '',
    faqs: (s.faqs || []).map((f) => ({ question: f.question, answer: f.answer })),
  });
});

r.get('/slots', (req, res) => {
  const { visitTypeId, providerId, locationId } = req.query;
  if (!visitTypeId) bad('visitTypeId is required');
  trackSite(req.db, 'slots'); // someone is looking at times
  const days = Math.min(Number(req.query.days) || 7, 14);
  const startDay = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.from || '')) ? String(req.query.from) : dayKey(nowIso());
  const out = [];
  for (let i = 0; i < days; i++) {
    const date = dayKey(addDays(startDay + 'T12:00:00', i));
    const slots = slotsForDay(req.db, { date, visitTypeId, providerId: providerId || null, locationId: locationId || null, online: true });
    const seen = new Set(); const list = [];
    for (const sl of slots) { const key = `${sl.start}|${sl.providerId}`; if (!seen.has(key)) { seen.add(key); list.push(sl); } }
    out.push({ date, slots: list });
  }
  res.json({ days: out });
});

r.post('/book', (req, res) => {
  const db = req.db; const b = req.body || {};
  const name = String(b.name || '').trim().replace(/\s+/g, ' ');
  const cc = db.settings.locale?.phoneCountryCode || '91';
  const phone = digits(b.phone, cc);
  if (!name) bad('Please enter your name');
  if (!phone || phone.replace(/\D/g, '').length < 10) bad('Please enter a valid mobile number');
  if (!b.start || !b.visitTypeId || !b.providerId) bad('Please choose a service, dentist and time');
  const vt = visitType(db, b.visitTypeId); provider(db, b.providerId);
  // Re-check against live availability: the slot must still be offered to online patients.
  const date = dayKey(b.start);
  const open = slotsForDay(db, { date, visitTypeId: b.visitTypeId, providerId: b.providerId, locationId: b.locationId || null, online: true });
  const slot = open.find((x) => new Date(x.start).getTime() === new Date(b.start).getTime());
  if (!slot) bad('Sorry, that time was just taken. Please pick another.');
  const [firstName, ...rest] = name.split(' ');
  let p = db.patients.find((x) => digits(x.phone, cc) === phone && x.firstName.toLowerCase() === firstName.toLowerCase());
  if (!p) {
    p = { id: id('pat'), source: String(b.source || 'Website').slice(0, 60), firstName, lastName: rest.join(' ') || '-', dob: b.dob || '', gender: '', phone, email: b.email || '', abhaNumber: '', abhaAddress: '', preferredLanguage: b.language || db.settings.locale?.defaultLanguage || 'en', locationId: slot.locationId, city: '', address: '', insurance: { type: 'self', carrier: '', memberId: '', groupNumber: '', tpa: '', cardScannedAt: null, verified: false }, lastVisit: null, nextRecallDue: null, notes: '', tags: ['online-booking'], createdAt: nowIso() };
    db.patients.push(p); emit(db, 'patient.created', { patient: p, via: 'website' });
  }
  const appt = bookAppointment(db, { patientId: p.id, visitTypeId: vt.id, providerId: slot.providerId, locationId: slot.locationId, start: slot.start, source: 'website', notes: String(b.reason || '').slice(0, 500), by: 'Website' });
  const when = fmtWhen(appt.start);
  sendCommunication(db, { patientId: p.id, type: 'confirmation', channel: db.settings.locale?.defaultChannel, appointmentId: appt.id, by: 'Website', body: `Hi ${p.firstName}, your ${vt.name} at ${db.settings.practice.name} (${location(db, appt.locationId)?.name || ''}) is booked for ${when} with ${provider(db, appt.providerId).name}. Reply here any time to change it.` });
  trackSite(db, 'booking');
  log(db, 'schedule', `${fullName(p)} booked online: ${vt.name} on ${when}`, { patientId: p.id, appointmentId: appt.id });
  req.store.save();
  res.status(201).json({ ok: true, appointmentId: appt.id, when, start: appt.start, visitType: vt.name, provider: provider(db, appt.providerId).name, location: location(db, appt.locationId)?.name || '', fee: appt.fee });
});

export default r;
