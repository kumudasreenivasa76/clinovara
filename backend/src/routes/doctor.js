/** Everything one dentist or hygienist needs: dashboard, patients, visit notes, finish-visit flow, aftercare. */
import { Router } from 'express';
import { id, nowIso, addDays, dayKey, minutesBetween, fullName, find, bad, log } from '../lib.js';
import { arrivalsBoard, setVisitStatus, FORM_SECTIONS, packetStatus } from '../domain/visits.js';
import { bookAppointment, nextSlots, location } from '../domain/scheduling.js';
import { renderTemplate, sendCommunication, templateBody } from '../domain/messaging.js';
import { estimateAppointment } from '../domain/estimates.js';
import { emit } from '../domain/webhooks.js';
import { addCallback } from '../domain/hours.js';
import { procedures as procedureCatalogue, priceItem } from '../domain/catalogue.js';
import { visitBundle, sendToEhr } from '../domain/ehr.js';

const r = Router();

/** Aftercare instructions the doctor can send after a visit. Matched by procedure keywords; editable in Settings. */
export function defaultAftercare() {
  return [
    { id: 'ac_extraction', name: 'After an extraction', keywords: ['extraction', 'wisdom', 'removed', 'nikala'], body: { en: 'Hi {{firstName}}, after today\'s extraction: bite on the gauze for 45 minutes; no spitting, rinsing, straws or smoking for 24 hours; eat soft, cool food today; take the medicines as advised; mild swelling for 2–3 days is normal. Call us if bleeding does not stop or pain gets worse after day 3. — {{provider}}, {{practice}}', hi: 'नमस्ते {{firstName}}, आज दाँत निकलवाने के बाद: 45 मिनट गॉज़ दबाकर रखें; 24 घंटे थूकना, कुल्ला, स्ट्रॉ या धूम्रपान न करें; आज नरम, ठंडा भोजन लें; बताई गई दवाइयाँ लें; 2–3 दिन हल्की सूजन सामान्य है। खून न रुके या तीसरे दिन के बाद दर्द बढ़े तो हमें कॉल करें। — {{provider}}, {{practice}}' } },
    { id: 'ac_rct', name: 'After a root canal sitting', keywords: ['root canal', 'rct', 'pulp'], body: { en: 'Hi {{firstName}}, after today\'s root canal sitting: avoid chewing on that side until the tooth is finally restored; some tenderness for 2–3 days is normal; take painkillers as advised; keep the temporary filling clean. Your next sitting is important — please keep it. — {{provider}}, {{practice}}', hi: 'नमस्ते {{firstName}}, आज रूट कैनाल की सिटिंग के बाद: जब तक दाँत पूरी तरह भर न जाए उस तरफ से न चबाएँ; 2–3 दिन हल्का दर्द सामान्य है; बताई गई दर्द की दवा लें; अस्थायी फिलिंग को साफ रखें। अगली सिटिंग ज़रूरी है, कृपया समय पर आएँ। — {{provider}}, {{practice}}' } },
    { id: 'ac_filling', name: 'After a filling', keywords: ['filling', 'composite', 'gic', 'restoration'], body: { en: 'Hi {{firstName}}, after today\'s filling: wait until the numbness wears off before eating (about 2 hours); mild sensitivity to hot or cold for a few days is normal; if your bite feels high or uneven, tell us and we will adjust it. — {{provider}}, {{practice}}', hi: 'नमस्ते {{firstName}}, आज फिलिंग के बाद: सुन्नपन खत्म होने तक (लगभग 2 घंटे) कुछ न खाएँ; कुछ दिन गर्म-ठंडे से हल्की संवेदनशीलता सामान्य है; काटने पर ऊँचा लगे तो बताएँ, हम ठीक कर देंगे। — {{provider}}, {{practice}}' } },
    { id: 'ac_cleaning', name: 'After a cleaning', keywords: ['cleaning', 'scaling', 'polish'], body: { en: 'Hi {{firstName}}, thanks for coming in for your cleaning. Slight sensitivity or gum tenderness for a day or two is normal. Brush twice a day with a soft brush, floss daily, and we will see you again in 6 months. — {{provider}}, {{practice}}', hi: 'नमस्ते {{firstName}}, सफाई के लिए आने के लिए धन्यवाद। एक-दो दिन हल्की संवेदनशीलता या मसूड़ों में दर्द सामान्य है। नरम ब्रश से दिन में दो बार ब्रश करें, रोज़ फ्लॉस करें, और 6 महीने बाद फिर मिलते हैं। — {{provider}}, {{practice}}' } },
    { id: 'ac_crown', name: 'After a crown or bridge', keywords: ['crown', 'bridge', 'cap', 'veneer'], body: { en: 'Hi {{firstName}}, with your temporary crown: avoid sticky and hard foods on that side, floss carefully by pulling the floss out sideways, and if it comes off keep it and call us. After the final crown is fitted, treat it like a natural tooth. — {{provider}}, {{practice}}', hi: 'नमस्ते {{firstName}}, अस्थायी क्राउन के साथ: उस तरफ चिपचिपा या सख्त खाना न खाएँ, फ्लॉस को बगल से निकालें, और अगर निकल जाए तो संभालकर रखें और हमें कॉल करें। स्थायी क्राउन लगने के बाद इसे प्राकृतिक दाँत की तरह रखें। — {{provider}}, {{practice}}' } },
    { id: 'ac_implant', name: 'After implant surgery', keywords: ['implant'], body: { en: 'Hi {{firstName}}, after implant surgery: apply a cold pack on and off for the first day, eat soft food for a week, do not disturb the area with your tongue or brush, use the mouthwash as advised, and take all medicines. Some swelling is normal for 3 days. Call us for fever, heavy bleeding or severe pain. — {{provider}}, {{practice}}', hi: 'नमस्ते {{firstName}}, इम्प्लांट सर्जरी के बाद: पहले दिन रुक-रुक कर ठंडी सिकाई करें, एक हफ्ते नरम भोजन लें, जगह को जीभ या ब्रश से न छेड़ें, बताया गया माउथवॉश उपयोग करें और सभी दवाइयाँ लें। 3 दिन तक सूजन सामान्य है। बुखार, ज़्यादा खून या तेज़ दर्द हो तो कॉल करें। — {{provider}}, {{practice}}' } },
    { id: 'ac_ortho', name: 'After braces or aligner adjustment', keywords: ['braces', 'aligner', 'wire', 'ortho', 'adjust'], body: { en: 'Hi {{firstName}}, after today\'s adjustment: soreness for 2–3 days is normal, soft food helps; use wax on any bracket that rubs; brush after every meal; wear your aligners 22 hours a day. Next adjustment in about 4–6 weeks. — {{provider}}, {{practice}}', hi: 'नमस्ते {{firstName}}, आज एडजस्टमेंट के बाद: 2–3 दिन दर्द सामान्य है, नरम भोजन मदद करेगा; रगड़ने वाले ब्रैकेट पर वैक्स लगाएँ; हर भोजन के बाद ब्रश करें; अलाइनर दिन में 22 घंटे पहनें। अगला एडजस्टमेंट 4–6 हफ्ते में। — {{provider}}, {{practice}}' } },
    { id: 'ac_whitening', name: 'After whitening', keywords: ['whitening', 'bleach'], body: { en: 'Hi {{firstName}}, after whitening: for 48 hours avoid tea, coffee, red wine, turmeric-heavy food and smoking; sensitivity for a day or two is normal, a sensitivity toothpaste helps. — {{provider}}, {{practice}}', hi: 'नमस्ते {{firstName}}, व्हाइटनिंग के बाद: 48 घंटे चाय, कॉफी, हल्दी वाला खाना और धूम्रपान से बचें; एक-दो दिन संवेदनशीलता सामान्य है, सेंसिटिविटी टूथपेस्ट मदद करेगा। — {{provider}}, {{practice}}' } },
    { id: 'ac_general', name: 'General post-visit note', keywords: [], body: { en: 'Hi {{firstName}}, thank you for visiting {{practice}} today. Follow the advice we discussed, take any medicines as prescribed, and reply here if anything worries you. — {{provider}}', hi: 'नमस्ते {{firstName}}, आज {{practice}} आने के लिए धन्यवाद। बताई गई सलाह का पालन करें, दवाइयाँ निर्देशानुसार लें, और कोई चिंता हो तो यहाँ जवाब दें। — {{provider}}' } },
  ];
}
const aftercareList = (db) => (db.settings.aftercare ||= defaultAftercare());

