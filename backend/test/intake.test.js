import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../src/app.js';
import { createRegistry } from '../src/registry.js';
import * as intake from '../src/domain/intake.js';

process.env.CLINOVARA_AI = 'rules';

let app, registry, token, db;
async function raw(method, path, body, headers = {}) {
  const server = app.listen(0);
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json };
  } finally { server.close(); }
}
const api = (method, path, body) => raw(method, path, body, { authorization: `Bearer ${token}` });
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const ANSWERS = {
  medicalHistory: { conditions: [], smoker: 'no' }, dentalConcerns: { concerns: 'Tooth ache' }, medications: { list: '' }, allergies: { list: '' },
  insurance: { type: 'self' }, consent: { agree: true, signature: 'Test Patient' },
};

/** A visit a few days out for a patient with nothing else booked, with no form sent yet. */
async function visit(hoursAhead = 72) {
  const patient = db.patients.find((p) => p.phone && !db.appointments.some((a) => a.patientId === p.id && a.start > new Date().toISOString()));
  const start = new Date(Date.now() + hoursAhead * 3600000); start.setMinutes(0, 0, 0);
  const a = await api('POST', '/api/appointments', { patientId: patient.id, visitTypeId: 'vt_cleaning', providerId: 'prov_khan', locationId: 'loc_whitefield', start: start.toISOString(), sendForms: false });
  expect(a.status).toBe(201);
  return { appointment: a.body, patient };
}
async function fill(tok, keys = Object.keys(ANSWERS)) {
  for (const k of keys) expect((await raw('PUT', `/api/forms/token/${tok}/sections/${k}`, { data: ANSWERS[k] })).status).toBe(200);
}

beforeEach(async () => {
  registry = createRegistry({ memory: true });
  app = createApp({ registry, frontendBase: 'http://test/' });
  token = (await raw('POST', '/api/auth/demo', {})).body.token;
  db = registry.tenantStore(registry.tenantBySlug('smilecare').id).db;
  db.settings.customForms = [];                       // the standard six sections only, unless a test adds a form
  db.settings.intake = { quietStart: '00:00', quietEnd: '00:00' };   // no quiet hours: these tests run at any time of day
});

