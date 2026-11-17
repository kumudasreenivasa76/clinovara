import { Router } from 'express';
import { id, nowIso, bad, find, digits, log, fullName, HttpError } from '../lib.js';
import { respond, applyActions } from '../domain/frontDesk.js';
import { rescheduleAppointment, cancelAppointment, acceptWaitlistOffer } from '../domain/scheduling.js';
import { packetFor, sendPacket } from '../domain/visits.js';
import { emit } from '../domain/webhooks.js';
import crypto from 'node:crypto';
import { rateLimit } from '../lib-ratelimit.js';

/** A signed-out visitor to a real clinic. The demo clinic keeps the open simulation used by the patient-chat demo page. */
const isVisitor = (req) => req.role === 'public' && !req.tenant?.demo;
const r = Router();
r.post('/', (req, res, next) => (isVisitor(req) ? rateLimit({ name: 'chat-new', windowMs: 10 * 60000, max: 10 })(req, res, next) : next()));
r.post('/:id/messages', (req, res, next) => (isVisitor(req) ? rateLimit({ name: 'chat-msg', windowMs: 10 * 60000, max: 60 })(req, res, next) : next()));
const CHANNELS = ['call', 'sms', 'web', 'whatsapp'];

function summary(db, c) {
  const last = c.messages[c.messages.length - 1];
  return { ...c, patient: c.patientId ? db.patients.find((p) => p.id === c.patientId) || null : null, lastMessage: last || null, messageCount: c.messages.length, candidatePatients: c.candidates?.map((cid) => { const p = db.patients.find((x) => x.id === cid); return p ? { id: p.id, name: fullName(p) } : null; }).filter(Boolean) || [] };
}

/** A signed-out visitor sees only their own thread, nothing internal. */
function visitorThread(c) { return { id: c.id, status: c.status, messages: c.messages.map((m) => ({ id: m.id, from: m.from, text: m.text, at: m.at })) }; }
/** The chat token is the visitor's proof that this conversation is theirs. */
function ownsThread(req, conv) {
  const given = Buffer.from(String(req.get('x-chat-token') || '')); const want = Buffer.from(String(conv.publicToken || ''));
  return want.length > 0 && given.length === want.length && crypto.timingSafeEqual(given, want);
}

export async function processPatientMessage(db, conv, text, { frontendBase = '' } = {}) {
  conv.messages.push({ id: id('msg'), from: 'patient', text, at: nowIso() });
  conv.updatedAt = nowIso();
  if (conv.status === 'staff' || conv.status === 'needs_staff') { conv.unread = true; return null; }
  const result = await respond(db, conv, text);
  const deps = {
    reschedule: (apptId, opts) => rescheduleAppointment(db, apptId, opts),
    cancel: (apptId, opts) => cancelAppointment(db, apptId, opts),
    acceptWaitlist: (wlId, opts) => acceptWaitlistOffer(db, wlId, opts),
    afterBooking: (appt) => { const pk = packetFor(db, appt.id, { create: true }); sendPacket(db, pk, { frontendBase }); },
  };
  let applied = [];
  try { applied = applyActions(db, conv, result, deps); }
  catch (err) { result.reply = `I ran into a problem completing that (${err.message}). I am asking our team to help.`; result.escalate = true; result.escalationReason = `Action failed: ${err.message}`; }
  const aiMsg = { id: id('msg'), from: 'ai', text: result.reply, at: nowIso(), intent: result.intent, escalated: !!result.escalate, engine: result.engine, actions: applied };
  conv.messages.push(aiMsg);
  conv.ai = result.state || {};
  conv.updatedAt = aiMsg.at;
  if (result.intent && !conv.reason) conv.reason = intentLabel(result);
  if (result.visitTypeId && !conv.visitTypeId) conv.visitTypeId = result.visitTypeId;
  if (result.escalate) {
    conv.status = 'needs_staff';
    conv.escalation = { reason: result.escalationReason || 'Needs staff', at: aiMsg.at };
    conv.unread = true;
    log(db, 'escalation', `Conversation with ${conv.contactName || 'unknown contact'} sent to staff (${conv.escalation.reason})`, { conversationId: conv.id });
    emit(db, 'conversation.escalated', { conversationId: conv.id, patientId: conv.patientId, contactName: conv.contactName, channel: conv.channel, reason: conv.escalation.reason, lastMessage: text });
  }
  return aiMsg;
}

function intentLabel(result) {
  return { book: 'Booking request', booked: 'Booked', urgent: 'Urgent visit request', reschedule: 'Reschedule request', cancel: 'Cancellation', faq: 'Question', clinical: 'Clinical question', sensitive: 'Needs staff', emergency: 'Emergency', greeting: 'General inquiry', confirm: 'Confirmation', identify: 'Family phone', other: 'General inquiry' }[result.intent] || 'Inquiry';
}

r.get('/', (req, res) => {
  if (req.role === 'public' && !req.tenant.demo) throw new HttpError(401, 'Please log in');
  const db = req.db;
  let list = db.conversations;
  if (req.query.status) list = list.filter((c) => c.status === req.query.status);
  res.json(list.slice().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).map((c) => summary(db, c)));
});

r.get('/:id', (req, res) => {
  const conv = find(req.db.conversations, req.params.id, 'Conversation');
  if (isVisitor(req)) { if (!ownsThread(req, conv)) throw new HttpError(403, 'This chat is not yours'); return res.json(visitorThread(conv)); }
  res.json(summary(req.db, conv));
});