function providerFor(req) {
  const providerId = req.query.providerId || req.body?.providerId || req.membership?.providerId || null;
  return providerId ? find(req.db.settings.providers, providerId, 'Provider') : null;
}

r.get('/dashboard', (req, res) => {
  const db = req.db; const now = nowIso(); const today = dayKey(now);
  const days = Math.min(365, Number(req.query.days || 30));
  const prov = providerFor(req);
  if (!prov) return res.json({ provider: null, providers: db.settings.providers });
  const mine = db.appointments.filter((a) => a.providerId === prov.id);
  const since = addDays(now, -days);
  const inWindow = mine.filter((a) => a.start >= since && a.start <= now);
  const completed = inWindow.filter((a) => a.status === 'completed');
  const noShows = inWindow.filter((a) => a.status === 'no_show');
  const cancelled = mine.filter((a) => a.status === 'cancelled' && a.cancelledAt >= since);
  const collected = mine.filter((a) => a.paymentStatus === 'paid' && a.paidAt && a.paidAt >= since).reduce((s, a) => s + (a.paidAmount || 0), 0);
  const patientIds = new Set(mine.map((a) => a.patientId));
  const myPatients = db.patients.filter((p) => patientIds.has(p.id));
  const board = arrivalsBoard(db, today).filter((x) => x.appointment.providerId === prov.id).map((x) => ({ ...x, alerts: alertsFor(db, x.patient), chiefComplaint: complaintFor(db, x.patient), notes: x.visit?.doctorNotes || null }));
  const week = [];
  for (let i = 0; i < 7; i++) {
    const d = dayKey(addDays(today + 'T12:00:00', i));
    const appts = mine.filter((a) => dayKey(a.start) === d && !['cancelled'].includes(a.status));
    const blocks = (db.blocks || []).filter((b) => b.providerId === prov.id && dayKey(b.start) === d);
    week.push({ day: d, count: appts.length, minutes: appts.reduce((s, a) => s + minutesBetween(a.start, a.end), 0), blocks: blocks.map((b) => b.reason || 'Blocked'), first: appts.sort((x, y) => x.start.localeCompare(y.start))[0]?.start || null, closed: !location(db, prov.locationIds?.[0]) && false });
  }
  const upcoming = mine.filter((a) => ['scheduled', 'confirmed'].includes(a.status) && a.start > now).sort((x, y) => x.start.localeCompare(y.start)).slice(0, 12).map((a) => ({ ...a, patient: db.patients.find((p) => p.id === a.patientId), visitType: db.settings.visitTypes.find((v) => v.id === a.visitTypeId), location: location(db, a.locationId), packet: db.formPackets.find((k) => k.appointmentId === a.id)?.status || null }));
  const plans = db.treatmentPlans.filter((t) => t.providerId === prov.id).map((t) => ({ ...t, patient: db.patients.find((p) => p.id === t.patientId), openItems: t.items.filter((i) => ['recommended', 'accepted'].includes(i.status)), openQuestions: t.patientQuestions.filter((q) => !q.answer), value: t.items.filter((i) => ['recommended', 'accepted'].includes(i.status)).reduce((s, i) => s + (i.estCost || 0), 0) }));
  const escalations = db.conversations.filter((c) => c.status === 'needs_staff' && c.patientId && patientIds.has(c.patientId)).map((c) => ({ id: c.id, contactName: c.contactName, reason: c.escalation?.reason || c.reason, at: c.escalation?.at || c.updatedAt, lastMessage: c.messages.filter((m) => m.from === 'patient').slice(-1)[0]?.text || '' }));
  const recallsDue = myPatients.filter((p) => p.nextRecallDue && p.nextRecallDue < today && !db.appointments.some((a) => a.patientId === p.id && ['scheduled', 'confirmed'].includes(a.status) && a.start > now)).map((p) => ({ id: p.id, name: fullName(p), dueOn: p.nextRecallDue }));
  const procedures = {};
  for (const a of completed) { const vt = db.settings.visitTypes.find((v) => v.id === a.visitTypeId)?.name || a.visitTypeId; procedures[vt] = (procedures[vt] || 0) + 1; }
  res.json({
    provider: prov, providers: db.settings.providers, windowDays: days, visitTypes: db.settings.visitTypes, aftercare: aftercareList(db).map((a) => ({ id: a.id, name: a.name })), procedures: procedureCatalogue(db).filter((p) => p.active !== false), feePolicy: db.settings.fees,
    today: { board, waiting: board.filter((x) => x.visit && ['ready', 'arrived', 'checking_in', 'needs_attention', 'called'].includes(x.stage)).length, done: board.filter((x) => x.stage === 'done').length, total: board.length, collected: board.filter((x) => x.appointment.paymentStatus === 'paid' && (x.appointment.paidAt || '').slice(0, 10) === today).reduce((s, x) => s + (x.appointment.paidAmount || 0), 0) },
    week, upcoming,
    stats: { completed: completed.length, noShows: noShows.length, cancelled: cancelled.length, noShowRate: inWindow.length ? Math.round((noShows.length / inWindow.length) * 100) : 0, collected, patients: myPatients.length, newPatients: myPatients.filter((p) => p.createdAt >= since).length, avgMinutes: completed.length ? Math.round(completed.reduce((s, a) => s + minutesBetween(a.start, a.end), 0) / completed.length) : 0, procedures },
    plans: { open: plans.filter((t) => t.openItems.length && !t.nextVisitScheduled), questions: plans.flatMap((t) => t.openQuestions.map((q) => ({ ...q, planId: t.id, patient: t.patient }))), all: plans.length, value: plans.filter((t) => t.openItems.length).reduce((s, t) => s + t.value, 0) },
    escalations, recallsDue,
    blocks: (db.blocks || []).filter((b) => b.providerId === prov.id && b.end >= now).sort((x, y) => x.start.localeCompare(y.start)).slice(0, 6),
  });
});

