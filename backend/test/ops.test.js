import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../src/app.js';
import { createRegistry } from '../src/registry.js';
process.env.CLINOVARA_AI = 'rules';
let app, registry, token;
async function raw(method, path, body, headers = {}) {
  const server = app.listen(0); const port = server.address().port;
  try { const res = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined }); const text = await res.text(); let json; try { json = JSON.parse(text); } catch { json = text; } return { status: res.status, body: json, headers: res.headers }; }
  finally { server.close(); }
}
const api = (m, p, b, h = {}) => raw(m, p, b, { authorization: `Bearer ${token}`, ...h });
const pub = (m, p, b, h = {}) => raw(m, p, b, { 'x-tenant': 'smilecare', ...h });
beforeEach(async () => { registry = createRegistry({ memory: true }); app = createApp({ registry, frontendBase: 'http://test/' }); token = (await raw('POST', '/api/auth/demo', {})).body.token; });

describe('after hours, missed calls and missed appointments', () => {
  it('adds the after-hours notice and queues a callback when closed', async () => {
    const s = (await api('GET', '/api/settings')).body;
    const today = new Date().toISOString().slice(0, 10);
    await api('PUT', '/api/settings', { holidays: [...s.holidays, { date: today, name: 'Test closure' }] });
    const r = await pub('POST', '/api/conversations', { channel: 'whatsapp', contactPhone: '9845011001', text: 'My crown came off and it hurts, what should I do?' });
    expect(r.body.reply.text).toMatch(/closed right now/);
    expect(r.body.reply.text).toMatch(/emergency/);
    const cbs = (await api('GET', '/api/callbacks')).body;
    expect(cbs.open).toBe(false);
    expect(cbs.items.some((c) => c.source === 'after_hours' && c.priority === 'high')).toBe(true);
    const faq = await pub('POST', '/api/conversations', { channel: 'web', contactName: 'Q', text: 'timings kya hai?' });
    expect(faq.body.reply.text).toMatch(/closed right now/);
    expect(faq.body.reply.text).toMatch(/9:00 AM/);
  });
  it('logs a missed call, messages the patient, and creates a callback', async () => {
    const r = await api('POST', '/api/callbacks/missed-call', { phone: '+91 98450 11006' });
    expect(r.status).toBe(201);
    expect(r.body.patient.firstName).toBe('Arjun');
    expect(r.body.sentMessage).toMatch(/missed your call|closed now/);
    const cbs = (await api('GET', '/api/callbacks')).body;
    const cb = cbs.items.find((c) => c.source === 'missed_call');
    expect(cb.contactName).toBe('Arjun Nair');
    await api('POST', `/api/callbacks/${cb.id}/attempt`, { outcome: 'spoke', done: true });
    expect((await api('GET', '/api/callbacks')).body.items.some((c) => c.id === cb.id)).toBe(false);
  });
  it('sweeps no-shows after the grace period and starts rebooking follow-up', async () => {
    const patients = (await api('GET', '/api/patients')).body;
    const priya = patients.find((p) => p.firstName === 'Priya');
    const store = registry.tenantStore(registry.tenantBySlug('smilecare').id);
    const start = new Date(Date.now() - 2 * 3600000).toISOString();
    // No-shows are only swept within the clinic's current day, so in the first two hours after midnight there is nothing to test.
    if (new Date(start).toLocaleDateString('en-CA') !== new Date().toLocaleDateString('en-CA')) return;
    store.db.appointments.push({ id: 'apt_past', patientId: priya.id, visitTypeId: 'vt_newpatient', providerId: 'prov_rao', locationId: 'loc_indiranagar', start, end: new Date(Date.now() - 3600000).toISOString(), status: 'confirmed', source: 'staff', reminders: [], createdAt: start, fee: 500, paymentStatus: 'unpaid' });
    const board = (await api('GET', '/api/arrivals')).body;
    expect(board.swept).toBeGreaterThanOrEqual(1);
    expect(board.missedToday).toBeGreaterThanOrEqual(1);
    const a = (await api('GET', '/api/appointments/apt_past')).body;
    expect(a.status).toBe('no_show');
    const comms = (await api('GET', `/api/communications?patientId=${priya.id}&type=missed_appointment`)).body;
    expect(comms.length).toBeGreaterThanOrEqual(1);
    expect(comms[0].body).toMatch(/we missed you/i);
    expect((await api('GET', '/api/callbacks')).body.counts.no_show).toBeGreaterThanOrEqual(1);
  });
});

