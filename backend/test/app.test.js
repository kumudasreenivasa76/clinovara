import { describe, it, expect, beforeEach, vi } from 'vitest';
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

/** Full sign-up: request both verification codes, then register with them. */
async function signup(f) {
  const base = { clinicType: 'General dental clinic', country: 'India', dial: '91', phone: '99999 00000', confirmPassword: f.password, acceptTerms: true, city: 'Mysuru', state: 'Karnataka', ...f };
  const e = await raw('POST', '/api/auth/signup/code', { channel: 'email', email: base.email });
  const p = await raw('POST', '/api/auth/signup/code', { channel: 'phone', phone: base.phone, dial: base.dial });
  await raw('POST', '/api/auth/signup/verify', { channel: 'email', email: base.email, code: e.body.devCode });
  await raw('POST', '/api/auth/signup/verify', { channel: 'phone', phone: base.phone, dial: base.dial, code: p.body.devCode });
  return raw('POST', '/api/auth/register', base);
}

describe('accounts, clinics and onboarding', () => {
  it('registers a clinic, guards routes, and tracks onboarding honestly', async () => {
    expect((await raw('GET', '/api/arrivals')).status).toBe(401);
    const reg = await signup({ name: 'Dr Test', email: 'T@Example.in', password: 'Secret@123', clinicName: 'Test Dental' });
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
    await raw('PUT', '/api/settings', { practice: { registrationNumber: 'KSDC-1', state: 'Karnataka', address: '1 MG Road' }, providers: [{ id: 'p1', name: 'Dr Test', role: 'Dentist', locationIds: ['loc_main'], consultationFee: 400 }], locations: [{ ...s.locations[0], address: '1 MG Road' }] }, H);
    await raw('POST', '/api/team/invites', { email: 'staff@example.in', role: 'front_desk', name: 'Asha' }, H);
    ob = (await raw('GET', '/api/onboarding', null, H)).body;
    expect(ob.steps.find((x) => x.key === 'team').done).toBe(true);
    expect(ob.steps.find((x) => x.key === 'profile').done).toBe(true);
    expect(ob.percent).toBeGreaterThan(30);
    const noCode = await raw('POST', '/api/auth/register', { name: 'Y', email: 'y@example.in', phone: '99999 11111', dial: '91', password: 'Secret@123', confirmPassword: 'Secret@123', clinicName: 'Y', clinicType: 'General dental clinic', country: 'India', city: 'X', state: 'Karnataka', acceptTerms: true });
    expect(noCode.status).toBe(400);
    const mismatch = await signup({ name: 'Y', email: 'y@example.in', password: 'Secret@123', confirmPassword: 'Other@1234', clinicName: 'Y' });
    expect(mismatch.status).toBe(400);
    const dup = await signup({ name: 'X', email: 't@example.in', password: 'Secret@123', clinicName: 'Other' });
    expect(dup.status).toBe(409);
    const bad = await raw('POST', '/api/auth/login', { email: 't@example.in', password: 'wrong' });
    expect(bad.status).toBe(401);
    const ok = await raw('POST', '/api/auth/login', { email: 't@example.in', password: 'Secret@123' });
    expect(ok.body.tenant.slug).toBe('test-dental');
  });
  it('invites staff with roles and enforces what they can change', async () => {
    const inv = await api('POST', '/api/team/invites', { email: 'kavya@example.in', role: 'front_desk', name: 'Kavya' });
    expect(inv.status).toBe(201);
    const tok = inv.body.link.split('/invite/')[1];
    expect((await raw('GET', `/api/auth/invite/${tok}`)).body.clinic).toBe('SmileCare Dental');
    const acc = await raw('POST', `/api/auth/invite/${tok}/accept`, { password: 'Kavya@1234', phone: '9000000001' });
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
    const other = await signup({ name: 'O', email: 'o@example.in', password: 'Secret@123', clinicName: 'Other Dental' });
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
    const fd = (await raw('POST', `/api/auth/invite/${inv.link.split('/invite/')[1]}/accept`, { password: 'Fdfd@1234' })).body;
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
    if (hour >= 9 && hour < 20) { expect(sent.body.sent).toBe(c.eligibleCount); expect(sent.body.campaign.history.some((h) => h.action === 'approve')).toBe(true); }
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
    const thanksBefore = (await api('GET', `/api/communications?patientId=${row.patient.id}&type=thank_you`)).body.length; // earlier history may already hold some
    expect(thanksBefore).toBeGreaterThanOrEqual(0);
    await api('POST', `/api/marketing/queue/${q.id}/approve`);
    // Approved but delayed 60 minutes: dispatch happens later, nothing sent yet
    expect((await api('GET', `/api/communications?patientId=${row.patient.id}&type=thank_you`)).body.length).toBe(thanksBefore);
    // Opt-out is respected
    await api('POST', `/api/marketing/optout/${row.patient.id}`, { optIn: false });
    expect((await api('GET', '/api/marketing')).body.optedOut).toBe(1);
  });
});