function latestPacket(db, patientId) { return db.formPackets.filter((k) => k.patientId === patientId).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))[0] || null; }
function complaintFor(db, patient) { if (!patient) return ''; const pk = latestPacket(db, patient.id); return pk?.sections.dentalConcerns?.data?.concerns || ''; }
export function alertsFor(db, patient) {
  if (!patient) return [];
  const pk = latestPacket(db, patient.id); if (!pk) return [];
  const m = pk.sections.medicalHistory?.data || {}; const meds = pk.sections.medications?.data || {}; const al = pk.sections.allergies?.data || {}; const dc = pk.sections.dentalConcerns?.data || {};
  const out = [];
  for (const c of m.conditions || []) out.push({ text: c, level: /heart|bleeding|diabetes|epilepsy/i.test(c) ? 'high' : 'medium' });
  if (meds.bloodThinners === 'yes') out.push({ text: 'On blood thinners', level: 'high' });
  if (al.list && !/^none$/i.test(String(al.list).trim())) out.push({ text: `Allergy: ${al.list}`, level: 'high' });
  if (al.latex === 'yes') out.push({ text: 'Latex allergy', level: 'high' });
  if (m.pregnant === 'yes') out.push({ text: 'Pregnant or nursing', level: 'medium' });
  if (m.smoker && m.smoker !== 'no') out.push({ text: `Tobacco: ${m.smoker}`, level: 'low' });
  if (dc.anxiety === 'very') out.push({ text: 'Very anxious', level: 'medium' });
  if (meds.list && !/^none$/i.test(String(meds.list).trim())) out.push({ text: `Medicines: ${meds.list}`, level: 'low' });
  return out;
}