describe('estimates and calendar', () => {
  it('suggests visit lengths and estimates a specific booking with a breakdown', async () => {
    const vt = (await api('GET', '/api/estimates/visit-types')).body;
    const rct = vt.suggestions.find((x) => x.visitTypeId === 'vt_procedure');
    expect(rct.suggested).toBeGreaterThanOrEqual(10);
    expect(rct.basis).toBeTruthy();
    const patients = (await api('GET', '/api/patients')).body;
    const priya = patients.find((p) => p.firstName === 'Priya');
    const est = (await api('POST', '/api/estimates/appointment', { visitTypeId: 'vt_procedure', providerId: 'prov_menon', patientId: priya.id, notes: 'RCT #36 and crown prep' })).body;
    expect(est.minutes).toBeGreaterThan(60);
    expect(est.breakdown.some((b) => /root canal|rct/.test(b.label))).toBe(true);
    expect(est.breakdown.some((b) => /First visit/.test(b.label))).toBe(true);
    const slot = (await api('GET', `/api/availability?visitTypeId=vt_procedure&providerId=prov_menon&limit=1&durationMin=${est.minutes}`)).body[0];
    const booked = (await api('POST', '/api/appointments', { patientId: priya.id, visitTypeId: 'vt_procedure', providerId: slot.providerId, locationId: slot.locationId, start: slot.start, durationMin: est.minutes, notes: 'RCT #36 and crown prep' })).body;
    expect(Math.round((new Date(booked.end) - new Date(booked.start)) / 60000)).toBe(est.minutes);
    const applied = await api('POST', '/api/estimates/apply', { visitTypeId: 'vt_procedure', durationMin: rct.suggested });
    expect(applied.body.durationMin).toBe(rct.suggested);
  });
  it('serves calendar feeds by key and per-appointment ics', async () => {
    expect((await api('GET', '/api/calendar/feeds')).body.enabled).toBe(false);
    await api('POST', '/api/calendar/key');
    const feeds = (await api('GET', '/api/calendar/feeds')).body;
    expect(feeds.enabled).toBe(true);
    const url = new URL(feeds.feeds.find((f) => f.providerId === 'prov_menon').url);
    const ics = await raw('GET', url.pathname + url.search);
    expect(ics.status).toBe(200);
    expect(ics.body).toMatch(/BEGIN:VCALENDAR/);
    expect(ics.body).toMatch(/Rohan Patil/);
    expect((await raw('GET', url.pathname + '?key=wrong')).status).toBe(401);
    const appt = (await api('GET', '/api/appointments')).body[0];
    const links = (await api('GET', `/api/calendar/links/${appt.id}`)).body;
    expect(links.google).toMatch(/calendar.google.com/);
    const one = await pub('GET', `/api/calendar/appointment/${appt.id}.ics`);
    expect(one.body).toMatch(/SUMMARY:.*SmileCare Dental/);
    expect(one.body).not.toMatch(/\+91 98450/);
  });
});