describe('pre-visit intake', () => {
  it('tracks a form from assignment to dentist review without inventing delivery', async () => {
    const { appointment } = await visit();
    const as = await api('POST', '/api/forms/assign', { appointmentId: appointment.id, channel: 'whatsapp' });
    expect(as.status).toBe(201);
    let pk = as.body.packet;
    expect(pk.intake.status).toBe('sent');
    expect(pk.intake.delivery).toBe('unknown');        // no provider is connected, so delivery is not claimed
    expect(as.body.communication.body).toContain(`#/forms/${pk.token}`);
    expect(pk.token.length).toBeGreaterThanOrEqual(32);

    expect((await raw('GET', `/api/forms/token/${pk.token}`)).status).toBe(200);
    pk = (await api('GET', `/api/forms/${pk.id}/detail`)).body;
    expect(pk.intake.status).toBe('opened');
    expect(pk.intake.openedAt).toBeTruthy();

    await fill(pk.token, ['medicalHistory', 'dentalConcerns']);
    pk = (await api('GET', `/api/forms/${pk.id}/detail`)).body;
    expect(pk.intake.status).toBe('in_progress');
    expect(pk.intake.percent).toBe(33);
    expect((await raw('POST', `/api/forms/token/${pk.token}/submit`, {})).status).toBe(400);
    expect((await api('POST', `/api/forms/${pk.id}/review`, { kind: 'admin' })).status).toBe(400);   // nothing to review yet

    await fill(pk.token, ['medications', 'allergies', 'insurance', 'consent']);
    expect((await raw('POST', `/api/forms/token/${pk.token}/submit`, {})).status).toBe(200);
    pk = (await api('GET', `/api/forms/${pk.id}/detail`)).body;
    expect(pk.intake.status).toBe('submitted');
    expect(pk.intake.source).toBe('digital');
    expect(pk.messages.some((m) => m.kind === 'received')).toBe(true);
    expect((await api('POST', `/api/forms/${pk.id}/remind`, {})).status).toBe(400);                   // never remind after a submission

    expect((await api('POST', `/api/forms/${pk.id}/review`, { kind: 'admin' })).body.intake.status).toBe('under_review');
    const done = await api('POST', `/api/forms/${pk.id}/review`, { kind: 'dentist', note: 'Read before the visit' });
    expect(done.body.intake.status).toBe('reviewed');
    expect(done.body.history.map((h) => h.action)).toEqual(expect.arrayContaining(['sent', 'opened', 'submitted', 'admin_check', 'dentist_review', 'viewed']));
  });

  it('lets only a dentist record the review of patient-reported answers', async () => {
    const { appointment } = await visit();
    const pk = db.formPackets.find((p) => p.appointmentId === appointment.id) || (await api('POST', '/api/forms/assign', { appointmentId: appointment.id, channel: 'tablet' }), db.formPackets.find((p) => p.appointmentId === appointment.id));
    await fill(pk.token);
    expect(() => intake.review(db, pk, { kind: 'dentist', by: 'Asha', role: 'front_desk', isDentist: false })).toThrow(/Only a dentist/);
    expect(() => intake.review(db, pk, { kind: 'admin', by: 'Dr Rao', role: 'dentist', isDentist: true })).toThrow(/reception/);
    intake.review(db, pk, { kind: 'admin', by: 'Asha', role: 'front_desk', isDentist: false });
    expect(intake.lifecycle(db, pk).status).toBe('under_review');
    expect(intake.lifecycle(db, pk).source).toBe('digital');
  });

  it('sends scheduled invitations and reminders once, and stops after cancellation', async () => {
    const { appointment } = await visit(72);
    const at = new Date(Date.now() + 3600000).toISOString();
    const as = await api('POST', '/api/forms/assign', { appointmentId: appointment.id, channel: 'sms', when: 'schedule', scheduleAt: at });
    expect(as.body.packet.intake.status).toBe('scheduled');
    expect(as.body.communication).toBeNull();
    const pk = db.formPackets.find((p) => p.id === as.body.packet.id);
    const count = () => db.communications.filter((c) => c.appointmentId === appointment.id && c.type === 'forms').length;

    intake.runIntakeAutomation(db, { frontendBase: 'http://test/', now: new Date(Date.now() + 1800000).toISOString() });
    expect(count()).toBe(0);                             // not due yet
    intake.runIntakeAutomation(db, { frontendBase: 'http://test/', now: new Date(Date.now() + 2 * 3600000).toISOString() });
    expect(count()).toBe(1);
    expect(intake.lifecycle(db, pk).status).toBe('sent');

    const dayBefore = new Date(new Date(appointment.start).getTime() - 23 * 3600000).toISOString();
    intake.runIntakeAutomation(db, { frontendBase: 'http://test/', now: dayBefore });
    expect(count()).toBe(2);                             // the 24-hour reminder
    intake.runIntakeAutomation(db, { frontendBase: 'http://test/', now: dayBefore });
    expect(count()).toBe(2);                             // and only once

    expect((await api('POST', `/api/forms/${pk.id}/cancel`, {})).body.intake.status).toBe('cancelled');
    intake.runIntakeAutomation(db, { frontendBase: 'http://test/', now: new Date(new Date(appointment.start).getTime() - 3 * 3600000).toISOString() });
    expect(count()).toBe(2);                             // nothing after a cancellation
    expect((await raw('GET', `/api/forms/token/${pk.token}`)).status).toBe(410);
  });

  it('respects quiet hours and a patient who switched reminders off', async () => {
    const { appointment, patient } = await visit(72);
    const pk = (await api('POST', '/api/forms/assign', { appointmentId: appointment.id, channel: 'whatsapp' })).body.packet;
    const count = () => db.communications.filter((c) => c.appointmentId === appointment.id && c.type === 'forms').length;
    const now = new Date(new Date(appointment.start).getTime() - 20 * 3600000).toISOString();
    const hh = String(new Date(now).getHours()).padStart(2, '0');
    db.settings.intake = { quietStart: `${hh}:00`, quietEnd: `${hh}:59` };
    intake.runIntakeAutomation(db, { frontendBase: 'http://test/', now });
    expect(count()).toBe(1);                             // held back: it is the clinic's quiet hour
    db.settings.intake = { quietStart: '00:00', quietEnd: '00:00' };
    expect((await raw('PUT', `/api/forms/token/${pk.token}/profile/preferences`, { data: { channel: 'whatsapp', reminders: false } })).status).toBe(200);
    expect(patient.formRemindersOff).toBe(true);
    intake.runIntakeAutomation(db, { frontendBase: 'http://test/', now });
    expect(count()).toBe(1);                             // the patient asked not to be reminded
  });

  it('expires links and issues a fresh one on resend', async () => {
    const { appointment } = await visit();
    const first = (await api('POST', '/api/forms/assign', { appointmentId: appointment.id, channel: 'whatsapp' })).body.packet;
    db.formPackets.find((p) => p.id === first.id).expiresAt = new Date(Date.now() - 1000).toISOString();
    expect((await raw('GET', `/api/forms/token/${first.token}`)).status).toBe(410);
    expect((await api('GET', `/api/forms/${first.id}/detail`)).body.intake.status).toBe('expired');
    const again = (await api('POST', `/api/forms/${first.id}/remind`, {})).body;
    expect(again.packet.token).not.toBe(first.token);
    expect(again.communication.body).toContain(again.packet.token);
    expect((await raw('GET', `/api/forms/token/${again.packet.token}`)).status).toBe(200);
    expect((await raw('GET', `/api/forms/token/${first.token}`)).status).toBe(404);
  });

  it('handles paper forms: received, scan attached, kept as the record', async () => {
    const { appointment } = await visit();
    const as = await api('POST', '/api/forms/assign', { appointmentId: appointment.id, channel: 'print' });
    expect(as.body.communication).toBeNull();             // nothing is messaged for a printed form
    const id = as.body.packet.id;
    expect((await api('POST', `/api/forms/${id}/paper`, { printed: true, received: true })).body.intake.status).toBe('paper_received');
    expect((await api('POST', `/api/forms/${id}/paper`, { submitted: true })).status).toBe(400);          // needs the scan first
    expect((await api('POST', `/api/forms/${id}/attachments`, { name: 'signed form.png', dataUrl: 'data:text/html;base64,AAAA', kind: 'paper_scan' })).status).toBe(400);
    const withScan = await api('POST', `/api/forms/${id}/attachments`, { name: 'signed form.png', dataUrl: PNG, kind: 'paper_scan' });
    expect(withScan.body.attachments).toHaveLength(1);
    expect(withScan.body.attachments[0].dataUrl).toBeUndefined();   // lists never carry the file itself
    const sub = await api('POST', `/api/forms/${id}/paper`, { submitted: true });
    expect(sub.body.intake.status).toBe('submitted');
    expect(sub.body.intake.source).toBe('paper');
    expect((await api('GET', `/api/forms/${id}/attachments/${withScan.body.attachments[0].id}`)).body.dataUrl).toBe(PNG);
  });

  it('flags contact details that differ and applies them only when reception says so', async () => {
    const { appointment, patient } = await visit();
    const pk = (await api('POST', '/api/forms/assign', { appointmentId: appointment.id, channel: 'whatsapp' })).body.packet;
    const before = patient.phone;
    const bad = await raw('PUT', `/api/forms/token/${pk.token}/profile/personal`, { data: { firstName: patient.firstName, lastName: patient.lastName, dob: '1990-01-01', phone: '123' } });
    expect(bad.status).toBe(400);
    await raw('PUT', `/api/forms/token/${pk.token}/profile/personal`, { data: { firstName: patient.firstName, lastName: patient.lastName, dob: '1990-01-01', phone: '90000 12345', email: 'new@example.in', preferredLanguage: 'kn' } });
    expect(patient.phone).toBe(before);                   // not changed behind reception's back
    expect(patient.preferredLanguage).toBe('kn');
    const detail = (await api('GET', `/api/forms/${pk.id}/detail`)).body;
    expect(detail.contactChanges.map((c) => c.field)).toEqual(expect.arrayContaining(['phone', 'email']));
    expect((await api('POST', `/api/forms/${pk.id}/apply-contact`, {})).body.applied).toBeGreaterThanOrEqual(2);
    expect(patient.phone).toBe('90000 12345');
  });

  it('routes a dentist request for clarification through reception', async () => {
    const { appointment } = await visit();
    const pk = (await api('POST', '/api/forms/assign', { appointmentId: appointment.id, channel: 'whatsapp' })).body.packet;
    const live = db.formPackets.find((p) => p.id === pk.id);
    const c = intake.clarify(db, live, { note: 'Which blood thinner', by: 'Dr Khan', fromDentist: true, send: false });
    expect(intake.lifecycle(db, live).attention).toBe(true);
    const sent = await api('POST', `/api/forms/${pk.id}/clarify/${c.id}`, { action: 'send' });
    expect(sent.body.messages[0].kind).toBe('clarify');
    expect(sent.body.messages[0].body).toContain('Which blood thinner.');
    expect((await raw('GET', `/api/forms/token/${pk.token}`)).body.clarifications).toEqual(['Which blood thinner']);
    await fill(pk.token, ['medications']);
    expect(live.clarifications[0].status).toBe('answered');
  });

  it('keeps the wording a patient answered when the form is edited later, and honours conditions', async () => {
    const made = await api('POST', '/api/forms/templates', { name: 'Health check', fields: [
      { label: 'Do you take any medicines?', type: 'yesno', required: true },
      { label: 'Which ones?', type: 'text', required: true, showIf: { fieldId: 'q1', equals: 'yes' }, id: 'q2' },
      { label: 'How should we reach you?', type: 'checkbox', options: ['WhatsApp', 'Call', 'Email'] },
    ].map((f, i) => ({ id: `q${i + 1}`, ...f })) });
    expect(made.status).toBe(201);
    const [q1, q2, q3] = made.body.fields;
    expect(q2.showIf).toEqual({ fieldId: q1.id, equals: 'yes' });
    expect(made.body.version).toBe(1);
    const { appointment } = await visit();
    const pk = (await api('POST', '/api/forms/assign', { appointmentId: appointment.id, channel: 'whatsapp' })).body.packet;
    const need = await raw('PUT', `/api/forms/token/${pk.token}/custom/${made.body.id}`, { data: { [q1.id]: 'yes' } });
    expect(need.status).toBe(400);                        // the follow-up is required once it is shown
    const ok = await raw('PUT', `/api/forms/token/${pk.token}/custom/${made.body.id}`, { data: { [q1.id]: 'no', [q3.id]: ['Call', 'Fax'] } });
    expect(ok.status).toBe(200);
    expect(ok.body.custom[0].data[q3.id]).toBe('Call');   // only choices that exist are kept
    const edited = await api('PUT', `/api/forms/templates/${made.body.id}`, { ...made.body, fields: [{ ...q1, label: 'Are you on any medication?' }, q2, q3] });
    expect(edited.body.version).toBe(2);
    const view = (await api('GET', `/api/forms/${pk.id}/detail`)).body.custom[0];
    expect(view.answeredVersion).toBe(1);
    expect(view.answeredFields[0].label).toBe('Do you take any medicines?');
    expect(view.fields[0].label).toBe('Are you on any medication?');
  });

  it('reports to owners and validates message templates', async () => {
    const { appointment } = await visit();
    const pk = (await api('POST', '/api/forms/assign', { appointmentId: appointment.id, channel: 'whatsapp' })).body.packet;
    await raw('GET', `/api/forms/token/${pk.token}`);
    await fill(pk.token);
    const day = appointment.start.slice(0, 10);
    const rep = (await api('GET', `/api/forms/report?from=${day}&to=${day}&channel=whatsapp`)).body;
    expect(rep.assigned).toBeGreaterThanOrEqual(1);
    expect(rep.submitted).toBeGreaterThanOrEqual(1);
    expect(rep.deliveryConfirmed).toBe(0);                // nothing confirmed delivery, so nothing is counted as delivered
    expect(rep.byChannel.find((c) => c.channel === 'whatsapp').submitted).toBeGreaterThanOrEqual(1);

    const s = (await api('GET', '/api/forms/intake-settings')).body;
    expect(s.templates.map((t) => t.id)).toContain('tpl_forms_reminder');
    expect((await api('PUT', '/api/forms/message-templates/tpl_forms_reminder', { body: { en: 'Hi {{firstName}}, please finish your form.' } })).status).toBe(400);
    expect((await api('PUT', '/api/forms/message-templates/tpl_forms_reminder', { body: { en: 'Hi {{firstName}} {{aadhaar}} {{formsLink}}' } })).status).toBe(400);
    expect((await api('PUT', '/api/forms/message-templates/tpl_forms_reminder', { body: { en: 'Hi {{firstName}}, please finish your form: {{formsLink}}' } })).status).toBe(200);
    expect((await api('PUT', '/api/forms/intake-settings', { remindHoursBefore: [48, 2, 999], maxReminders: 2 })).body.settings.remindHoursBefore).toEqual([48, 2]);
  });
});
