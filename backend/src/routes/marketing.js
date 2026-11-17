import { Router } from 'express';
import { id, nowIso, bad, find, log, fullName } from '../lib.js';
import { GOALS, SEGMENTS, AUTOMATIONS, TONES, marketingSettings, segmentPatients, eligibleAudience, recentlyMarketed, draftCopy, createCampaign, transition, sendCampaign, dispatchQueue, queueBirthdays, defaultPrompts, renderCopy } from '../domain/marketing.js';
import { planCampaign, improvePrompt, testPrompt } from '../domain/marketingAI.js';
import { analytics } from '../domain/marketingAnalytics.js';
import { PROMPT_LIBRARY } from '../domain/promptLibrary.js';
import { MANAGERS } from '../domain/auth.js';
import { growth, SOURCES } from '../domain/growth.js';
import { ruleDraft, sendWindowOpen, nextSendWindow, windowMessage } from '../domain/marketing.js';

const r = Router();
const manager = (req) => { if (!MANAGERS.has(req.role)) bad('Only an owner or admin can do this'); };

r.get('/', (req, res) => {
  const db = req.db; const m = marketingSettings(db);
  queueBirthdays(db); dispatchQueue(db); req.store.save();
  const campaigns = (db.settings.marketingCampaigns || []).map((c) => ({ ...c, audienceCount: segmentPatients(db, c.segment, { locationId: c.locationId }).length, eligibleCount: eligibleAudience(db, c.segment, c.locationId).length }));
  const queue = (db.settings.marketingQueue || []).map((q) => ({ ...q, patient: db.patients.find((p) => p.id === q.patientId) || null }));
  res.json({ settings: m, prompts: db.settings.marketingPrompts, campaigns, queue, goals: GOALS, segments: SEGMENTS.map((s) => ({ ...s, count: segmentPatients(db, s.id).length })), optedIn: db.patients.filter((p) => p.marketingOptIn !== false && p.phone).length, optedOut: db.patients.filter((p) => p.marketingOptIn === false).length, pendingApprovals: campaigns.filter((c) => c.status === 'pending_approval').length + queue.filter((q) => q.status === 'pending_approval').length, canApprove: MANAGERS.has(req.role), automations: AUTOMATIONS, tones: TONES });
});

/** Results and opportunities for the Growth tab. */
r.get('/growth', (req, res) => res.json({ ...growth(req.db, { days: Math.min(90, Math.max(7, Number(req.query.days) || 30)), locationId: req.query.locationId ? String(req.query.locationId) : null }), sourceOptions: SOURCES }));

/** One tap from an opportunity to a draft campaign (still needs submitting and approval before anything is sent). */
r.post('/opportunity', async (req, res) => {
  const db = req.db; const b = req.body || {};
  let draft;
  try { draft = await draftCopy(db, { goal: b.goal }); } catch { draft = ruleDraft(db, { goal: b.goal }); }
  const c = createCampaign(db, { goal: b.goal, segment: b.segment, body: draft.body, notes: draft.notes, engine: draft.engine, promptId: draft.promptId, by: req.user });
  log(db, 'marketing', `${req.user} started a "${c.name}" campaign from the growth screen`);
  req.store.save();
  res.status(201).json(c);
});

/** Revenue, marketing results, reach-out and website views in one read. */
r.get('/analytics', (req, res) => res.json(analytics(req.db, { days: Math.min(180, Math.max(7, Number(req.query.days) || 30)), locationId: req.query.locationId ? String(req.query.locationId) : null })));

/** Describe a goal in words; get a ready draft campaign back to review. Nothing is created until the user saves it. */
r.post('/plan', async (req, res) => { res.json(await planCampaign(req.db, { ask: req.body?.ask, lang: req.body?.lang })); });

// Prompt tools: a library of ready briefs, an AI improver, and a tester that works before approval.
r.get('/prompts/library', (req, res) => { const have = new Set((req.db.settings.marketingPrompts || []).map((p) => p.name.toLowerCase())); res.json(PROMPT_LIBRARY.map((p) => ({ ...p, added: have.has(p.name.toLowerCase()) }))); });
r.post('/prompts/improve', async (req, res) => { res.json(await improvePrompt(req.db, req.body || {})); });
r.post('/prompts/test', async (req, res) => { res.json(await testPrompt(req.db, req.body || {})); });

/** Patients and their marketing status: who can be messaged, who was messaged lately, who is paused by the frequency cap. */
r.get('/patients', (req, res) => {
  const db = req.db; const m = marketingSettings(db); const seg = String(req.query.segment || 'all'); const q = String(req.query.q || '').toLowerCase().trim();
  const cap = m.frequencyCapDays; const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
  let list = seg === 'opted_out' ? db.patients.filter((p) => p.marketingOptIn === false) : segmentPatients(db, seg);
  if (q) list = list.filter((p) => `${p.firstName} ${p.lastName} ${p.phone}`.toLowerCase().includes(q));
  const rows = list.slice(0, 150).map((p) => {
    const mine = db.communications.filter((c) => c.patientId === p.id && ['marketing', 'recall', 'treatment', 'thank_you', 'review_request'].includes(c.type));
    const last = mine.reduce((a, c) => (!a || c.sentAt > a.sentAt ? c : a), null);
    return { id: p.id, name: fullName(p), phone: p.phone, lang: p.preferredLanguage, optIn: p.marketingOptIn !== false, source: p.source || '', lastVisit: p.lastVisit || null, lastMessage: last ? { at: last.sentAt, type: last.type, goal: last.meta?.goal || null } : null, messages30: mine.filter((c) => c.sentAt >= since30).length, paused: recentlyMarketed(db, p.id, cap) };
  });
  res.json({ total: list.length, shown: rows.length, capDays: cap, rows, optedOut: db.patients.filter((p) => p.marketingOptIn === false).length });
});

