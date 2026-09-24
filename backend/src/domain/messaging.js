import { id, nowIso, log, fullName } from '../lib.js';
import { emit } from './webhooks.js';

function fmtWhen(iso) {
  return new Date(iso).toLocaleString('en-IN', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function fmtTime(iso) { return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }); }

/** Picks the template body in the patient's preferred language, falling back to English. */
export function templateBody(db, tpl, lang) {
  const b = tpl.body;
  if (typeof b === 'string') return b;
  return b[lang] || b[db.settings.locale?.defaultLanguage || 'en'] || b.en || Object.values(b)[0] || '';
}

export function renderTemplate(db, templateIdOrBody, ctx = {}) {
  const tpl = db.settings.templates.find((t) => t.id === templateIdOrBody);
  const lang = ctx.lang || ctx.patient?.preferredLanguage || db.settings.locale?.defaultLanguage || 'en';
  const body = tpl ? templateBody(db, tpl, lang) : (typeof templateIdOrBody === 'object' ? templateBody(db, { body: templateIdOrBody }, lang) : templateIdOrBody);
  const vars = {
    firstName: ctx.patient?.firstName || 'there',
    lastName: ctx.patient?.lastName || '',
    practice: db.settings.practice.name,
    phone: db.settings.practice.phone,
    visitType: ctx.visitType?.name || 'visit',
    provider: ctx.provider?.name || 'our team',
    location: ctx.location?.name || db.settings.locations?.[0]?.name || '',
    when: ctx.start ? fmtWhen(ctx.start) : '',
    time: ctx.start ? fmtTime(ctx.start) : '',
    formsLink: ctx.formsLink || '',
    treatment: ctx.treatment || 'treatment',
    token: ctx.token || '',
    amount: ctx.amount || '',
    opens: ctx.opens || '',
    calendarLink: ctx.calendarLink || '',
  };
  return body.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] ?? ''));
}

/**
 * Records an outbound message. This app does not connect to WhatsApp/SMS/email providers:
 * messages are stored in the outbox and shown in the patient's thread. A provider integration
 * (WhatsApp Business API, MSG91, Twilio, …) hooks in here; `integrations.messaging` in settings holds its config.
 */
export function sendCommunication(db, { patientId, type, body, channel, appointmentId = null, meta = {}, by = 'Clinovara' }) {
  const patient = db.patients.find((p) => p.id === patientId);
  const ch = channel || db.settings.locale?.defaultChannel || 'sms';
  const c = { id: id('cm'), patientId, type, channel: ch, body, sentAt: nowIso(), status: 'sent', appointmentId, meta, by, delivery: db.settings.integrations?.messaging?.provider && db.settings.integrations.messaging.provider !== 'none' ? 'queued' : 'simulated', lang: patient?.preferredLanguage || 'en' };
  db.communications.unshift(c);
  if (patient) {
    let conv = db.conversations.find((x) => x.patientId === patientId && x.status !== 'closed');
    if (!conv) {
      conv = { id: id('cnv'), patientId, contactName: fullName(patient), contactPhone: patient.phone, channel: ch, status: 'ai', reason: typeLabel(type), createdAt: nowIso(), updatedAt: nowIso(), messages: [], assignedTo: null, unread: false };
      db.conversations.unshift(conv);
    }
    conv.messages.push({ id: id('msg'), from: by === 'Clinovara' ? 'ai' : 'staff', by, text: body, at: c.sentAt, intent: type, outbound: true });
    conv.updatedAt = c.sentAt;
    c.conversationId = conv.id;
  }
  emit(db, 'communication.sent', { communication: c });
  return c;
}

export function typeLabel(type) {
  return { reminder: 'Appointment reminder', prep: 'Preparation instructions', forms: 'Pre-visit form', recall: 'Recall', post_visit: 'Post-visit check-in', waitlist: 'Waitlist offer', treatment: 'Treatment follow-up', token: 'Token', marketing: 'Campaign', thank_you: 'Thank-you', review_request: 'Review request', missed_call: 'Missed call', missed_appointment: 'Missed appointment', aftercare: 'Aftercare instructions', custom: 'Message' }[type] || 'Message';
}

export function dueRecalls(db, now = nowIso()) {
  const today = now.slice(0, 10);
  return db.patients.filter((p) => {
    if (!p.nextRecallDue || p.nextRecallDue > today) return false;
    const upcoming = db.appointments.some((a) => a.patientId === p.id && ['scheduled', 'confirmed'].includes(a.status) && a.start > now);
    if (upcoming) return false;
    const recent = db.communications.find((c) => c.patientId === p.id && c.type === 'recall' && (new Date(now) - new Date(c.sentAt)) < 14 * 86400000);
    return !recent;
  });
}

export function duePostVisit(db, now = nowIso()) {
  return db.appointments.filter((a) => a.status === 'completed' && a.completedAt && (new Date(now) - new Date(a.completedAt)) < 3 * 86400000
    && !db.communications.some((c) => c.appointmentId === a.id && c.type === 'post_visit'));
}

export { log };
