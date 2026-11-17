/**
 * Growth analytics for the marketing screens. A booking is credited to a message when the patient was sent that
 * campaign / recall / treatment follow-up and made the booking within ATTRIBUTION_DAYS afterwards. It is a fair
 * "after the message" measure, not proof the message caused the visit, and the screens say so.
 */
import { dayKey, nowIso, addDays } from '../lib.js';
import { segmentPatients, GOALS } from './marketing.js';

const ATTRIBUTION_DAYS = 14;
const PUSH_TYPES = new Set(['marketing', 'recall', 'treatment']);
const sum = (xs) => xs.reduce((s, x) => s + x, 0);
export const SOURCES = ['Google search', 'Google Maps', 'Friend or family', 'Instagram or Facebook', 'Walked past', 'Doctor referral', 'Other'];

function windowStats(db, fromIso, toIso) {
  const comms = db.communications.filter((c) => c.sentAt >= fromIso && c.sentAt < toIso);
  // Greetings and thank-yous do not ask for a booking, so they are not credited with one.
  const push = db.communications.filter((c) => PUSH_TYPES.has(c.type) && !(c.type === 'marketing' && ['festival', 'thank_you', 'review', 'birthday', 'welcome', 'aftercare'].includes(c.meta?.goal)));
  const created = db.appointments.filter((a) => a.createdAt >= fromIso && a.createdAt < toIso && a.status !== 'cancelled');
  const booked = new Map(); // appointmentId -> { comm }
  for (const a of created) {
    // A message only counts if the patient had nothing booked when it went out (otherwise they would have come anyway).
    const hadUpcoming = (c) => db.appointments.some((x) => x.id !== a.id && x.patientId === c.patientId && x.status !== 'cancelled' && x.createdAt <= c.sentAt && x.start > c.sentAt);
    const hit = push.filter((c) => c.patientId === a.patientId && c.sentAt <= a.createdAt && new Date(a.createdAt) - new Date(c.sentAt) <= ATTRIBUTION_DAYS * 86400000 && !hadUpcoming(c))
      .sort((x, y) => y.sentAt.localeCompare(x.sentAt))[0];
    if (hit) booked.set(a.id, { comm: hit, appt: a });
  }
  // One message earns at most one booking: the first one that followed it.
  const firstPerMessage = new Map();
  for (const [aid, v] of booked) { const cur = firstPerMessage.get(v.comm.id); if (!cur || v.appt.createdAt < cur.appt.createdAt) firstPerMessage.set(v.comm.id, { aid, ...v }); }
  booked.clear();
  for (const v of firstPerMessage.values()) booked.set(v.aid, { comm: v.comm, appt: v.appt });
  return {
    messages: comms.filter((c) => PUSH_TYPES.has(c.type)).length,
    reached: new Set(comms.filter((c) => PUSH_TYPES.has(c.type)).map((c) => c.patientId)).size,
    thankYous: comms.filter((c) => c.type === 'thank_you').length,
    reviewRequests: comms.filter((c) => c.type === 'review_request').length,
    bookings: booked.size,
    revenue: sum([...booked.values()].map(({ appt }) => (appt.paymentStatus === 'paid' ? appt.paidAmount || 0 : 0))),
    booked,
  };
}

