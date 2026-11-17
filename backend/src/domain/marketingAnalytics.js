/**
 * One analytics read for the Marketing screen: revenue, marketing results, reach-out and the website funnel.
 * Everything is computed from records the clinic already has. Two things are deliberately honest:
 *  - "Views" are loads of the clinic's public booking page, counted by Clinovara (not Google or Instagram impressions).
 *  - Delivered/read receipts exist only when WhatsApp or SMS is connected, so until then the screen shows what was sent and who replied.
 */
import { dayKey, nowIso, addDays } from '../lib.js';
import { growth } from './growth.js';
import { marketingSettings } from './marketing.js';

const PUSH = new Set(['marketing', 'recall', 'treatment']);
const TYPE_LABEL = { reminder: 'Appointment reminders', confirmation: 'Booking confirmations', prep: 'Preparation', forms: 'Pre-visit forms', recall: 'Recall reminders', post_visit: 'Post-visit check-ins', waitlist: 'Waitlist offers', treatment: 'Treatment follow-ups', marketing: 'Campaigns', thank_you: 'Thank-yous', review_request: 'Review requests', missed_call: 'Missed-call replies', missed_appointment: 'Missed-appointment follow-ups', aftercare: 'Aftercare', receipt: 'Receipts', custom: 'Staff messages', token: 'Queue tokens' };
const sum = (xs) => xs.reduce((s, x) => s + x, 0);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

/** Counts one public-site event for today. Kept per day for 180 days. */
export function trackSite(db, event, source = '') {
  const stats = (db.settings.siteStats ||= {});
  const day = dayKey(nowIso());
  const d = (stats[day] ||= { views: 0, slotChecks: 0, bookings: 0, sources: {} });
  if (event === 'view') { d.views++; if (source) d.sources[source] = (d.sources[source] || 0) + 1; }
  else if (event === 'slots') d.slotChecks++;
  else if (event === 'booking') d.bookings++;
  const keep = dayKey(addDays(nowIso(), -180));
  for (const k of Object.keys(stats)) if (k < keep) delete stats[k];
}

const dayList = (from, days) => Array.from({ length: days }, (_, i) => dayKey(addDays(from, i)));