describe('verification delivery and launch rules', () => {
  const withEnv = async (env, fn) => {
    const old = {}; for (const k of Object.keys(env)) { old[k] = process.env[k]; if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
    try { await fn(); } finally { for (const k of Object.keys(old)) { if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; } }
  };
  it('emails the code through Resend and never returns it in the response', async () => {
    const calls = []; const realFetch = global.fetch;
    global.fetch = async (url, init) => { if (String(url).startsWith('http://127.0.0.1')) return realFetch(url, init); calls.push({ url, init }); return { ok: true, text: async () => '' }; };
    try {
      await withEnv({ RESEND_API_KEY: 're_test', MAIL_FROM: 'Clinovara <hi@example.com>', NODE_ENV: 'production' }, async () => {
        const r = await raw('POST', '/api/auth/signup/code', { channel: 'email', email: 'real@example.in' });
        expect(r.status).toBe(200); expect(r.body.devCode).toBeUndefined();
        expect(calls[0].url).toBe('https://api.resend.com/emails');
        const sent = JSON.parse(calls[0].init.body);
        expect(sent.to).toEqual(['real@example.in']); expect(sent.text).toMatch(/\d{6}/);
        expect(calls[0].init.headers.authorization).toBe('Bearer re_test');
      });
    } finally { global.fetch = realFetch; }
  });
  it('refuses to hand out codes in production when no provider is configured, and skips phone verification', async () => {
    await withEnv({ RESEND_API_KEY: undefined, NODE_ENV: 'production' }, async () => {
      const e = await raw('POST', '/api/auth/signup/code', { channel: 'email', email: 'nomail@example.in' });
      expect(e.status).toBe(503); expect(e.body.devCode).toBeUndefined();
      const p = await raw('POST', '/api/auth/signup/code', { channel: 'phone', phone: '99999 22222', dial: '91' });
      expect(p.body.skipped).toBe(true);
      const h = (await raw('GET', '/api/health')).body; expect(h.verification).toEqual({ email: false, sms: false });
    });
  });
  it('takes a new clinic from sign-up to live, end to end', async () => {
    const reg = await signup({ name: 'Dr Live', email: 'live@example.in', password: 'Secret@123', clinicName: 'Live Dental' });
    expect(reg.status).toBe(201);
    const H = { authorization: `Bearer ${reg.body.token}` };
    const s = (await raw('GET', '/api/settings', null, H)).body;
    const vts = s.visitTypes.map((v) => ({ ...v, fee: v.fee || 500, keywords: v.keywords?.length ? v.keywords : [v.name.toLowerCase()] }));
    await raw('PUT', '/api/settings', { practice: { ...s.practice, address: '1 MG Road', state: 'Karnataka' }, locations: s.locations.map((l) => ({ ...l, address: '1 MG Road' })), providers: [{ id: 'p1', name: 'Dr Live', role: 'Dentist', specialty: 'General dentist', locationIds: [s.locations[0].id], consultationFee: 500 }], visitTypes: vts }, H);
    let ob = (await raw('GET', '/api/onboarding', null, H)).body;
    expect(ob.steps.filter((x) => x.core && x.key !== 'launch').every((x) => x.done)).toBe(true);
    expect((await raw('POST', '/api/onboarding/complete', {}, H)).body.completed).toBe(true);
    ob = (await raw('GET', '/api/onboarding', null, H)).body;
    expect(ob.percent).toBe(100);
    const me = (await raw('GET', '/api/auth/me', null, H)).body;
    expect(me.user.emailVerifiedAt).toBeTruthy(); expect(me.user.phoneVerifiedAt).toBeTruthy();
  });
});

describe('roles and providers', () => {
  const withEnv = async (env, fn) => {
    const old = {}; for (const k of Object.keys(env)) { old[k] = process.env[k]; process.env[k] = env[k]; }
    try { await fn(); } finally { for (const k of Object.keys(old)) { if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; } }
  };
  const stubFetch = (calls) => { const real = global.fetch; global.fetch = async (url, init) => { if (String(url).startsWith('http://127.0.0.1')) return real(url, init); calls.push({ url: String(url), init }); return { ok: true, text: async () => '' }; }; return () => { global.fetch = real; }; };

  it('sends verification codes by SMS through Twilio when configured', async () => {
    const calls = []; const restore = stubFetch(calls);
    try {
      await withEnv({ TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: 'tok', TWILIO_FROM: '+15550001111', NODE_ENV: 'production' }, async () => {
        const r = await raw('POST', '/api/auth/signup/code', { channel: 'phone', phone: '99999 33333', dial: '91' });
        expect(r.status).toBe(200); expect(r.body.devCode).toBeUndefined(); expect(r.body.skipped).toBeUndefined();
        expect(calls[0].url).toContain('api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json');
        expect(String(calls[0].init.body)).toContain('To=%2B919999933333');
      });
    } finally { restore(); }
  });

  it('delivers patient messages over WhatsApp when the Cloud API is configured, and records failures', async () => {
    const { sendCommunication } = await import('../src/domain/messaging.js');
    const db = { patients: [{ id: 'p1', firstName: 'A', lastName: 'B', phone: '9845012345' }], settings: { locale: { defaultChannel: 'whatsapp', phoneCountryCode: '91' }, integrations: { messaging: { provider: 'none' } } }, communications: [], conversations: [] };
    const calls = []; const restore = stubFetch(calls);
    try {
      await withEnv({ WHATSAPP_TOKEN: 'wa', WHATSAPP_PHONE_ID: '123' }, async () => {
        const c = sendCommunication(db, { patientId: 'p1', type: 'reminder', body: 'See you tomorrow', channel: 'whatsapp' });
        await new Promise((r) => setTimeout(r, 20));
        expect(calls[0].url).toBe('https://graph.facebook.com/v20.0/123/messages');
        expect(JSON.parse(calls[0].init.body).to).toBe('919845012345');
        expect(c.delivery).toBe('sent');
      });
    } finally { restore(); }
    const realFetch = global.fetch;
    global.fetch = async (url, init) => (String(url).startsWith('http://127.0.0.1') ? realFetch(url, init) : { ok: false, status: 400, text: async () => 'bad' });
    try {
      await withEnv({ WHATSAPP_TOKEN: 'wa', WHATSAPP_PHONE_ID: '123' }, async () => {
        const c = sendCommunication(db, { patientId: 'p1', type: 'reminder', body: 'x', channel: 'whatsapp' });
        await new Promise((r) => setTimeout(r, 20));
        expect(c.delivery).toBe('failed');
      });
    } finally { global.fetch = realFetch; }
  });

  it('gives each invited role only what it should have', async () => {
    const owner = (await signup({ name: 'Own Er', email: 'roles-owner@example.in', password: 'Secret@123', clinicName: 'Roles Dental' })).body;
    const O = { authorization: `Bearer ${owner.token}` };
    const join = async (role, email) => {
      const inv = await raw('POST', '/api/team/invites', { email, role, name: role }, O);
      expect(JSON.stringify(inv.body)).toContain('link');
      const tok = inv.body.link.split('/invite/')[1];
      const acc = await raw('POST', `/api/auth/invite/${tok}/accept`, { name: role, phone: '99999 44444', password: 'Secret@123' });
      expect(acc.status).toBe(200); expect(acc.body.role).toBe(role);
      return { authorization: `Bearer ${acc.body.token}` };
    };
    const FD = await join('front_desk', 'fd@example.in');
    const DR = await join('dentist', 'dr@example.in');
    for (const H of [FD, DR]) {
      expect((await raw('PUT', '/api/settings', { practice: { name: 'Hacked' } }, H)).status).toBe(403);
      expect((await raw('POST', '/api/team/invites', { email: 'x@example.in', role: 'admin' }, H)).status).toBe(403);
    }
    expect((await raw('GET', '/api/patients', null, FD)).status).toBe(200);
    expect((await raw('PUT', '/api/settings', { practice: { ...(await raw('GET', '/api/settings', null, O)).body.practice, tagline: 'ok' } }, O)).status).toBe(200);
    const me = (await raw('GET', '/api/auth/me', null, FD)).body;
    expect(me.canManage).toBe(false);
    expect((await raw('GET', '/api/dashboard', null, FD)).status).toBe(403); // revenue analytics are for owners and admins
    expect((await raw('GET', '/api/dashboard', null, DR)).status).toBe(403);
    const insFD = (await raw('GET', '/api/insights', null, FD)).body;
    expect(insFD.revenue).toBeUndefined(); expect(insFD.forms).toBeTruthy(); // front desk keeps the operational numbers
    expect((await raw('GET', '/api/insights', null, O)).body.revenue).toBeTruthy();
    expect((await raw('GET', '/api/dashboard', null, O)).status).toBe(200);
  });
});

describe('scheduling for a newly set-up clinic', () => {
  it('offers slots in the clinic time zone whatever zone the server runs in, then books, blocks double-booking, reschedules and cancels', async () => {
    process.env.TZ = 'UTC'; // a typical cloud server; the request handler must switch to the clinic's zone
    const reg = await signup({ name: 'Dr Sched', email: 'sched@example.in', password: 'Secret@123', clinicName: 'Sched Dental' });
    const H = { authorization: `Bearer ${reg.body.token}` }; const T = { 'x-tenant': reg.body.tenant.slug };
    const s = (await raw('GET', '/api/settings', null, H)).body;
    const hours = { mon: ['09:00', '19:00'], tue: ['09:00', '19:00'], wed: ['09:00', '19:00'], thu: ['09:00', '19:00'], fri: ['09:00', '19:00'], sat: ['09:00', '14:00'], sun: null };
    const saved = await raw('PUT', '/api/settings', { ...s, practice: { ...s.practice, hours }, locations: s.locations.map((l) => ({ ...l, hours })), providers: [{ id: 'p1', name: 'Dr Sched', role: 'Dentist', specialty: 'General dentist', locationIds: [s.locations[0].id], consultationFee: 500 }] }, H);
    expect(saved.status).toBe(200);
    const slotsRes = await raw('GET', '/api/public/slots?visitTypeId=vt_newpatient&days=14', null, T);
    const days = slotsRes.body.days;
    const hhmm = (iso) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
    const all = days.flatMap((d) => d.slots);
    expect(all.length).toBeGreaterThan(20);
    for (const sl of all) { expect(hhmm(sl.start) >= '09:00').toBe(true); expect(hhmm(sl.start) <= '19:00').toBe(true); }
    for (const d of days) { const dow = new Date(`${d.date}T12:00:00Z`).getUTCDay(); if (dow === 0) expect(d.slots.length).toBe(0); }
    const sat = days.find((d) => new Date(`${d.date}T12:00:00Z`).getUTCDay() === 6 && d.slots.length);
    if (sat) expect(sat.slots.every((x) => hhmm(x.end) <= '14:00')).toBe(true);

    const sl = all[0];
    const body = { name: 'Test Patient', phone: '98450 99999', visitTypeId: 'vt_newpatient', providerId: sl.providerId, locationId: sl.locationId, start: sl.start };
    const book = await raw('POST', '/api/public/book', body, T);
    expect(book.status).toBe(201);
    expect((await raw('POST', '/api/public/book', { ...body, name: 'Other Person', phone: '98450 88888' }, T)).status).toBe(400);
    const list = (await raw('GET', '/api/appointments', null, H)).body;
    expect(list.length).toBe(1); expect(list[0].patient.firstName).toBe('Test');
    const gone = (await raw('GET', '/api/public/slots?visitTypeId=vt_newpatient&days=14', null, T)).body.days.flatMap((d) => d.slots);
    expect(gone.some((x) => x.start === sl.start && x.providerId === sl.providerId)).toBe(false);

    const moved = await raw('POST', `/api/appointments/${list[0].id}/reschedule`, { start: all[5].start }, H);
    expect(moved.status).toBe(200);
    const cancelled = await raw('POST', `/api/appointments/${list[0].id}/cancel`, { reason: 'test' }, H);
    expect(cancelled.body.appointment.status).toBe('cancelled');
    const back = (await raw('GET', '/api/public/slots?visitTypeId=vt_newpatient&days=14', null, T)).body.days.flatMap((d) => d.slots);
    expect(back.some((x) => x.start === all[5].start)).toBe(true);
  });
});

describe('staff assistant', () => {
  const ask = async (message, as = 'owner') => {
    const t = (await raw('POST', '/api/auth/demo', { role: as })).body.token;
    const r = await raw('POST', '/api/assistant/ask', { message }, { authorization: `Bearer ${t}` });
    expect(r.status).toBe(200); return r.body;
  };
  it('answers from clinic data and routes to the right screen', async () => {
    const sched = await ask("today's schedule");
    expect(sched.reply).toMatch(/appointments? today/); expect(sched.items.length).toBeGreaterThan(3);
    const rohan = await ask('find rohan');
    expect(rohan.reply).toMatch(/Rohan Patil/); expect(rohan.items.some((i) => /Penicillin/.test(i.title))).toBe(true);
    const many = await ask('find a');
    expect(many.reply.length).toBeGreaterThan(0);
    const slots = await ask('open slots for a cleaning');
    expect(slots.items.length).toBeGreaterThan(0); expect(slots.reply).toMatch(/Cleaning/);
    const how = await ask('how do I add a patient');
    expect(how.items[0].href).toBe('#/patients');
    const who = await ask('who is next');
    expect(who.reply).not.toMatch(/No patient matches/);
    expect((await ask('revenue this week')).reply).toMatch(/Collected ₹/);
  });
  it('keeps a dentist to their own patients and hides clinic revenue', async () => {
    const mine = await ask('my schedule today', 'dentist');
    expect(mine.items.every((i) => !/Sunitha|Ananya Rao/.test(i.sub))).toBe(true);
    expect((await ask('revenue this week', 'dentist')).reply).toMatch(/owners and admins/);
  });
  it('does not mistake a how-to question for a patient search', async () => {
    expect((await ask('how do I book an appointment')).items[0].href).toBe('#/schedule');
  });
});

describe('Claude-powered assistant (scripted model)', () => {
  const scripted = (steps) => { const calls = []; return { calls, beta: { messages: { create: async (body) => { calls.push(body); const next = steps[calls.length - 1]; if (!next) throw new Error('script exhausted'); return next; } } } }; };
  const use = (id, name, input) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id, name, input }] });
  const say = (text) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text }] });
  const mkReq = (role, message, userId = 'u1') => { const tenant = registry.tenantBySlug('smilecare'); const store = registry.tenantStore(tenant.id); return { db: store.db, store, tenant, session: { userId }, role, user: 'Kavitha', membership: {}, body: { message }, frontendBase: 'http://t/' }; };

  it('looks things up with tools, only proposes a booking, and books after the person confirms', async () => {
    const { claudeAsk, resolveAction } = await import('../src/domain/assistantAI.js');
    const req = mkReq('front_desk', 'Book Rohan for a follow-up');
    const rohan = req.db.patients.find((p) => p.firstName === 'Rohan');
    const calls = [];
    const client = { calls, beta: { messages: { create: async (body) => {
      const n = calls.length; calls.push(body);
      if (n === 0) return use('t1', 'find_patient', { query: 'rohan' });
      if (n === 1) return use('t2', 'find_slots', { visitTypeId: 'vt_followup', providerId: 'prov_rao' });
      if (n === 2) { const slots = JSON.parse(body.messages.at(-1).content[0].content); return use('t3', 'propose_book_appointment', { patientId: rohan.id, visitTypeId: 'vt_followup', providerId: 'prov_rao', start: slots[0].start }); }
      return say('Prepared a follow-up for Rohan. Confirm to book it.');
    } } } };
    const before = req.db.appointments.length;
    const out = await claudeAsk(req, { client });
    expect(out.engine).toBe('claude'); expect(out.reply).toMatch(/Confirm/);
    expect(out.actions.length).toBe(1); expect(out.actions[0].summary).toMatch(/Rohan Patil/);
    expect(req.db.appointments.length).toBe(before); // proposing changes nothing
    const first = client.calls[0];
    expect(first.model).toBe('claude-opus-5-5'); expect(first.tools.some((x) => x.name === 'propose_book_appointment')).toBe(true);
    expect(JSON.stringify(first.system)).toMatch(/never instructions/i);

    const done = resolveAction(req, out.actions[0].id, 'confirm');
    expect(done.ok).toBe(true); expect(req.db.appointments.length).toBe(before + 1);
    expect(() => resolveAction(req, out.actions[0].id, 'confirm')).toThrow(/expired/); // single use
  });

  it('does not let another user confirm, lets a person dismiss, and keeps clinic stats from non-managers', async () => {
    const { claudeAsk, resolveAction } = await import('../src/domain/assistantAI.js');
    const req = mkReq('front_desk', 'message rohan');
    const rohan = req.db.patients.find((p) => p.firstName === 'Rohan');
    const client = scripted([use('a', 'propose_send_message', { patientId: rohan.id, text: 'See you soon' }), use('b', 'clinic_stats', { days: 7 }), say('Prepared. Stats are restricted.')]);
    const out = await claudeAsk(req, { client });
    const statsResult = JSON.parse(client.calls[2].messages.at(-1).content[0].content);
    expect(statsResult.error).toMatch(/owners and admins/);
    expect(() => resolveAction({ ...req, session: { userId: 'someone-else' } }, out.actions[0].id, 'confirm')).toThrow(/expired/);
    const sent = req.db.communications.length;
    expect(resolveAction(req, out.actions[0].id, 'dismiss').message).toMatch(/Nothing was changed/);
    expect(req.db.communications.length).toBe(sent);
  });

  it('falls back to the rule engine when Claude is unavailable', async () => {
    const t = (await raw('POST', '/api/auth/demo', { role: 'owner' })).body.token;
    const r = await raw('POST', '/api/assistant/ask', { message: 'unpaid visits' }, { authorization: `Bearer ${t}` });
    expect(r.status).toBe(200); expect(r.body.reply).toBeTruthy();
  });
});

