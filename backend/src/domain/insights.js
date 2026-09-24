import { nowIso, addDays, minutesBetween, fullName } from '../lib.js';
import { callStats } from './assistant.js';

export function computeInsights(db, { days = 30, now = nowIso(), locationId = null } = {}) {
  const since = addDays(now, -days);
  const today = now.slice(0, 10);
  const unansweredMin = db.settings.rules.unansweredMinutes || 30;
  const inLoc = (a) => !locationId || a.locationId === locationId;

  const unanswered = db.conversations.filter((c) => {
    if (c.status === 'closed') return false;
    const last = c.messages[c.messages.length - 1];
    if (!last) return false;
    if (c.status === 'needs_staff') return true;
    return last.from === 'patient' && minutesBetween(last.at, now) >= unansweredMin;
  }).map((c) => ({ id: c.id, contactName: c.contactName, channel: c.channel, status: c.status, reason: c.reason, waitingMinutes: minutesBetween(c.messages[c.messages.length - 1].at, now) }));

  const convsInWindow = db.conversations.filter((c) => c.createdAt >= since);
  const bookingIntent = convsInWindow.filter((c) => c.messages.some((m) => ['book', 'booked', 'reschedule', 'urgent'].includes(m.intent)));
  const booked = bookingIntent.filter((c) => c.messages.some((m) => m.intent === 'booked') || db.appointments.some((a) => a.patientId && a.patientId === c.patientId && a.createdAt >= c.createdAt && ['ai', 'patient'].includes(a.source)));
  const bookingRate = bookingIntent.length ? Math.round((booked.length / bookingIntent.length) * 100) : null;

  const apptsInWindow = db.appointments.filter((a) => inLoc(a) && a.start >= since && a.start <= addDays(now, 1));
  const cancellations = db.appointments.filter((a) => inLoc(a) && a.status === 'cancelled' && a.cancelledAt >= since);
  const lateCancellations = cancellations.filter((a) => a.cancelledLate);
  const noShows = db.appointments.filter((a) => inLoc(a) && a.status === 'no_show' && a.start >= since);
  const completed = db.appointments.filter((a) => inLoc(a) && a.status === 'completed' && a.start >= since);

  const visits = db.visits.filter((v) => v.arrivedAt >= since && (!locationId || v.locationId === locationId));
  const toReady = visits.filter((v) => v.readyAt).map((v) => minutesBetween(v.arrivedAt, v.readyAt));
  const readyToBack = visits.filter((v) => v.readyAt && v.broughtBackAt).map((v) => minutesBetween(v.readyAt, v.broughtBackAt));
  const avg = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const waitingNow = db.visits.filter((v) => v.arrivedAt.slice(0, 10) === today && (!locationId || v.locationId === locationId) && ['arrived', 'checking_in', 'needs_attention', 'ready', 'called'].includes(v.status))
    .map((v) => ({ visitId: v.id, token: v.token, patientName: fullName(db.patients.find((p) => p.id === v.patientId)), status: v.status, waitingMinutes: minutesBetween(v.arrivedAt, now), helpRequested: !!v.helpRequested }));

  const overdueRecalls = db.patients.filter((p) => (!locationId || p.locationId === locationId) && p.nextRecallDue && p.nextRecallDue < today
    && !db.appointments.some((a) => a.patientId === p.id && ['scheduled', 'confirmed'].includes(a.status) && a.start > now))
    .map((p) => ({ patientId: p.id, name: fullName(p), dueOn: p.nextRecallDue, daysOverdue: Math.round((new Date(today) - new Date(p.nextRecallDue)) / 86400000), lastContacted: db.communications.find((c) => c.patientId === p.id && c.type === 'recall')?.sentAt || null }));

  const unscheduledTreatment = db.treatmentPlans.filter((tp) => !tp.nextVisitScheduled && tp.items.some((i) => ['recommended', 'accepted'].includes(i.status)))
    .map((tp) => {
      const items = tp.items.filter((i) => ['recommended', 'accepted'].includes(i.status));
      return { planId: tp.id, patientId: tp.patientId, name: fullName(db.patients.find((p) => p.id === tp.patientId)), items: items.map((i) => i.procedure), value: items.reduce((s, i) => s + (i.estCost || 0), 0), daysSince: Math.round((new Date(now) - new Date(tp.createdAt)) / 86400000), lastFollowUp: tp.followUps[tp.followUps.length - 1]?.at || null, openQuestions: tp.patientQuestions.filter((q) => !q.answer).length };
    });

  const upcoming = db.appointments.filter((a) => inLoc(a) && ['scheduled', 'confirmed'].includes(a.status) && a.start >= now && a.start <= addDays(now, 3));
  const formsIncomplete = upcoming.filter((a) => { const pk = db.formPackets.find((p) => p.appointmentId === a.id); return !pk || pk.status !== 'complete'; }).length;

  const byChannel = {};
  for (const c of convsInWindow) byChannel[c.channel] = (byChannel[c.channel] || 0) + 1;
  const escalated = convsInWindow.filter((c) => c.escalation).length;
  const aiResolved = convsInWindow.filter((c) => !c.escalation && c.status !== 'staff').length;

  const paid = db.appointments.filter((a) => inLoc(a) && a.paymentStatus === 'paid' && a.paidAt && a.paidAt >= since);
  const revenue = { collected: paid.reduce((s, a) => s + (a.paidAmount || 0), 0), today: paid.filter((a) => a.paidAt.slice(0, 10) === today).reduce((s, a) => s + (a.paidAmount || 0), 0), byMode: paid.reduce((m, a) => { m[a.paymentMode] = (m[a.paymentMode] || 0) + (a.paidAmount || 0); return m; }, {}), outstanding: db.appointments.filter((a) => inLoc(a) && a.status === 'completed' && a.paymentStatus === 'unpaid' && a.fee).reduce((s, a) => s + a.fee, 0), currency: db.settings.locale?.currencySymbol || '₹' };

  const group = (key, list) => list.map((x) => {
    const mine = apptsInWindow.filter((a) => a[key] === x.id);
    return { id: x.id, name: x.name, specialty: x.specialty || x.role, scheduled: mine.length, completed: mine.filter((a) => a.status === 'completed').length, cancelled: mine.filter((a) => a.status === 'cancelled').length, noShow: mine.filter((a) => a.status === 'no_show').length, collected: mine.filter((a) => a.paymentStatus === 'paid').reduce((s, a) => s + (a.paidAmount || 0), 0), utilisation: null };
  });
  const byProvider = group('providerId', db.settings.providers.filter((p) => !locationId || !p.locationIds?.length || p.locationIds.includes(locationId)));
  const byLocation = group('locationId', db.settings.locations || []);

  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = addDays(now, -i).slice(0, 10);
    const dayAppts = db.appointments.filter((a) => inLoc(a) && a.start.slice(0, 10) === day);
    series.push({ day, completed: dayAppts.filter((a) => a.status === 'completed').length, cancelled: dayAppts.filter((a) => a.status === 'cancelled').length, noShow: dayAppts.filter((a) => a.status === 'no_show').length, scheduled: dayAppts.filter((a) => ['scheduled', 'confirmed', 'arrived', 'ready', 'in_chair'].includes(a.status)).length });
  }

  return {
    windowDays: days, generatedAt: now, locationId,
    unansweredInquiries: { count: unanswered.length, items: unanswered },
    bookings: { rate: bookingRate, inquiriesWithBookingIntent: bookingIntent.length, booked: booked.length, conversations: convsInWindow.length, escalated, aiResolved, byChannel },
    cancellations: { total: cancellations.length, late: lateCancellations.length, noShows: noShows.length, completed: completed.length, scheduled: apptsInWindow.length, rate: apptsInWindow.length ? Math.round(((cancellations.length + noShows.length) / apptsInWindow.length) * 100) : null },
    checkIn: { avgArrivalToReadyMin: avg(toReady), avgReadyToChairMin: avg(readyToBack), kioskShare: visits.length ? Math.round((visits.filter((v) => v.checkInSource === 'kiosk').length / visits.length) * 100) : null, waitingNow },
    recalls: { overdue: overdueRecalls.length, items: overdueRecalls.sort((a, b) => b.daysOverdue - a.daysOverdue) },
    unscheduledTreatment: { count: unscheduledTreatment.length, value: unscheduledTreatment.reduce((s, x) => s + x.value, 0), items: unscheduledTreatment },
    forms: { upcoming: upcoming.length, incomplete: formsIncomplete },
    revenue, byProvider, byLocation, series,
    calls: callStats(db, { since }),
  };
}