/** My patients: everyone this dentist has seen or will see. */
r.get('/patients', (req, res) => {
  const db = req.db; const prov = providerFor(req); if (!prov) bad('providerId required');
  const q = String(req.query.q || '').toLowerCase();
  const ids = new Set(db.appointments.filter((a) => a.providerId === prov.id).map((a) => a.patientId));
  const now = nowIso();
  const list = db.patients.filter((p) => ids.has(p.id) && (!q || fullName(p).toLowerCase().includes(q) || (p.phone || '').includes(q))).map((p) => {
    const appts = db.appointments.filter((a) => a.patientId === p.id && a.providerId === prov.id);
    const last = appts.filter((a) => a.status === 'completed').sort((x, y) => y.start.localeCompare(x.start))[0];
    const next = appts.filter((a) => ['scheduled', 'confirmed'].includes(a.status) && a.start > now).sort((x, y) => x.start.localeCompare(y.start))[0];
    const plan = db.treatmentPlans.find((t) => t.patientId === p.id && t.items.some((i) => ['recommended', 'accepted'].includes(i.status)));
    return { id: p.id, name: fullName(p), dob: p.dob, phone: p.phone, lang: p.preferredLanguage, lastVisit: last?.start || null, lastVisitType: last ? db.settings.visitTypes.find((v) => v.id === last.visitTypeId)?.name : null, nextVisit: next?.start || null, openPlan: plan ? plan.items.filter((i) => ['recommended', 'accepted'].includes(i.status)).map((i) => i.procedure).join(', ') : '', alerts: alertsFor(db, p).filter((a) => a.level === 'high').length, visits: appts.filter((a) => a.status === 'completed').length };
  }).sort((a, b) => (b.lastVisit || '').localeCompare(a.lastVisit || ''));
  res.json(list);
});

/** Chart for one patient as the doctor sees it. */
r.get('/chart/:patientId', (req, res) => {
  const db = req.db; const p = find(db.patients, req.params.patientId, 'Patient');
  const pk = latestPacket(db, p.id);
  const visits = db.visits.filter((v) => v.patientId === p.id).map((v) => { const a = db.appointments.find((x) => x.id === v.appointmentId); return { ...v, appointment: a, visitType: db.settings.visitTypes.find((x) => x.id === a?.visitTypeId)?.name, provider: db.settings.providers.find((x) => x.id === a?.providerId)?.name }; }).sort((x, y) => y.arrivedAt.localeCompare(x.arrivedAt));
  const ehrOutbox = (db.ehrOutbox || []).filter((e) => e.patientId === p.id).slice(0, 10).map(({ bundle, ...rest }) => { void bundle; return rest; });
  res.json({ patient: p, alerts: alertsFor(db, p), forms: pk ? { updatedAt: pk.updatedAt, medicalHistory: pk.sections.medicalHistory?.data || {}, dentalConcerns: pk.sections.dentalConcerns?.data || {}, medications: pk.sections.medications?.data || {}, allergies: pk.sections.allergies?.data || {} } : null, plans: db.treatmentPlans.filter((t) => t.patientId === p.id).map((t) => ({ ...t, provider: db.settings.providers.find((x) => x.id === t.providerId)?.name })), visits, appointments: db.appointments.filter((a) => a.patientId === p.id).sort((x, y) => y.start.localeCompare(x.start)).map((a) => ({ ...a, visitType: db.settings.visitTypes.find((v) => v.id === a.visitTypeId)?.name, provider: db.settings.providers.find((x) => x.id === a.providerId)?.name })), communications: db.communications.filter((c) => c.patientId === p.id).slice(0, 20), ehrOutbox });
});

/** Save visit notes at any time during the visit. */
r.patch('/visits/:visitId/notes', (req, res) => {
  const v = find(req.db.visits, req.params.visitId, 'Visit');
  v.doctorNotes = { ...(v.doctorNotes || {}), ...(req.body || {}), updatedAt: nowIso(), by: req.user };
  req.store.save(); res.json(v);
});

/** Aftercare suggestion for what was done. */
r.get('/aftercare', (req, res) => {
  const db = req.db; const text = String(req.query.q || '').toLowerCase();
  const list = aftercareList(db);
  const hit = list.find((a) => a.keywords.some((k) => text.includes(k))) || list.find((a) => a.id === 'ac_general');
  const patient = req.query.patientId ? db.patients.find((p) => p.id === req.query.patientId) : null;
  const prov = providerFor(req);
  const lang = patient?.preferredLanguage || 'en';
  res.json({ suggested: hit.id, options: list.map((a) => ({ id: a.id, name: a.name, body: renderTemplate(db, templateBody(db, a, lang), { patient, provider: prov }) })), lang });
});

/**
 * Finish a visit in one go: notes, treatment recommended, next visit, aftercare message, mark done.
 * Everything is optional except marking the visit done; each part is written through the normal domain rules.
 */