export function analytics(db, { days = 30, locationId = null } = {}) {
  const now = nowIso();
  const today = dayKey(now);
  const dayKeys = dayList(addDays(now, -(days - 1)), days); // the window is exactly these days, so totals match the chart
  const fromDay = dayKeys[0]; const dayBefore = dayKey(addDays(now, -days)); const prevFromDay = dayKey(addDays(now, -(2 * days - 1)));
  const m = marketingSettings(db);
  const g = growth(db, { days, locationId });
  const inLoc = (x) => !locationId || x.locationId === locationId;

  /* ----- Revenue ----- */
  const paid = db.appointments.filter((a) => a.paymentStatus === 'paid' && a.paidAt && inLoc(a));
  const paidIn = (a, b) => paid.filter((x) => dayKey(x.paidAt) >= a && dayKey(x.paidAt) <= b);
  const curPaid = paidIn(fromDay, today); const prevPaid = paidIn(prevFromDay, dayBefore);
  const byDay = new Map(dayKeys.map((k) => [k, 0]));
  for (const a of curPaid) if (byDay.has(dayKey(a.paidAt))) byDay.set(dayKey(a.paidAt), byDay.get(dayKey(a.paidAt)) + (a.paidAmount || 0));
  const vtName = (id) => db.settings.visitTypes.find((v) => v.id === id)?.name || 'Other';
  const byType = new Map();
  for (const a of curPaid) { const k = vtName(a.visitTypeId); const c = byType.get(k) || { name: k, revenue: 0, visits: 0 }; c.revenue += a.paidAmount || 0; c.visits++; byType.set(k, c); }
  const patientById = new Map(db.patients.map((p) => [p.id, p]));
  const newIds = new Set(db.patients.filter((p) => dayKey(p.createdAt) >= fromDay).map((p) => p.id));
  const total = sum(curPaid.map((a) => a.paidAmount || 0)); const prevTotal = sum(prevPaid.map((a) => a.paidAmount || 0));
  const fromNew = sum(curPaid.filter((a) => newIds.has(a.patientId)).map((a) => a.paidAmount || 0));
  const unpaid = db.appointments.filter((a) => a.status === 'completed' && a.paymentStatus !== 'paid' && inLoc(a));
  const bySource = new Map();
  for (const a of curPaid) { const k = patientById.get(a.patientId)?.source || 'Not recorded'; bySource.set(k, (bySource.get(k) || 0) + (a.paidAmount || 0)); }
  const revenue = {
    total, previous: prevTotal, visits: curPaid.length, previousVisits: prevPaid.length, averageVisit: curPaid.length ? Math.round(total / curPaid.length) : 0,
    series: dayKeys.map((k) => ({ day: k, value: byDay.get(k) })),
    byType: [...byType.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 7),
    bySource: [...bySource.entries()].map(([source, value]) => ({ source, value })).sort((a, b) => b.value - a.value).slice(0, 7),
    fromNewPatients: fromNew, fromReturning: total - fromNew, outstanding: sum(unpaid.map((a) => a.fee || 0)), outstandingVisits: unpaid.length,
    fromMarketing: g.now.revenue, marketingShare: pct(g.now.revenue, total),
  };

  /* ----- Reach-out ----- */
  const comms = db.communications.filter((c) => dayKey(c.sentAt) >= fromDay);
  const prevComms = db.communications.filter((c) => dayKey(c.sentAt) >= prevFromDay && dayKey(c.sentAt) <= dayBefore);
  const byTypeCount = new Map();
  for (const c of comms) byTypeCount.set(c.type, (byTypeCount.get(c.type) || 0) + 1);
  const automated = (c) => !c.by || c.by === 'Clinovara' || /^(Campaign|Scheduled)/.test(c.by);
  const reachedIds = new Set(comms.map((c) => c.patientId).filter(Boolean));
  const outbound = comms.filter((c) => c.channel);
  const byChannel = new Map();
  for (const c of outbound) byChannel.set(c.channel, (byChannel.get(c.channel) || 0) + 1);
  const provider = db.settings.integrations?.messaging?.provider;
  const deliveryKnown = !!provider && provider !== 'none';
  const sentDay = new Map(dayKeys.map((k) => [k, { day: k, marketing: 0, care: 0 }]));
  for (const c of comms) { const row = sentDay.get(dayKey(c.sentAt)); if (!row) continue; (PUSH.has(c.type) || ['thank_you', 'review_request'].includes(c.type) ? (row.marketing++) : (row.care++)); }

  // Replies: a patient writing back within three days of a push message.
  const patientMsgs = new Map();
  for (const conv of db.conversations || []) if (conv.patientId) for (const msg of conv.messages || []) if (msg.from === 'patient') { const a = patientMsgs.get(conv.patientId) || []; a.push(msg.at); patientMsgs.set(conv.patientId, a); }
  const replied = (c) => (patientMsgs.get(c.patientId) || []).some((t) => t > c.sentAt && new Date(t) - new Date(c.sentAt) <= 3 * 86400000);
  const pushSent = comms.filter((c) => PUSH.has(c.type) || c.type === 'thank_you' || c.type === 'review_request');
  const repliedCount = pushSent.filter(replied).length;

  const days14 = marketingSettings(db).frequencyCapDays || 0;
  const cappedNow = days14 ? db.patients.filter((p) => db.communications.some((c) => c.patientId === p.id && c.type === 'marketing' && c.sentAt >= addDays(now, -days14))).length : 0;
  const reach = {
    sent: comms.length, previous: prevComms.length, patientsReached: reachedIds.size, reachPercent: pct(reachedIds.size, db.patients.length),
    automatedShare: pct(comms.filter(automated).length, comms.length),
    byType: [...byTypeCount.entries()].map(([type, count]) => ({ type, label: TYPE_LABEL[type] || type, count })).sort((a, b) => b.count - a.count),
    byChannel: [...byChannel.entries()].map(([channel, count]) => ({ channel, count })).sort((a, b) => b.count - a.count),
    series: [...sentDay.values()], replies: repliedCount, replyRate: pct(repliedCount, pushSent.length), pushSent: pushSent.length,
    deliveryTracked: deliveryKnown, provider: deliveryKnown ? provider : null,
    consent: g.consent, cappedNow, capDays: days14,
    skippedByCap: (db.settings.marketingCampaigns || []).filter((c) => c.sentAt && dayKey(c.sentAt) >= fromDay).reduce((s, c) => s + (c.skippedRecent || 0), 0),
  };

  /* ----- Campaigns, with replies ----- */
  const campaigns = g.campaigns.map((c) => {
    const sent = db.communications.filter((x) => (c.id === 'recalls' ? x.type === 'recall' && dayKey(x.sentAt) >= fromDay : x.meta?.campaignId === c.id));
    const r = sent.filter(replied).length;
    return { ...c, replies: r, replyRate: pct(r, sent.length), conversion: pct(c.bookings, c.sent) };
  });
  const byGoal = new Map();
  for (const c of campaigns) { const k = c.goalName; const x = byGoal.get(k) || { goal: k, sent: 0, bookings: 0, revenue: 0 }; x.sent += c.sent; x.bookings += c.bookings; x.revenue += c.revenue; byGoal.set(k, x); }

  /* ----- Website views and the booking funnel ----- */
  const stats = db.settings.siteStats || {};
  const win = (a, b) => Object.entries(stats).filter(([k]) => k >= a && k <= b).map(([, v]) => v);
  const cur = win(fromDay, today); const prev = win(prevFromDay, dayBefore);
  const tot = (arr, k) => sum(arr.map((x) => x[k] || 0));
  const srcViews = new Map();
  for (const d of cur) for (const [k, v] of Object.entries(d.sources || {})) srcViews.set(k, (srcViews.get(k) || 0) + v);
  const webBookings = db.appointments.filter((a) => a.source === 'website' && dayKey(a.createdAt) >= fromDay && inLoc(a)).length;
  const chats = (db.conversations || []).filter((c) => c.channel === 'web' && dayKey(c.createdAt) >= fromDay).length;
  const views = tot(cur, 'views');
  const site = {
    views, previousViews: tot(prev, 'views'), slotChecks: tot(cur, 'slotChecks'), chats, bookings: webBookings,
    viewToBooking: pct(webBookings, views),
    series: dayKeys.map((k) => ({ day: k, value: stats[k]?.views || 0 })),
    sources: [...srcViews.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count).slice(0, 6),
    tracked: Object.keys(stats).length > 0,
  };

  return {
    days, today, revenue, reach, site,
    marketing: { messages: g.now.messages, previousMessages: g.previous.messages, bookings: g.now.bookings, previousBookings: g.previous.bookings, revenue: g.now.revenue, conversion: g.conversion, campaigns, byGoal: [...byGoal.values()].sort((a, b) => b.revenue - a.revenue), reviewRequests: g.now.reviewRequests, thankYous: g.now.thankYous, attributionDays: g.attributionDays },
    newPatients: { count: g.newPatients, sources: g.sources },
    autoSettings: { thankYou: !!m.autoThankYou?.enabled, review: !!m.autoReview?.enabled },
  };
}