r.post('/', async (req, res) => {
  const db = req.db;
  const visitor = isVisitor(req);
  // A signed-out visitor is never matched to a patient on file by an ID or phone number they type: that would
  // show another person's appointments to anyone who knows their number. Staff and verified channels can match.
  const b = visitor ? { text: req.body?.text, contactName: String(req.body?.contactName || '').slice(0, 80), contactPhone: '', channel: 'web', forceNew: true } : (req.body || {});
  const channel = CHANNELS.includes(b.channel) ? b.channel : (db.settings.locale?.defaultChannel || 'web');
  if (!b.text) bad('text is required');
  const cc = db.settings.locale?.phoneCountryCode || '91';
  let patient = b.patientId ? find(db.patients, b.patientId, 'Patient') : null;
  let candidates = null;
  if (!patient && b.contactPhone) {
    const matches = db.patients.filter((p) => digits(p.phone, cc) && digits(p.phone, cc) === digits(b.contactPhone, cc));
    if (matches.length === 1) patient = matches[0];
    else if (matches.length > 1) candidates = matches.map((p) => p.id);
  }
  let conv = patient ? db.conversations.find((c) => c.patientId === patient.id && c.status !== 'closed') : (b.contactPhone ? db.conversations.find((c) => digits(c.contactPhone, cc) === digits(b.contactPhone, cc) && c.status !== 'closed') : null);
  if (!conv || b.forceNew) {
    conv = { id: id('cnv'), patientId: patient?.id || null, candidates, contactName: patient ? fullName(patient) : (b.contactName || (candidates ? `${db.patients.find((p) => p.id === candidates[0]).lastName} family` : 'Unknown contact')), contactPhone: digits(b.contactPhone || patient?.phone || '', cc), contactEmail: b.contactEmail || '', channel, status: 'ai', reason: '', createdAt: nowIso(), updatedAt: nowIso(), messages: [], assignedTo: null, unread: false, ai: {} };
    db.conversations.unshift(conv);
  }
  if (visitor && !conv.publicToken) conv.publicToken = crypto.randomBytes(18).toString('base64url');
  const reply = await processPatientMessage(db, conv, b.text, { frontendBase: req.frontendBase });
  req.store.save();
  if (visitor) return res.status(201).json({ conversation: visitorThread(conv), token: conv.publicToken });
  res.status(201).json({ conversation: summary(db, conv), reply });
});

r.post('/:id/messages', async (req, res) => {
  const db = req.db;
  const conv = find(db.conversations, req.params.id, 'Conversation');
  const visitor = isVisitor(req);
  if (visitor && !ownsThread(req, conv)) throw new HttpError(403, 'This chat is not yours');
  const b = visitor ? { text: req.body?.text } : (req.body || {});
  if (!b.text) bad('text is required');
  if (b.from === 'staff') {
    conv.messages.push({ id: id('msg'), from: 'staff', by: req.user, text: b.text, at: nowIso() });
    conv.status = 'staff'; conv.assignedTo = conv.assignedTo || req.user; conv.unread = false; conv.updatedAt = nowIso();
    db.communications.unshift({ id: id('cm'), patientId: conv.patientId, type: 'custom', channel: conv.channel, body: b.text, sentAt: nowIso(), status: 'sent', by: req.user, conversationId: conv.id, delivery: 'simulated' });
    req.store.save();
    return res.json({ conversation: summary(db, conv), reply: null });
  }
  if (conv.status === 'closed') { conv.status = 'ai'; conv.ai = {}; }
  const reply = await processPatientMessage(db, conv, b.text, { frontendBase: req.frontendBase });
  req.store.save();
  if (visitor) return res.json({ conversation: visitorThread(conv) });
  res.json({ conversation: summary(db, conv), reply });
});

r.post('/:id/takeover', (req, res) => { const conv = find(req.db.conversations, req.params.id, 'Conversation'); conv.status = 'staff'; conv.assignedTo = req.user; conv.unread = false; conv.updatedAt = nowIso(); log(req.db, 'inbox', `${req.user} took over the conversation with ${conv.contactName}`, { conversationId: conv.id }); req.store.save(); res.json(summary(req.db, conv)); });
r.post('/:id/release', (req, res) => { const conv = find(req.db.conversations, req.params.id, 'Conversation'); conv.status = 'ai'; conv.assignedTo = null; conv.ai = {}; conv.escalation = null; conv.updatedAt = nowIso(); req.store.save(); res.json(summary(req.db, conv)); });
r.post('/:id/close', (req, res) => { const conv = find(req.db.conversations, req.params.id, 'Conversation'); conv.status = 'closed'; conv.unread = false; conv.closedAt = nowIso(); conv.updatedAt = nowIso(); req.store.save(); res.json(summary(req.db, conv)); });
r.post('/:id/read', (req, res) => { const conv = find(req.db.conversations, req.params.id, 'Conversation'); conv.unread = false; req.store.save(); res.json(summary(req.db, conv)); });
r.post('/:id/link', (req, res) => { const conv = find(req.db.conversations, req.params.id, 'Conversation'); const p = find(req.db.patients, req.body?.patientId, 'Patient'); conv.patientId = p.id; conv.candidates = null; conv.contactName = fullName(p); if (!conv.contactPhone) conv.contactPhone = p.phone; req.store.save(); res.json(summary(req.db, conv)); });
r.patch('/:id', (req, res) => { const conv = find(req.db.conversations, req.params.id, 'Conversation'); for (const k of ['reason', 'assignedTo', 'contactName']) if (req.body?.[k] !== undefined) conv[k] = req.body[k]; req.store.save(); res.json(summary(req.db, conv)); });

export default r;