r.post('/visits/:visitId/finish', (req, res) => {
  const db = req.db; const v = find(db.visits, req.params.visitId, 'Visit'); const a = find(db.appointments, v.appointmentId, 'Appointment');
  const patient = find(db.patients, v.patientId, 'Patient'); const prov = db.settings.providers.find((p) => p.id === a.providerId);
  const b = req.body || {}; const result = {};
  v.doctorNotes = { ...(v.doctorNotes || {}), chiefComplaint: b.chiefComplaint || v.doctorNotes?.chiefComplaint || '', findings: b.findings || '', procedureDone: b.procedureDone || '', advice: b.advice || '', medicines: b.medicines || '', updatedAt: nowIso(), by: req.user };
  const planItems = Array.isArray(b.plan) ? b.plan.filter((i) => i.procedure || i.procedureId) : [];
  if (planItems.length) {
    let tp = db.treatmentPlans.find((t) => t.patientId === patient.id && t.providerId === a.providerId && !t.nextVisitScheduled && t.items.some((i) => ['recommended', 'accepted'].includes(i.status)));
    if (!tp) { tp = { id: id('tp'), patientId: patient.id, appointmentId: a.id, providerId: a.providerId, createdAt: nowIso(), createdBy: req.user, approvedBy: prov?.name || req.user, approvedAt: nowIso(), items: [], patientQuestions: [], nextSteps: b.nextSteps || '', nextVisitScheduled: false, nextAppointmentId: null, followUps: [] }; db.treatmentPlans.unshift(tp); emit(db, 'treatment_plan.created', { plan: tp }); }
    for (const i of planItems) tp.items.push({ id: id('tpi'), ...priceItem(db, i, { by: 'dentist' }), tooth: i.tooth || '', priority: i.priority || 'recommended', status: 'recommended' });
    if (b.nextSteps) tp.nextSteps = b.nextSteps;
    result.planId = tp.id;
  }
  if (b.nextVisit?.mode === 'book' && b.nextVisit.visitTypeId) {
    const fromDate = dayKey(addDays(nowIso(), Number(b.nextVisit.inDays) || 14));
    const est = estimateAppointment(db, { visitTypeId: b.nextVisit.visitTypeId, providerId: a.providerId, patientId: patient.id, notes: b.nextVisit.notes || '' });
    const slots = nextSlots(db, { visitTypeId: b.nextVisit.visitTypeId, providerId: a.providerId, locationId: a.locationId, fromDate, limit: 1, durationMin: est.minutes });
    if (slots.length) { const appt = bookAppointment(db, { patientId: patient.id, visitTypeId: b.nextVisit.visitTypeId, providerId: a.providerId, locationId: a.locationId, start: slots[0].start, notes: b.nextVisit.notes || '', by: req.user, durationMin: est.minutes }); result.nextAppointment = appt; if (result.planId) { const tp = db.treatmentPlans.find((t) => t.id === result.planId); tp.nextVisitScheduled = true; tp.nextAppointmentId = appt.id; } }
    else result.nextVisitNote = 'No free slot found in that window; the front desk has been asked to book.';
  }
  if (b.nextVisit?.mode === 'desk' || result.nextVisitNote) {
    db.callbacks ||= []; db.callbacks.unshift({ id: id('cb'), source: 'book_next', patientId: patient.id, appointmentId: a.id, contactName: fullName(patient), contactPhone: patient.phone, reason: `${prov?.name || 'Doctor'} asks to book: ${b.nextVisit?.notes || db.settings.visitTypes.find((x) => x.id === b.nextVisit?.visitTypeId)?.name || 'follow-up'} in about ${b.nextVisit?.inDays || 14} days`, channel: 'whatsapp', priority: 'normal', status: 'open', createdAt: nowIso(), dueBy: nowIso(), attempts: [] });
    result.deskAsked = true;
  }
  if (b.aftercare?.body?.trim()) { sendCommunication(db, { patientId: patient.id, type: 'aftercare', body: b.aftercare.body.trim(), appointmentId: a.id, by: prov?.name || req.user }); result.aftercareSent = true; }
  if (v.status !== 'done') setVisitStatus(db, v.id, 'done', { by: req.user });
  if (b.closeCase) { v.doctorNotes.closing = { outcome: b.closeCase.outcome || '', notes: b.closeCase.notes || '', at: nowIso(), by: req.user }; if (result.planId) { const tp = db.treatmentPlans.find((t) => t.id === result.planId); tp.status = 'closed'; tp.closedAt = nowIso(); tp.closedBy = req.user; } result.caseClosed = true; }
  if (b.sendToEhr !== false) {
    const bundle = visitBundle(db, { visitId: v.id, planId: result.planId || null, closing: b.closeCase || null, by: req.user });
    const entry = sendToEhr(db, { bundle, reason: b.closeCase ? 'Case closed' : 'Visit finished', patientId: patient.id, visitId: v.id, planId: result.planId || null, by: prov?.name || req.user });
    result.ehr = { id: entry.id, status: entry.status, target: entry.target, note: entry.note || null };
  }
  log(db, 'visit', `${req.user} finished the visit for ${fullName(patient)}${b.procedureDone ? `: ${b.procedureDone}` : ''}${b.closeCase ? ' and closed the case' : ''}`, { patientId: patient.id, appointmentId: a.id });
  req.store.save();
  res.json({ ok: true, ...result, visit: v });
});

/** Send one patient's record to the connected EHR on demand (chart button, or after adding a late note). */
r.post('/patients/:patientId/send-to-ehr', (req, res) => {
  const db = req.db; const patient = find(db.patients, req.params.patientId, 'Patient');
  const b = req.body || {};
  const bundle = visitBundle(db, { visitId: b.visitId || null, planId: b.planId || null, by: req.user });
  const entry = sendToEhr(db, { bundle, reason: b.reason || 'Manual export', patientId: patient.id, visitId: b.visitId || null, planId: b.planId || null, by: req.user });
  req.store.save();
  res.status(201).json({ id: entry.id, status: entry.status, target: entry.target, note: entry.note || null });
});

/* ---------- Appointment tracking ---------- */
const STAGE = { scheduled: 'Booked', confirmed: 'Confirmed', arrived: 'Arrived', checked_in: 'Checked in', ready: 'Ready', in_chair: 'In chair', completed: 'Completed', no_show: 'No-show', cancelled: 'Cancelled' };
const sinceFor = (q) => { const days = Math.min(365, Number(q.days || 30)); return { days, from: addDays(nowIso(), -days) }; };

