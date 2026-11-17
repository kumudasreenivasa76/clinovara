import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../src/app.js';
import { createRegistry } from '../src/registry.js';
process.env.CLINOVARA_AI = 'rules';
let app, token;
async function raw(method, path, body, headers = {}) {
  const server = app.listen(0); const port = server.address().port;
  try { const res = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined }); const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch { /* text */ } return { status: res.status, body: json, text }; }
  finally { server.close(); }
}
const api = (m, p, b) => raw(m, p, b, { authorization: `Bearer ${token}` });
beforeEach(async () => { app = createApp({ registry: createRegistry({ memory: true }), frontendBase: 'http://test/' }); token = (await raw('POST', '/api/auth/demo', {})).body.token; });

describe('doctor tracking, earnings, forms and calendar', () => {
  it('lists appointments with counts, earnings with the doctor share, and csv', async () => {
    const s = (await api('GET', '/api/settings')).body;
    await api('PUT', '/api/settings', { providers: s.providers.map((p) => (p.id === 'prov_rao' ? { ...p, revenueSharePct: 60 } : p)) });
    const a = (await api('GET', '/api/doctor/appointments?providerId=prov_rao&days=60&ahead=60')).body;
    expect(a.appointments.length).toBeGreaterThan(0); expect(a.counts).toHaveProperty('formsMissing');
    const e = (await api('GET', '/api/doctor/earnings?providerId=prov_rao&days=90')).body;
    expect(e.sharePct).toBe(60); expect(e.earned).toBe(Math.round(e.gross * 0.6));
    const csv = await api('GET', '/api/doctor/earnings.csv?providerId=prov_rao&days=90');
    expect(csv.text.split('\n')[0]).toMatch(/Date paid/);
  });
  it('issues a document from a template and sends it', async () => {
    const pat = (await api('GET', '/api/patients')).body[0];
    const t = (await api('GET', `/api/doctor/documents/template?providerId=prov_rao&patientId=${pat.id}&kind=prescription`)).body;
    expect(t.text).toMatch(/Rx/);
    const d = await api('POST', '/api/doctor/documents', { providerId: 'prov_rao', patientId: pat.id, kind: 'prescription', text: t.text + '\nAmoxicillin 500mg', send: true });
    expect(d.status).toBe(201); expect(d.body.sentAt).toBeTruthy();
    const list = (await api('GET', '/api/doctor/documents?providerId=prov_rao')).body;
    expect(list.documents.length).toBe(1);
    expect((await api('GET', '/api/doctor/forms?providerId=prov_rao')).status).toBe(200);
  });
  it('lets a dentist create a private calendar link that only serves their own schedule', async () => {
    expect((await api('POST', '/api/calendar/my-key', { providerId: 'prov_rao' })).body.enabled).toBe(true);
    const f = (await api('GET', '/api/calendar/feeds')).body.feeds;
    const mine = f.find((x) => x.providerId === 'prov_rao'); expect(mine.own).toBe(true);
    const ok = await raw('GET', mine.url.replace(/^https?:\/\/[^/]+/, ''));
    expect(ok.text).toMatch(/BEGIN:VCALENDAR/);
    const other = await raw('GET', mine.url.replace(/^https?:\/\/[^/]+/, '').replace('prov_rao', 'prov_menon'));
    expect(other.status).toBe(400);
  });
  it('keeps a tooth chart with history and validates tooth numbers', async () => {
    const pat = (await api('GET', '/api/patients')).body[0];
    expect((await api('PUT', `/api/doctor/teeth/${pat.id}`, { tooth: '99', status: 'caries' })).status).toBe(400);
    expect((await api('PUT', `/api/doctor/teeth/${pat.id}`, { tooth: '36', status: 'caries', note: 'deep' })).status).toBe(200);
    await api('PUT', `/api/doctor/teeth/${pat.id}`, { tooth: '36', status: 'filled' });
    const t = (await api('GET', `/api/doctor/teeth/${pat.id}`)).body;
    expect(t.teeth['36'].status).toBe('filled'); expect(t.history.length).toBe(2);
  });
  it('tracks lab cases and asks the front desk to book the fitting when one is back', async () => {
    const pat = (await api('GET', '/api/patients')).body[0];
    const c = (await api('POST', '/api/doctor/lab?providerId=prov_rao', { patientId: pat.id, kind: 'Crown', tooth: '46', lab: 'Dental Lab', dueDate: '2020-01-01' })).body;
    expect((await api('PATCH', `/api/doctor/lab/${c.id}`, { status: 'at_lab' })).body.overdue).toBe(true);
    await api('PATCH', `/api/doctor/lab/${c.id}`, { status: 'received' });
    const cbs = (await api('GET', '/api/callbacks')).body.items;
    expect(cbs.some((x) => x.source === 'lab_case')).toBe(true);
  });
  it('checks prescriptions for allergy and blocks high-severity warnings unless overridden', async () => {
    const pats = (await api('GET', '/api/patients')).body;
    // Rohan Patil has a penicillin allergy on his form
    const rohan = pats.find((p) => p.firstName === 'Rohan');
    const chk = (await api('POST', '/api/doctor/rx/check', { patientId: rohan.id, drugIds: ['amox500', 'para650'] })).body;
    expect(chk.warnings.some((w) => w.level === 'high' && w.drugId === 'amox500')).toBe(true);
    const lines = [{ drugId: 'amox500' }, { drugId: 'para650' }];
    const blocked = await api('POST', '/api/doctor/rx?providerId=prov_menon', { patientId: rohan.id, lines });
    expect(blocked.status).toBe(400);
    const safe = await api('POST', '/api/doctor/rx?providerId=prov_menon', { patientId: rohan.id, lines: [{ drugId: 'azithro500' }, { drugId: 'para650' }], send: true });
    expect(safe.status).toBe(201); expect(safe.body.text).toMatch(/Azithromycin/);
    const forced = await api('POST', '/api/doctor/rx?providerId=prov_menon', { patientId: rohan.id, lines, overrideReason: 'Tolerated before, confirmed with patient' });
    expect(forced.status).toBe(201);
  });
  it('plans treatment from a tooth, stores images, and runs follow-ups and to-dos', async () => {
    const pat = (await api('GET', '/api/patients')).body[0];
    const cat = (await api('GET', '/api/doctor/catalogue')).body.procedures[0];
    const plan = await api('POST', `/api/doctor/teeth/${pat.id}/plan?providerId=prov_rao`, { tooth: '36', procedureId: cat.id });
    expect(plan.status).toBe(201); expect(plan.body.item.tooth).toBe('36');
    const tiny = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    expect((await api('POST', `/api/doctor/images/${pat.id}`, { dataUrl: 'nope' })).status).toBe(400);
    const img = await api('POST', `/api/doctor/images/${pat.id}`, { dataUrl: tiny, kind: 'xray', tooth: '36', title: 'IOPA' });
    expect(img.status).toBe(201);
    expect((await api('GET', `/api/doctor/images/${pat.id}`)).body.images.length).toBe(1);
    const t = (await api('POST', '/api/doctor/tasks?providerId=prov_rao', { text: 'Order composite kit' })).body;
    await api('PATCH', `/api/doctor/tasks/${t.id}`, { done: true });
    const f = (await api('GET', '/api/doctor/followups?providerId=prov_rao')).body;
    expect(f.tasks[0].done).toBe(true); expect(Array.isArray(f.postOp)).toBe(true);
  });
});
