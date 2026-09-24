import { describe, it, expect, beforeEach } from 'vitest';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { createRegistry } from '../src/registry.js';

process.env.CLINOVARA_AI = 'rules';

let app, registry, token;
async function raw(method, path, body, headers = {}) {
  const server = app.listen(0);
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json };
  } finally { server.close(); }
}
/** Staff call as the demo owner; public pages pass x-tenant instead. */
const api = (method, path, body, headers = {}) => raw(method, path, body, { authorization: `Bearer ${token}`, ...headers });
const pub = (method, path, body, headers = {}) => raw(method, path, body, { 'x-tenant': 'smilecare', ...headers });

beforeEach(async () => {
  registry = createRegistry({ memory: true });
  app = createApp({ registry, frontendBase: 'http://test/' });
  token = (await raw('POST', '/api/auth/demo', {})).body.token;
});

describe('accounts, clinics and onboarding', () => {
  it('registers a clinic, guards routes, and tracks onboarding honestly', async () => {
    expect((await raw('GET', '/api/arrivals')).status).toBe(401);
    const reg = await raw('POST', '/api/auth/register', { name: 'Dr Test', email: 'T@Example.in', phone: '+91 99999 00000', password: 'secret123', clinicName: 'Test Dental', city: 'Mysuru' });
    expect(reg.status).toBe(201);
    expect(reg.body.tenant.slug).toBe('test-dental');
    expect(reg.body.role).toBe('owner');
    const H = { authorization: `Bearer ${reg.body.token}` };
    const s = (await raw('GET', '/api/settings', null, H)).body;
    expect(s.practice.name).toBe('Test Dental');
    expect(s.providers.length).toBe(0);
    expect((await raw('GET', '/api/patients', null, H)).body.length).toBe(0);
    let ob = (await raw('GET', '/api/onboarding', null, H)).body;
    expect(ob.completed).toBe(false);
    expect(ob.steps.find((x) => x.key === 'team').done).toBe(false);
    await raw('PUT', '/api/settings', { practice: { registrationNumber: 'KSDC-1', state: 'Karnataka' }, providers: [{ id: 'p1', name: 'Dr Test', role: 'Dentist', locationIds: ['loc_main'], consultationFee: 400 }], locations: [{ ...s.locations[0], address: '1 MG Road' }] }, H);
    await raw('POST', '/api/team/invites', { email: 'staff@example.in', role: 'front_desk', name: 'Asha' }, H);
    ob = (await raw('GET', '/api/onboarding', null, H)).body;
    expect(ob.steps.find((x) => x.key === 'team').done).toBe(true);
    expect(ob.steps.find((x) => x.key === 'profile').done).toBe(true);
    expect(ob.percent).toBeGreaterThan(30);
    const dup = await raw('POST', '/api/auth/register', { name: 'X', email: 't@example.in', password: 'secret123', clinicName: 'Other' });
    expect(dup.status).toBe(409);
    const bad = await raw('POST', '/api/auth/login', { email: 't@example.in', password: 'wrong' });
    expect(bad.status).toBe(401);
    const ok = await raw('POST', '/api/auth/login', { email: 't@example.in', password: 'secret123' });
    expect(ok.body.tenant.slug).toBe('test-dental');
  });
  it('invites staff with roles and enforces what they can change', async () => {
    const inv = await api('POST', '/api/team/invites', { email: 'kavya@example.in', role: 'front_desk', name: 'Kavya' });
    expect(inv.status).toBe(201);
    const tok = inv.body.link.split('/invite/')[1];
    expect((await raw('GET', `/api/auth/invite/${tok}`)).body.clinic).toBe('SmileCare Dental');
    const acc = await raw('POST', `/api/auth/invite/${tok}/accept`, { password: 'kavya1234', phone: '9000000001' });
    expect(acc.status).toBe(200);
    expect(acc.body.role).toBe('front_desk');
    const K = { authorization: `Bearer ${acc.body.token}` };
    expect((await raw('GET', '/api/arrivals', null, K)).status).toBe(200);
    expect((await raw('PUT', '/api/settings', { rules: { cancelNoticeHours: 1 } }, K)).status).toBe(403);
    expect((await raw('POST', '/api/team/invites', { email: 'x@y.in', role: 'dentist' }, K)).status).toBe(403);
    const team = (await api('GET', '/api/team')).body;
    expect(team.members.some((m) => m.user.email === 'kavya@example.in')).toBe(true);
    const otp = await raw('POST', '/api/auth/code', { phone: '9000000001', purpose: 'login' });
    expect(otp.body.devCode).toMatch(/^\d{6}$/);
    const ver = await raw('POST', '/api/auth/verify', { phone: '9000000001', purpose: 'login', code: otp.body.devCode });
    expect(ver.status).toBe(200);
    expect(ver.body.user.name).toBe('Kavya');
  });
  it('isolates clinics from each other', async () => {
    const other = await raw('POST', '/api/auth/register', { name: 'O', email: 'o@example.in', password: 'secret123', clinicName: 'Other Dental' });
    const O = { authorization: `Bearer ${other.body.token}` };
    expect((await raw('GET', '/api/appointments', null, O)).body.length).toBe(0);
    expect((await api('GET', '/api/appointments')).body.length).toBeGreaterThan(5);
    expect((await raw('POST', '/api/kiosk/sessions', { kioskCode: 'IND1' }, { 'x-tenant': 'other-dental' })).body.location.name).toBe('Main branch');
  });
});

