/**
 * Phone voice for the AI receptionist, kept independent of any one vendor.
 *
 * A phone call reaches Clinovara through a small "media bridge" that sits between the phone carrier
 * (for example Exotel) and a voice model. Two shapes are supported, and both end at the same booking
 * rules as WhatsApp and web chat:
 *
 *   speech to speech  (OpenAI Realtime): the model hears and speaks. It is given the instructions and
 *                     the tools below, and calls a tool whenever it needs the diary.
 *   text in the middle (Claude + speech recognition + a voice such as ElevenLabs): the bridge turns the
 *                     caller's speech into text, sends each turn to the existing call assistant, and
 *                     speaks the reply.
 *
 * Nothing here handles audio. Credentials live in the server environment, never in clinic settings.
 */
import { nowIso, dayKey, addDays, bad, fullName, digits, id, log, HttpError } from '../lib.js';
import { nextSlots, bookAppointment, fmtWhen, location } from './scheduling.js';
import { isOpen, nextOpening, fmtOpening, addCallback } from './hours.js';
import { aiOn } from './claudeJson.js';

export const PROVIDERS = {
  none: { label: 'Not connected', needs: [] },
  openai_realtime: { label: 'OpenAI Realtime (speech to speech)', needs: ['OPENAI_API_KEY'], mode: 'speech' },
  claude_elevenlabs: { label: 'Claude with speech recognition and ElevenLabs voice', needs: ['ANTHROPIC_API_KEY', 'ELEVENLABS_API_KEY', 'SPEECH_TO_TEXT_API_KEY'], mode: 'text' },
};
export const CARRIER_KEYS = ['EXOTEL_SID', 'EXOTEL_API_KEY', 'EXOTEL_API_TOKEN'];

export const voiceSettings = (db) => (db.settings.voice ||= { provider: 'none', number: '', voiceName: '', enabled: false });

/** Which keys are present on this server. Values are never returned, only whether each is set. */
export function voiceStatus(db) {
  const s = voiceSettings(db); const has = (k) => !!process.env[k];
  const need = PROVIDERS[s.provider]?.needs || [];
  const keys = Object.fromEntries([...new Set([...Object.values(PROVIDERS).flatMap((p) => p.needs), ...CARRIER_KEYS, 'VOICE_WEBHOOK_SECRET'])].map((k) => [k, has(k)]));
  const missing = [...need.filter((k) => !has(k)), ...CARRIER_KEYS.filter((k) => !has(k)), ...(has('VOICE_WEBHOOK_SECRET') ? [] : ['VOICE_WEBHOOK_SECRET'])];
  return {
    settings: s, providers: Object.entries(PROVIDERS).map(([id2, p]) => ({ id: id2, label: p.label, needs: p.needs, mode: p.mode || null })),
    keys, missing: s.provider === 'none' ? [] : missing,
    ready: s.provider !== 'none' && s.enabled && missing.length === 0,
    brain: s.provider === 'claude_elevenlabs' ? (aiOn() ? 'claude' : 'rules') : s.provider === 'openai_realtime' ? 'openai' : null,
  };
}

export function saveVoiceSettings(db, b = {}) {
  const s = voiceSettings(db);
  if (b.provider !== undefined) { if (!PROVIDERS[b.provider]) bad('Unknown voice provider'); s.provider = b.provider; }
  if (b.number !== undefined) s.number = String(b.number).replace(/[^\d+ ]/g, '').slice(0, 20);
  if (b.voiceName !== undefined) s.voiceName = String(b.voiceName).slice(0, 60);
  if (b.enabled !== undefined) s.enabled = !!b.enabled;
  return s;
}

/** The bridge proves who it is with a shared secret. Without one configured, the voice endpoints stay closed. */
export function checkBridge(req) {
  const secret = process.env.VOICE_WEBHOOK_SECRET || '';
  if (!secret) throw new HttpError(503, 'Voice calls are not set up on this server. Set VOICE_WEBHOOK_SECRET first.');
  const given = req.get('x-voice-secret') || '';
  if (given.length !== secret.length || !timingSafe(given, secret)) throw new HttpError(401, 'The voice bridge secret is missing or wrong');
}
function timingSafe(a, b) { let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i); return diff === 0; }

// ── what a speech-to-speech model is told, and what it may do ───────────────