r.post('/campaigns/:id/duplicate', (req, res) => {
  const src = find(req.db.settings.marketingCampaigns || [], req.params.id, 'Campaign');
  const c = createCampaign(req.db, { name: `${src.name} (copy)`, goal: src.goal, segment: src.segment, locationId: src.locationId, lang: src.lang, body: src.body, notes: src.notes, brief: src.brief, festival: src.festival, promptId: src.promptId, engine: src.engine, by: req.user });
  req.store.save(); res.status(201).json(c);
});

r.put('/settings', (req, res) => {
  manager(req); const m = marketingSettings(req.db); const b = req.body || {};
  const NESTED = ['autoThankYou', 'autoReview', 'voice', 'quietHours']; // merged one level so a partial save keeps the other fields
  for (const [k, v] of Object.entries(b)) if (!NESTED.includes(k) && !['automations', 'frequencyCapDays'].includes(k)) m[k] = v;
  for (const k of NESTED) if (b[k]) m[k] = { ...m[k], ...b[k] };
  if (b.automations) for (const [k, v] of Object.entries(b.automations)) m.automations[k] = { ...(m.automations[k] || {}), ...v };
  if (b.frequencyCapDays !== undefined) m.frequencyCapDays = Math.min(60, Math.max(0, Number(b.frequencyCapDays) || 0));
  req.store.save(); res.json(m);
});

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
r.post('/campaigns/:id/send', (req, res) => {
  const c = find(req.db.settings.marketingCampaigns || [], req.params.id, 'Campaign');
  // Check the window first: a blocked send must leave the campaign exactly as it was, never half-marked as sent.
  if (c.status === 'approved' && !sendWindowOpen(req.db)) bad(`${windowMessage(req.db)} Use "Schedule" and it will go out automatically when the window opens.`);
  transition(req.db, c, 'send', { by: req.user, role: req.role });
  let n;
  try { n = sendCampaign(req.db, c, { by: req.user }); } catch (err) { c.status = 'approved'; throw err; }
  c.scheduledFor = null; req.store.save(); res.json({ campaign: c, sent: n });
});
/** Queue an approved campaign for the next allowed time (or a chosen time). The background job sends it. */
r.post('/campaigns/:id/schedule', (req, res) => {
  manager(req); const c = find(req.db.settings.marketingCampaigns || [], req.params.id, 'Campaign');
  if (c.status !== 'approved') bad('Only an approved campaign can be scheduled');
  const at = req.body?.at ? new Date(req.body.at) : null;
  if (at && (Number.isNaN(at.getTime()) || at < new Date())) bad('Choose a time in the future');
  c.scheduledFor = nextSendWindow(req.db, at || new Date()); c.scheduleError = null; c.updatedAt = nowIso();
  c.history.push({ at: nowIso(), by: req.user, action: 'schedule', reason: c.scheduledFor });
  log(req.db, 'marketing', `${req.user} scheduled "${c.name}" to send at ${c.scheduledFor}`); req.store.save(); res.json(c);
});
r.post('/campaigns/:id/unschedule', (req, res) => { manager(req); const c = find(req.db.settings.marketingCampaigns || [], req.params.id, 'Campaign'); c.scheduledFor = null; c.scheduleError = null; c.history.push({ at: nowIso(), by: req.user, action: 'unschedule', reason: '' }); req.store.save(); res.json(c); });
r.delete('/campaigns/:id', (req, res) => { const c = find(req.db.settings.marketingCampaigns || [], req.params.id, 'Campaign'); if (c.status === 'sent') bad('Sent campaigns are kept for the audit trail'); req.db.settings.marketingCampaigns = req.db.settings.marketingCampaigns.filter((x) => x.id !== c.id); req.store.save(); res.json({ ok: true }); });

// Per-visit queue (thank-you / review requests)
r.post('/queue/:id/approve', (req, res) => { manager(req); const q = find(req.db.settings.marketingQueue || [], req.params.id, 'Queued message'); if (req.body?.body) q.body = req.body.body; q.status = 'approved'; q.approvedBy = req.user; q.approvedAt = nowIso(); q.sendAfter = q.sendAfter < nowIso() ? nowIso() : q.sendAfter; dispatchQueue(req.db, { by: req.user }); req.store.save(); res.json(q); });
r.post('/queue/:id/reject', (req, res) => { manager(req); const q = find(req.db.settings.marketingQueue || [], req.params.id, 'Queued message'); q.status = 'rejected'; q.rejectedBy = req.user; req.store.save(); res.json(q); });
r.post('/queue/approve-all', (req, res) => { manager(req); let n = 0; for (const q of req.db.settings.marketingQueue || []) if (q.status === 'pending_approval' && (!req.body?.goal || q.goal === req.body.goal)) { q.status = 'approved'; q.approvedBy = req.user; q.approvedAt = nowIso(); n++; } dispatchQueue(req.db, { by: req.user }); log(req.db, 'marketing', `${req.user} approved ${n} queued messages`); req.store.save(); res.json({ approved: n }); });
r.post('/queue/dispatch', (req, res) => { const n = dispatchQueue(req.db, { by: req.user }); req.store.save(); res.json({ sent: n }); });

// Patient opt-in / opt-out
r.post('/optout/:patientId', (req, res) => { const p = find(req.db.patients, req.params.patientId, 'Patient'); p.marketingOptIn = req.body?.optIn === true; p.marketingOptChangedAt = nowIso(); req.store.save(); res.json({ id: p.id, marketingOptIn: p.marketingOptIn }); });

export default r;