describe('health & settings', () => {
  it('reports the AI mode, and settings carry branches', async () => {
    const { body } = await raw('GET', '/api/health');
    expect(body.ok).toBe(true);
    expect(body.demoAvailable).toBe(true);
    const s = (await api('GET', '/api/settings')).body;
    expect(s.locations.length).toBe(2);
    expect(s.locale.currencySymbol).toBe('₹');
    expect(s.holidays.length).toBeGreaterThan(0);
  });
  it('updates settings and hides secrets', async () => {
    const { body } = await api('PUT', '/api/settings', { rules: { cancelNoticeHours: 48 } });
    expect(body.rules.cancelNoticeHours).toBe(48);
    expect(body.integrations.apiKey).toBe('');
  });
});

describe('AI front desk', () => {
  it('answers an approved FAQ (Hinglish) without escalating', async () => {
    const { body } = await pub('POST', '/api/conversations', { channel: 'whatsapp', contactName: 'Pat Doe', text: 'timings kya hai?' });
    expect(body.reply.text).toContain('9:00 AM');
    expect(body.conversation.status).toBe('ai');
  });
  it('escalates clinical questions to staff', async () => {
    const { body } = await pub('POST', '/api/conversations', { channel: 'sms', contactPhone: '+91 98450 11001', text: 'Should I take amoxicillin for the swelling?' });
    expect(body.conversation.status).toBe('needs_staff');
    expect(body.conversation.patient.firstName).toBe('Meera');
  });
  it('books a new patient end to end at the requested branch with the fee mentioned', async () => {
    const start = await pub('POST', '/api/conversations', { channel: 'web', contactName: 'Nina Park', contactPhone: '9845099999', text: 'Hi, I need a cleaning next week in the evening at Whitefield' });
    expect(start.body.reply.text).toMatch(/₹1,500/);
    expect(start.body.reply.text).toMatch(/Whitefield/);
    const convId = start.body.conversation.id;
    await pub('POST', `/api/conversations/${convId}/messages`, { text: 'The first one please' });
    const ident = await pub('POST', `/api/conversations/${convId}/messages`, { text: 'Nina Park, 1992-03-04' });
    expect(ident.body.reply.intent).toBe('booked');
    const mine = (await api('GET', '/api/appointments?status=scheduled')).body.find((a) => a.patient?.lastName === 'Park');
    expect(mine.locationId).toBe('loc_whitefield');
    expect(new Date(mine.start).getHours()).toBeGreaterThanOrEqual(16);
  });
  it('asks which family member when a phone is shared', async () => {
    const a = await pub('POST', '/api/conversations', { channel: 'whatsapp', contactPhone: '9845011008', text: 'I want to reschedule' });
    expect(a.body.reply.text).toMatch(/Aarav and Zoya/);
    const b = await pub('POST', `/api/conversations/${a.body.conversation.id}/messages`, { text: 'Aarav' });
    expect(b.body.conversation.patient.firstName).toBe('Aarav');
  });
  it('lets staff take over', async () => {
    const a = await pub('POST', '/api/conversations', { channel: 'web', contactName: 'Q', text: 'banana' });
    const c = await api('POST', `/api/conversations/${a.body.conversation.id}/messages`, { from: 'staff', text: 'Hi, how can I help?' });
    expect(c.body.conversation.status).toBe('staff');
    expect(c.body.conversation.assignedTo).toBe('Dr. Ananya Rao');
  });
});

