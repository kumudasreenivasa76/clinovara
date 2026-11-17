/**
 * AI front desk.
 *
 * Two engines share the same contract:
 *  - ruleEngine: deterministic keyword/intent matching, always available.
 *  - claudeEngine: uses the Anthropic SDK when ANTHROPIC_API_KEY (or an `ant auth login` profile) is
 *    available and CLINOVARA_AI is not "rules". Falls back to the rule engine on any error.
 *
 * Both return: { intent, reply, escalate, escalationReason, visitTypeId, preferredTime, slots, actions }
 * Hard rule for both: clinical, medication, billing-dispute, records, and complaint questions are
 * never answered — they are acknowledged and handed to staff.
 */
import { nextSlots, bookAppointment, visitType, fmtWhen, ACTIVE, location, defaultLocationId } from './scheduling.js';
import { fullName, nowIso, dayKey, addDays } from '../lib.js';
import { isOpen, nextOpening, fmtOpening, addCallback } from './hours.js';

const EMERGENCY = ['can\'t breathe', 'cannot breathe', 'trouble breathing', 'difficulty breathing', 'unconscious', 'uncontrolled bleeding', 'won\'t stop bleeding', 'jaw broken', 'broken jaw', 'swelling in my eye', 'swelling to my eye', 'swelling in my neck'];
const URGENT = ['dard', 'sujan', 'toot gaya', 'khoon', 'pain', 'hurts', 'hurting', 'toothache', 'emergency', 'urgent', 'swelling', 'swollen', 'broken', 'chipped', 'cracked', 'knocked out', 'bleeding', 'abscess', 'lost a crown', 'lost my crown', 'lost a filling', 'lost my filling', 'asap'];
const CLINICAL = ['dawai', 'dawa', 'kaunsi', 'should i take', 'can i take', 'dose', 'dosage', 'antibiotic', 'amoxicillin', 'ibuprofen', 'prescription', 'prescribe', 'diagnos', 'x-ray results', 'xray results', 'my results', 'is it normal', 'is this normal', 'infection', 'numb', 'what is this', 'what does this mean', 'do i need a', 'medication', 'pregnan', 'blood thinner', 'allergic reaction', 'nerve', 'root canal or'];
const SENSITIVE = ['complaint', 'complain', 'refund', 'dispute', 'overcharged', 'lawyer', 'attorney', 'records', 'release form', 'hipaa', 'mistake', 'wrong tooth', 'malpractice', 'manager', 'speak to a human', 'talk to a person', 'real person', 'talk to someone', 'staff'];
const BOOK = ['chahiye', 'milna hai', 'dikhana', 'lena hai', 'time chahiye', 'book', 'schedule', 'appointment', 'come in', 'available', 'availability', 'opening', 'openings', 'get in', 'see the dentist', 'see someone', 'make an appt', 'set up'];
const RESCHEDULE = ['badalna', 'time change', 'reschedule', 'move my', 'change my appointment', 'different time', 'push back', 'later date', 'another day', 'switch my'];
const CANCEL = ['cancel'];
const CONFIRM_YES = ['haan', 'ha', 'ji', 'ji haan', 'theek hai', 'thik hai', 'yes', 'yes please', 'sure', 'ok', 'okay', 'sounds good', 'that works', 'perfect', 'book it', 'c', 'confirm', 'confirmed', 'y', 'great'];
const CONFIRM_NO = ['nahi', 'nahin', 'no', 'nope', 'neither', 'none of those', 'doesn\'t work', 'does not work', 'other times', 'something else', 'different'];
const GREETING = ['namaste', 'namaskar', 'hi', 'hello', 'hey', 'good morning', 'good afternoon'];

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
const has = (text, list) => list.some((k) => text.includes(k));
const isExact = (text, list) => list.includes(text.replace(/[.!]/g, '').trim());