/** Spoken-style instructions built from the clinic's own settings. The same limits as chat: no medical advice, real slots only. */
export function voiceInstructions(db, call) {
  const p = db.settings.practice || {}; const open = isOpen(db); const opening = nextOpening(db);
  const services = db.settings.visitTypes.map((v) => `${v.name} (${v.durationMin} minutes${v.fee ? `, ${db.settings.locale?.currencySymbol || '₹'}${v.fee}` : ''})`).join('; ');
  const branches = (db.settings.locations || []).map((l) => `${l.name}: ${l.address}`).join(' | ');
  return [
    `You are the phone receptionist for ${p.name}, a dental clinic in India. You are speaking on a phone call, so keep every reply to one or two short sentences and ask one question at a time.`,
    `Reply in the language the caller speaks. Hindi, Kannada, Tamil, Telugu and other Indian languages mixed with English are normal. If you are unsure, ask which language they prefer.`,
    `The clinic is ${open ? 'open now' : `closed now${opening ? ` and opens ${fmtOpening(opening.at)}` : ''}`}. Branches: ${branches || 'one branch'}. Phone: ${p.phone || 'not listed'}.`,
    `Services you may book: ${services}.`,
    `To offer a time you must call find_slots and read back only the times it returns. Never invent a time, a dentist or a fee. To book, call book_appointment with the exact slot the caller chose and their full name, then confirm the day, time and branch aloud.`,
    `You are not a dentist. Do not diagnose, suggest medicines or doses, or say whether something is serious. For pain, swelling, bleeding, injury, medicines or any clinical question, say a dentist will call them back and call take_message with urgency "urgent". If it sounds like an emergency, also give the clinic phone number.`,
    `For anything you cannot do (billing disputes, complaints, insurance approvals), call take_message so the front desk calls back. Do not promise an outcome.`,
    `Never ask for card numbers, UPI PINs, passwords, OTPs or Aadhaar numbers. If the caller offers one, ask them not to share it.`,
    `When the caller is finished, say goodbye briefly and call end_call.`,
    call?.contactName && !/^\+|Unknown/.test(call.contactName) ? `The caller's number matches a patient on file: ${call.contactName}. Confirm their name before using it.` : `The caller's number is not on file. Ask for their full name before booking.`,
  ].join('\n');
}

export const VOICE_TOOLS = [
  { name: 'clinic_info', description: 'Opening hours, addresses and phone number of the clinic and its branches, and whether it is open right now.', parameters: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'find_slots', description: 'Real free appointment times. Always call this before offering a time.', parameters: { type: 'object', additionalProperties: false, required: ['service'], properties: {
    service: { type: 'string', description: 'What the caller wants, in their words or as a service name, for example "cleaning" or "tooth pain".' },
    branch: { type: 'string', description: 'Branch name if the caller named one.' },
    from_date: { type: 'string', description: 'Earliest day to look from, as YYYY-MM-DD. Leave out for today.' },
    time_of_day: { type: 'string', enum: ['any', 'morning', 'afternoon', 'evening'] },
  } } },
  { name: 'book_appointment', description: 'Books one of the slots returned by find_slots for the caller.', parameters: { type: 'object', additionalProperties: false, required: ['slot_id', 'full_name'], properties: {
    slot_id: { type: 'string', description: 'The id of the slot exactly as find_slots returned it.' },
    full_name: { type: 'string', description: "The caller's full name as they said it." },
  } } },
  { name: 'take_message', description: 'Leaves a message for the front desk or dentist to call the caller back. Use for clinical questions, complaints, billing and anything you cannot do.', parameters: { type: 'object', additionalProperties: false, required: ['summary'], properties: {
    summary: { type: 'string', description: 'What the caller needs, in one or two plain sentences.' },
    urgency: { type: 'string', enum: ['normal', 'urgent'] },
  } } },
  { name: 'end_call', description: 'Ends the call after saying goodbye.', parameters: { type: 'object', additionalProperties: false, properties: { outcome: { type: 'string', description: 'One short phrase: what the call achieved.' } } } },
];

const norm = (s) => String(s || '').toLowerCase();
function matchService(db, text) {
  const t = norm(text);
  return db.settings.visitTypes.find((v) => norm(v.name) === t) || db.settings.visitTypes.find((v) => t.includes(norm(v.name)) || (v.keywords || []).some((k) => t.includes(norm(k)))) || db.settings.visitTypes.find((v) => v.id === 'vt_newpatient') || db.settings.visitTypes[0];
}
const matchBranch = (db, text) => (text ? (db.settings.locations || []).find((l) => norm(text).includes(norm(l.name)) || norm(l.name).includes(norm(text))) || null : null);