/** Every appointment of this dentist across a window (past and future) with forms, payment and visit stage. */
r.get('/appointments', (req, res) => {
  const db = req.db; const prov = providerFor(req); if (!prov) bad('providerId required');
  const { from } = sinceFor(req.query); const to = addDays(nowIso(), Math.min(180, Number(req.query.ahead || 30)));
  const share = Number(prov.revenueSharePct ?? 100);
  const list = db.appointments.filter((a) => a.providerId === prov.id && a.start >= from && a.start <= to).sort((a, b) => b.start.localeCompare(a.start)).map((a) => {
    const patient = db.patients.find((p) => p.id === a.patientId); const visit = db.visits.find((v) => v.appointmentId === a.id);
    const pk = db.formPackets.find((k) => k.appointmentId === a.id);
    return {
      id: a.id, patientId: a.patientId, patient: fullName(patient), phone: patient?.phone || '', start: a.start, end: a.end, status: a.status, stage: STAGE[a.status] || a.status,
      visitType: db.settings.visitTypes.find((v) => v.id === a.visitTypeId)?.name || a.visitTypeId, location: location(db, a.locationId)?.name || '', source: a.source,
      token: visit?.token || null, visitStatus: visit?.status || null, fee: a.fee || 0, paymentStatus: a.paymentStatus, paid: a.paidAmount || 0, earned: Math.round((a.paidAmount || 0) * share / 100),
      forms: pk ? packetStatus(pk) : 'none', cancelReason: a.cancelReason || null,
      timeline: [['Booked', a.createdAt], ['Confirmed', a.confirmedAt], ['Arrived', visit?.arrivedAt], ['Paid', a.paidAt], ['Cancelled', a.cancelledAt]].filter((x) => x[1]).map(([label, at]) => ({ label, at })),
    };
  });
  const count = (st) => list.filter((a) => st.includes(a.status)).length;
  const future = (a) => a.start > nowIso();
  res.json({ appointments: list, counts: { upcoming: list.filter((a) => future(a) && ['scheduled', 'confirmed'].includes(a.status)).length, completed: count(['completed']), noShow: count(['no_show']), cancelled: count(['cancelled']), unconfirmed: list.filter((a) => future(a) && a.status === 'scheduled').length, formsMissing: list.filter((a) => future(a) && ['scheduled', 'confirmed'].includes(a.status) && a.forms !== 'complete').length } });
});

/* ---------- Earnings ---------- */
r.get('/earnings', (req, res) => {
  const db = req.db; const prov = providerFor(req); if (!prov) bad('providerId required');
  const { days, from } = sinceFor(req.query);
  const share = Number(prov.revenueSharePct ?? 100);
  const mine = db.appointments.filter((a) => a.providerId === prov.id);
  const paid = mine.filter((a) => a.paymentStatus === 'paid' && a.paidAt && a.paidAt >= from);
  const gross = paid.reduce((s, a) => s + (a.paidAmount || 0), 0);
  const pending = mine.filter((a) => a.status === 'completed' && a.paymentStatus !== 'paid' && a.start >= from);
  const byDay = {}; for (const a of paid) { const d = dayKey(a.paidAt); byDay[d] = (byDay[d] || 0) + (a.paidAmount || 0); }
  const byType = {}; const byMode = {};
  for (const a of paid) { const n = db.settings.visitTypes.find((v) => v.id === a.visitTypeId)?.name || a.visitTypeId; byType[n] ||= { count: 0, gross: 0 }; byType[n].count++; byType[n].gross += a.paidAmount || 0; byMode[a.paymentMode || 'other'] = (byMode[a.paymentMode || 'other'] || 0) + (a.paidAmount || 0); }
  const today = dayKey(nowIso()); const month = today.slice(0, 7);
  const sum = (arr) => arr.reduce((s, a) => s + (a.paidAmount || 0), 0);
  res.json({
    windowDays: days, sharePct: share, gross, earned: Math.round(gross * share / 100), clinicShare: Math.round(gross * (100 - share) / 100), visitsPaid: paid.length, avgPerVisit: paid.length ? Math.round(gross / paid.length) : 0,
    todayGross: sum(mine.filter((a) => a.paidAt && dayKey(a.paidAt) === today)), monthGross: sum(mine.filter((a) => a.paidAt && a.paidAt.slice(0, 7) === month)),
    pendingAmount: pending.reduce((s, a) => s + (a.fee || 0), 0), pendingCount: pending.length,
    pending: pending.slice(0, 20).map((a) => ({ id: a.id, patient: fullName(db.patients.find((p) => p.id === a.patientId)), start: a.start, fee: a.fee || 0 })),
    byDay: Object.entries(byDay).sort().map(([date, amount]) => ({ date, amount })),
    byType: Object.entries(byType).map(([name, v]) => ({ name, ...v, earned: Math.round(v.gross * share / 100) })).sort((a, b) => b.gross - a.gross),
    byMode: Object.entries(byMode).map(([mode, amount]) => ({ mode, amount })),
    pipeline: db.treatmentPlans.filter((t) => t.providerId === prov.id).reduce((s, t) => s + t.items.filter((i) => ['recommended', 'accepted'].includes(i.status)).reduce((x, i) => x + (Number(i.fee) || 0), 0), 0),
  });
});