function detectVisitType(db, text) {
  let best = null; let bestScore = 0;
  for (const vt of db.settings.visitTypes) {
    const score = vt.keywords.filter((k) => text.includes(k)).length;
    if (score > bestScore) { best = vt; bestScore = score; }
  }
  return best;
}
function matchFaq(db, text) {
  let best = null; let bestScore = 0;
  for (const f of db.settings.faqs) {
    const score = (f.keywords || []).filter((k) => text.includes(k)).length;
    if (score > bestScore) { best = f; bestScore = score; }
  }
  return bestScore ? best : null;
}
function preferredTime(text) {
  if (/morning|before noon|early|subah/.test(text)) return 'morning';
  if (/evening|after 5|after office|shaam|sham/.test(text)) return 'evening';
  if (/afternoon|after lunch|after 12|dopahar/.test(text)) return 'afternoon';
  return 'any';
}
function preferredLocation(db, text) {
  for (const l of db.settings.locations || []) if (text.includes(l.name.toLowerCase())) return l.id;
  return null;
}
function preferredDate(text) {
  const today = dayKey(nowIso());
  if (/\btoday\b|\baaj\b|\babhi\b/.test(text)) return today;
  if (/\btomorrow\b|\bkal\b/.test(text)) return dayKey(addDays(today + 'T12:00:00', 1));
  if (/next week/.test(text)) {
    const d = new Date(today + 'T12:00:00'); const add = ((8 - d.getDay()) % 7) || 7; return dayKey(addDays(today + 'T12:00:00', add));
  }
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < 7; i++) if (text.includes(days[i])) {
    const d = new Date(today + 'T12:00:00'); let add = (i - d.getDay() + 7) % 7; if (add === 0) add = 7; return dayKey(addDays(today + 'T12:00:00', add));
  }
  return null;
}
function pickSlot(text, slots) {
  if (!slots?.length) return null;
  // "the earliest", "any time", "whichever is fine": take the first one offered.
  if (/(earliest|soonest|asap|any ?time|any of (them|these)|whichever|you choose|anything (works|is fine))/.test(text) && !/\d{1,2}(:\d{2})?\s*(am|pm)/.test(text)) return slots[0];
  const m = text.match(/\b(first|second|third|fourth|1st|2nd|3rd|4th|option ?[1-4]|[1-4])\b/);
  if (m) {
    const map = { first: 0, '1st': 0, 1: 0, second: 1, '2nd': 1, 2: 1, third: 2, '3rd': 2, 3: 2, fourth: 3, '4th': 3, 4: 3 };
    const key = m[1].replace('option', '').trim();
    if (map[key] !== undefined && slots[map[key]]) return slots[map[key]];
  }
  const t = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  if (t) {
    let h = Number(t[1]); const mi = Number(t[2] || 0); const ap = t[3];
    if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0;
    if (!ap && h < 7) h += 12;
    const found = slots.find((s) => { const d = new Date(s.start); return d.getHours() === h && d.getMinutes() === mi; });
    if (found) return found;
  }
  if (isExact(text, CONFIRM_YES) && slots.length === 1) return slots[0];
  if (isExact(text, CONFIRM_YES)) return slots[0];
  return null;
}

function slotList(slots) {
  return slots.map((s, i) => `${i + 1}. ${fmtWhen(s.start)} with ${s.providerName}${s.locationName ? ` (${s.locationName})` : ''}`).join('\n');
}

export function upcomingFor(db, patientId) {
  if (!patientId) return null;
  return db.appointments.filter((a) => a.patientId === patientId && ACTIVE.has(a.status) && new Date(a.start) > new Date()).sort((a, b) => a.start.localeCompare(b.start))[0] || null;
}