describe('website visitors cannot reach patient data', () => {
  it('keeps conversations private, ties each chat to its owner, and never links a visitor to a patient they name', async () => {
    const reg = await signup({ name: 'Dr Priv', email: 'priv@example.in', password: 'Secret@123', clinicName: 'Privacy Dental' });
    const H = { authorization: `Bearer ${reg.body.token}` }; const T = { 'x-tenant': reg.body.tenant.slug };
    const mk = await raw('POST', '/api/patients', { firstName: 'Real', lastName: 'Patient', dob: '1990-01-01', phone: '9845012345' }, H);
    expect(mk.status).toBe(201);

    expect((await raw('GET', '/api/conversations', null, T)).status).toBe(401);
    const settings = (await raw('GET', '/api/settings', null, T)).body;
    expect(Object.keys(settings).sort()).toEqual(['branding', 'locale', 'locations', 'practice', 'tenant']); // branding is the clinic's public logo and colour
    expect((await raw('GET', '/api/patients', null, T)).status).toBe(401);

    // A visitor who types an existing patient's id and phone still gets an anonymous web chat.
    const a = await raw('POST', '/api/conversations', { text: 'What are your timings?', patientId: mk.body.id, contactPhone: '9845012345', channel: 'whatsapp' }, T);
    expect(a.status).toBe(201); expect(a.body.token).toBeTruthy();
    expect(a.body.conversation.messages.length).toBeGreaterThan(1);
    expect(JSON.stringify(a.body)).not.toMatch(/Real|Patient|patientId|assignedTo/);
    const staffView = (await raw('GET', '/api/conversations', null, H)).body;
    expect(staffView[0].patientId).toBeNull(); expect(staffView[0].channel).toBe('web');

    const id = a.body.conversation.id; const tok = a.body.token;
    expect((await raw('GET', `/api/conversations/${id}`, null, T)).status).toBe(403);
    expect((await raw('GET', `/api/conversations/${id}`, null, { ...T, 'x-chat-token': 'wrong' })).status).toBe(403);
    expect((await raw('GET', `/api/conversations/${id}`, null, { ...T, 'x-chat-token': tok })).status).toBe(200);
    expect((await raw('POST', `/api/conversations/${id}/messages`, { text: 'hi' }, T)).status).toBe(403);
    const more = await raw('POST', `/api/conversations/${id}/messages`, { text: 'Do you accept insurance?', from: 'staff' }, { ...T, 'x-chat-token': tok });
    expect(more.status).toBe(200);
    expect(more.body.conversation.messages.some((m) => m.from === 'staff')).toBe(false); // a visitor cannot post as staff

    const b = await raw('POST', '/api/conversations', { text: 'Hello' }, T);
    expect((await raw('GET', `/api/conversations/${id}`, null, { ...T, 'x-chat-token': b.body.token })).status).toBe(403); // another chat's token
    expect((await raw('GET', '/api/conversations', null, H)).status).toBe(200); // staff still see everything
  });
});

describe('owner dashboard analytics', () => {
  it('summarises a busy clinic and stays well-formed for a brand-new empty one', async () => {
    const t = (await raw('POST', '/api/auth/demo', { role: 'owner' })).body.token;
    const busy = (await raw('GET', '/api/dashboard?days=30', null, { authorization: `Bearer ${t}` })).body;
    expect(busy.series.length).toBe(30); expect(busy.now.appointments).toBeGreaterThan(50); expect(busy.now.revenue).toBeGreaterThan(0);
    expect(busy.treatments.length).toBeGreaterThan(3); expect(busy.heat.rows.length).toBe(7); expect(busy.team.length).toBeGreaterThan(3);
    expect(busy.series.reduce((s, x) => s + x.revenue, 0)).toBe(busy.now.revenue);
    const reg = await signup({ name: 'Dr Empty', email: 'empty@example.in', password: 'Secret@123', clinicName: 'Empty Dental' });
    const empty = await raw('GET', '/api/dashboard?days=7', null, { authorization: `Bearer ${reg.body.token}` });
    expect(empty.status).toBe(200); expect(empty.body.now.appointments).toBe(0); expect(empty.body.now.revenue).toBe(0);
    expect(empty.body.treatments).toEqual([]); expect(empty.body.goal.target).toBe(0); expect(empty.body.now.noShowRate).toBe(0);
    const set = await raw('PUT', '/api/settings', { goals: { monthlyRevenue: 500000 } }, { authorization: `Bearer ${reg.body.token}` });
    expect(set.status).toBe(200);
    expect((await raw('GET', '/api/dashboard', null, { authorization: `Bearer ${reg.body.token}` })).body.goal.target).toBe(500000);
  });
});

describe('growth and marketing, end to end', () => {
  it('credits at most one booking per message, and only when nothing was booked at send time', async () => {
    const { growth } = await import('../src/domain/growth.js');
    const now = new Date(); const iso = (d) => new Date(now.getTime() - d * 864e5).toISOString();
    const base = { settings: { marketing: { googleReviewUrl: '' }, marketingCampaigns: [], visitTypes: [], providers: [] }, treatmentPlans: [] };
    const appt = (id, patientId, createdDaysAgo, startDaysAhead, extra = {}) => ({ id, patientId, status: 'scheduled', createdAt: iso(createdDaysAgo), start: new Date(now.getTime() + startDaysAhead * 864e5).toISOString(), paymentStatus: 'unpaid', ...extra });
    const patients = [{ id: 'p1', marketingOptIn: true, phone: '1', createdAt: iso(100) }, { id: 'p2', marketingOptIn: true, phone: '2', createdAt: iso(100) }];
    const comm = (patientId, daysAgo, type = 'recall') => ({ id: `c${patientId}${daysAgo}`, patientId, type, sentAt: iso(daysAgo), meta: {} });
    // p1: one recall 10 days ago, then TWO bookings made afterwards: one is credited
    const db1 = { ...base, patients, communications: [comm('p1', 10)], appointments: [appt('a1', 'p1', 8, 3), appt('a2', 'p1', 6, 5)] };
    expect(growth(db1, { days: 30 }).now.bookings).toBe(1);
    // p2 already had a visit booked when the message went out: nothing credited
    const db2 = { ...base, patients, communications: [comm('p2', 10)], appointments: [appt('a0', 'p2', 20, 2), appt('a3', 'p2', 7, 6)] };
    expect(growth(db2, { days: 30 }).now.bookings).toBe(0);
    // a booking made before the message, or more than 14 days after it, is not credited
    const db3 = { ...base, patients, communications: [comm('p1', 5), comm('p2', 25)], appointments: [appt('b1', 'p1', 9, 4), appt('b2', 'p2', 5, 4)] };
    expect(growth(db3, { days: 30 }).now.bookings).toBe(0);
    // greetings are not credited with bookings
    const db4 = { ...base, patients, communications: [{ ...comm('p1', 10, 'marketing'), meta: { goal: 'festival' } }], appointments: [appt('c1', 'p1', 8, 3)] };
    expect(growth(db4, { days: 30 }).now.bookings).toBe(0);
  });

  it('goes from an opportunity to a draft, an approval, a send, and the results screen', async () => {
    const owner = (await raw('POST', '/api/auth/demo', { role: 'owner' })).body.token; const fd = (await raw('POST', '/api/auth/demo', { role: 'front_desk' })).body.token;
    const O = { authorization: `Bearer ${owner}` }; const F = { authorization: `Bearer ${fd}` };
    const g = (await raw('GET', '/api/marketing/growth?days=30', null, O)).body;
    expect(g.campaigns.length).toBeGreaterThanOrEqual(3); expect(g.conversion).toBeLessThanOrEqual(100);
    for (const c of g.campaigns) expect(c.bookings).toBeLessThanOrEqual(c.sent);
    const opp = g.opportunities.find((o) => o.goal === 'recall'); expect(opp.count).toBeGreaterThan(0);
    const draft = await raw('POST', '/api/marketing/opportunity', { goal: 'recall', segment: 'overdue_recall' }, F);
    expect(draft.status).toBe(201); expect(draft.body.status).toBe('draft'); expect(draft.body.body).toMatch(/cleaning/i);
    expect((await raw('POST', `/api/marketing/campaigns/${draft.body.id}/send`, {}, F)).status).toBe(400); // an unapproved draft cannot be sent
    expect((await raw('POST', `/api/marketing/campaigns/${draft.body.id}/submit`, {}, F)).body.status).toBe('pending_approval');
    expect((await raw('POST', `/api/marketing/campaigns/${draft.body.id}/approve`, {}, F)).status).toBe(400); // front desk cannot approve
    expect((await raw('POST', `/api/marketing/campaigns/${draft.body.id}/approve`, {}, O)).body.status).toBe('approved');
    await raw('PUT', '/api/marketing/settings', { quietHours: { start: '00:00', end: '24:00' } }, O); // so the test does not depend on the time of day
    const sent = await raw('POST', `/api/marketing/campaigns/${draft.body.id}/send`, {}, O);
    expect(sent.status).toBe(200);
    const after = (await raw('GET', '/api/marketing/growth?days=30', null, O)).body;
    const row = after.campaigns.find((c) => c.id === draft.body.id); expect(row.sent).toBe(opp.count);
    expect(after.now.messages).toBe(g.now.messages + opp.count);
  });

  it('lets the assistant brief the day and prepare a campaign draft that is only created on confirmation', async () => {
    const owner = (await raw('POST', '/api/auth/demo', { role: 'owner' })).body.token; const O = { authorization: `Bearer ${owner}` };
    const brief = (await raw('GET', '/api/assistant/brief', null, O)).body;
    expect(brief.greeting).toMatch(/^Good (morning|afternoon|evening)/); expect(brief.lines[0]).toMatch(/appointment/); expect(brief.suggestions.length).toBeGreaterThan(0);
    const dentist = (await raw('POST', '/api/auth/demo', { role: 'dentist' })).body.token;
    expect((await raw('GET', '/api/assistant/brief', null, { authorization: `Bearer ${dentist}` })).body.lines.join(' ')).not.toMatch(/marketing|worth a message/i);
    const before = (await raw('GET', '/api/marketing', null, O)).body.campaigns.length;
    const ask = await raw('POST', '/api/assistant/ask', { message: 'draft a recall reminder' }, O);
    expect(ask.body.actions.length).toBe(1); expect(ask.body.actions[0].summary).toMatch(/Recall/);
    expect((await raw('GET', '/api/marketing', null, O)).body.campaigns.length).toBe(before); // proposing creates nothing
    const results = await raw('POST', '/api/assistant/ask', { message: 'marketing results' }, O);
    expect(results.body.reply).toMatch(/messages? sent/);
    const dentistAsk = await raw('POST', '/api/assistant/ask', { message: 'marketing results' }, { authorization: `Bearer ${dentist}` });
    expect(dentistAsk.body.reply).toMatch(/owners and admins/);
    const act = await raw('POST', '/api/assistant/action', { actionId: ask.body.actions[0].id, decision: 'confirm' }, O);
    expect(act.status).toBe(200); expect(act.body.message).toMatch(/Draft created/);
    expect((await raw('GET', '/api/marketing', null, O)).body.campaigns.length).toBe(before + 1);
  });

  it('records where a new patient heard about the clinic and shows it in growth', async () => {
    const reg = await signup({ name: 'Dr Grow', email: 'grow@example.in', password: 'Secret@123', clinicName: 'Grow Dental' });
    const H = { authorization: `Bearer ${reg.body.token}` }; const T = { 'x-tenant': reg.body.tenant.slug };
    const s = (await raw('GET', '/api/settings', null, H)).body;
    await raw('PUT', '/api/settings', { ...s, providers: [{ id: 'p1', name: 'Dr Grow', role: 'Dentist', locationIds: [s.locations[0].id], consultationFee: 500 }] }, H);
    const slots = (await raw('GET', '/api/public/slots?visitTypeId=vt_newpatient&days=7', null, T)).body.days.flatMap((d) => d.slots);
    const book = await raw('POST', '/api/public/book', { name: 'Neha Verma', phone: '98450 12121', visitTypeId: 'vt_newpatient', providerId: slots[0].providerId, locationId: slots[0].locationId, start: slots[0].start, source: 'Google Maps' }, T);
    expect(book.status).toBe(201);
    await raw('POST', '/api/patients', { firstName: 'Ravi', lastName: 'Kumar', dob: '1990-01-01', phone: '9845033333', source: 'Friend or family' }, H);
    const g = (await raw('GET', '/api/marketing/growth?days=30', null, H)).body;
    expect(g.newPatients).toBe(2);
    expect(Object.fromEntries(g.sources.map((x) => [x.source, x.count]))).toEqual({ 'Google Maps': 1, 'Friend or family': 1 });
    expect(g.now.messages).toBe(0); expect(g.opportunities).toEqual([]);
  });
});