describe('scheduling', () => {
  it('respects branches, blocked time and holidays', async () => {
    const khan = (await api('GET', '/api/availability?visitTypeId=vt_ortho&providerId=prov_khan&limit=8')).body;
    expect(khan.every((s) => s.locationId === 'loc_whitefield')).toBe(true);
    const s = (await api('GET', '/api/settings')).body;
    const day = khan[0].start.slice(0, 10);
    await api('PUT', '/api/settings', { holidays: [...s.holidays, { date: day, name: 'Test holiday' }] });
    const after = (await api('GET', `/api/availability?visitTypeId=vt_ortho&providerId=prov_khan&date=${day}`)).body;
    expect(after.length).toBe(0);
  });
  it('cancelling offers the slot to a matching waitlist patient', async () => {
    const patients = (await api('GET', '/api/patients')).body;
    const priya = patients.find((p) => p.firstName === 'Priya'); const arjun = patients.find((p) => p.firstName === 'Arjun');
    const slots = (await api('GET', '/api/availability?visitTypeId=vt_newpatient&limit=12')).body;
    const slot = slots.find((x) => new Date(x.start) - Date.now() > 36 * 3600000);
    const fresh = (await api('POST', '/api/appointments', { patientId: priya.id, visitTypeId: 'vt_newpatient', providerId: slot.providerId, locationId: slot.locationId, start: slot.start })).body;
    await api('POST', '/api/waitlist', { patientId: arjun.id, visitTypeId: 'vt_newpatient', preferredDays: ['any'], preferredTime: 'any' });
    const res = await api('POST', `/api/appointments/${fresh.id}/cancel`, { reason: 'test' });
    expect(res.body.offers.length).toBe(1);
  });
  it('lists and sends due reminders once, in the patient language', async () => {
    const due = (await api('GET', '/api/reminders/due')).body;
    expect(due.length).toBeGreaterThan(0);
    const sent = (await api('POST', '/api/reminders/send')).body;
    expect(sent.sent).toBe(due.length);
    const hindi = sent.communications.find((c) => c.lang === 'hi');
    if (hindi) expect(hindi.body).toMatch(/नमस्ते/);
  });
});

describe('kiosk, tokens and arrivals', () => {
  it('checks a patient in with a token and resets the session', async () => {
    const s = (await pub('POST', '/api/kiosk/sessions', { kioskCode: 'IND1' })).body;
    expect(s.location.name).toBe('Indiranagar');
    const ok = await pub('POST', `/api/kiosk/sessions/${s.id}/identify`, { lastName: 'Raman', dob: '2001-09-09' });
    expect(ok.body.visit.token).toMatch(/^A\d\d$/);
    for (const k of ['medicalHistory', 'dentalConcerns', 'medications', 'allergies']) await pub('POST', `/api/kiosk/sessions/${s.id}/forms/${k}`, { data: { x: 'y' } });
    await pub('POST', `/api/kiosk/sessions/${s.id}/insurance`, { type: 'pmjay', carrier: 'PM-JAY', memberId: 'P1', abhaNumber: '12-3456-7890-1234', scanned: true });
    const consent = await pub('POST', `/api/kiosk/sessions/${s.id}/consent`, { signature: 'Priya Raman' });
    expect(consent.body.visit.missing).toEqual([]);
    expect((await pub('POST', `/api/kiosk/sessions/${s.id}/complete`)).body.visit.status).toBe('ready');
    await pub('POST', `/api/kiosk/sessions/${s.id}/end`);
    expect((await pub('GET', `/api/kiosk/sessions/${s.id}`)).status).toBe(410);
  });
  it('lets family members sharing a phone choose who is checking in', async () => {
    const zoya = (await api('GET', '/api/patients?q=Zoya')).body[0];
    const today = new Date(); today.setHours(18, 0, 0, 0);
    await api('POST', '/api/appointments', { patientId: zoya.id, visitTypeId: 'vt_child', providerId: 'prov_iyer', start: today.toISOString(), sendForms: false });
    const s = (await pub('POST', '/api/kiosk/sessions', {})).body;
    const r = await pub('POST', `/api/kiosk/sessions/${s.id}/identify`, { phone: '9845011008' });
    expect(r.body.choose.length).toBe(2);
    expect((await pub('POST', `/api/kiosk/sessions/${s.id}/identify`, { patientId: zoya.id })).body.patient.firstName).toBe('Zoya');
  });
  it('call-next, payment and the display board work together', async () => {
    const called = (await api('POST', '/api/arrivals/call-next', { providerId: 'prov_menon', locationId: 'loc_indiranagar' })).body;
    expect(called.called.token).toBe('A02');
    const display = (await pub('GET', '/api/arrivals/board?locationId=loc_indiranagar')).body;
    expect(display.lanes.find((l) => l.provider.id === 'prov_menon').nowServing.token).toBe('A02');
    const board = (await api('GET', '/api/arrivals?locationId=loc_indiranagar')).body;
    const row = board.board.find((r) => r.visit?.token === 'A02');
    const paid = (await api('POST', `/api/arrivals/${row.appointment.id}/payment`, { mode: 'UPI', amount: 6000 })).body;
    expect(paid.paymentStatus).toBe('paid');
    expect((await api('GET', '/api/insights?locationId=loc_indiranagar')).body.revenue.today).toBeGreaterThanOrEqual(6000);
  });
});

