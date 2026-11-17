import { Router } from 'express';
import crypto from 'node:crypto';
import { id, nowIso, bad, find, log } from '../lib.js';
import { EVENTS, emit, pending } from '../domain/webhooks.js';
import { resend, outboxSummary } from '../domain/ehr.js';
import { mailConfigured } from '../domain/mailer.js';
import { smsReady, whatsappReady } from '../domain/providers.js';
import { aiMode } from '../domain/frontDesk.js';

const r = Router();
const cfg = (db) => (db.settings.integrations ||= { apiKey: '', webhooks: [], messaging: { provider: 'none' }, ehr: {}, abdm: {} });

/** What is switched on. Provider credentials live in the server environment, never in clinic settings. */
r.get('/status', (req, res) => {
  const db = req.db; const c = cfg(db); const m = db.settings.marketing || {};
  res.json({
    server: { email: mailConfigured(), sms: smsReady(), whatsapp: whatsappReady(), ai: aiMode() === 'claude' },
    clinic: { googleReview: !!m.googleReviewUrl, calendarFeeds: !!db.settings.calendarFeeds?.enabled || undefined, webhooks: c.webhooks.length, apiKey: !!c.apiKey },
    outbox: { simulated: db.communications.filter((x) => x.delivery === 'simulated').length, failed: db.communications.filter((x) => x.delivery === 'failed').length, sent: db.communications.filter((x) => x.delivery === 'sent').length },
  });
});

r.get('/', (req, res) => {
  const c = cfg(req.db);
  res.json({ ...c, apiKey: c.apiKey ? `${c.apiKey.slice(0, 6)}…${c.apiKey.slice(-4)}` : '', hasApiKey: !!c.apiKey, events: EVENTS, fhirBase: '/api/fhir', log: req.db.webhookLog.slice(0, 50) });
});

r.post('/api-key', (req, res) => {
  const c = cfg(req.db);
  c.apiKey = `clv_${crypto.randomBytes(24).toString('base64url')}`;
  log(req.db, 'settings', `${req.user} generated a new integration API key`);
  req.store.save();
  res.json({ apiKey: c.apiKey, note: 'Shown once. Send it as the x-api-key header on /api/fhir requests.' });
});
r.delete('/api-key', (req, res) => { cfg(req.db).apiKey = ''; req.store.save(); res.json({ ok: true }); });

r.put('/config', (req, res) => {
  const c = cfg(req.db); const b = req.body || {};
  if (b.messaging) c.messaging = { ...c.messaging, ...b.messaging };
  if (b.ehr) c.ehr = { ...c.ehr, ...b.ehr };
  if (b.abdm) c.abdm = { ...c.abdm, ...b.abdm };
  req.store.save();
  res.json(c);
});

r.post('/webhooks', (req, res) => {
  const c = cfg(req.db); const b = req.body || {};
  if (!/^https?:\/\//.test(b.url || '')) bad('Webhook URL must start with http:// or https://');
  const w = { id: id('wh'), url: b.url, events: Array.isArray(b.events) ? b.events.filter((e) => EVENTS.includes(e) && e !== 'test.ping') : [], secret: b.secret || crypto.randomBytes(16).toString('hex'), active: b.active !== false, name: b.name || '', createdAt: nowIso() };
  c.webhooks.push(w);
  req.store.save();
  res.status(201).json(w);
});
r.patch('/webhooks/:id', (req, res) => {
  const w = find(cfg(req.db).webhooks, req.params.id, 'Webhook');
  for (const k of ['url', 'name', 'secret', 'active']) if (req.body?.[k] !== undefined) w[k] = req.body[k];
  if (Array.isArray(req.body?.events)) w.events = req.body.events.filter((e) => EVENTS.includes(e));
  req.store.save();
  res.json(w);
});
r.delete('/webhooks/:id', (req, res) => { const c = cfg(req.db); c.webhooks = c.webhooks.filter((w) => w.id !== req.params.id); req.store.save(); res.json({ ok: true }); });
r.post('/webhooks/:id/test', async (req, res) => {
  const w = find(cfg(req.db).webhooks, req.params.id, 'Webhook');
  const before = req.db.webhookLog.length;
  emit({ ...req.db, settings: { ...req.db.settings, integrations: { ...cfg(req.db), webhooks: [w] } }, webhookLog: req.db.webhookLog }, 'test.ping', { message: 'Hello from Clinovara', at: nowIso() });
  await pending();
  req.store.save();
  res.json({ delivered: req.db.webhookLog.length > before ? req.db.webhookLog[0] : null });
});
r.get('/log', (req, res) => res.json(req.db.webhookLog.slice(0, Number(req.query.limit || 100))));

r.get('/ehr-outbox', (req, res) => res.json((req.db.ehrOutbox || []).slice(0, Number(req.query.limit || 100)).map(outboxSummary)));
r.post('/ehr-outbox/:id/resend', (req, res) => { const e = resend(req.db, req.params.id); if (!e) bad('Not found'); req.store.save(); res.json(outboxSummary(e)); });

export default r;