export function growth(db, { days = 30, locationId = null } = {}) {
  const now = nowIso(); const from = addDays(now, -days); const prevFrom = addDays(now, -2 * days);
  const cur = windowStats(db, from, now); const prev = windowStats(db, prevFrom, from);
  const everything = windowStats(db, '0000', now); // campaign results cover all that followed each one, however long ago it went out
  const m = db.settings.marketing || {};
  const patients = db.patients.filter((p) => !locationId || p.locationId === locationId);

  // Per campaign: what it sent and what followed.
  const campaigns = (db.settings.marketingCampaigns || []).filter((c) => c.status === 'sent').map((c) => {
    const sent = db.communications.filter((x) => x.meta?.campaignId === c.id);
    const patientIds = new Set(sent.map((x) => x.patientId));
    const won = [...everything.booked.values()].filter(({ comm }) => comm.meta?.campaignId === c.id);
    return { id: c.id, name: c.name, goal: c.goal, goalName: GOALS.find((g) => g.id === c.goal)?.name || c.goal, sentAt: c.sentAt, sent: c.sentCount ?? sent.length, reached: patientIds.size, bookings: won.length, revenue: sum(won.map(({ appt }) => (appt.paymentStatus === 'paid' ? appt.paidAmount || 0 : 0))) };
  }).sort((a, b) => (b.sentAt || '').localeCompare(a.sentAt || '')).slice(0, 8);
  const recallWon = [...cur.booked.values()].filter(({ comm }) => comm.type === 'recall');
  const recallSent = db.communications.filter((c) => c.type === 'recall' && c.sentAt >= from);
  if (recallSent.length) campaigns.push({ id: 'recalls', name: 'Automatic recall reminders', goal: 'recall', goalName: 'Recall / cleaning reminder', sentAt: recallSent[0].sentAt, sent: recallSent.length, reached: new Set(recallSent.map((c) => c.patientId)).size, bookings: recallWon.length, revenue: sum(recallWon.map(({ appt }) => (appt.paymentStatus === 'paid' ? appt.paidAmount || 0 : 0))) });

  // Opportunities: groups of opted-in patients worth a message right now.
  const unscheduledValue = sum(db.treatmentPlans.filter((tp) => !tp.nextVisitScheduled).flatMap((tp) => tp.items.filter((i) => ['recommended', 'accepted'].includes(i.status)).map((i) => i.fee || 0)));
  const opp = (id, goal, segment, title, hint, extra = {}) => ({ id, goal, segment, title, hint, count: segmentPatients(db, segment, { locationId }).length, ...extra });
  const opportunities = [
    opp('recall', 'recall', 'overdue_recall', 'Overdue for a check-up', 'Patients past their recall date with nothing booked'),
    opp('unscheduled', 'unscheduled', 'unscheduled_treatment', 'Left without booking treatment', 'Recommended treatment that is not scheduled yet', { value: unscheduledValue }),
    opp('reactivation', 'reactivation', 'inactive_12m', 'Not seen in 12 months', 'A gentle win-back message'),
    opp('birthday', 'festival', 'birthday_month', 'Birthdays this month', 'A short greeting keeps the clinic top of mind'),
  ].filter((o) => o.count > 0);

  // Where new patients heard about the clinic.
  const fresh = patients.filter((p) => p.createdAt >= from);
  const srcCount = new Map();
  for (const p of fresh) { const k = p.source || 'Not recorded'; srcCount.set(k, (srcCount.get(k) || 0) + 1); }
  const optedIn = db.patients.filter((p) => p.marketingOptIn !== false).length;

  return {
    days, attributionDays: ATTRIBUTION_DAYS, now: { messages: cur.messages, reached: cur.reached, bookings: cur.bookings, revenue: cur.revenue, reviewRequests: cur.reviewRequests, thankYous: cur.thankYous },
    previous: { messages: prev.messages, reached: prev.reached, bookings: prev.bookings, revenue: prev.revenue, reviewRequests: prev.reviewRequests },
    conversion: cur.messages ? Math.min(100, Math.round((cur.bookings / cur.messages) * 100)) : 0, // messages followed by a booking
    campaigns, opportunities,
    sources: [...srcCount.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count), newPatients: fresh.length,
    reviews: { linkSet: !!m.googleReviewUrl, auto: !!m.autoReview?.enabled, requested: cur.reviewRequests, thankYous: cur.thankYous },
    consent: { optedIn, total: db.patients.length, percent: db.patients.length ? Math.round((optedIn / db.patients.length) * 100) : 0 },
    today: dayKey(now),
  };
}