describe('patients, FHIR and integrations', () => {
  it('imports CSV with Indian formats', async () => {
    const csv = 'Name,Mobile,DOB,Gender,Insurer,Policy no,Branch\nRavi Kumar,+91 99000 11122,15/08/1985,male,Star Health,SH-1,Whitefield\n';
    expect((await api('POST', '/api/patients/import', { csv })).body.created).toBe(1);
    const ravi = (await api('GET', '/api/patients?q=Ravi')).body[0];
    expect(ravi.phone).toBe('9900011122'); expect(ravi.dob).toBe('1985-08-15'); expect(ravi.locationId).toBe('loc_whitefield');
  });
  it('serves FHIR by API key, or by clinic slug while no key is set', async () => {
    expect((await raw('GET', '/api/fhir/Patient')).status).toBe(401);
    const open = await raw('GET', '/api/fhir/Patient?t=smilecare&phone=9845011001');
    expect(open.status).toBe(200); expect(open.body.total).toBe(1);
    const key = (await api('POST', '/api/integrations/api-key')).body.apiKey;
    expect((await raw('GET', '/api/fhir/Patient?t=smilecare')).status).toBe(401);
    const keyed = await raw('GET', '/api/fhir/Patient/' + open.body.entry[0].resource.id + '/$everything', null, { 'x-api-key': key });
    expect(keyed.status).toBe(200);
    expect(keyed.body.entry.map((e) => e.resource.resourceType)).toEqual(expect.arrayContaining(['Patient', 'Appointment', 'CarePlan']));
    const appt = await raw('POST', '/api/fhir/Appointment', { resourceType: 'Appointment', start: (await api('GET', '/api/availability?visitTypeId=vt_newpatient&limit=1')).body[0].start, serviceType: [{ text: 'New patient consultation' }], participant: [{ actor: { reference: `Patient/${open.body.entry[0].resource.id}` } }] }, { 'x-api-key': key });
    expect(appt.status).toBe(201);
  });
  it('delivers signed webhooks and logs them', async () => {
    const received = [];
    const sink = http.createServer((req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { received.push({ headers: req.headers, body: JSON.parse(b) }); res.end('ok'); }); });
    await new Promise((r) => sink.listen(0, r));
    const w = (await api('POST', '/api/integrations/webhooks', { url: `http://127.0.0.1:${sink.address().port}/hook`, events: ['patient.created'], secret: 'abc' })).body;
    await api('POST', `/api/integrations/webhooks/${w.id}/test`);
    await api('POST', '/api/patients', { firstName: 'Hook', lastName: 'Test', phone: '9999999999' });
    await new Promise((r) => setTimeout(r, 300));
    sink.close();
    expect(received.map((x) => x.body.event)).toEqual(['test.ping', 'patient.created']);
    expect(received[1].headers['x-clinovara-signature']).toMatch(/^sha256=/);
  });
});

describe('forms and treatment plans', () => {
  it('lets a patient complete sections via a token found across clinics', async () => {
    const pk = (await api('GET', '/api/forms')).body.find((f) => f.patient.firstName === 'Lakshmi');
    const view = await raw('GET', `/api/forms/token/${pk.token}`);
    expect(view.status).toBe(200); expect(view.body.languages.length).toBe(3);
    const upd = await raw('PUT', `/api/forms/token/${pk.token}/sections/insurance`, { data: { type: 'esic', carrier: 'ESIC', memberId: 'E1', abhaNumber: '11-2222-3333-4444' } });
    expect(upd.body.sections.insurance.complete).toBe(true);
    expect((await api('GET', `/api/patients/${pk.patientId}`)).body.abhaNumber).toBe('11-2222-3333-4444');
  });
  it('tracks unscheduled treatment and clears it when booked', async () => {
    expect((await api('GET', '/api/insights')).body.unscheduledTreatment.count).toBe(1);
    const plan = (await api('GET', '/api/treatment-plans?unscheduled=true')).body[0];
    const slots = (await api('GET', '/api/availability?visitTypeId=vt_procedure&limit=1')).body;
    expect((await api('POST', `/api/treatment-plans/${plan.id}/schedule`, { start: slots[0].start, providerId: slots[0].providerId, locationId: slots[0].locationId })).status).toBe(201);
    expect((await api('GET', '/api/insights')).body.unscheduledTreatment.count).toBe(0);
  });
});