/** Deterministic engine. `conv.ai` holds the small dialog state (pending slots, visit type, step). */
export function ruleEngine(db, conv, text) {
  const t = norm(text);
  const state = conv.ai || {};
  const patient = conv.patientId ? db.patients.find((p) => p.id === conv.patientId) : null;
  const name = patient?.firstName || conv.contactName?.split(' ')[0] || 'there';
  const practice = db.settings.practice;
  const res = { intent: 'other', reply: '', escalate: false, escalationReason: null, visitTypeId: state.visitTypeId || null, preferredTime: state.preferredTime || 'any', slots: null, actions: [], state: { ...state } };

  // 0. A shared family phone: ask who the request is for.
  if (!conv.patientId && conv.candidates?.length > 1) {
    const cands = conv.candidates.map((cid) => db.patients.find((p) => p.id === cid)).filter(Boolean);
    const hit = cands.find((p) => t.includes(p.firstName.toLowerCase()));
    if (hit) {
      conv.patientId = hit.id; conv.contactName = fullName(hit); conv.candidates = null;
      const pending = state.pendingText; conv.ai = {};
      if (pending) { const out = ruleEngine(db, conv, pending); return { ...out, reply: `Thanks, ${hit.firstName}. ${out.reply}` }; }
      return { ...res, intent: 'identify', state: {}, reply: `Thanks, ${hit.firstName}. How can I help you today?` };
    }
    if (!has(t, EMERGENCY)) return { ...res, intent: 'identify', state: { ...state, pendingText: state.pendingText || text }, reply: `This number is shared by ${cands.map((p) => p.firstName).join(' and ')}. Who is this for? Reply with the name.` };
  }

  // 1. Emergencies and clinical/sensitive questions always go to staff.
  if (has(t, EMERGENCY)) {
    return { ...res, intent: 'emergency', escalate: true, escalationReason: 'Possible medical emergency', reply: `If you are having trouble breathing, uncontrolled bleeding, or swelling spreading to your eye or neck, please call 911 or go to the nearest emergency room now. I am also alerting our clinical team immediately.` };
  }
  if (has(t, CLINICAL)) {
    const upcoming = upcomingFor(db, conv.patientId);
    const extra = upcoming ? ` Your ${visitType(db, upcoming.visitTypeId).name.toLowerCase()} is booked for ${fmtWhen(upcoming.start)}.` : ' If you are in pain, reply "urgent" and I can find you the soonest visit.';
    return { ...res, intent: 'clinical', escalate: true, escalationReason: 'Clinical or medication question', reply: `Thanks for letting us know, ${name}. I am not able to answer clinical or medication questions, so I am passing this to our clinical team and someone will get back to you here shortly.${extra}` };
  }
  if (has(t, SENSITIVE)) {
    return { ...res, intent: 'sensitive', escalate: true, escalationReason: 'Sensitive request (billing, records, complaint, or asked for a person)', reply: `Understood, ${name}. I am handing this to a member of our team so they can help you directly. You will hear back here, usually within the hour during office hours.` };
  }

  // 2. Continue a booking flow in progress.
  if (state.step === 'choose_slot' && state.slots?.length) {
    if (isExact(t, CONFIRM_NO) || has(t, ['other time', 'other times', 'later', 'earlier', 'different'])) {
      const pt = preferredTime(t) !== 'any' ? preferredTime(t) : state.preferredTime;
      const fromDate = preferredDate(t) || (state.slots.length ? dayKey(addDays(state.slots[state.slots.length - 1].start, 1)) : null);
      const slots = nextSlots(db, { visitTypeId: state.visitTypeId, preferredTime: pt, fromDate, locationId: preferredLocation(db, t) || state.locationId || null, limit: 4 });
      if (!slots.length) return { ...res, intent: 'book', escalate: true, escalationReason: 'No availability found for request', reply: `I could not find more openings that fit. I am asking our team to look at the schedule and reach out to you.` };
      return { ...res, intent: 'book', slots, state: { ...state, slots, preferredTime: pt }, reply: `No problem. Here are some other options:\n${slotList(slots)}\nReply with the number that works.` };
    }
    // "the earliest", "any time", "whichever is fine": take the first one offered.
    const wantsFirst = /(earliest|soonest|asap|any ?time|any of (them|these)|whichever|you choose|anything (works|is fine))/.test(t) && !/\d{1,2}(:\d{2})?\s*(am|pm)/.test(t);
    const slot = wantsFirst ? state.slots[0] : pickSlot(t, state.slots);
    if (slot) {
      if (!conv.patientId) {
        return { ...res, intent: 'book', state: { ...state, step: 'collect_identity', chosen: slot }, reply: `Great, ${fmtWhen(slot.start)} it is. To finish booking, please reply with your full name and date of birth (for example: Jane Doe, 1990-05-14).` };
      }
      return finalizeBooking(db, conv, res, slot, state);
    }
    return { ...res, intent: 'book', slots: state.slots, reply: `Which of these works best? Reply with the number.\n${slotList(state.slots)}` };
  }
  if (state.step === 'collect_identity') {
    const m = text.match(/([A-Za-z][A-Za-z'\-]+(?:\s+[A-Za-z][A-Za-z'\-]+)+)\s*,?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})/);
    if (m) {
      const [firstName, ...rest] = m[1].trim().split(/\s+/);
      const dob = m[2].includes('/') ? toIsoDate(m[2]) : m[2];
      let p = db.patients.find((x) => x.firstName.toLowerCase() === firstName.toLowerCase() && x.lastName.toLowerCase() === rest.join(' ').toLowerCase() && x.dob === dob);
      if (!p) {
        p = { id: `pat_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, firstName, lastName: rest.join(' '), dob, phone: conv.contactPhone || '', email: conv.contactEmail || '', gender: '', preferredLanguage: db.settings.locale?.defaultLanguage || 'en', abhaNumber: '', abhaAddress: '', locationId: state.locationId || state.chosen?.locationId || defaultLocationId(db), city: '', address: '', tags: [], insurance: { type: 'self', carrier: '', memberId: '', groupNumber: '', tpa: '', cardScannedAt: null, verified: false }, lastVisit: null, nextRecallDue: null, notes: 'Created by AI front desk', createdAt: nowIso() };
        db.patients.push(p);
      }
      conv.patientId = p.id; conv.contactName = fullName(p);
      return finalizeBooking(db, conv, res, state.chosen, state);
    }
    return { ...res, intent: 'book', state, reply: `I did not catch that. Please reply with your full name and date of birth, like: Jane Doe, 1990-05-14.` };
  }
  if (state.step === 'confirm_cancel' && state.appointmentId) {
    if (isExact(t, CONFIRM_YES)) {
      return { ...res, intent: 'cancel', actions: [{ type: 'cancel', appointmentId: state.appointmentId }], state: {}, reply: `Done, your appointment is cancelled. Reply BOOK any time to find a new time.` };
    }
    return { ...res, intent: 'cancel', state: {}, reply: `Okay, I have kept your appointment as it is.` };
  }
  if (state.step === 'ask_reason') {
    const vt = detectVisitType(db, t);
    if (vt) return startBooking(db, conv, res, vt, t, state);
    // Second unknown reason → capture and hand to staff
    return { ...res, intent: 'book', escalate: true, escalationReason: `Visit reason unclear: "${text.slice(0, 80)}"`, state: {}, reply: `Thanks, I have noted "${text.trim()}" as the reason for your visit and our team will follow up here to get you booked.` };
  }

  // 3. Fresh intents.
  const faq = matchFaq(db, t);
  const wantsBook = has(t, BOOK) || (detectVisitType(db, t) && !faq);
  if (has(t, RESCHEDULE)) {
    const upcoming = upcomingFor(db, conv.patientId);
    if (!upcoming) return { ...res, intent: 'reschedule', escalate: !conv.patientId, escalationReason: conv.patientId ? null : 'Reschedule request from unidentified contact', reply: conv.patientId ? `I do not see an upcoming appointment on file. Would you like to book a new one? Tell me the reason for your visit.` : `I can help with that. Please reply with your full name and date of birth so I can find your appointment, or a team member will follow up here.` };
    const slots = nextSlots(db, { visitTypeId: upcoming.visitTypeId, preferredTime: preferredTime(t), fromDate: preferredDate(t), limit: 4 });
    return { ...res, intent: 'reschedule', slots, state: { step: 'choose_slot', slots, visitTypeId: upcoming.visitTypeId, rescheduleId: upcoming.id, preferredTime: preferredTime(t) }, reply: `Sure. Your current ${visitType(db, upcoming.visitTypeId).name.toLowerCase()} is ${fmtWhen(upcoming.start)}. Here are some alternatives:\n${slotList(slots)}\nReply with the number you prefer.` };
  }
  if (has(t, CANCEL) && !t.includes('policy')) {
    const upcoming = upcomingFor(db, conv.patientId);
    if (!upcoming) return { ...res, intent: 'cancel', escalate: !conv.patientId, escalationReason: conv.patientId ? null : 'Cancellation from unidentified contact', reply: conv.patientId ? `I do not see an upcoming appointment to cancel. Is there anything else I can help with?` : `I can help cancel. Please reply with your full name and date of birth, or our team will follow up here.` };
    const hours = (new Date(upcoming.start) - new Date()) / 3600000;
    const late = hours < db.settings.rules.cancelNoticeHours ? ` Just so you know, this is inside our ${db.settings.rules.cancelNoticeHours}-hour notice window.` : '';
    return { ...res, intent: 'cancel', state: { step: 'confirm_cancel', appointmentId: upcoming.id }, reply: `Your ${visitType(db, upcoming.visitTypeId).name.toLowerCase()} is ${fmtWhen(upcoming.start)}.${late} Would you rather reschedule instead? Reply YES to cancel, or RESCHEDULE to pick a new time.` };
  }
  if (isExact(t, ['c', 'confirm', 'confirmed', 'yes']) && upcomingFor(db, conv.patientId) && !state.step) {
    const up = upcomingFor(db, conv.patientId);
    return { ...res, intent: 'confirm', actions: [{ type: 'confirm', appointmentId: up.id }], reply: `Thank you, ${name}. You are confirmed for ${fmtWhen(up.start)}. See you then!` };
  }
  if (isExact(t, ['r']) && upcomingFor(db, conv.patientId)) return ruleEngine(db, conv, 'reschedule');
  if (isExact(t, ['book', 'yes']) && has(norm(conv.reason || ''), ['recall', 'cleaning'])) return startBooking(db, conv, res, visitType(db, 'vt_cleaning'), t, state);
  if (isExact(t, ['yes']) && state.offerWaitlistId) return { ...res, intent: 'book', actions: [{ type: 'accept_waitlist', waitlistId: state.offerWaitlistId }], state: {}, reply: `You are all set with the earlier time. I have moved your appointment and sent a confirmation.` };
  if (has(t, URGENT)) {
    const vt = visitType(db, 'vt_urgent');
    const out = startBooking(db, conv, res, vt, t, state, { fromDate: dayKey(nowIso()) });
    out.reply = `I am sorry you are dealing with that, ${name}. Let's get you seen quickly. ` + out.reply;
    out.intent = 'urgent';
    return out;
  }
  if (wantsBook) {
    const vt = detectVisitType(db, t);
    if (vt) return startBooking(db, conv, res, vt, t, state);
    return { ...res, intent: 'book', state: { step: 'ask_reason', preferredTime: preferredTime(t), fromDate: preferredDate(t) }, reply: `Happy to help you book. What is the reason for your visit? For example: a cleaning and check-up, a new patient exam, a consultation, a procedure, or something urgent.` };
  }
  if (faq) {
    const follow = faq.id === 'faq_insurance' || faq.id === 'faq_newpatient' ? ' Would you like to book a visit?' : '';
    return { ...res, intent: 'faq', faqId: faq.id, reply: faq.answer + follow };
  }
  if (isExact(t, GREETING) || GREETING.some((g) => t.startsWith(g + ' ')) && t.length < 25) {
    return { ...res, intent: 'greeting', reply: `Hi ${name}, this is ${practice.name}. I can help you book, reschedule, or cancel an appointment, answer questions about hours, location, insurance, and payment, or connect you with our team. What can I do for you?` };
  }
  if (isExact(t, ['thanks', 'thank you', 'ty', 'thx', 'ok thank you', 'ok thanks', 'great thanks'])) {
    return { ...res, intent: 'thanks', reply: `You are welcome, ${name}. Reply here any time.` };
  }
  // Unknown → ask once, then escalate.
  if (state.unknownCount >= 1) {
    return { ...res, intent: 'other', escalate: true, escalationReason: `Could not understand: "${text.slice(0, 80)}"`, state: {}, reply: `I want to make sure you get the right answer, so I am passing this to our team. Someone will reply here soon.` };
  }
  return { ...res, intent: 'other', state: { ...state, unknownCount: 1 }, reply: `I can help with appointments (book, reschedule, cancel), hours, location, insurance, and payment questions. Could you tell me a bit more about what you need?` };
}

function article(name) { return /^[aeiou]/i.test(name) ? 'An' : 'A'; }
function toIsoDate(s) { const [m, d, y] = s.split('/').map(Number); const yy = y < 100 ? 2000 + y : y; return `${yy}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }

function startBooking(db, conv, res, vt, t, state, opts = {}) {
  const pt = preferredTime(t) !== 'any' ? preferredTime(t) : (state.preferredTime || 'any');
  const fromDate = opts.fromDate || preferredDate(t) || state.fromDate || null;
  const patient = conv.patientId ? db.patients.find((p) => p.id === conv.patientId) : null;
  const locationId = preferredLocation(db, t) || state.locationId || patient?.locationId || null;
  const slots = nextSlots(db, { visitTypeId: vt.id, preferredTime: pt, fromDate, locationId, limit: 4 });
  if (!slots.length) return { ...res, intent: 'book', visitTypeId: vt.id, escalate: true, escalationReason: `No availability for ${vt.name}`, state: {}, reply: `I could not find an opening for a ${vt.name.toLowerCase()} that fits. I am asking our team to look at the schedule and get back to you here.` };
  const feeNote = vt.fee ? ` The fee is ${db.settings.locale?.currencySymbol || '₹'}${vt.fee.toLocaleString('en-IN')}, payable by UPI, cash or card.` : '';
  return { ...res, intent: 'book', visitTypeId: vt.id, preferredTime: pt, slots, state: { step: 'choose_slot', slots, visitTypeId: vt.id, preferredTime: pt, locationId }, reply: `${article(vt.name)} ${vt.name.toLowerCase()} takes about ${vt.durationMin} minutes.${feeNote} Here is what I have:\n${slotList(slots)}\nReply with the number that works, or tell me another day, time or branch.` };
}

function finalizeBooking(db, conv, res, slot, state) {
  const patient = db.patients.find((p) => p.id === conv.patientId);
  const vt = visitType(db, state.visitTypeId);
  if (state.rescheduleId) {
    return { ...res, intent: 'booked', visitTypeId: vt.id, actions: [{ type: 'reschedule', appointmentId: state.rescheduleId, start: slot.start, providerId: slot.providerId, locationId: slot.locationId }], state: {}, reply: `Done. Your ${vt.name.toLowerCase()} is now ${fmtWhen(slot.start)} with ${slot.providerName}${slot.locationName ? ` at ${slot.locationName}` : ''}. I have sent a confirmation and updated your reminders.` };
  }
  return { ...res, intent: 'booked', visitTypeId: vt.id, actions: [{ type: 'book', patientId: patient.id, visitTypeId: vt.id, providerId: slot.providerId, locationId: slot.locationId, start: slot.start }], state: {}, reply: `You are booked, ${patient.firstName}: ${vt.name} on ${fmtWhen(slot.start)} with ${slot.providerName}${slot.locationName ? ` at our ${slot.locationName} branch` : ''}. I will send a confirmation and your pre-visit form, which takes about 5 minutes. Anything else I can help with?` };
}

/* ---------- Claude engine (optional) ---------- */

let anthropicClient = null;
export function aiMode() {
  if (process.env.CLINOVARA_AI === 'rules') return 'rules';
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.CLINOVARA_AI === 'claude') return 'claude';
  return 'rules';
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    intent: { type: 'string', enum: ['greeting', 'faq', 'book', 'reschedule', 'cancel', 'confirm', 'urgent', 'clinical', 'sensitive', 'emergency', 'thanks', 'other'] },
    reply: { type: 'string', description: 'The message to send to the patient. Plain text, friendly, under 80 words.' },
    escalate: { type: 'boolean', description: 'true when a staff member must take over' },
    escalationReason: { type: ['string', 'null'] },
    visitTypeId: { type: ['string', 'null'], description: 'One of the practice visit type ids when the patient wants to book' },
    preferredTime: { type: 'string', enum: ['any', 'morning', 'afternoon', 'evening'] },
    preferredDate: { type: ['string', 'null'], description: 'YYYY-MM-DD when the patient named a day' },
    chosenSlotIndex: { type: ['integer', 'null'], description: '0-based index into the offered slots when the patient picked one' },
    visitReason: { type: ['string', 'null'], description: 'Short reason for the visit in the patient\'s words' },
  },
  required: ['intent', 'reply', 'escalate', 'escalationReason', 'visitTypeId', 'preferredTime', 'preferredDate', 'chosenSlotIndex', 'visitReason'],
  additionalProperties: false,
};

function systemPrompt(db) {
  const s = db.settings;
  const hours = Object.entries(s.practice.hours).map(([d, h]) => `${d}: ${h ? h.join('–') : 'closed'}`).join(', ');
  return `You are the AI front desk for ${s.practice.name}, a dental practice. You talk to patients over text, web chat, and phone transcripts.

What you may do: answer the approved FAQs below, collect the reason for a visit, guide patients to the right visit type, offer appointment slots that the system provides, and confirm, reschedule, or cancel within the practice rules.

What you must never do: give clinical advice, discuss diagnoses, medications, doses, x-ray results, or whether something is normal; discuss billing disputes, refunds, complaints, or records requests; or invent availability, prices, or policies not listed here. For any of those, acknowledge warmly, say a team member will follow up here, and set escalate=true with intent clinical, sensitive, or emergency. If someone describes trouble breathing, uncontrolled bleeding, or swelling spreading to the eye or neck, tell them to call 911 or go to the ER and set intent=emergency.

Practice: ${s.practice.name}, ${s.practice.phone}. Branches: ${(s.locations || []).map((l) => `${l.name} — ${l.address}`).join('; ') || s.practice.address}. Hours: ${hours}. Currency: ${s.locale?.currencySymbol || '₹'}. Patients may write in English, Hindi, Kannada or Hinglish; reply in the language they used.
Rules: ${s.rules.cancelNoticeHours}-hour cancellation notice. Reminders ${s.rules.reminderHoursBefore.join('h and ')}h before.
Visit types (id — name, minutes, fee): ${s.visitTypes.map((v) => `${v.id} — ${v.name}, ${v.durationMin} min${v.fee ? `, ${s.locale?.currencySymbol || '₹'}${v.fee}` : ''}`).join('; ')}.
Approved FAQs:
${s.faqs.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join('\n')}

Only offer times from the "Offered slots" list in the latest context block; refer to them by their number. When the patient picks one, set chosenSlotIndex. When the patient wants to book but you do not yet know the visit type, ask for the reason for the visit and map it to a visit type id. Keep replies short, warm, and plain, with no markdown.`;
}

export async function claudeEngine(db, conv, text) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  anthropicClient ||= new Anthropic();
  const state = conv.ai || {};
  const patient = conv.patientId ? db.patients.find((p) => p.id === conv.patientId) : null;
  const upcoming = upcomingFor(db, conv.patientId);
  const history = conv.messages.slice(-12).map((m) => ({ role: m.from === 'patient' ? 'user' : 'assistant', content: m.text }));
  // Merge consecutive same-role turns and make sure history starts with user
  const merged = [];
  for (const h of history) { const last = merged[merged.length - 1]; if (last && last.role === h.role) last.content += '\n' + h.content; else merged.push({ ...h }); }
  while (merged.length && merged[0].role !== 'user') merged.shift();
  if (merged.length && merged[merged.length - 1].role === 'user') merged[merged.length - 1].content += '\n' + text; else merged.push({ role: 'user', content: text });

  const context = [
    `Channel: ${conv.channel}. Contact: ${conv.contactName || 'unknown'}${patient ? ` (patient on file, id ${patient.id}, dob ${patient.dob})` : ' (not matched to a patient yet)'}.`,
    upcoming ? `Upcoming appointment: ${visitType(db, upcoming.visitTypeId).name} on ${fmtWhen(upcoming.start)} (id ${upcoming.id}).` : 'No upcoming appointment on file.',
    state.slots?.length ? `Offered slots:\n${slotList(state.slots)}` : 'Offered slots: none yet.',
    `Today is ${fmtWhen(nowIso())}.`,
  ].join('\n');
  merged[merged.length - 1].content = `<context>\n${context}\n</context>\n\n${merged[merged.length - 1].content}`;

  const response = await anthropicClient.beta.messages.create({
    model: 'claude-opus-5',
    max_tokens: 1024,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [{ type: 'text', text: systemPrompt(db), cache_control: { type: 'ephemeral' } }],
    messages: merged,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: RESPONSE_SCHEMA } },
  });
  if (response.stop_reason === 'refusal') throw new Error('Model declined the request');
  const textBlock = response.content.find((b) => b.type === 'text');
  const parsed = JSON.parse(textBlock.text);

  // Post-process into the shared contract, reusing the deterministic booking machinery.
  const res = { intent: parsed.intent, reply: parsed.reply, escalate: parsed.escalate, escalationReason: parsed.escalationReason, visitTypeId: parsed.visitTypeId || state.visitTypeId || null, preferredTime: parsed.preferredTime, slots: null, actions: [], state: { ...state }, engine: 'claude' };
  if (['clinical', 'sensitive', 'emergency'].includes(parsed.intent)) res.escalate = true;
  if (parsed.chosenSlotIndex != null && state.slots?.[parsed.chosenSlotIndex]) {
    const slot = state.slots[parsed.chosenSlotIndex];
    if (!conv.patientId) { res.state = { ...state, step: 'collect_identity', chosen: slot }; res.reply = `Great, ${fmtWhen(slot.start)} it is. To finish booking, please reply with your full name and date of birth (for example: Jane Doe, 1990-05-14).`; return res; }
    return { ...finalizeBooking(db, conv, res, slot, state), engine: 'claude' };
  }
  if (state.step === 'collect_identity') return { ...ruleEngine(db, conv, text), engine: 'claude+rules' };
  if (['book', 'urgent', 'reschedule'].includes(parsed.intent) && res.visitTypeId && !res.escalate) {
    const vt = db.settings.visitTypes.find((v) => v.id === res.visitTypeId);
    if (vt) {
      const rescheduleId = parsed.intent === 'reschedule' && upcoming ? upcoming.id : null;
      const slots = nextSlots(db, { visitTypeId: vt.id, preferredTime: parsed.preferredTime, fromDate: parsed.preferredDate, locationId: preferredLocation(db, norm(text)) || db.patients.find((p) => p.id === conv.patientId)?.locationId || null, limit: 4 });
      if (slots.length) {
        res.slots = slots; res.state = { step: 'choose_slot', slots, visitTypeId: vt.id, preferredTime: parsed.preferredTime, rescheduleId };
        if (!/\b1\./.test(res.reply)) res.reply = `${res.reply.trim()}\n${slotList(slots)}\nReply with the number that works.`;
      } else { res.escalate = true; res.escalationReason = `No availability for ${vt.name}`; }
    }
  }
  if (parsed.intent === 'confirm' && upcoming) res.actions.push({ type: 'confirm', appointmentId: upcoming.id });
  if (parsed.intent === 'cancel' && upcoming && !state.step) { res.state = { step: 'confirm_cancel', appointmentId: upcoming.id }; }
  if (parsed.intent === 'cancel' && state.step === 'confirm_cancel') return { ...ruleEngine(db, conv, text), engine: 'claude+rules' };
  return res;
}

export async function respond(db, conv, text) {
  let result;
  if (aiMode() === 'claude') {
    try { result = await claudeEngine(db, conv, text); }
    catch (err) { console.warn('[frontDesk] Claude engine failed, using rules:', err.message); }
  }
  result ||= { ...ruleEngine(db, conv, text), engine: 'rules' };
  return afterHours(db, conv, text, result);
}

/** Outside opening hours: say so once, keep booking working, and queue anything that needs a person for the morning. */
function afterHours(db, conv, text, result) {
  const ah = db.settings.afterHours;
  if (!ah?.enabled || isOpen(db)) return result;
  const opening = nextOpening(db);
  const opens = opening ? fmtOpening(opening.at) : 'soon';
  const patient = conv.patientId ? db.patients.find((p) => p.id === conv.patientId) : null;
  const lang = patient?.preferredLanguage || 'en';
  const notice = String((ah.message && (ah.message[lang] || ah.message.en)) || '').replace('{{opens}}', opens);
  const firstTurn = conv.messages.filter((m) => m.from === 'ai').length === 0;
  result.afterHours = true;
  if (result.intent === 'emergency') { result.reply = `${result.reply}\n${ah.emergency || ''}`.trim(); }
  else if (result.escalate) {
    result.reply = `${notice}\n\nI have noted your message for our team; they will contact you when we open ${opens}.${result.intent === 'clinical' || result.intent === 'urgent' ? ` ${ah.emergency || ''}` : ''}`.trim();
    if (ah.takeMessages !== false) addCallback(db, { source: 'after_hours', conversationId: conv.id, patientId: conv.patientId, contactName: conv.contactName, contactPhone: conv.contactPhone, reason: result.escalationReason || 'After-hours message', channel: conv.channel, priority: ['clinical', 'urgent', 'emergency'].includes(result.intent) ? 'high' : 'normal' });
  } else if (result.intent === 'urgent') {
    // Pain after hours: still offer the earliest slots, add the emergency line, and have the team call first thing.
    result.reply = `${firstTurn ? notice + '\n\n' : ''}${result.reply}\n${ah.emergency || ''}`.trim();
    if (ah.takeMessages !== false) addCallback(db, { source: 'after_hours', conversationId: conv.id, patientId: conv.patientId, contactName: conv.contactName, contactPhone: conv.contactPhone, reason: 'Pain reported after hours — call first thing', channel: conv.channel, priority: 'high' });
  } else if (firstTurn && !['booked', 'confirm'].includes(result.intent)) {
    result.reply = `${notice}\n\n${result.reply}`;
  }
  return result;
}

/** Apply the engine's actions to the database. */
export function applyActions(db, conv, result, deps) {
  const done = [];
  for (const a of result.actions || []) {
    if (a.type === 'book') {
      const appt = bookAppointment(db, { patientId: a.patientId, visitTypeId: a.visitTypeId, providerId: a.providerId, locationId: a.locationId, start: a.start, source: 'ai', by: 'AI front desk' });
      deps.afterBooking?.(appt);
      done.push({ type: 'book', appointmentId: appt.id });
    } else if (a.type === 'reschedule') {
      const appt = deps.reschedule(a.appointmentId, { start: a.start, providerId: a.providerId, locationId: a.locationId, by: 'AI front desk' });
      done.push({ type: 'reschedule', appointmentId: appt.id });
    } else if (a.type === 'cancel') {
      deps.cancel(a.appointmentId, { reason: 'Cancelled by patient via AI front desk', by: 'AI front desk', source: 'ai' });
      done.push({ type: 'cancel', appointmentId: a.appointmentId });
    } else if (a.type === 'confirm') {
      const appt = db.appointments.find((x) => x.id === a.appointmentId);
      if (appt && ['scheduled'].includes(appt.status)) { appt.status = 'confirmed'; appt.confirmedAt = nowIso(); }
      done.push({ type: 'confirm', appointmentId: a.appointmentId });
    } else if (a.type === 'accept_waitlist') {
      const appt = deps.acceptWaitlist(a.waitlistId, { by: 'Patient' });
      done.push({ type: 'accept_waitlist', appointmentId: appt.id });
    }
  }
  return done;
}