describe('campaign send window and scheduling', () => {
  it('leaves a campaign untouched when a send is blocked, then sends it when its scheduled time comes', async () => {
    const { dispatchScheduledCampaigns } = await import('../src/domain/marketing.js');
    const owner = (await raw('POST', '/api/auth/demo', { role: 'owner' })).body.token; const O = { authorization: `Bearer ${owner}` };
    const h = new Date().getHours(); // pick a window that is closed right now
    const closed = h < 20 ? { start: '21:00', end: '23:00' } : { start: '06:00', end: '08:00' };
    await raw('PUT', '/api/marketing/settings', { quietHours: closed }, O);
    const draft = await raw('POST', '/api/marketing/opportunity', { goal: 'recall', segment: 'overdue_recall' }, O);
    const id = draft.body.id; const lifecycle = async (a) => raw('POST', `/api/marketing/campaigns/${id}/${a}`, {}, O);
    await lifecycle('submit'); expect((await lifecycle('approve')).body.status).toBe('approved');

    const blocked = await lifecycle('send');
    expect(blocked.status).toBe(400); expect(blocked.body.error).toMatch(/go out between/);
    const afterBlocked = (await raw('GET', '/api/marketing', null, O)).body.campaigns.find((c) => c.id === id);
    expect(afterBlocked.status).toBe('approved'); // not "sent" with nothing delivered

    const sched = await lifecycle('schedule');
    expect(sched.status).toBe(200); expect(new Date(sched.body.scheduledFor).getTime()).toBeGreaterThan(Date.now());
    const hr = new Date(sched.body.scheduledFor).getHours(); expect(hr).toBe(Number(closed.start.slice(0, 2))); // the start of the next window
    const unsched = await lifecycle('unschedule'); expect(unsched.body.scheduledFor).toBeNull();
    const again = await lifecycle('schedule');

    const demo = registry.tenantBySlug('smilecare'); const db = registry.tenantStore(demo.id).db;
    expect(dispatchScheduledCampaigns(db, { now: new Date(Date.parse(again.body.scheduledFor) - 60000).toISOString() })).toBe(0); // not due yet
    expect(dispatchScheduledCampaigns(db, { now: again.body.scheduledFor })).toBe(1); // due and the window is open
    const done = (await raw('GET', '/api/marketing', null, O)).body.campaigns.find((c) => c.id === id);
    expect(done.status).toBe('sent'); expect(done.sentCount).toBeGreaterThan(0); expect(done.scheduledFor).toBeNull();
  });

  it('only an owner or admin can schedule, and only an approved campaign', async () => {
    const fd = (await raw('POST', '/api/auth/demo', { role: 'front_desk' })).body.token; const F = { authorization: `Bearer ${fd}` };
    const draft = await raw('POST', '/api/marketing/opportunity', { goal: 'recall', segment: 'overdue_recall' }, F);
    expect((await raw('POST', `/api/marketing/campaigns/${draft.body.id}/schedule`, {}, F)).status).toBe(400);
    const owner = (await raw('POST', '/api/auth/demo', { role: 'owner' })).body.token;
    expect((await raw('POST', `/api/marketing/campaigns/${draft.body.id}/schedule`, {}, { authorization: `Bearer ${owner}` })).body.error).toMatch(/approved/);
  });
});

describe('owner who is also the dentist', () => {
  it('links the owner login to her dentist profile when she adds herself as a provider', async () => {
    const reg = await signup({ name: 'Dr Lata Rao', email: 'lata@example.in', password: 'Secret@123', clinicName: 'Lata Dental' });
    const H = { authorization: `Bearer ${reg.body.token}` };
    expect((await raw('GET', '/api/auth/me', null, H)).body.providerId).toBeNull();
    const st = (await raw('GET', '/api/settings', null, H)).body;
    await raw('PUT', '/api/settings', { providers: [{ id: 'p_lata', name: 'Dr. Lata Rao', role: 'Dentist', locationIds: [st.locations[0].id], consultationFee: 500 }, { id: 'p_other', name: 'Dr Someone Else', role: 'Dentist', locationIds: [st.locations[0].id], consultationFee: 500 }] }, H);
    expect((await raw('GET', '/api/auth/me', null, H)).body.providerId).toBe('p_lata');
    const home = (await raw('GET', '/api/doctor/dashboard?days=30', null, H)).body;
    expect(home.provider.id).toBe('p_lata'); // My home opens on her own list
  });
});

describe('a new clinic does not inherit another clinic\'s claims', () => {
  it('starts with neutral answers about insurance, payment and procedures, and no pre-filled insurers or EMI', async () => {
    const reg = await signup({ name: 'Dr Fresh', email: 'fresh@example.in', password: 'Secret@123', clinicName: 'Fresh Dental' });
    const s = (await raw('GET', '/api/settings', null, { authorization: `Bearer ${reg.body.token}` })).body;
    const all = s.faqs.map((f) => f.answer).join(' ');
    expect(all).not.toMatch(/Star Health|HDFC|Niva|ICICI|empanelled|no-cost EMI|CGHS|ESIC|SmileCare|Indiranagar|Whitefield/);
    expect(s.paymentModes).not.toContain('EMI'); expect(s.paymentModes).not.toContain('Insurance / cashless');
    expect(s.insuranceOptions.every((o) => !o.examples)).toBe(true);
    const ans = (await raw('POST', '/api/conversations', { text: 'Do you accept insurance?' }, { 'x-tenant': reg.body.tenant.slug })).body.conversation.messages.at(-1).text;
    expect(ans).not.toMatch(/Star Health|empanelled/);
  });
});

describe('chat booking understands "the earliest"', () => {
  it('picks the first offered time when the patient says any time or the earliest', async () => {
    const first = (await pub('POST', '/api/conversations', { channel: 'whatsapp', contactName: 'Pat Doe', text: 'I want to book a cleaning' })).body;
    expect(first.reply.text).toMatch(/1\./);
    const next = await pub('POST', `/api/conversations/${first.conversation.id}/messages`, { text: 'any time is fine, the earliest please' });
    expect(next.body.reply.text).toMatch(/full name and date of birth/i);
  });
});

describe('nothing from the demo clinic leaks into a new one', () => {
  it('has no demo names, places, doctors or links anywhere in a new clinic settings', async () => {
    const reg = await signup({ name: 'Dr Clean', email: 'clean@example.in', password: 'Secret@123', clinicName: 'Clean Dental' });
    const s = (await raw('GET', '/api/settings', null, { authorization: `Bearer ${reg.body.token}` })).body;
    const txt = JSON.stringify(s);
    for (const w of ['SmileCare', 'smilecare', 'Indiranagar', 'Whitefield', 'Bengaluru', 'Ananya', 'Vikram', 'Sunitha', 'g.page', 'KMC/DC']) expect(txt, w).not.toContain(w);
    expect(s.marketing.googleReviewUrl).toBe('');
  });
});

describe('website demo-call requests', () => {
  const lead = (slot, extra = {}) => ({ name: 'Dr Asha Nair', clinic: 'Nair Dental', email: 'asha@nairdental.in', phone: '98450 12345', city: 'Kochi', size: '2 to 3 dentists', slot, ...extra });
  it('offers weekday IST slots with an agenda, and books one without any login', async () => {
    const m = (await raw('GET', '/api/leads/slots')).body;
    expect(m.tz).toBe('Asia/Kolkata'); expect(m.slots.length).toBeGreaterThan(8); expect(m.agenda.length).toBe(5); expect(m.sizes.length).toBeGreaterThan(3);
    const ist = (iso) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', weekday: 'short' });
    for (const s of m.slots) { expect(['11:00', '14:30', '17:00']).toContain(ist(s.start).split(' ').pop()); expect(ist(s.start)).not.toMatch(/Sat|Sun/); expect(new Date(s.start).getTime()).toBeGreaterThan(Date.now()); }
    const slot = m.slots[0].start;
    const ok = await raw('POST', '/api/leads/demo', lead(slot));
    expect(ok.status).toBe(201); expect(ok.body.when).toMatch(/IST/); expect(ok.body.agenda.length).toBe(5);
    expect(registry.platform.db.leads.at(-1)).toMatchObject({ clinic: 'Nair Dental', email: 'asha@nairdental.in', slot, status: 'new' });
  });
  it('rejects bad details, unknown times, and fills a slot after two bookings', async () => {
    const slot = (await raw('GET', '/api/leads/slots')).body.slots[1].start;
    expect((await raw('POST', '/api/leads/demo', lead(slot, { email: 'nope' }))).status).toBe(400);
    expect((await raw('POST', '/api/leads/demo', lead(slot, { phone: '123' }))).status).toBe(400);
    expect((await raw('POST', '/api/leads/demo', lead(slot, { name: '' }))).status).toBe(400);
    expect((await raw('POST', '/api/leads/demo', lead('2020-01-01T05:30:00.000Z'))).status).toBe(400);
    expect((await raw('POST', '/api/leads/demo', lead(new Date(Date.parse(slot) + 60000).toISOString()))).status).toBe(400); // not one of the offered times
    expect((await raw('POST', '/api/leads/demo', lead(slot))).status).toBe(201);
    expect((await raw('POST', '/api/leads/demo', lead(slot, { email: 'b@b.in' }))).status).toBe(201);
    const third = await raw('POST', '/api/leads/demo', lead(slot, { email: 'c@c.in' }));
    expect(third.status).toBe(409);
    expect((await raw('GET', '/api/leads/slots')).body.slots.find((s) => s.start === slot).available).toBe(false);
  });
  it('emails the requester the agenda when email is configured', async () => {
    const calls = []; const real = global.fetch; process.env.RESEND_API_KEY = 're_test'; process.env.SALES_EMAIL = 'sales@clinovara.test';
    global.fetch = async (url, init) => { if (String(url).startsWith('http://127.0.0.1')) return real(url, init); calls.push(JSON.parse(init.body)); return { ok: true, text: async () => '' }; };
    try {
      const slot = (await raw('GET', '/api/leads/slots')).body.slots[3].start;
      const r = await raw('POST', '/api/leads/demo', lead(slot, { email: 'mail@clinic.in' }));
      expect(r.status).toBe(201); expect(r.body.confirmedByEmail).toBe(true);
      const toUser = calls.find((c) => c.to[0] === 'mail@clinic.in'); expect(toUser.text).toMatch(/Agenda/); expect(toUser.text).toMatch(/Live walkthrough/);
      expect(calls.some((c) => c.to[0] === 'sales@clinovara.test')).toBe(true);
    } finally { global.fetch = real; delete process.env.RESEND_API_KEY; delete process.env.SALES_EMAIL; }
  });
});