describe('marketing with human approval', () => {
  it('drafts only from approved prompts, requires approval to send, and queues thank-yous', async () => {
    const m0 = (await api('GET', '/api/marketing')).body;
    expect(m0.prompts.length).toBeGreaterThan(5);
    const festival = m0.prompts.find((p) => p.goal === 'festival');
    expect(festival.status).toBe('draft');
    const blocked = await api('POST', '/api/marketing/draft', { goal: 'festival', promptId: festival.id, festival: 'Diwali' });
    expect(blocked.status).toBe(400);
    await api('POST', `/api/marketing/prompts/${festival.id}/approve`);
    const draft = await api('POST', '/api/marketing/draft', { goal: 'festival', promptId: festival.id, festival: 'Diwali', lang: 'hi' });
    expect(draft.status).toBe(200);
    expect(draft.body.body).toMatch(/Diwali/);
    // Front desk (non-manager) can draft and submit but not approve or send
    const inv = (await api('POST', '/api/team/invites', { email: 'fd@example.in', role: 'front_desk', name: 'FD' })).body;
    const fd = (await raw('POST', `/api/auth/invite/${inv.link.split('/invite/')[1]}/accept`, { password: 'fdfdfdfd' })).body;
    const FD = { authorization: `Bearer ${fd.token}` };
    const c = (await raw('POST', '/api/marketing/campaigns', { goal: 'festival', segment: 'all', lang: 'hi', body: draft.body.body, festival: 'Diwali' }, FD)).body;
    expect(c.status).toBe('draft');
    expect(c.audienceCount).toBeGreaterThan(5);
    expect((await raw('POST', `/api/marketing/campaigns/${c.id}/send`, {}, FD)).status).toBe(400);
    expect((await raw('POST', `/api/marketing/campaigns/${c.id}/submit`, {}, FD)).body.status).toBe('pending_approval');
    expect((await raw('POST', `/api/marketing/campaigns/${c.id}/approve`, {}, FD)).status).toBe(400);
    expect((await api('POST', `/api/marketing/campaigns/${c.id}/approve`)).body.status).toBe('approved');
    const hour = new Date().getHours();
    const sent = await api('POST', `/api/marketing/campaigns/${c.id}/send`);
    if (hour >= 9 && hour < 20) { expect(sent.body.sent).toBe(c.audienceCount); expect(sent.body.campaign.history.some((h) => h.action === 'approve')).toBe(true); }
    else expect(sent.status).toBe(400);
    // Completing a visit queues a thank-you that waits for approval
    const board = (await api('GET', '/api/arrivals?locationId=loc_indiranagar')).body.board;
    const row = board.find((r) => r.visit?.token === 'A02');
    await api('PATCH', `/api/arrivals/visits/${row.visit.id}`, { status: 'brought_back' });
    await api('PATCH', `/api/arrivals/visits/${row.visit.id}`, { status: 'done' });
    const m1 = (await api('GET', '/api/marketing')).body;
    const q = m1.queue.find((x) => x.appointmentId === row.appointment.id && x.goal === 'thank_you');
    expect(q.status).toBe('pending_approval');
    expect(q.lang).toBe('hi');
    expect((await api('GET', `/api/communications?patientId=${row.patient.id}&type=thank_you`)).body.length).toBe(0);
    await api('POST', `/api/marketing/queue/${q.id}/approve`);
    // Approved but delayed 60 minutes: dispatch happens later, nothing sent yet
    expect((await api('GET', `/api/communications?patientId=${row.patient.id}&type=thank_you`)).body.length).toBe(0);
    // Opt-out is respected
    await api('POST', `/api/marketing/optout/${row.patient.id}`, { optIn: false });
    expect((await api('GET', '/api/marketing')).body.optedOut).toBe(1);
  });
});