r.get('/earnings.csv', (req, res) => {
  const db = req.db; const prov = providerFor(req); if (!prov) bad('providerId required');
  const { from } = sinceFor(req.query); const share = Number(prov.revenueSharePct ?? 100);
  const esc = (v) => { const t = v == null ? '' : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const rows = [['Date paid', 'Receipt', 'Patient', 'Visit type', 'Mode', 'Amount', `Your share (${share}%)`].join(',')];
  for (const a of db.appointments.filter((x) => x.providerId === prov.id && x.paymentStatus === 'paid' && x.paidAt >= from).sort((x, y) => x.paidAt.localeCompare(y.paidAt))) {
    rows.push([dayKey(a.paidAt), a.receiptNo || '', fullName(db.patients.find((p) => p.id === a.patientId)), db.settings.visitTypes.find((v) => v.id === a.visitTypeId)?.name || '', a.paymentMode || '', a.paidAmount || 0, Math.round((a.paidAmount || 0) * share / 100)].map(esc).join(','));
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename="earnings.csv"'); res.send(rows.join('\n'));
});

/* ---------- Forms & clinical documents ---------- */
/** Pre-visit form status for this dentist's upcoming and recent patients. */
r.get('/forms', (req, res) => {
  const db = req.db; const prov = providerFor(req); if (!prov) bad('providerId required');
  const from = addDays(nowIso(), -14);
  const rows = db.appointments.filter((a) => a.providerId === prov.id && a.start >= from && a.status !== 'cancelled').sort((a, b) => a.start.localeCompare(b.start)).map((a) => {
    const pk = db.formPackets.find((k) => k.appointmentId === a.id); const patient = db.patients.find((p) => p.id === a.patientId);
    return { appointmentId: a.id, patientId: a.patientId, patient: fullName(patient), start: a.start, status: pk ? packetStatus(pk) : 'none', token: pk?.token || null,
      sections: FORM_SECTIONS.map((sec) => ({ key: sec.key, label: sec.label, complete: !!pk?.sections[sec.key]?.complete, data: pk?.sections[sec.key]?.data || {} })) };
  });
  res.json({ forms: rows });
});

export const DOC_KINDS = [
  { id: 'prescription', name: 'Prescription' }, { id: 'certificate', name: 'Dental / medical certificate' }, { id: 'referral', name: 'Referral letter' },
  { id: 'consent', name: 'Procedure consent' }, { id: 'estimate', name: 'Treatment estimate' }, { id: 'instructions', name: 'Patient instructions' },
];
function docTemplate(db, prov, patient, kind) {
  const clinic = db.settings.practice; const date = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const name = fullName(patient); const sym = db.settings.locale?.currencySymbol || '₹';
  const head = `${clinic.name}\n${clinic.address || ''}\n${clinic.phone || ''}\n\n${prov.name}${prov.qualifications ? `, ${prov.qualifications}` : ''}${prov.councilRegNo ? `\nReg. No. ${prov.councilRegNo}` : ''}\nDate: ${date}\nPatient: ${name}${patient.dob ? ` (DOB ${patient.dob})` : ''}\n\n`;
  const plan = db.treatmentPlans.find((t) => t.patientId === patient.id && t.items.some((i) => ['recommended', 'accepted'].includes(i.status)));
  const items = plan ? plan.items.filter((i) => ['recommended', 'accepted'].includes(i.status)) : [];
  const body = {
    prescription: 'Rx\n\n1. \n2. \n3. \n\nAdvice: \nReview after: ',
    certificate: `This is to certify that ${name} attended ${clinic.name} on ${date} and received dental treatment/consultation. The patient is advised rest from ___ to ___ (___ days).\n\nDiagnosis / treatment: `,
    referral: `To: Dr. ____________\n\nDear Colleague,\nI am referring ${name} for ____________.\n\nFindings: \nTreatment done so far: \nReason for referral: \n\nThank you,`,
    consent: `I, ${name}, have been explained the procedure ____________, its benefits, risks, alternatives and the expected cost by ${prov.name}. I have had the chance to ask questions and I consent to the treatment.\n\nPatient / guardian signature: ____________   Date: ______\nDentist signature: ____________`,
    estimate: items.length ? `Treatment estimate\n\n${items.map((i, n) => `${n + 1}. ${i.procedure || i.name}${i.tooth ? ` (tooth ${i.tooth})` : ''} — ${sym}${Number(i.fee || 0).toLocaleString('en-IN')}`).join('\n')}\n\nTotal: ${sym}${items.reduce((s, i) => s + (Number(i.fee) || 0), 0).toLocaleString('en-IN')}\n\n${db.settings.fees?.quoteNote || 'Final fee is confirmed by the dentist.'}` : `Treatment estimate\n\n1. \n\nTotal: ${sym}`,
    instructions: "Instructions after today's visit:\n\n- \n- \n\nCall us if you have severe pain, swelling or bleeding.",
  };
  return head + body[kind];
}
r.get('/documents', (req, res) => {
  const db = req.db; const prov = providerFor(req); if (!prov) bad('providerId required');
  const list = db.documents.filter((d) => d.providerId === prov.id && (!req.query.patientId || d.patientId === req.query.patientId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100).map((d) => ({ ...d, patient: fullName(db.patients.find((p) => p.id === d.patientId)) }));
  res.json({ kinds: DOC_KINDS, documents: list });
});
r.get('/documents/template', (req, res) => {
  const db = req.db; const prov = providerFor(req); if (!prov) bad('providerId required');
  const kind = String(req.query.kind || 'prescription'); if (!DOC_KINDS.some((k) => k.id === kind)) bad('Unknown document type');
  res.json({ text: docTemplate(db, prov, find(db.patients, req.query.patientId, 'Patient'), kind) });
});
r.post('/documents', (req, res) => {
  const db = req.db; const prov = providerFor(req); if (!prov) bad('providerId required');
  const b = req.body || {}; const patient = find(db.patients, b.patientId, 'Patient');
  if (!DOC_KINDS.some((k) => k.id === b.kind)) bad('Unknown document type');
  if (!String(b.text || '').trim()) bad('The document is empty');
  const doc = { id: id('doc'), patientId: patient.id, providerId: prov.id, kind: b.kind, title: DOC_KINDS.find((k) => k.id === b.kind).name, text: String(b.text), createdAt: nowIso(), createdBy: req.user, sentAt: null };
  if (b.send) { sendCommunication(db, { patientId: patient.id, type: 'document', body: `${doc.title} from ${prov.name}:\n\n${doc.text}`, by: prov.name }); doc.sentAt = nowIso(); }
  db.documents.push(doc);
  log(db, 'patient', `${prov.name} issued a ${doc.title.toLowerCase()} for ${fullName(patient)}${doc.sentAt ? ' and sent it' : ''}`, { patientId: patient.id });
  req.store.save(); res.status(201).json(doc);
});

/* ---------- Tooth chart (FDI notation) ---------- */
export const TOOTH_STATUS = ['healthy', 'watch', 'caries', 'filled', 'crown', 'rct', 'implant', 'fracture', 'extraction', 'missing'];
const FDI = new Set([...[1, 2, 3, 4].flatMap((q) => [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `${q}${n}`)), ...[5, 6, 7, 8].flatMap((q) => [1, 2, 3, 4, 5].map((n) => `${q}${n}`))]);
r.get('/teeth/:patientId', (req, res) => {
  const p = find(req.db.patients, req.params.patientId, 'Patient');
  res.json({ teeth: p.teeth || {}, history: (p.toothHistory || []).slice(-30).reverse(), statuses: TOOTH_STATUS });
});
r.put('/teeth/:patientId', (req, res) => {
  const db = req.db; const p = find(db.patients, req.params.patientId, 'Patient'); const b = req.body || {};
  const tooth = String(b.tooth || '');
  if (!FDI.has(tooth)) bad('Unknown tooth number (use FDI, for example 16 or 46)');
  if (!TOOTH_STATUS.includes(b.status)) bad('Unknown tooth status');
  p.teeth ||= {}; p.toothHistory ||= [];
  const prev = p.teeth[tooth]?.status || 'healthy';
  if (b.status === 'healthy' && !b.note) delete p.teeth[tooth]; else p.teeth[tooth] = { status: b.status, note: String(b.note || '').slice(0, 300), updatedAt: nowIso(), by: req.user };
  if (prev !== b.status || b.note) p.toothHistory.push({ tooth, from: prev, to: b.status, note: String(b.note || '').slice(0, 300), at: nowIso(), by: req.user });
  log(db, 'patient', `${req.user} marked tooth ${tooth} ${b.status} for ${fullName(p)}`, { patientId: p.id });
  req.store.save(); res.json({ teeth: p.teeth });
});

/* ---------- Lab cases (crowns, dentures, aligners…) ---------- */
export const LAB_KINDS = ['Crown', 'Bridge', 'Veneer', 'Denture', 'Aligners', 'Night guard', 'Implant abutment', 'Retainer', 'Other'];
export const LAB_FLOW = ['to_send', 'at_lab', 'received', 'fitted'];
const labView = (db, c) => ({ ...c, patient: fullName(db.patients.find((p) => p.id === c.patientId)), overdue: c.status === 'at_lab' && c.dueDate && c.dueDate < dayKey(nowIso()) });
r.get('/lab', (req, res) => {
  const db = req.db; const prov = providerFor(req); if (!prov) bad('providerId required');
  res.json({ kinds: LAB_KINDS, flow: LAB_FLOW, cases: db.labCases.filter((c) => c.providerId === prov.id && !c.archived).sort((a, b) => (a.dueDate || '9').localeCompare(b.dueDate || '9')).map((c) => labView(db, c)) });
});
r.post('/lab', (req, res) => {
  const db = req.db; const prov = providerFor(req); if (!prov) bad('providerId required'); const b = req.body || {};
  const patient = find(db.patients, b.patientId, 'Patient');
  if (!LAB_KINDS.includes(b.kind)) bad('Choose what is being made');
  const c = { id: id('lab'), patientId: patient.id, providerId: prov.id, kind: b.kind, tooth: String(b.tooth || ''), shade: String(b.shade || ''), lab: String(b.lab || ''), dueDate: b.dueDate || '', notes: String(b.notes || '').slice(0, 500), status: 'to_send', createdAt: nowIso(), history: [{ status: 'to_send', at: nowIso(), by: req.user }] };
  db.labCases.push(c); log(db, 'patient', `${prov.name} created a lab case (${c.kind}${c.tooth ? ` ${c.tooth}` : ''}) for ${fullName(patient)}`, { patientId: patient.id });
  req.store.save(); res.status(201).json(labView(db, c));
});
r.patch('/lab/:id', (req, res) => {
  const db = req.db; const c = find(db.labCases, req.params.id, 'Lab case'); const b = req.body || {};
  for (const k of ['lab', 'shade', 'tooth', 'notes', 'dueDate']) if (k in b) c[k] = String(b[k] || '');
  if (b.archive) c.archived = true;
  if (b.status && b.status !== c.status) {
    if (!LAB_FLOW.includes(b.status)) bad('Unknown lab status');
    c.status = b.status; c.history.push({ status: b.status, at: nowIso(), by: req.user });
    const patient = db.patients.find((p) => p.id === c.patientId);
    if (b.status === 'received' && patient) addCallback(db, { source: 'lab_case', patientId: patient.id, contactName: fullName(patient), contactPhone: patient.phone, reason: `${c.kind}${c.tooth ? ` (tooth ${c.tooth})` : ''} is back from the lab. Book the fitting visit.`, priority: 'normal' });
  }
  req.store.save(); res.json(labView(db, c));
});

export default r;