describe('doctor finish-visit flow', () => {
  it('records notes, recommends treatment, books the next visit, sends aftercare, and marks done', async () => {
    const doc = (await raw('POST', '/api/auth/demo', { role: 'dentist' })).body;
    const D = { authorization: `Bearer ${doc.token}` };
    const dash = (await raw('GET', '/api/doctor/dashboard', null, D)).body;
    expect(dash.provider.id).toBe('prov_menon');
    const row = dash.today.board.find((r) => r.visit?.token === 'A02');
    expect(row.alerts.some((x) => /Penicillin/i.test(x.text) && x.level === 'high')).toBe(true);
    const ac = (await raw('GET', `/api/doctor/aftercare?q=root canal sitting 1&patientId=${row.patient.id}`, null, D)).body;
    expect(ac.suggested).toBe('ac_rct');
    expect(ac.lang).toBe('hi');
    const body = ac.options.find((o) => o.id === ac.suggested).body;
    expect(body).toMatch(/रूट कैनाल/);
    const fin = await raw('POST', `/api/doctor/visits/${row.visit.id}/finish`, { procedureDone: 'RCT #36 sitting 1', findings: 'Irreversible pulpitis 36', advice: 'Soft diet', plan: [{ procedure: 'PFM crown #36', tooth: '36', estCost: 5500 }], nextVisit: { mode: 'book', visitTypeId: 'vt_followup', inDays: 7, notes: 'RCT #36 sitting 2' }, aftercare: { id: 'ac_rct', body } }, D);
    expect(fin.status).toBe(200);
    expect(fin.body.aftercareSent).toBe(true);
    expect(fin.body.nextAppointment).toBeTruthy();
    expect(fin.body.planId).toBeTruthy();
    // Fee catalogue: a fixed-price procedure is normalised to the admin's name and fee, no matter what the dentist typed or quoted.
    expect(fin.body.ehr.status).toBe('queued');
    const chart = (await raw('GET', `/api/doctor/chart/${row.patient.id}`, null, D)).body;
    expect(chart.visits[0].doctorNotes.procedureDone).toBe('RCT #36 sitting 1');
    const crownItem = chart.plans.flatMap((p) => p.items).find((i) => i.procedureId === 'pr_crown_pfm');
    expect(crownItem).toBeTruthy();
    expect(crownItem.procedure).toBe('Crown — PFM (metal-ceramic)');
    expect(crownItem.estCost).toBe(6500); // catalogue fee, not the 5500 the dentist typed
    expect(crownItem.tooth).toBe('36');
    expect(chart.ehrOutbox.length).toBe(1);
    expect(chart.ehrOutbox[0].resources).toContain('Composition');
    const comms = (await raw('GET', `/api/communications?patientId=${row.patient.id}&type=aftercare`, null, D)).body;
    expect(comms.length).toBe(1);
    const mine = (await raw('GET', '/api/doctor/patients', null, D)).body;
    expect(mine.find((p) => p.id === row.patient.id).visits).toBeGreaterThanOrEqual(1);
  });

  it('enforces the fee policy set by the admin (range mode requires a note and a fee inside range)', async () => {
    const doc = (await raw('POST', '/api/auth/demo', { role: 'dentist' })).body;
    const D = { authorization: `Bearer ${doc.token}` };
    const s = (await api('GET', '/api/settings')).body;
    await api('PUT', '/api/settings', { fees: { ...s.fees, mode: 'range' } });
    const dash = (await raw('GET', '/api/doctor/dashboard', null, D)).body;
    const row = dash.today.board.find((r) => r.visit);
    // Outside the catalogue's range, and no note: rejected.
    const bad1 = await raw('POST', `/api/doctor/visits/${row.visit.id}/finish`, { plan: [{ procedureId: 'pr_composite', estCost: 50000 }], sendToEhr: false }, D);
    expect(bad1.status).toBe(400);
    // Inside range but no note: also rejected, because the fee differs from the catalogue default.
    const bad2 = await raw('POST', `/api/doctor/visits/${row.visit.id}/finish`, { plan: [{ procedureId: 'pr_composite', estCost: 1500 }], sendToEhr: false }, D);
    expect(bad2.status).toBe(400);
    // Inside range with a note: accepted.
    const ok = await raw('POST', `/api/doctor/visits/${row.visit.id}/finish`, { plan: [{ procedureId: 'pr_composite', estCost: 1500, note: 'Large cavity, extra material' }], sendToEhr: false }, D);
    expect(ok.status).toBe(200);
    const chart = (await raw('GET', `/api/doctor/chart/${row.patient.id}`, null, D)).body;
    const item = chart.plans.flatMap((p) => p.items).find((i) => i.procedureId === 'pr_composite');
    expect(item.estCost).toBe(1500);
    expect(item.feeSource).toBe('adjusted');
  });

  it('closes a case with notes and queues it for the EHR; the queue can be listed and resent', async () => {
    const doc = (await raw('POST', '/api/auth/demo', { role: 'dentist' })).body;
    const D = { authorization: `Bearer ${doc.token}` };
    const dash = (await raw('GET', '/api/doctor/dashboard', null, D)).body;
    const row = dash.today.board.find((r) => r.visit);
    const fin = await raw('POST', `/api/doctor/visits/${row.visit.id}/finish`, { procedureDone: 'Extraction', plan: [{ procedureId: 'pr_ext_simple' }], closeCase: { outcome: 'resolved', notes: 'Healed well, no further treatment needed' } }, D);
    expect(fin.status).toBe(200);
    expect(fin.body.caseClosed).toBe(true);
    const plan = (await api('GET', `/api/treatment-plans/${fin.body.planId}`)).body;
    expect(plan.status).toBe('closed');
    const outbox = (await api('GET', '/api/integrations/ehr-outbox')).body;
    expect(outbox.some((e) => e.planId === fin.body.planId)).toBe(true);
    const entry = outbox.find((e) => e.planId === fin.body.planId);
    expect(entry.status).toBe('queued');
    const resent = await api('POST', `/api/integrations/ehr-outbox/${entry.id}/resend`);
    expect(resent.status).toBe(200);
  });
});

