import { Router } from 'express';
import { id, nowIso, bad, find, log, fullName } from '../lib.js';
import { GOALS, SEGMENTS, marketingSettings, segmentPatients, draftCopy, createCampaign, transition, sendCampaign, dispatchQueue, defaultPrompts, renderCopy } from '../domain/marketing.js';
import { MANAGERS } from '../domain/auth.js';

const r = Router();
const manager = (req) => { if (!MANAGERS.has(req.role)) bad('Only an owner or admin can do this'); };

r.get('/', (req, res) => {
  const db = req.db; const m = marketingSettings(db);
  dispatchQueue(db); req.store.save();
  const campaigns = (db.settings.marketingCampaigns || []).map((c) => ({ ...c, audienceCount: segmentPatients(db, c.segment, { locationId: c.locationId }).length }));
  const queue = (db.settings.marketingQueue || []).map((q) => ({ ...q, patient: db.patients.find((p) => p.id === q.patientId) || null }));
  res.json({ settings: m, prompts: db.settings.marketingPrompts, campaigns, queue, goals: GOALS, segments: SEGMENTS.map((s) => ({ ...s, count: segmentPatients(db, s.id).length })), optedIn: db.patients.filter((p) => p.marketingOptIn !== false && p.phone).length, optedOut: db.patients.filter((p) => p.marketingOptIn === false).length, pendingApprovals: campaigns.filter((c) => c.status === 'pending_approval').length + queue.filter((q) => q.status === 'pending_approval').length, canApprove: MANAGERS.has(req.role) });
});

r.put('/settings', (req, res) => { manager(req); const m = marketingSettings(req.db); Object.assign(m, req.body || {}); if (req.body?.autoThankYou) m.autoThankYou = { ...m.autoThankYou, ...req.body.autoThankYou }; if (req.body?.autoReview) m.autoReview = { ...m.autoReview, ...req.body.autoReview }; req.store.save(); res.json(m); });

// Prompts (briefs) — approval-gated
r.post('/prompts', (req, res) => { const db = req.db; marketingSettings(db); const b = req.body || {}; if (!b.name || !b.body || !b.goal) bad('name, goal and body are required'); const p = { id: id('pr'), goal: b.goal, name: b.name, body: b.body, status: 'draft', createdBy: req.user, createdAt: nowIso() }; db.settings.marketingPrompts.push(p); req.store.save(); res.status(201).json(p); });
r.patch('/prompts/:id', (req, res) => { const db = req.db; marketingSettings(db); const p = find(db.settings.marketingPrompts, req.params.id, 'Prompt'); if (req.body?.body !== undefined || req.body?.name !== undefined) { if (req.body.body !== undefined) p.body = req.body.body; if (req.body.name !== undefined) p.name = req.body.name; p.status = 'draft'; p.editedBy = req.user; p.editedAt = nowIso(); } req.store.save(); res.json(p); });
r.post('/prompts/:id/approve', (req, res) => { manager(req); const p = find(req.db.settings.marketingPrompts, req.params.id, 'Prompt'); p.status = 'approved'; p.approvedBy = req.user; p.approvedAt = nowIso(); log(req.db, 'marketing', `${req.user} approved the prompt "${p.name}"`); req.store.save(); res.json(p); });
r.post('/prompts/:id/revoke', (req, res) => { manager(req); const p = find(req.db.settings.marketingPrompts, req.params.id, 'Prompt'); p.status = 'draft'; req.store.save(); res.json(p); });
r.post('/prompts/reset', (req, res) => { manager(req); req.db.settings.marketingPrompts = defaultPrompts(); req.store.save(); res.json(req.db.settings.marketingPrompts); });
r.delete('/prompts/:id', (req, res) => { manager(req); req.db.settings.marketingPrompts = req.db.settings.marketingPrompts.filter((p) => p.id !== req.params.id); req.store.save(); res.json({ ok: true }); });

// AI draft (uses an approved prompt only)
r.post('/draft', async (req, res) => { const out = await draftCopy(req.db, req.body || {}); res.json(out); });
r.post('/preview', (req, res) => { const db = req.db; const p = db.patients.find((x) => x.id === req.body?.patientId) || db.patients[0]; res.json({ body: renderCopy(db, req.body?.body || '', { patient: p, provider: db.settings.providers[0], treatment: 'a crown on tooth 46', location: db.settings.locations?.[0], festival: req.body?.festival, brief: req.body?.brief, lang: req.body?.lang }) }); });
r.get('/segments/:id', (req, res) => res.json(segmentPatients(req.db, req.params.id, { locationId: req.query.locationId || null }).map((p) => ({ id: p.id, name: fullName(p), phone: p.phone, lang: p.preferredLanguage }))));

