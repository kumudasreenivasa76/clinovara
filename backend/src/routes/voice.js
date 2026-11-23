/**
 * Voice calls. Two audiences:
 *   - owners and admins: see what is connected and choose the voice provider (GET /status, PUT /settings);
 *   - the media bridge that carries the phone audio: starts a call, sends caller turns or tool calls,
 *     and ends the call. The bridge authenticates with the x-voice-secret header.
 */
import { Router } from 'express';
import { find, bad, HttpError } from '../lib.js';
import { startCall, callerSays, endCall, assistantSettings } from '../domain/assistant.js';
import { voiceStatus, saveVoiceSettings, voiceSettings, checkBridge, voiceSession, runVoiceTool, VOICE_TOOLS } from '../domain/voice.js';

const r = Router();
const managers = (req) => { if (!['owner', 'admin'].includes(req.role)) throw new HttpError(403, 'Only clinic owners and admins can change the phone assistant'); };
const callFor = (req) => { const c = find(req.db.calls || [], req.params.id, 'Call'); if (c.status === 'ended') bad('This call has already ended'); return c; };

r.get('/status', (req, res) => {
  managers(req);
  const base = `${req.protocol}://${req.get('host')}/api/voice`;
  res.json({ ...voiceStatus(req.db), tools: VOICE_TOOLS.map((t) => ({ name: t.name, description: t.description })), webhooks: { incoming: `${base}/incoming?t=${req.tenant.slug}`, turn: `${base}/calls/{callId}/turn`, tool: `${base}/calls/{callId}/tool`, end: `${base}/calls/{callId}/end` } });
});

r.put('/settings', (req, res) => {
  managers(req);
  const s = saveVoiceSettings(req.db, req.body || {});
  req.store.save();
  res.json({ ...voiceStatus(req.db), settings: s });
});

/** A call has arrived. Returns the greeting to speak and, for speech-to-speech providers, the session to open. */
r.post('/incoming', (req, res) => {
  checkBridge(req);
  const db = req.db; const b = req.body || {};
  if (!assistantSettings(db).enabled || !voiceSettings(db).enabled) return res.status(409).json({ error: 'The phone assistant is switched off for this clinic', forwardTo: db.settings.practice.phone || null });
  const { call, say, language, open } = startCall(db, { phone: b.from || b.phone || '', contactName: b.callerName || '', language: b.language || null, externalId: b.callSid || b.externalId || null });
  call.channel = 'voice';
  req.store.save();
  res.status(201).json({ callId: call.id, say, language, open, session: voiceSession(db, call) });
});

/** Text-in-the-middle providers: what the caller said, as text. Returns what to say back. */
r.post('/calls/:id/turn', async (req, res) => {
  checkBridge(req);
  const call = callFor(req); const text = String(req.body?.text || '').trim();
  if (!text) bad('text is required');
  const out = await callerSays(req.db, call, text, { frontendBase: req.frontendBase });
  req.store.save();
  res.json({ say: out.say, language: out.language || call.language, end: !!out.end, handoff: !!out.handoff });
});

/** Speech-to-speech providers: the model asked to use a tool. Returns the result for the model to speak from. */
r.post('/calls/:id/tool', (req, res) => {
  checkBridge(req);
  const call = callFor(req); const name = String(req.body?.name || '');
  let args = req.body?.arguments ?? {};
  if (typeof args === 'string') { try { args = JSON.parse(args || '{}'); } catch { return res.json({ ok: false, error: 'The tool arguments were not valid JSON.' }); } }
  const result = runVoiceTool(req.db, call, name, args);
  (call.toolLog ||= []).push({ at: new Date().toISOString(), name, ok: !!result.ok });
  // Keep a plain-language line in the transcript so staff can read what the assistant did.
  if (result.ok && name === 'book_appointment') call.transcript.push({ from: 'assistant', text: `[Booked ${result.when} with ${result.dentist} at ${result.branch}]`, at: new Date().toISOString(), lang: call.language });
  if (result.ok && name === 'take_message') call.transcript.push({ from: 'assistant', text: `[Message for staff: ${call.notes?.summary}]`, at: new Date().toISOString(), lang: call.language });
  req.store.save();
  res.json(result);
});

/** Optional: the bridge sends what was said so the call log has a transcript even with speech-to-speech. */
r.post('/calls/:id/transcript', (req, res) => {
  checkBridge(req);
  const call = callFor(req); const from = req.body?.from === 'assistant' ? 'assistant' : 'caller'; const text = String(req.body?.text || '').trim().slice(0, 2000);
  if (text) call.transcript.push({ from, text, at: new Date().toISOString(), lang: call.language });
  req.store.save();
  res.json({ ok: true, lines: call.transcript.length });
});

r.post('/calls/:id/end', (req, res) => {
  checkBridge(req);
  const call = find(req.db.calls || [], req.params.id, 'Call');
  const { say } = endCall(req.db, call, { by: 'Phone assistant', reason: req.body?.reason || 'hangup' });
  req.store.save();
  res.json({ say, status: call.status, outcome: call.outcome || null });
});

export default r;