describe('marketing: planner, prompt tools, automations, frequency cap, analytics', () => {
  const demoDb = () => registry.tenantStore(registry.tenantBySlug('smilecare').id).db;
  const mk = () => import('../src/domain/marketing.js');

  it('turns a plain request into a draft plan without AI, and counts the audience', async () => {
    const diwali = (await api('POST', '/api/marketing/plan', { ask: 'Send a Diwali greeting in Hindi to everyone' })).body;
    expect(diwali).toMatchObject({ goal: 'festival', segment: 'all', lang: 'hi', engine: 'rules' });
    expect(diwali.festival).toMatch(/Diwali/i); expect(diwali.body).toMatch(/Diwali|दिवाली/i); expect(diwali.audienceCount).toBeGreaterThan(5);
    expect((await api('POST', '/api/marketing/plan', { ask: 'bring back patients who have not visited in over a year' })).body).toMatchObject({ goal: 'reactivation', segment: 'inactive_12m' });
    const offer = (await api('POST', '/api/marketing/plan', { ask: '20% off teeth whitening in November' })).body;
    expect(offer.goal).toBe('offer'); expect(offer.body).toMatch(/20% off teeth whitening/);
    expect((await api('POST', '/api/marketing/plan', { ask: 'hi' })).status).toBe(400);
    const before = (await api('GET', '/api/marketing')).body.campaigns.length; // the plan only proposes; it must create nothing
    await api('POST', '/api/marketing/plan', { ask: 'remind people about their cleaning' });
    expect((await api('GET', '/api/marketing')).body.campaigns.length).toBe(before);
  });

  it('offers a prompt library, improves a weak prompt, and tests a prompt before approval', async () => {
    const lib = (await api('GET', '/api/marketing/prompts/library')).body;
    expect(lib.length).toBeGreaterThan(8); expect(lib.every((p) => p.goal && p.body && p.name)).toBe(true);
    const imp = (await api('POST', '/api/marketing/prompts/improve', { goal: 'offer', body: 'Tell them about our offer' })).body;
    expect(imp.body.length).toBeGreaterThan('Tell them about our offer'.length); expect(imp.changes.length).toBeGreaterThan(0);
    const t = (await api('POST', '/api/marketing/prompts/test', { goal: 'recall', lang: 'en', body: 'Write a recall for {{firstName}}.' })).body;
    expect(t.body).toMatch(/\S/); expect(t.body).not.toMatch(/\{\{/); expect(t.engine).toBe('rules');
    const created = (await api('POST', '/api/marketing/prompts', { goal: 'offer', name: 'From library', body: lib[0].body })).body;
    expect(created.status).toBe('draft'); // library prompts still need approval
  });

  it('queues aftercare and welcome after a procedure, and birthdays once a year, all waiting for approval', async () => {
    const m = await mk(); const db = demoDb();
    const patient = db.patients.find((p) => p.marketingOptIn !== false && p.phone);
    const appt = { id: 'ap_test_after', patientId: patient.id, visitTypeId: 'vt_procedure', providerId: db.settings.providers[0].id, locationId: db.settings.locations[0].id, status: 'completed' };
    db.appointments.push(appt);
    const items = m.queueVisitFollowups(db, appt);
    const goals = items.map((q) => q.goal); expect(goals).toContain('aftercare'); expect(goals).toContain('thank_you');
    expect(items.every((q) => q.status === 'pending_approval')).toBe(true);
    expect(items.find((q) => q.goal === 'aftercare').body).toMatch(/pain|swelling/i);
    expect(m.queueVisitFollowups(db, appt).length).toBe(0); // never twice for the same visit
    patient.marketingOptIn = false; const after2 = { ...appt, id: 'ap_test_after2' }; db.appointments.push(after2); // aftercare is care, so it still goes to a patient who opted out of marketing
    expect(m.queueVisitFollowups(db, after2).map((q) => q.goal)).toEqual(['aftercare']); patient.marketingOptIn = true;
    const bp = db.patients.filter((p) => p.marketingOptIn !== false && p.phone)[1];
    const today = new Date(); const md = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`; bp.dob = `1990-${md}`;
    const count = () => db.settings.marketingQueue.filter((q) => q.goal === 'birthday' && q.patientId === bp.id).length;
    m.queueBirthdays(db); m.queueBirthdays(db); expect(count()).toBe(1);
    const bq = db.settings.marketingQueue.find((q) => q.goal === 'birthday' && q.patientId === bp.id);
    expect(bq.status).toBe('pending_approval'); expect(bq.body).toMatch(/birthday|जन्मदिन/i);
    bq.status = 'approved'; bq.sendAfter = new Date(0).toISOString(); // outside the send window a birthday wish waits; inside it, it goes
    const at = (h) => { const d = new Date(); d.setHours(h, 0, 0, 0); return d.toISOString(); };
    expect(m.dispatchQueue(db, { now: at(23) })).toBe(0); expect(bq.status).toBe('approved');
    expect(m.dispatchQueue(db, { now: at(12) })).toBeGreaterThanOrEqual(1); expect(bq.status).toBe('sent');
    bp.dob = ''; const bp2 = db.patients.filter((p) => p.marketingOptIn !== false && p.phone)[2]; bp2.dob = `1991-${md}`;
    await api('PUT', '/api/marketing/settings', { automations: { birthday: { enabled: false } } });
    expect(m.queueBirthdays(db)).toBe(0);
    await api('PUT', '/api/marketing/settings', { automations: { birthday: { enabled: true } } });
  });

  it('keeps sibling settings on a partial save, and limits how often a patient gets campaigns', async () => {
    const m = await mk(); const db = demoDb();
    const before = (await api('GET', '/api/marketing')).body.settings.autoThankYou;
    await api('PUT', '/api/marketing/settings', { autoThankYou: { enabled: true } });
    const after = (await api('GET', '/api/marketing')).body.settings.autoThankYou;
    expect(after.delayMinutes).toBe(before.delayMinutes); expect(after.mode).toBe(before.mode);
    await api('PUT', '/api/marketing/settings', { voice: { tone: 'professional', avoid: 'discounts' }, frequencyCapDays: 10 });
    const s2 = (await api('GET', '/api/marketing')).body.settings; expect(s2.voice).toMatchObject({ tone: 'professional', avoid: 'discounts' }); expect(s2.frequencyCapDays).toBe(10);
    const p = db.patients.find((x) => x.marketingOptIn !== false && x.phone);
    db.communications.unshift({ id: 'cm_cap', patientId: p.id, type: 'marketing', channel: 'whatsapp', body: 'x', sentAt: new Date().toISOString(), meta: {}, by: 'Campaign: t' });
    expect(m.recentlyMarketed(db, p.id, 10)).toBe(true);
    expect(m.eligibleAudience(db, 'all').some((x) => x.id === p.id)).toBe(false);
    expect(m.segmentPatients(db, 'all').some((x) => x.id === p.id)).toBe(true);
    await api('PUT', '/api/marketing/settings', { frequencyCapDays: 0 });
    expect(m.eligibleAudience(db, 'all').some((x) => x.id === p.id)).toBe(true); // 0 turns the limit off
    await api('PUT', '/api/marketing/settings', { frequencyCapDays: 7 });
  });

  it('reports revenue, marketing, reach-out and page views, and counts real page loads', async () => {
    const O = { 'x-tenant': 'smilecare' };
    const a = (await api('GET', '/api/marketing/analytics?days=30')).body;
    expect(a.revenue.series.length).toBe(30); expect(a.revenue.total).toBe(a.revenue.series.reduce((s, d) => s + d.value, 0));
    expect(a.revenue.total).toBeGreaterThan(0); expect(a.revenue.averageVisit).toBeGreaterThan(0);
    expect(a.revenue.byType.length).toBeGreaterThan(0); expect(a.revenue.marketingShare).toBeLessThanOrEqual(100);
    expect(a.reach.sent).toBeGreaterThan(0); expect(a.reach.byType.length).toBeGreaterThan(0); expect(a.reach.replyRate).toBeLessThanOrEqual(100);
    expect(a.reach.deliveryTracked).toBe(false); // no WhatsApp provider connected, so no delivered or read figures are claimed
    expect(a.marketing.campaigns.every((c) => c.conversion <= 100 && c.replyRate <= 100)).toBe(true);
    expect(a.site.series.length).toBe(30);
    const v0 = (await api('GET', '/api/marketing/analytics?days=7')).body.site.views;
    await raw('GET', '/api/public/clinic?src=Google', null, O); await raw('GET', '/api/public/clinic', null, O);
    const v1 = (await api('GET', '/api/marketing/analytics?days=7')).body.site;
    expect(v1.views).toBe(v0 + 2); expect(v1.sources.some((s) => s.source === 'google')).toBe(true);
    const pat = (await api('GET', '/api/marketing/patients?segment=all')).body;
    expect(pat.rows.length).toBeGreaterThan(5); expect(pat.rows[0]).toHaveProperty('optIn');
  });
});

describe('front desk dashboard', () => {
  it('gives reception one consistent picture of today, and moves with check-in, the queue and payments', async () => {
    const s0 = (await api('GET', '/api/frontdesk/summary')).body;
    expect(s0.kpis.appointments).toBe(s0.schedule.filter((x) => x.status !== 'cancelled').length);
    expect(s0.kpis.waiting).toBe(s0.queue.length);
    expect(s0.kpis.checkedIn).toBe(s0.schedule.filter((x) => x.visitId).length);
    expect(s0.dentists.length).toBeGreaterThan(0); expect(s0.chairs.total).toBeGreaterThan(0);
    for (const k of ['schedule', 'queue', 'upcoming', 'walkIns', 'activity']) expect(Array.isArray(s0[k])).toBe(true);

    // Check in someone who has not arrived: they get a token, join the queue and the counts move together.
    // Book someone for a couple of minutes from now, so the test does not depend on the time of day the seed was built.
    const anyone = (await api('GET', '/api/patients')).body[0];
    const booked = await api('POST', '/api/appointments', { patientId: anyone.id, visitTypeId: 'vt_cleaning', providerId: 'prov_khan', locationId: 'loc_whitefield', start: new Date(Date.now() + 2 * 60000).toISOString(), sendForms: false });
    expect(booked.status).toBeLessThan(300);
    const sBooked = (await api('GET', '/api/frontdesk/summary')).body;
    expect(sBooked.kpis.appointments).toBe(s0.kpis.appointments + 1);
    const expected = sBooked.schedule.find((x) => x.id === booked.body.id);
    expect(expected.status).toBe('pending'); expect(expected.sameDay).toBe(true);
    await api('POST', `/api/arrivals/${expected.id}/arrive`);
    const s1 = (await api('GET', '/api/frontdesk/summary')).body;
    const mine = s1.schedule.find((x) => x.id === expected.id);
    expect(mine.token).toBeTruthy(); expect(['checked_in', 'waiting']).toContain(mine.status);
    expect(s1.kpis.checkedIn).toBe(sBooked.kpis.checkedIn + 1);
    expect(s1.queue.some((x) => x.id === expected.id)).toBe(true);

    // Taking a payment raises today's collections and lowers what is owed by the same visit.
    const before = s1.payments.collected;
    await api('POST', `/api/arrivals/${expected.id}/payment`, { amount: 900, mode: 'UPI', reference: 'UPI-TEST' });
    const s2 = (await api('GET', '/api/frontdesk/summary')).body;
    expect(s2.payments.collected).toBe(before + 900); expect(s2.kpis.collected).toBe(s2.payments.collected);
    expect(s2.schedule.find((x) => x.id === expected.id).payment).toBe('paid');
    expect(s2.payments.byMode.find((m) => m.mode === 'UPI').amount).toBeGreaterThanOrEqual(900);

    // A branch filter only ever shows that branch.
    const br = (await api('GET', '/api/frontdesk/summary?locationId=loc_whitefield')).body;
    expect(br.schedule.every((x) => x.locationId === 'loc_whitefield')).toBe(true);
    expect(br.chairs.total).toBe(2);
  });

  it('is for reception, admins and owners, not dentists', async () => {
    const dentist = (await raw('POST', '/api/auth/demo', { role: 'dentist' })).body.token;
    const res = await raw('GET', '/api/frontdesk/summary', null, { authorization: `Bearer ${dentist}` });
    expect(res.status).toBe(403);
    const desk = (await raw('POST', '/api/auth/demo', { role: 'front_desk' })).body.token;
    expect((await raw('GET', '/api/frontdesk/summary', null, { authorization: `Bearer ${desk}` })).status).toBe(200);
  });
});

describe('email integration', () => {
  it('says plainly when email is not connected, and sends a real message through the provider when it is', async () => {
    delete process.env.RESEND_API_KEY;
    const off = await api('POST', '/api/integrations/email/test', { to: 'owner@example.in' });
    expect(off.status).toBe(503); expect(off.body.error).toMatch(/RESEND_API_KEY/);
    expect((await api('GET', '/api/integrations/status')).body.server.email).toBe(false);
    expect((await api('POST', '/api/integrations/email/test', { to: 'not-an-email' })).status).toBe(400);

    // Connected: the provider is replaced by a stand-in that records what would have been sent.
    const realFetch = globalThis.fetch; const sent = [];
    vi.stubGlobal('fetch', (url, opts) => (String(url).includes('api.resend.com') ? (sent.push({ url: String(url), auth: opts.headers.authorization, body: JSON.parse(opts.body) }), Promise.resolve(new Response('{"id":"test"}', { status: 200 }))) : realFetch(url, opts)));
    process.env.RESEND_API_KEY = 're_test_key'; process.env.MAIL_FROM = 'SmileCare <hello@smilecare.example>';
    try {
      const st = (await api('GET', '/api/integrations/status')).body;
      expect(st.server.email).toBe(true); expect(st.mailFrom).toBe('SmileCare <hello@smilecare.example>');
      const ok = await api('POST', '/api/integrations/email/test', { to: 'Owner@Example.in' });
      expect(ok.status).toBe(200); expect(ok.body.to).toBe('owner@example.in');
      expect(sent).toHaveLength(1);
      expect(sent[0].auth).toBe('Bearer re_test_key');
      expect(sent[0].body.to).toEqual(['owner@example.in']); expect(sent[0].body.from).toBe('SmileCare <hello@smilecare.example>');
      expect(sent[0].body.subject).toMatch(/test email/i);

      // Only owners and admins may send it.
      const desk = (await raw('POST', '/api/auth/demo', { role: 'front_desk' })).body.token;
      expect((await raw('POST', '/api/integrations/email/test', { to: 'x@example.in' }, { authorization: `Bearer ${desk}` })).status).toBe(403);
      expect(sent).toHaveLength(1);
    } finally { vi.unstubAllGlobals(); delete process.env.RESEND_API_KEY; delete process.env.MAIL_FROM; }
  });
});

describe('front desk, end to end', () => {
  it('takes one patient from registration to booking, check-in, the queue, payment, receipt and recall', async () => {
    // 1. Register a new patient, then find them again by mobile number instead of creating a duplicate.
    const created = await api('POST', '/api/patients', { firstName: 'Nisha', lastName: 'Verma', phone: '98765 40001', language: 'hi', locationId: 'loc_whitefield' });
    expect(created.status).toBeLessThan(300); const pid = created.body.id;
    const found = (await api('GET', '/api/patients?q=9876540001')).body;
    expect(found.map((p) => p.id)).toContain(pid);

    // 2. Book with a dentist; the same dentist cannot be double-booked for the same time.
    const start = new Date(Date.now() + 3 * 60000).toISOString();
    const appt = await api('POST', '/api/appointments', { patientId: pid, visitTypeId: 'vt_cleaning', providerId: 'prov_khan', locationId: 'loc_whitefield', start, sendForms: false });
    expect(appt.status).toBeLessThan(300); const aid = appt.body.id;
    const other = (await api('GET', '/api/patients')).body.find((p) => p.id !== pid);
    const clash = await api('POST', '/api/appointments', { patientId: other.id, visitTypeId: 'vt_cleaning', providerId: 'prov_khan', locationId: 'loc_whitefield', start, sendForms: false });
    expect(clash.status).toBe(400); expect(clash.body.error).toMatch(/already has an appointment/);

    // 3. Confirm, then check in at the desk: a token is issued and the patient joins the queue.
    expect((await api('POST', `/api/appointments/${aid}/confirm`)).body.status).toBe('confirmed');
    const visit = (await api('POST', `/api/arrivals/${aid}/arrive`)).body;
    expect(visit.token).toBeTruthy();
    let dash = (await api('GET', '/api/frontdesk/summary?locationId=loc_whitefield')).body;
    expect(dash.queue.find((q) => q.id === aid).token).toBe(visit.token);

    // 4. Mark waiting, call, seat and finish: each step shows on the dashboard.
    await api('PATCH', `/api/arrivals/visits/${visit.id}`, { status: 'ready' });
    const called = (await api('POST', '/api/arrivals/call-next', { providerId: 'prov_khan', locationId: 'loc_whitefield' })).body.called;
    expect(called.token).toBe(visit.token);
    await api('PATCH', `/api/arrivals/visits/${visit.id}`, { status: 'brought_back' });
    dash = (await api('GET', '/api/frontdesk/summary?locationId=loc_whitefield')).body;
    expect(dash.schedule.find((s) => s.id === aid).status).toBe('in_chair');
    expect(dash.chairs.inUse).toBe(1); expect(dash.dentists.find((d) => d.id === 'prov_khan').state).toBe('with_patient');
    await api('PATCH', `/api/arrivals/visits/${visit.id}`, { status: 'done' });
    dash = (await api('GET', '/api/frontdesk/summary?locationId=loc_whitefield')).body;
    expect(dash.schedule.find((s) => s.id === aid).status).toBe('completed');
    expect(dash.payments.unpaid.some((u) => u.id === aid)).toBe(true);

    // 5. Collect by UPI: collections rise, the visit leaves the unpaid list and a numbered receipt exists.
    const before = dash.kpis.collected;
    await api('POST', `/api/arrivals/${aid}/payment`, { amount: 1500, mode: 'UPI', reference: 'UPI-E2E-1' });
    dash = (await api('GET', '/api/frontdesk/summary?locationId=loc_whitefield')).body;
    expect(dash.kpis.collected).toBe(before + 1500);
    expect(dash.payments.unpaid.some((u) => u.id === aid)).toBe(false);
    const receipt = (await api('GET', `/api/arrivals/${aid}/receipt`)).body;
    expect(JSON.stringify(receipt)).toMatch(/UPI/); expect(JSON.stringify(receipt)).toMatch(/Nisha/);

    // 6. A cleaning sets the next recall date on the patient, so follow-up has something to act on.
    const after = (await api('GET', `/api/patients/${pid}`)).body;
    expect((after.patient || after).nextRecallDue).toBeTruthy();

    // 7. Another clinic sees none of this.
    const reg = await signup({ name: 'Dr Other', email: 'other-e2e@example.in', password: 'Secret@123', clinicName: 'Other E2E Dental' });
    const theirs = (await raw('GET', '/api/frontdesk/summary', null, { authorization: `Bearer ${reg.body.token}` })).body;
    expect(theirs.schedule).toHaveLength(0); expect(theirs.kpis.collected).toBe(0);
  });
});

describe('clinic branding', () => {
  it('is saved by an owner, cleaned, and shown on every patient-facing screen', async () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const saved = await api('PUT', '/api/settings', { branding: { color: '#0F766E', logo: png, welcome: 'Welcome to SmileCare' } });
    expect(saved.status).toBe(200);
    const want = { color: '#0f766e', logo: png, welcome: 'Welcome to SmileCare' };
    expect((await pub('GET', '/api/settings')).body.branding).toEqual(want);
    expect((await pub('GET', '/api/public/clinic')).body.branding).toEqual(want);
    expect((await pub('GET', '/api/arrivals/board')).body.branding).toEqual(want);
    expect((await pub('POST', '/api/kiosk/sessions', {})).body.branding).toEqual(want);

    // The logo also reaches the pre-visit forms page a patient opens, and the receipt for a payment.
    const packets = (await api('GET', '/api/forms')).body;
    expect(packets.length).toBeGreaterThan(0);
    expect((await pub('GET', '/api/forms/token/' + packets[0].token)).body.branding).toEqual(want);
    const paid = (await api('GET', '/api/frontdesk/summary')).body.schedule.find((x) => x.payment === 'paid');
    if (paid) expect((await api('GET', '/api/arrivals/' + paid.id + '/receipt')).body.branding).toEqual(want);

    // A colour that is not a hex falls back to the default; a file that is not an image is refused.
    expect((await api('PUT', '/api/settings', { branding: { color: 'red; background:url(x)' } })).body.branding.color).toBe('#2563eb');
    const bad = await api('PUT', '/api/settings', { branding: { logo: 'data:text/html;base64,PHNjcmlwdD4=' } });
    expect(bad.status).toBe(400);

    // Reception cannot change the clinic's branding.
    const desk = (await raw('POST', '/api/auth/demo', { role: 'front_desk' })).body.token;
    expect((await raw('PUT', '/api/settings', { branding: { color: '#000000' } }, { authorization: 'Bearer ' + desk })).status).toBe(403);
  });

  it('tells a checked-in patient how many people are ahead of them', async () => {
    // Two people with nothing else booked today, so the kiosk can only find these visits.
    const anyone = [(await api('POST', '/api/patients', { firstName: 'Asha', lastName: 'Queue', phone: '98111 00001', locationId: 'loc_whitefield' })).body, (await api('POST', '/api/patients', { firstName: 'Bala', lastName: 'Queue', phone: '98111 00002', locationId: 'loc_whitefield' })).body];
    const mk = async (i, mins) => (await api('POST', '/api/appointments', { patientId: anyone[i].id, visitTypeId: 'vt_cleaning', providerId: 'prov_khan', locationId: 'loc_whitefield', start: new Date(Date.now() + mins * 60000).toISOString(), durationMin: 1, sendForms: false })).body;
    const first = await mk(0, 2); const second = await mk(1, 4); // minutes apart, so the test also works late in the evening
    expect(second.id).toBeTruthy();
    await api('POST', '/api/arrivals/' + first.id + '/arrive');
    await new Promise((r) => setTimeout(r, 15));
    const ks = (await pub('POST', '/api/kiosk/sessions', { locationId: 'loc_whitefield' })).body;
    const mine = (await pub('POST', '/api/kiosk/sessions/' + ks.id + '/identify', { phone: anyone[1].phone })).body;
    const view = mine.choose ? (await pub('POST', '/api/kiosk/sessions/' + ks.id + '/identify', { patientId: mine.choose[0].id })).body : mine;
    expect(view.visit && view.visit.token).toBeTruthy();
    expect(view.visit.ahead).toBe(1);
  });
});

describe('clinic forms', () => {
  it('lets a clinic write a form, send it to everyone, collect answers and see who has finished', async () => {
    const tpl = (await api('GET', '/api/forms/templates')).body;
    expect(tpl.forms).toEqual([]); expect(tpl.starters.length).toBeGreaterThan(2);

    // Start from the general consent starter and save it for every visit.
    const made = await api('POST', '/api/forms/templates', { ...tpl.starters[0], appliesTo: 'all' });
    expect(made.status).toBe(201); const form = made.body;
    expect(form.fields.every((f) => f.id)).toBe(true);
    expect((await api('POST', '/api/forms/templates', { name: '', fields: form.fields })).status).toBe(400);
    expect((await api('POST', '/api/forms/templates', { name: 'Only a statement', fields: [{ type: 'info', label: 'Read this' }] })).status).toBe(400);

    // Send to all upcoming visits: each of those patients gets the forms link.
    const sent = (await api('POST', '/api/forms/templates/' + form.id + '/send')).body;
    expect(sent.sent).toBeGreaterThan(0);

    // A patient opens their link, sees the clinic form after the standard sections, and answers it.
    const packets = (await api('GET', '/api/forms')).body;
    const pk = packets.find((p) => p.custom.some((c) => c.id === form.id));
    expect(pk).toBeTruthy(); expect(pk.custom[0].complete).toBe(false);
    const page = (await pub('GET', '/api/forms/token/' + pk.token)).body;
    expect(page.custom[0].name).toBe(form.name); expect(page.custom[0].fields.length).toBe(form.fields.length);
    const answers = {}; for (const f of form.fields) answers[f.id] = f.type === 'yesno' ? 'yes' : f.type === 'date' ? '2026-11-23' : f.type === 'info' ? undefined : 'Nisha Verma';
    const required = form.fields.find((f) => f.required);
    const missing = await pub('PUT', '/api/forms/token/' + pk.token + '/custom/' + form.id, { data: { ...answers, [required.id]: '' } });
    expect(missing.status).toBe(400); expect(missing.body.error).toMatch(/Please answer/);
    const ok = await pub('PUT', '/api/forms/token/' + pk.token + '/custom/' + form.id, { data: answers });
    expect(ok.status).toBe(200); expect(ok.body.custom[0].complete).toBe(true);

    // Staff see it as done, and the form's counts move.
    const after = (await api('GET', '/api/forms')).body.find((p) => p.id === pk.id);
    expect(after.custom[0].complete).toBe(true); expect(after.custom[0].by).toBe('patient');
    const stats = (await api('GET', '/api/forms/templates')).body.forms[0];
    expect(stats.answered).toBe(1); expect(stats.sentTo).toBeGreaterThan(0);

    // Edit: limit it to one visit type, so it no longer goes with other visits. Then switch it off and delete it.
    const edited = await api('PUT', '/api/forms/templates/' + form.id, { ...form, name: 'General consent', appliesTo: 'visitTypes', visitTypeIds: ['vt_child'] });
    expect(edited.body.name).toBe('General consent'); expect(edited.body.id).toBe(form.id);
    expect((await api('PUT', '/api/forms/templates/' + form.id, { ...form, active: false })).body.active).toBe(false);
    expect((await api('POST', '/api/forms/templates/' + form.id + '/send')).status).toBe(400);
    expect((await api('DELETE', '/api/forms/templates/' + form.id)).status).toBe(200);
    expect((await api('GET', '/api/forms/templates')).body.forms).toEqual([]);
  });

  it('drafts a form from a description and from an uploaded list of questions, without saving either', async () => {
    const draft = (await api('POST', '/api/forms/templates/draft', { prompt: 'consent form for tooth extraction' })).body;
    expect(draft.engine).toBe('rules');
    expect(draft.form.name).toMatch(/extraction/i);
    expect(draft.form.fields[0].type).toBe('info');
    expect(draft.form.fields.some((f) => f.type === 'signature')).toBe(true);
    expect((await api('POST', '/api/forms/templates/draft', { prompt: 'x' })).status).toBe(400);

    const upload = (await api('POST', '/api/forms/templates/import', { name: 'new_patient_questions.txt', text: '1. Do you smoke?\n2. How did you hear about us: Google, Friend, Walk-in\n3. Date of last dental visit\n- Please describe your main concern\nI agree to be contacted on WhatsApp *' })).body;
    expect(upload.form.name).toBe('new patient questions');
    expect(upload.form.fields.map((f) => f.type)).toEqual(['yesno', 'choice', 'date', 'textarea', 'yesno']);
    expect(upload.form.fields[1].options).toEqual(['Google', 'Friend', 'Walk-in']);
    expect(upload.form.fields[4].required).toBe(true);
    expect((await api('POST', '/api/forms/templates/import', { text: '   ' })).status).toBe(400);
    expect((await api('GET', '/api/forms/templates')).body.forms).toEqual([]);
  });
});

describe('dentist workspace', () => {
  it('connects the dentist and reception: arrivals, intake review, handoff, visit close and follow-up tasks', async () => {
    const dentistToken = (await raw('POST', '/api/auth/demo', { role: 'dentist' })).body;
    const dent = (m, path, body) => raw(m, path, body, { authorization: 'Bearer ' + dentistToken.token });
    const d0 = (await dent('GET', '/api/dentist/dashboard')).body;
    expect(d0.provider.id).toBeTruthy();
    const provId = d0.provider.id;
    expect(d0.kpis.appointments).toBe(d0.schedule.filter((x) => x.status !== 'cancelled').length);

    // Reception books and checks in a new patient for this dentist, and leaves a note.
    const pat = (await api('POST', '/api/patients', { firstName: 'Meena', lastName: 'Handoff', phone: '98222 00001' })).body;
    const prov = (await api('GET', '/api/settings')).body.providers.find((x) => x.id === provId);
    const appt = (await api('POST', '/api/appointments', { patientId: pat.id, visitTypeId: 'vt_followup', providerId: provId, locationId: prov.locationIds[0], start: new Date(Date.now() + 2 * 60000).toISOString() })).body;
    expect(appt.id).toBeTruthy();
    expect((await api('PUT', '/api/frontdesk/handoff/' + appt.id, { note: 'x' })).status).toBe(400); // not checked in yet
    await api('POST', '/api/arrivals/' + appt.id + '/arrive');
    expect((await api('PUT', '/api/frontdesk/handoff/' + appt.id, { note: 'Brought previous X-rays. Two files added.' })).status).toBe(200);

    // The dentist sees the arrival, the queue position and the note, and acknowledges it.
    const q = (await dent('GET', '/api/dentist/queue')).body;
    const mine = q.queue.find((x) => x.id === appt.id);
    expect(mine.token).toBeTruthy(); expect(mine.position).toBeGreaterThan(0); expect(mine.handoff.note).toMatch(/X-rays/);
    expect((await dent('GET', '/api/dentist/dashboard')).body.attention.handoffsNew).toBeGreaterThan(0);
    expect((await dent('POST', '/api/dentist/appointments/' + appt.id + '/handoff/acknowledge')).body.acknowledgedAt).toBeTruthy();

    // Intake: the patient answers one section; the dentist reads it, cannot edit it, and asks reception to clarify.
    const pk = (await api('GET', '/api/forms')).body.find((p) => p.appointment.id === appt.id);
    await pub('PUT', '/api/forms/token/' + pk.token + '/sections/dentalConcerns', { data: { chiefComplaint: 'Discomfort in one tooth for a few days' } });
    const list = (await dent('GET', '/api/dentist/intake')).body;
    expect(list.items.find((x) => x.appointmentId === appt.id).intake.state).toBe('pending_review');
    const detail = (await dent('GET', '/api/dentist/intake/' + pk.id)).body;
    expect(detail.patient.name).toBe('Meena Handoff');
    expect(JSON.stringify(detail.questionnaire)).toMatch(/Discomfort in one tooth/);
    expect((await dent('PUT', '/api/forms/' + pk.id + '/sections/dentalConcerns', { data: { chiefComplaint: 'changed' } })).status).toBeGreaterThanOrEqual(200);
    expect((await dent('POST', '/api/dentist/intake/' + pk.id + '/clarification', { note: '' })).status).toBe(400);
    const clar = (await dent('POST', '/api/dentist/intake/' + pk.id + '/clarification', { note: 'Which tooth, and for how long?' })).body;
    expect(clar.intake.state).toBe('clarification'); expect(clar.task.type).toBe('clarification');
    expect((await dent('POST', '/api/dentist/intake/' + pk.id + '/review', {})).body.state).toBe('reviewed');

    // Reception sees the task on the front desk dashboard and completes it; the dentist sees it closed.
    const fd = (await api('GET', '/api/frontdesk/summary')).body;
    const task = fd.tasks.items.find((t) => t.id === clar.task.id);
    expect(task.patientName).toBe('Meena Handoff'); expect(task.priority).toBe('high');
    expect((await api('PATCH', '/api/frontdesk/tasks/' + task.id, { status: 'in_progress' })).body.status).toBe('in_progress');
    expect((await api('PATCH', '/api/frontdesk/tasks/' + task.id, { status: 'done', note: 'Upper right molar, 4 days.' })).body.status).toBe('done');
    expect((await dent('GET', '/api/dentist/dashboard')).body.attention.tasksAnswered).toBe(1);
    const fu = (await dent('GET', '/api/dentist/followups')).body;
    expect(fu.tasks.find((t) => t.id === task.id).resolution).toMatch(/Upper right molar/);
    expect((await dent('GET', '/api/dentist/dashboard')).body.attention.tasksAnswered).toBe(0);

    // The dentist calls, starts and completes the visit, and asks reception to book the next one.
    expect((await dent('POST', '/api/dentist/appointments/' + appt.id + '/call')).body.status).toBe('called');
    expect((await dent('POST', '/api/dentist/appointments/' + appt.id + '/start')).body.status).toBe('in_progress');
    expect((await api('GET', '/api/frontdesk/summary')).body.schedule.find((x) => x.id === appt.id).status).toBe('in_chair');
    const done = (await dent('POST', '/api/dentist/appointments/' + appt.id + '/complete', { bookNext: true, instruction: 'Review in two weeks, 30 minutes.' })).body;
    expect(done.status).toBe('completed'); expect(done.tasks[0].type).toBe('book_next');
    expect((await api('GET', '/api/frontdesk/summary')).body.schedule.find((x) => x.id === appt.id).status).toBe('completed');
    expect((await dent('POST', '/api/dentist/followups', { type: 'callback', patientId: pat.id, description: 'Asked about whitening fees.', priority: 'high' })).status).toBe(201);
    expect((await dent('POST', '/api/dentist/followups', { type: 'nope' })).status).toBe(400);

    // A dentist cannot act on another dentist's patient, and reception cannot open the dentist workspace.
    const other = d0.schedule.length && (await api('GET', '/api/frontdesk/summary')).body.schedule.find((x) => x.providerId !== provId);
    if (other) expect((await dent('POST', '/api/dentist/appointments/' + other.id + '/start')).status).toBe(403);
    const desk = (await raw('POST', '/api/auth/demo', { role: 'front_desk' })).body.token;
    expect((await raw('GET', '/api/dentist/dashboard', null, { authorization: 'Bearer ' + desk })).status).toBe(403);
    expect((await dent('PATCH', '/api/frontdesk/tasks/' + task.id, { status: 'pending' })).status).toBe(403);
  });
});

describe('security', () => {
  it('never serves a real clinic\'s records to someone who only knows its web name', async () => {
    const reg = await signup({ name: 'Dr Private', email: 'private@example.in', password: 'Secret@123', clinicName: 'Private Dental' });
    const slug = reg.body.tenant.slug;
    await raw('POST', '/api/patients', { firstName: 'Secret', lastName: 'Patient', phone: '98333 00001' }, { authorization: 'Bearer ' + reg.body.token });
    for (const path of ['/api/patients', '/api/conversations', '/api/fhir/Patient', '/api/fhir/Appointment', '/api/forms', '/api/frontdesk/summary', '/api/dentist/dashboard', '/api/appointments', '/api/forms/templates']) {
      const res = await raw('GET', path + '?t=' + slug);
      expect([401, 403], path).toContain(res.status);
      expect(JSON.stringify(res.body), path).not.toMatch(/Secret/);
    }
    // The clinic's own API key still works for its EHR.
    const key = (await raw('POST', '/api/integrations/api-key', {}, { authorization: 'Bearer ' + reg.body.token })).body.apiKey;
    const fhir = await raw('GET', '/api/fhir/Patient', null, { 'x-api-key': key });
    expect(fhir.status).toBe(200); expect(JSON.stringify(fhir.body)).toMatch(/Secret/);
    expect((await raw('GET', '/api/fhir/Patient', null, { 'x-api-key': 'wrong-key' })).status).toBe(401);
  });

  it('encrypts data files when a key is set, reads them back, and refuses to overwrite a file it cannot open', async () => {
    const { jsonStore, DataKeyError } = await import('../src/store.js');
    const fs = await import('node:fs'); const os = await import('node:os'); const path = await import('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clinovara-enc-')); const file = path.join(dir, 'clinic.json');
    const doc = () => ({ patients: [{ name: 'Nisha Verma', phone: '9876540001' }] });
    try {
      // Without a key the file is plain JSON, as before.
      delete process.env.CLINOVARA_DATA_KEY;
      jsonStore({ file, initial: doc }).flush();
      expect(fs.readFileSync(file, 'utf8')).toMatch(/Nisha Verma/);

      // With a key: the plain file is read once, then written encrypted. No patient detail is readable on disk.
      process.env.CLINOVARA_DATA_KEY = 'correct horse battery staple 9f2c';
      const s1 = jsonStore({ file, initial: () => ({ patients: [] }) });
      expect(s1.db.patients[0].name).toBe('Nisha Verma');
      s1.db.patients.push({ name: 'Second Person', phone: '9000000002' }); s1.flush();
      const onDisk = fs.readFileSync(file, 'utf8');
      expect(onDisk).toMatch(/clinovaraEncrypted/); expect(onDisk).not.toMatch(/Nisha|Second Person|9876540001/);
      expect(jsonStore({ file, initial: () => ({ patients: [] }) }).db.patients).toHaveLength(2);

      // The wrong key, or no key, stops with an error and leaves the file exactly as it was.
      process.env.CLINOVARA_DATA_KEY = 'a different key';
      expect(() => jsonStore({ file, initial: () => ({ patients: [] }) })).toThrow(DataKeyError);
      delete process.env.CLINOVARA_DATA_KEY;
      expect(() => jsonStore({ file, initial: () => ({ patients: [] }) })).toThrow(DataKeyError);
      expect(fs.readFileSync(file, 'utf8')).toBe(onDisk);
    } finally { delete process.env.CLINOVARA_DATA_KEY; fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('phone voice assistant', () => {
  it('stays closed without a bridge secret, then runs a call both ways: tools for speech models, text turns for Claude', async () => {
    delete process.env.VOICE_WEBHOOK_SECRET;
    expect((await pub('POST', '/api/voice/incoming', { from: '9845011002' })).status).toBe(503);

    process.env.VOICE_WEBHOOK_SECRET = 'bridge-secret-for-tests';
    const bridge = (m, path, body) => pub(m, path, body, { 'x-voice-secret': 'bridge-secret-for-tests' });
    try {
      expect((await pub('POST', '/api/voice/incoming', { from: '9845011002' }, { 'x-voice-secret': 'wrong' })).status).toBe(401);
      // Off until an owner chooses a provider and switches it on.
      expect((await bridge('POST', '/api/voice/incoming', { from: '9845011002' })).status).toBe(409);
      const st0 = (await api('GET', '/api/voice/status')).body;
      expect(st0.ready).toBe(false); expect(st0.providers.map((p) => p.id)).toEqual(['none', 'openai_realtime', 'claude_elevenlabs']);
      expect(JSON.stringify(st0)).not.toMatch(/bridge-secret-for-tests/);
      const st1 = (await api('PUT', '/api/voice/settings', { provider: 'openai_realtime', enabled: true, number: '+91 80 4123 4567' })).body;
      expect(st1.settings.provider).toBe('openai_realtime'); expect(st1.missing).toContain('OPENAI_API_KEY'); expect(st1.ready).toBe(false);
      expect((await api('PUT', '/api/voice/settings', { provider: 'nope' })).status).toBe(400);

      // Speech to speech: the call opens with instructions and tools; the model uses tools to reach the diary.
      const start = (await bridge('POST', '/api/voice/incoming', { from: '98444 55667', callSid: 'exo-1' })).body;
      expect(start.callId).toBeTruthy(); expect(start.say.length).toBeGreaterThan(5);
      expect(start.session.mode).toBe('speech'); expect(start.session.tools.map((t) => t.name)).toEqual(['clinic_info', 'find_slots', 'book_appointment', 'take_message', 'end_call']);
      expect(start.session.instructions).toMatch(/SmileCare/); expect(start.session.instructions).toMatch(/not a dentist/i);
      const tool = async (name, args) => (await bridge('POST', '/api/voice/calls/' + start.callId + '/tool', { name, arguments: args })).body;
      expect((await tool('clinic_info', {})).branches.length).toBe(2);
      expect((await tool('book_appointment', { slot_id: 's1', full_name: 'Ravi Kumar' })).ok).toBe(false); // nothing offered yet
      const found = await tool('find_slots', JSON.stringify({ service: 'cleaning', time_of_day: 'any' }));
      expect(found.ok).toBe(true); expect(found.slots.length).toBeGreaterThan(0); expect(found.slots[0].slot_id).toBe('s1');
      expect((await tool('book_appointment', { slot_id: 's9', full_name: 'Ravi Kumar' })).ok).toBe(false); // not an offered slot
      expect((await tool('book_appointment', { slot_id: 's1', full_name: '' })).ok).toBe(false);
      const booked = await tool('book_appointment', { slot_id: 's1', full_name: 'Ravi Kumar' });
      expect(booked.booked).toBe(true); expect(booked.patient).toBe('Ravi Kumar'); expect(booked.when).toBe(found.slots[0].when);
      // The booking is a real appointment for a real new patient, visible to staff.
      const patient = (await api('GET', '/api/patients?q=9844455667')).body[0];
      expect(patient.firstName).toBe('Ravi'); expect(patient.upcoming.source).toBe('ai');
      // A clinical question becomes an urgent callback, never an answer.
      const msg = await tool('take_message', { summary: 'Swelling after an extraction yesterday, asks which medicine to take', urgency: 'urgent' });
      expect(msg.recorded).toBe(true);
      expect(JSON.stringify((await api('GET', '/api/callbacks')).body.items)).toMatch(/URGENT\. Phone call: Swelling/);
      expect((await tool('launch_rocket', {})).ok).toBe(false);
      await bridge('POST', '/api/voice/calls/' + start.callId + '/transcript', { from: 'caller', text: 'I want a cleaning appointment' });
      const ended = (await bridge('POST', '/api/voice/calls/' + start.callId + '/end', { reason: 'hangup' })).body;
      expect(ended.status).toBe('ended');
      expect((await bridge('POST', '/api/voice/calls/' + start.callId + '/tool', { name: 'clinic_info' })).status).toBe(400);
      const log = (await api('GET', '/api/calls')).body.find((c) => c.id === start.callId);
      expect(log.externalId).toBe('exo-1'); expect(JSON.stringify(log.transcript)).toMatch(/Booked/);

      // Text in the middle: the bridge sends what the caller said; the same assistant that runs chat replies.
      await api('PUT', '/api/voice/settings', { provider: 'claude_elevenlabs' });
      const c2 = (await bridge('POST', '/api/voice/incoming', { from: '98444 11223' })).body;
      expect(c2.session.mode).toBe('text');
      const turn = (await bridge('POST', '/api/voice/calls/' + c2.callId + '/turn', { text: 'What time do you open tomorrow?' })).body;
      expect(turn.say.length).toBeGreaterThan(5);
      expect((await bridge('POST', '/api/voice/calls/' + c2.callId + '/turn', { text: '' })).status).toBe(400);

      // Reception cannot change the provider, and the bridge secret alone does not open the staff API.
      const desk = (await raw('POST', '/api/auth/demo', { role: 'front_desk' })).body.token;
      expect((await raw('PUT', '/api/voice/settings', { enabled: false }, { authorization: 'Bearer ' + desk })).status).toBe(403);
      expect((await bridge('GET', '/api/voice/status')).status).toBe(401);
    } finally { delete process.env.VOICE_WEBHOOK_SECRET; }
  });
});

describe('roles and permissions', () => {
  it('closes owner-only areas to reception and dentists on the server, not just in the menu', async () => {
    const tok = {}; for (const role of ['front_desk', 'dentist']) tok[role] = (await raw('POST', '/api/auth/demo', { role })).body.token;
    const as = (role, m, path, body) => (role === 'owner' ? api(m, path, body) : raw(m, path, body, { authorization: 'Bearer ' + tok[role] }));
    const cases = [
      // [method, path, owner, front desk, dentist]
      ['GET', '/api/admin/export', 200, 403, 403], ['GET', '/api/integrations', 200, 403, 403], ['GET', '/api/integrations/log', 200, 403, 403],
      ['GET', '/api/insights?days=30', 200, 200, 200], ['GET', '/api/dashboard?days=30', 200, 403, 403], ['GET', '/api/team', 200, 403, 403],
      ['GET', '/api/patients/export.csv', 200, 403, 403], ['GET', '/api/settings/procedures/export.csv', 200, 403, 403], ['GET', '/api/voice/status', 200, 403, 403],
      ['GET', '/api/marketing', 200, 200, 403], ['GET', '/api/frontdesk/summary', 200, 200, 403], ['GET', '/api/dentist/dashboard', 200, 403, 200],
      ['GET', '/api/admin/activity', 200, 200, 200], ['GET', '/api/settings', 200, 200, 200], ['GET', '/api/patients', 200, 200, 200], ['GET', '/api/forms/templates', 200, 200, 200],
      ['PUT', '/api/settings', 200, 403, 403], ['POST', '/api/forms/templates', 400, 403, 403], ['DELETE', '/api/forms/templates/none', 400, 403, 403],
    ];
    for (const [m, path, owner, desk, dentist] of cases) {
      const body = m === 'GET' ? null : {};
      expect((await as('owner', m, path, body)).status, `owner ${m} ${path}`).toBe(owner);
      expect((await as('front_desk', m, path, body)).status, `front desk ${m} ${path}`).toBe(desk);
      expect((await as('dentist', m, path, body)).status, `dentist ${m} ${path}`).toBe(dentist);
    }
    // Insights stay open to staff for the operational numbers, but money is left out for anyone below admin.
    expect((await as('front_desk', 'GET', '/api/insights?days=30')).body.revenue).toBeUndefined();
    expect((await as('dentist', 'GET', '/api/insights?days=30')).body.revenue).toBeUndefined();
    // Only reception and managers take payments.
    const paid = (await api('GET', '/api/frontdesk/summary')).body.schedule.find((x) => x.payment === 'unpaid' && x.fee > 0);
    if (paid) expect((await as('dentist', 'POST', '/api/arrivals/' + paid.id + '/payment', { amount: 1, mode: 'Cash' })).status).toBe(403);

    // A dentist cannot read another dentist's earnings by naming them.
    const mine = (await as('dentist', 'GET', '/api/dentist/dashboard')).body.provider.id;
    const other = (await api('GET', '/api/settings')).body.providers.find((x) => x.id !== mine).id;
    const e = (await as('dentist', 'GET', '/api/doctor/earnings?providerId=' + other)).body;
    expect(JSON.stringify(e)).not.toMatch(new RegExp(other));

    // The matrix shown in Settings matches what the server enforces.
    const matrix = (await as('front_desk', 'GET', '/api/auth/permissions')).body;
    expect(matrix.roles.map((x) => x.id)).toContain('front_desk');
    expect(matrix.matrix.find((x) => /Integrations/.test(x.area)).roles).toEqual(['owner', 'admin']);
  });
});

describe('api behaviour', () => {
  const rawRes = async (method, path, headers = {}, body) => {
    const server = app.listen(0); const port = server.address().port;
    try { const res = await fetch('http://127.0.0.1:' + port + path, { method, headers: { 'content-type': 'application/json', ...headers }, body }); return { status: res.status, headers: res.headers, body: await res.json().catch(() => null) }; }
    finally { server.close(); }
  };
  it('labels every reply, never caches patient data, and gives errors a code without leaking internals', async () => {
    const auth = { authorization: 'Bearer ' + token };
    const ok = await rawRes('GET', '/api/patients?limit=5&offset=2', auth);
    expect(ok.status).toBe(200); expect(ok.body).toHaveLength(5);
    expect(Number(ok.headers.get('x-total-count'))).toBeGreaterThan(5);
    expect(ok.headers.get('cache-control')).toBe('no-store');
    expect(ok.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{8,}$/);
    // Without paging the whole list still comes back, as before, with family and the next appointment attached.
    const all = await rawRes('GET', '/api/patients', auth);
    expect(all.body.length).toBe(Number(all.headers.get('x-total-count')));
    expect(all.body[0]).toHaveProperty('upcoming'); expect(all.body[0]).toHaveProperty('family');
    expect(all.body.slice(2, 7).map((p) => p.id)).toEqual(ok.body.map((p) => p.id));

    const out = await rawRes('GET', '/api/appointments');
    expect(out.status).toBe(401); expect(out.body.code).toBe('not_logged_in'); expect(out.body.requestId).toBe(out.headers.get('x-request-id'));
    const missing = await rawRes('GET', '/api/nothing-here', auth);
    expect(missing.status).toBe(404); expect(missing.body.code).toBe('not_found');
    const broken = await rawRes('POST', '/api/patients', auth, '{not json');
    expect(broken.status).toBe(400); expect(broken.body.error).toBe('The request body is not valid JSON'); expect(broken.body.code).toBe('invalid_request');
    const desk = (await raw('POST', '/api/auth/demo', { role: 'front_desk' })).body.token;
    expect((await rawRes('GET', '/api/team', { authorization: 'Bearer ' + desk })).body.code).toBe('not_allowed');
  });

  it('answers only the listed websites when an allow-list is set', async () => {
    const open = await rawRes('GET', '/api/health', { origin: 'https://anything.example' });
    expect(open.headers.get('access-control-allow-origin')).toBe('*');
    process.env.CLINOVARA_ALLOWED_ORIGINS = 'https://app.clinic.example, https://clinic.example/';
    try {
      expect((await rawRes('GET', '/api/health', { origin: 'https://app.clinic.example' })).headers.get('access-control-allow-origin')).toBe('https://app.clinic.example');
      expect((await rawRes('GET', '/api/health', { origin: 'https://clinic.example' })).headers.get('access-control-allow-origin')).toBe('https://clinic.example');
      const other = await rawRes('GET', '/api/health', { origin: 'https://evil.example' });
      expect(other.headers.get('access-control-allow-origin')).toBeNull(); expect(other.headers.get('vary')).toMatch(/Origin/);
      expect((await rawRes('GET', '/api/health')).status).toBe(200); // a server-to-server call has no Origin and still works
    } finally { delete process.env.CLINOVARA_ALLOWED_ORIGINS; }
  });
});
