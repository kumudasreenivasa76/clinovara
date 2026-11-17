import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../src/app.js';
import { createRegistry } from '../src/registry.js';
process.env.CLINOVARA_AI = 'rules';
let app, token;
async function raw(method, path, body, headers = {}) {
  const server = app.listen(0); const port = server.address().port;
  try { const res = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined }); const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch { /* not json */ } return { status: res.status, body: json }; }
  finally { server.close(); }
}
const api = (m, p, b) => raw(m, p, b, { authorization: `Bearer ${token}` });
const pub = (m, p, b) => raw(m, p, b, { 'x-tenant': 'smilecare' });
beforeEach(async () => { app = createApp({ registry: createRegistry({ memory: true }), frontendBase: 'http://test/' }); token = (await raw('POST', '/api/auth/demo', {})).body.token; });

const firstSlot = async (q = '') => { const r = (await pub('GET', `/api/public/slots?visitTypeId=vt_cleaning&days=14${q}`)).body; return r.days.flatMap((d) => d.slots)[0]; };

describe('public website booking', () => {
  it('shows clinic profile with fees and books online without double-booking', async () => {
    const c = (await pub('GET', '/api/public/clinic')).body;
    expect(c.visitTypes.length).toBeGreaterThan(3); expect(c.visitTypes[0].fee).not.toBeNull();
    const slot = await firstSlot();
    const body = { name: 'Web Patient', phone: '9845077700', visitTypeId: 'vt_cleaning', providerId: slot.providerId, locationId: slot.locationId, start: slot.start };
    const ok = await pub('POST', '/api/public/book', body);
    expect(ok.status).toBe(201);
    const again = await pub('POST', '/api/public/book', { ...body, name: 'Other Person', phone: '9845077701' });
    expect(again.status).toBe(400); expect(again.body.error || again.body.message).toMatch(/taken/);
  });
  it('honours booking rules, doctor timings, buffers and fee overrides', async () => {
    const s = (await api('GET', '/api/settings')).body;
    const base = await firstSlot();
    // provider with no working days offers nothing; fee override changes the fee shown
    const hours = { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null };
    const providers = s.providers.map((p) => (p.id === base.providerId ? { ...p, hours, feeOverrides: { vt_cleaning: 999 } } : p));
    await api('PUT', '/api/settings', { providers });
    const after = (await pub('GET', `/api/public/slots?visitTypeId=vt_cleaning&providerId=${base.providerId}&days=14`)).body;
    expect(after.days.flatMap((d) => d.slots).length).toBe(0);
    const c = (await pub('GET', '/api/public/clinic')).body;
    expect(c.visitTypes.find((v) => v.id === 'vt_cleaning').fees[base.providerId]).toBe(999);
    // switching online booking off hides all slots
    await api('PUT', '/api/settings', { practice: { ...s.practice, booking: { onlineBooking: false } } });
    const off = (await pub('GET', '/api/public/slots?visitTypeId=vt_cleaning&days=7')).body;
    expect(off.days.flatMap((d) => d.slots).length).toBe(0);
  });
});
