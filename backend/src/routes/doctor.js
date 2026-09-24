/** Everything one dentist or hygienist needs: dashboard, patients, visit notes, finish-visit flow, aftercare. */
import { Router } from 'express';
import { id, nowIso, addDays, dayKey, minutesBetween, fullName, find, bad, log } from '../lib.js';
import { arrivalsBoard, setVisitStatus } from '../domain/visits.js';
import { bookAppointment, nextSlots, location } from '../domain/scheduling.js';
import { renderTemplate, sendCommunication, templateBody } from '../domain/messaging.js';
import { estimateAppointment } from '../domain/estimates.js';
import { emit } from '../domain/webhooks.js';
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

export default r;