describe('virtual assistant (after-hours calls, all Indian languages)', () => {
  it('answers a call in Hindi after hours, books an appointment, and takes a note it cannot answer', async () => {
    const s = (await api('GET', '/api/settings')).body;
    const today = new Date().toISOString().slice(0, 10);
    await api('PUT', '/api/settings', { holidays: [...s.holidays, { date: today, name: 'Closed for test' }] });
    const started = await pub('POST', '/api/calls', { phone: '98450 11002', contactName: 'Rohan' });
    expect(started.status).toBe(201);
    expect(started.body.open).toBe(false);
    expect(started.body.say).toMatch(/सहायक/);
    const callId = started.body.call.id;
    const turn = await pub('POST', `/api/calls/${callId}/messages`, { text: 'mujhe cleaning ke liye appointment chahiye kal subah' });
    expect(turn.status).toBe(200);
    expect(turn.body.language).toBe('hi');
    const slotTurn = await pub('POST', `/api/calls/${callId}/messages`, { text: '1' });
    expect(['booked', 'book'].includes(slotTurn.body.intent) || slotTurn.body.actions.some((a) => a.type === 'book')).toBeTruthy();
    const clinical = await pub('POST', `/api/calls/${callId}/messages`, { text: 'should i take ibuprofen for the pain' });
    expect(clinical.body.escalated).toBe(true);
    const ended = await pub('POST', `/api/calls/${callId}/end`, {});
    expect(ended.status).toBe(200);
    expect(ended.body.call.status).toBe('ended');
    expect(ended.body.call.notes.clinicalQuestion).toMatch(/ibuprofen/);
    const list = (await api('GET', '/api/calls')).body;
    expect(list.some((c) => c.id === callId)).toBe(true);
  });

  it("detects several Indian languages from the caller's own words", async () => {
    const { detectLanguage } = await import('../src/domain/assistant.js');
    expect(detectLanguage('क्या आप खुले हैं')).toBe('hi');
    expect(detectLanguage('ನೀವು ತೆರೆದಿದ್ದೀರಾ')).toBe('kn');
    expect(detectLanguage('நீங்கள் திறந்திருக்கிறீர்களா')).toBe('ta');
    expect(detectLanguage('mera daant dukh raha hai')).toBe('hi');
    expect(detectLanguage('hallu novutide')).toBe('kn');
    expect(detectLanguage('hello, are you open')).toBe('en');
  });
});

describe('procedure catalogue export & import', () => {
  it('exports the catalogue as CSV and imports edits back (update by name, add new rows)', async () => {
    const csv = (await api('GET', '/api/settings/procedures/export.csv')).body;
    expect(csv).toMatch(/^﻿?id,name,category,fee,minFee,maxFee,durationMin,keywords,aftercareId,quote,active/);
    expect(csv).toMatch(/Composite filling/);
    const lines = csv.replace(/^﻿/, '').split('\n');
    expect(lines.length).toBe(29); // header + 28 seeded procedures

    // Edit the composite filling fee, and add a brand-new procedure, then re-import.
    const edited = lines.map((l) => (l.startsWith('pr_composite,') ? l.replace(',1800,', ',2000,') : l));
    edited.push('pr_new_test,Sports mouthguard,Appliances,4000,3000,6000,20,"mouthguard, sports guard",ac_general,true,true');
    const imp = await api('POST', '/api/settings/procedures/import', { csv: edited.join('\n') });
    expect(imp.status).toBe(200);
    expect(imp.body.created).toBe(1);
    expect(imp.body.updated).toBe(28);
    expect(imp.body.errors.length).toBe(0);
    const composite = imp.body.procedures.find((p) => p.id === 'pr_composite');
    expect(composite.fee).toBe(2000);
    const added = imp.body.procedures.find((p) => p.name === 'Sports mouthguard');
    expect(added).toBeTruthy();
    expect(added.keywords).toEqual(['mouthguard', 'sports guard']);

    const s = (await api('GET', '/api/settings')).body;
    expect(s.procedures.length).toBe(29);
    expect(s.procedures.find((p) => p.id === 'pr_composite').fee).toBe(2000);

    // A row with no name is reported, not silently dropped or crashing the import.
    const bad = await api('POST', '/api/settings/procedures/import', { csv: `${lines[0]}\n,,General,100,,,20,,,true,true` });
    expect(bad.status).toBe(200);
    expect(bad.body.errors.length).toBe(1);
    expect(bad.body.errors[0]).toMatch(/missing procedure name/);
  });

  it('front desk staff cannot import the catalogue, only owners and admins', async () => {
    const desk = (await raw('POST', '/api/auth/demo', { role: 'front_desk' })).body;
    const r = await raw('POST', '/api/settings/procedures/import', { csv: 'id,name,category,fee\npr_x,Test,General,100' }, { authorization: `Bearer ${desk.token}` });
    expect(r.status).toBe(403);
  });
});