// Campaign lifecycle
r.post('/campaigns', (req, res) => { const c = createCampaign(req.db, { ...req.body, by: req.user }); log(req.db, 'marketing', `${req.user} drafted campaign "${c.name}"`); req.store.save(); res.status(201).json(c); });
r.patch('/campaigns/:id', (req, res) => { const c = find(req.db.settings.marketingCampaigns || [], req.params.id, 'Campaign'); if (!['draft', 'rejected'].includes(c.status)) bad('Withdraw the campaign to edit it'); for (const k of ['name', 'body', 'segment', 'locationId', 'lang', 'notes', 'scheduledFor', 'brief', 'festival']) if (req.body?.[k] !== undefined) c[k] = req.body[k]; c.updatedAt = nowIso(); c.history.push({ at: nowIso(), by: req.user, action: 'edited' }); req.store.save(); res.json(c); });
for (const action of ['submit', 'approve', 'reject', 'withdraw']) {
  r.post(`/campaigns/:id/${action}`, (req, res) => { const c = find(req.db.settings.marketingCampaigns || [], req.params.id, 'Campaign'); transition(req.db, c, action, { by: req.user, role: req.role, reason: req.body?.reason || '' }); log(req.db, 'marketing', `${req.user} ${action === 'submit' ? 'submitted' : action + 'd'} campaign "${c.name}"${req.body?.reason ? `: ${req.body.reason}` : ''}`); req.store.save(); res.json(c); });
}
r.post('/campaigns/:id/send', (req, res) => { const c = find(req.db.settings.marketingCampaigns || [], req.params.id, 'Campaign'); transition(req.db, c, 'send', { by: req.user, role: req.role }); const n = sendCampaign(req.db, c, { by: req.user }); req.store.save(); res.json({ campaign: c, sent: n }); });
r.delete('/campaigns/:id', (req, res) => { const c = find(req.db.settings.marketingCampaigns || [], req.params.id, 'Campaign'); if (c.status === 'sent') bad('Sent campaigns are kept for the audit trail'); req.db.settings.marketingCampaigns = req.db.settings.marketingCampaigns.filter((x) => x.id !== c.id); req.store.save(); res.json({ ok: true }); });

// Per-visit queue (thank-you / review requests)
r.post('/queue/:id/approve', (req, res) => { manager(req); const q = find(req.db.settings.marketingQueue || [], req.params.id, 'Queued message'); if (req.body?.body) q.body = req.body.body; q.status = 'approved'; q.approvedBy = req.user; q.approvedAt = nowIso(); q.sendAfter = q.sendAfter < nowIso() ? nowIso() : q.sendAfter; dispatchQueue(req.db, { by: req.user }); req.store.save(); res.json(q); });
r.post('/queue/:id/reject', (req, res) => { manager(req); const q = find(req.db.settings.marketingQueue || [], req.params.id, 'Queued message'); q.status = 'rejected'; q.rejectedBy = req.user; req.store.save(); res.json(q); });
r.post('/queue/approve-all', (req, res) => { manager(req); let n = 0; for (const q of req.db.settings.marketingQueue || []) if (q.status === 'pending_approval' && (!req.body?.goal || q.goal === req.body.goal)) { q.status = 'approved'; q.approvedBy = req.user; q.approvedAt = nowIso(); n++; } dispatchQueue(req.db, { by: req.user }); log(req.db, 'marketing', `${req.user} approved ${n} queued messages`); req.store.save(); res.json({ approved: n }); });
r.post('/queue/dispatch', (req, res) => { const n = dispatchQueue(req.db, { by: req.user }); req.store.save(); res.json({ sent: n }); });

// Patient opt-in / opt-out
r.post('/optout/:patientId', (req, res) => { const p = find(req.db.patients, req.params.patientId, 'Patient'); p.marketingOptIn = req.body?.optIn === true; p.marketingOptChangedAt = nowIso(); req.store.save(); res.json({ id: p.id, marketingOptIn: p.marketingOptIn }); });

export default r;