/** Runs one tool for a call and returns a small result the model can read aloud. Every booking goes through the normal scheduling rules. */
export function runVoiceTool(db, call, name, args = {}) {
  const say = (o) => ({ ok: true, ...o });
  if (name === 'clinic_info') {
    const opening = nextOpening(db);
    return say({ name: db.settings.practice.name, phone: db.settings.practice.phone || '', open_now: isOpen(db), opens: opening ? fmtOpening(opening.at) : null, branches: (db.settings.locations || []).map((l) => ({ name: l.name, address: l.address, phone: l.phone || '', hours: l.hours })) });
  }
  if (name === 'find_slots') {
    const vt = matchService(db, args.service); const loc = matchBranch(db, args.branch);
    const from = /^\d{4}-\d{2}-\d{2}$/.test(String(args.from_date || '')) && args.from_date >= dayKey(nowIso()) ? args.from_date : dayKey(nowIso());
    const slots = nextSlots(db, { visitTypeId: vt.id, locationId: loc?.id || null, fromDate: from, preferredTime: ['morning', 'afternoon', 'evening'].includes(args.time_of_day) ? args.time_of_day : 'any', limit: 4 });
    call.voiceSlots = slots.map((s, i) => ({ slot_id: `s${i + 1}`, start: s.start, providerId: s.providerId, locationId: s.locationId, visitTypeId: vt.id }));
    if (!slots.length) return say({ service: vt.name, slots: [], note: 'No free times in the next three weeks. Offer to take a message so the front desk can call back.' });
    return say({ service: vt.name, fee: vt.fee || 0, slots: call.voiceSlots.map((s) => ({ slot_id: s.slot_id, when: fmtWhen(s.start), dentist: db.settings.providers.find((p) => p.id === s.providerId)?.name || '', branch: location(db, s.locationId)?.name || '' })) });
  }
  if (name === 'book_appointment') {
    const slot = (call.voiceSlots || []).find((s) => s.slot_id === args.slot_id);
    if (!slot) return { ok: false, error: 'That slot is not one of the times offered. Call find_slots again and offer the times it returns.' };
    const full = String(args.full_name || '').trim().replace(/\s+/g, ' ');
    if (full.length < 2) return { ok: false, error: "Ask for the caller's full name first." };
    const cc = db.settings.locale?.phoneCountryCode || '91';
    let patient = call.patientId ? db.patients.find((p) => p.id === call.patientId) : null;
    if (!patient && call.phone) patient = db.patients.find((p) => digits(p.phone, cc) === call.phone) || null;
    if (!patient) {
      const [firstName, ...rest] = full.split(' ');
      patient = { id: id('pat'), firstName, lastName: rest.join(' ') || '', phone: call.phone || '', language: call.language || 'en', preferredLanguage: call.language || 'en', locationId: slot.locationId, createdAt: nowIso(), source: 'phone', insurance: {}, marketingOptIn: false };
      db.patients.push(patient);
      log(db, 'patient', `The phone assistant registered ${fullName(patient)} from a call`, { patientId: patient.id });
    }
    try {
      const a = bookAppointment(db, { patientId: patient.id, visitTypeId: slot.visitTypeId, providerId: slot.providerId, locationId: slot.locationId, start: slot.start, source: 'ai', by: 'Phone assistant', notes: 'Booked on a phone call by the voice assistant' });
      call.patientId = patient.id; call.appointmentId = a.id; call.outcome = 'booked'; call.voiceSlots = [];
      return say({ booked: true, when: fmtWhen(a.start), dentist: db.settings.providers.find((p) => p.id === a.providerId)?.name || '', branch: location(db, a.locationId)?.name || '', fee: a.fee || 0, patient: fullName(patient) });
    } catch (e) { return { ok: false, error: `${e.message}. Call find_slots again and offer another time.` }; }
  }
  if (name === 'take_message') {
    const summary = String(args.summary || '').trim().slice(0, 400);
    if (summary.length < 3) return { ok: false, error: 'Say what the caller needs.' };
    const urgent = args.urgency === 'urgent';
    addCallback(db, { source: 'after_hours', patientId: call.patientId || null, contactName: call.contactName || '', contactPhone: call.phone || '', reason: `${urgent ? 'URGENT. ' : ''}Phone call: ${summary}` });
    call.notes = { ...(call.notes || {}), summary, urgency: urgent ? 'urgent' : 'normal' }; call.outcome = call.outcome || 'message';
    return say({ recorded: true, tell_caller: urgent ? `A dentist will call back as soon as possible. For an emergency call ${db.settings.practice.phone || 'the clinic'}.` : 'The front desk will call back.' });
  }
  if (name === 'end_call') return say({ end: true, outcome: String(args.outcome || '').slice(0, 120) });
  return { ok: false, error: `Unknown tool ${name}` };
}

/** Everything a bridge needs to open a session for one call: how to speak, what it may do, and which shape to use. */
export function voiceSession(db, call) {
  const s = voiceSettings(db); const p = PROVIDERS[s.provider] || PROVIDERS.none;
  return { provider: s.provider, mode: p.mode || null, language: call.language, voiceName: s.voiceName || null, instructions: voiceInstructions(db, call), tools: VOICE_TOOLS };
}
export { addDays };