describe('demo data stays current', () => {
  it('reseeds the demo clinic automatically once a real day has passed, so "today" is never stale', async () => {
    const demo = registry.tenantBySlug('smilecare');
    const store = registry.tenantStore(demo.id);
    const today = () => new Date().toLocaleDateString('en-CA'); // the clinic's day: the app runs in the clinic's time zone
    expect(store.db.settings.demoSeededDate).toBe(today());
    const todaysAppointments = store.db.appointments.filter((a) => new Date(a.start).toLocaleDateString('en-CA') === store.db.settings.demoSeededDate).length;
    expect(todaysAppointments).toBeGreaterThan(0);

    // Simulate the clinic having been seeded yesterday: back-date the marker and every "today" appointment.
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA');
    store.db.settings.demoSeededDate = yesterday;
    for (const a of store.db.appointments) if (new Date(a.start).toLocaleDateString('en-CA') === today()) a.start = yesterday + a.start.slice(10);

    registry.ensureDemo(); // the same call app startup makes; should detect the stale date and reseed

    const refreshed = registry.tenantStore(demo.id);
    expect(refreshed.db.settings.demoSeededDate).toBe(today());
    const nowToday = refreshed.db.appointments.filter((a) => new Date(a.start).toLocaleDateString('en-CA') === refreshed.db.settings.demoSeededDate).length;
    expect(nowToday).toBe(todaysAppointments); // back to the same freshly-seeded "today" shape
  });

  it('does not reseed mid-day, so in-progress demo edits from the same day survive', async () => {
    const before = (await api('GET', '/api/patients')).body.length;
    await api('POST', '/api/patients', { firstName: 'Extra', lastName: 'Walkin', dob: '1990-01-01', phone: '9998887777' });
    registry.ensureDemo(); // same-day call: must be a no-op
    const after = (await api('GET', '/api/patients')).body;
    expect(after.length).toBe(before + 1);
    expect(after.some((p) => p.firstName === 'Extra')).toBe(true);
  });
});

describe('payment receipts', () => {
  it('numbers receipts per financial year, builds GST split, words, and sends on WhatsApp', async () => {
    const board = (await api('GET', '/api/arrivals')).body.board.filter((r) => r.appointment.fee > 0 && !r.appointment.paidAt);
    const [a, b] = board.map((r) => r.appointment.id);
    expect((await api('GET', `/api/arrivals/${a}/receipt`)).status).toBe(400); // nothing paid yet
    await api('PUT', '/api/settings', { billing: { gstRate: 18, receiptPrefix: 'SC', nextNumber: 1 } });
    const p1 = (await api('POST', `/api/arrivals/${a}/payment`, { amount: 1180, mode: 'UPI', reference: 'U123' })).body;
    const p2 = (await api('POST', `/api/arrivals/${b}/payment`, { amount: 500, mode: 'Cash' })).body;
    expect(p1.receiptNo).toMatch(/^SC\/\d\d-\d\d\/0001$/);
    expect(p2.receiptNo).toMatch(/\/0002$/);
    const rc = (await api('GET', `/api/arrivals/${a}/receipt`)).body;
    expect(rc.receiptNo).toBe(p1.receiptNo);
    expect(rc.taxable).toBe(1000); expect(rc.gst).toBe(180); expect(rc.words).toBe('One thousand one hundred eighty rupees only');
    // counter can't be wound back to reissue a number
    await api('PUT', '/api/settings', { billing: { nextNumber: 1 } });
    expect((await api('GET', '/api/settings')).body.billing.nextNumber).toBe(3);
    const sent = await api('POST', `/api/arrivals/${a}/receipt/send`);
    expect(sent.status).toBe(201); expect(sent.body.body).toContain(p1.receiptNo);
  });
  it('writes amounts in Indian words', async () => {
    const { amountInWords } = await import('../src/domain/billing.js');
    expect(amountInWords(125000)).toBe('One lakh twenty five thousand rupees only');
    expect(amountInWords(20000000)).toBe('Two crore rupees only');
    expect(amountInWords(99.5)).toBe('Ninety nine rupees and fifty paise only');
  });
});
