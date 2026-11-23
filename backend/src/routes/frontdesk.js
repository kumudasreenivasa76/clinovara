/**
 * Front desk dashboard: everything reception needs for today in one call, so the page cannot show
 * numbers that disagree with each other. All of it is derived from the same appointments, visits,
 * patients and payments the rest of the app writes to; nothing is stored here.
 */
import { Router } from 'express';
import { nowIso, dayKey, addDays, fullName, HttpError, minutesBetween, overlaps } from '../lib.js';
import { arrivalsBoard } from '../domain/visits.js';
import { sweepNoShows, isOpen, nextOpening, fmtOpening, hoursOn } from '../domain/hours.js';
import { tasksOf, setTaskStatus, taskView } from '../domain/deskTasks.js';
import { find, bad } from '../lib.js';

const r = Router();
const SOURCE = { staff: 'Front desk', website: 'Website', ai: 'AI assistant', patient: 'Kiosk / portal', whatsapp: 'WhatsApp', phone: 'Phone', walkin: 'Walk-in' };
const IN_CLINIC = ['arrived', 'checking_in', 'needs_attention', 'ready', 'called', 'brought_back'];
const LATE_AFTER_MIN = 15;

/** One status word per appointment, the same on every front desk screen. */
function unifiedStatus(a, visit) {
  if (a.status === 'cancelled') return 'cancelled';
  if (a.status === 'no_show') return 'no_show';
  if (a.status === 'completed' || visit?.status === 'done') return 'completed';
  if (visit?.status === 'brought_back' || a.status === 'in_chair') return 'in_chair';
  if (visit && ['ready', 'called'].includes(visit.status)) return 'waiting';
  if (visit) return 'checked_in';
  if (a.status === 'confirmed') return 'confirmed';
  return 'pending';
}
const payState = (a) => (a.paymentStatus === 'paid' ? 'paid' : a.paymentStatus === 'insurance' ? 'insurance' : 'unpaid');

r.get('/summary', (req, res) => {
  if (!['owner', 'admin', 'front_desk'].includes(req.role)) throw new HttpError(403, 'The front desk dashboard is for reception, admins and owners');
  const db = req.db; const now = nowIso(); const today = dayKey(now); const tomorrow = dayKey(addDays(now, 1));
  const loc = req.query.locationId ? String(req.query.locationId) : null;
  sweepNoShows(db);

  const inLoc = (x) => !loc || x.locationId === loc;
  const patientOf = (id) => db.patients.find((p) => p.id === id) || null;
  const providerOf = (id) => db.settings.providers.find((p) => p.id === id) || null;
  const branchOf = (id) => (db.settings.locations || []).find((l) => l.id === id) || null;
  const serviceOf = (id) => db.settings.visitTypes.find((v) => v.id === id)?.name || 'Visit';

  const board = arrivalsBoard(db, today, loc);
  const cancelledToday = db.appointments.filter((a) => dayKey(a.start) === today && a.status === 'cancelled' && inLoc(a));
  const row = (a, visit) => {
    const p = patientOf(a.patientId); const status = unifiedStatus(a, visit);
    const waitingFrom = visit && IN_CLINIC.includes(visit.status) && visit.status !== 'brought_back' ? (visit.arrivedAt || a.start) : null;
    return {
      id: a.id, start: a.start, end: a.end, status, appointmentStatus: a.status, visitId: visit?.id || null, visitStatus: visit?.status || null, token: visit?.token || null,
      patientId: a.patientId, patientName: fullName(p), phone: p?.phone || '', providerId: a.providerId, provider: providerOf(a.providerId)?.name || '',
      locationId: a.locationId, branch: branchOf(a.locationId)?.name || '', service: serviceOf(a.visitTypeId), source: SOURCE[a.source] || a.source || 'Front desk',
      payment: payState(a), fee: a.fee || 0, paidAmount: a.paidAmount || 0, paymentMode: a.paymentMode || null, receiptNo: a.receiptNo || null,
      handoff: visit?.handoff || null,
      waitingMin: waitingFrom ? Math.max(0, minutesBetween(waitingFrom, now)) : null,
      lateMin: !visit && ['scheduled', 'confirmed'].includes(a.status) && a.start < now ? minutesBetween(a.start, now) : 0,
      sameDay: dayKey(a.createdAt || a.start) === today, needsAttention: visit?.status === 'needs_attention',
    };
  };
  const schedule = [...board.map((x) => row(x.appointment, x.visit)), ...cancelledToday.map((a) => row(a, null))].sort((x, y) => x.start.localeCompare(y.start));
  const live = schedule.filter((s) => s.status !== 'cancelled');

  // Queue: everyone in the building who is not yet in a chair, longest wait first within "ready before not ready".
  const order = { called: 0, ready: 1, needs_attention: 2, arrived: 3, checking_in: 3 };
  const queue = live.filter((s) => s.visitId && ['arrived', 'checking_in', 'needs_attention', 'ready', 'called'].includes(s.visitStatus))
    .sort((x, y) => (order[x.visitStatus] - order[y.visitStatus]) || (y.waitingMin - x.waitingMin));

  // Money: what came in today (by the day it was paid), and every completed visit still unpaid.
  const paidToday = db.appointments.filter((a) => inLoc(a) && a.paymentStatus === 'paid' && dayKey(a.paidAt || '') === today);
  const collected = paidToday.reduce((s, a) => s + (a.paidAmount || 0), 0);
  const byMode = Object.values(paidToday.reduce((m, a) => { const k = a.paymentMode || 'Other'; (m[k] ||= { mode: k, amount: 0, count: 0 }); m[k].amount += a.paidAmount || 0; m[k].count += 1; return m; }, {})).sort((x, y) => y.amount - x.amount);
  const unpaidAll = db.appointments.filter((a) => inLoc(a) && a.status === 'completed' && a.paymentStatus === 'unpaid' && (a.fee || 0) > 0).sort((x, y) => y.start.localeCompare(x.start));
  const outstanding = unpaidAll.reduce((s, a) => s + (a.fee || 0), 0);

  // Dentists: with a patient, free, away (blocked time) or not working today.
  const dentists = db.settings.providers.filter((p) => !loc || !p.locationIds?.length || p.locationIds.includes(loc)).map((p) => {
    const mine = live.filter((s) => s.providerId === p.id);
    const inChair = mine.find((s) => s.status === 'in_chair') || null;
    const next = mine.find((s) => ['pending', 'confirmed'].includes(s.status) && s.start >= now) || mine.find((s) => ['checked_in', 'waiting'].includes(s.status)) || null;
    const block = (db.blocks || []).find((b) => b.providerId === p.id && overlaps(b.start, b.end, now, now));
    const working = (p.locationIds?.length ? p.locationIds : (db.settings.locations || []).map((l) => l.id)).some((l) => hoursOn(db, today, l));
    const state = inChair ? 'with_patient' : block ? 'away' : !working ? 'off' : 'free';
    return {
      id: p.id, name: p.name, specialty: p.specialty || p.role || '', state, awayReason: block?.reason || '', awayUntil: block?.end || null,
      now: inChair ? { patientName: inChair.patientName, token: inChair.token } : null, next: next ? { start: next.start, patientName: next.patientName } : null,
      booked: mine.length, done: mine.filter((s) => s.status === 'completed').length, waiting: mine.filter((s) => ['checked_in', 'waiting'].includes(s.status)).length,
    };
  });

  const branches = (db.settings.locations || []).filter((l) => !loc || l.id === loc);
  const chairsTotal = branches.reduce((s, l) => s + (Number(l.chairs) || 0), 0);
  const chairsInUse = live.filter((s) => s.status === 'in_chair').length;

  const tomorrowUnconfirmed = db.appointments.filter((a) => inLoc(a) && dayKey(a.start) === tomorrow && a.status === 'scheduled').sort((x, y) => x.start.localeCompare(y.start));
  const todayUnconfirmed = live.filter((s) => s.status === 'pending' && s.start >= now);
  const brief = (a) => ({ id: a.id, start: a.start, patientId: a.patientId, patientName: fullName(patientOf(a.patientId)), provider: providerOf(a.providerId)?.name || '', service: serviceOf(a.visitTypeId) });

  const recalls = db.patients.filter((p) => inLoc(p) || !p.locationId).filter((p) => p.nextRecallDue && p.nextRecallDue <= today && !db.appointments.some((a) => a.patientId === p.id && ['scheduled', 'confirmed'].includes(a.status) && a.start > now));
  const callbacks = (db.callbacks || []).filter((c) => c.status === 'open');
  const needsStaff = (db.conversations || []).filter((c) => c.status === 'needs_staff').length;
  const opening = nextOpening(db, now, loc);

  res.json({
    date: today, at: now, locationId: loc, open: isOpen(db, now, loc), opensLabel: opening ? fmtOpening(opening.at) : null,
    paymentModes: db.settings.paymentModes || ['UPI', 'Cash', 'Card'],
    kpis: {
      appointments: live.length,
      checkedIn: live.filter((s) => s.visitId).length,
      waiting: queue.length,
      completed: live.filter((s) => s.status === 'completed').length,
      noShows: live.filter((s) => s.status === 'no_show').length,
      collected, outstanding,
      newPatients: db.patients.filter((p) => (inLoc(p) || !p.locationId) && dayKey(p.createdAt || '') === today).length,
    },
    schedule, queue,
    dentists,
    chairs: { total: chairsTotal, inUse: chairsInUse, percent: chairsTotal ? Math.round((chairsInUse / chairsTotal) * 100) : 0, branches: branches.map((l) => ({ id: l.id, name: l.name, total: Number(l.chairs) || 0, inUse: live.filter((s) => s.status === 'in_chair' && s.locationId === l.id).length })) },
    upcoming: live.filter((s) => ['pending', 'confirmed'].includes(s.status) && s.start >= now).slice(0, 6),
    pendingConfirmations: { today: todayUnconfirmed.length, tomorrow: tomorrowUnconfirmed.length, items: [...todayUnconfirmed.map((s) => ({ id: s.id, start: s.start, patientId: s.patientId, patientName: s.patientName, provider: s.provider, service: s.service, day: 'today' })), ...tomorrowUnconfirmed.map((a) => ({ ...brief(a), day: 'tomorrow' }))].slice(0, 8) },
    walkIns: live.filter((s) => s.sameDay),
    missed: { late: live.filter((s) => s.lateMin >= LATE_AFTER_MIN), noShows: live.filter((s) => s.status === 'no_show') },
    payments: { collected, count: paidToday.length, byMode, outstanding, unpaid: unpaidAll.slice(0, 8).map((a) => ({ id: a.id, start: a.start, patientId: a.patientId, patientName: fullName(patientOf(a.patientId)), service: serviceOf(a.visitTypeId), amount: a.fee || 0 })), unpaidCount: unpaidAll.length },
    followUps: {
      recallsDue: recalls.length, callbacks: callbacks.length, needsStaff,
      items: [
        ...callbacks.slice(0, 4).map((c) => ({ kind: 'callback', id: c.id, title: c.contactName || fullName(patientOf(c.patientId)) || 'Unknown caller', note: c.reason || 'Call back', to: '#/callbacks' })),
        ...recalls.slice(0, 4).map((p) => ({ kind: 'recall', id: p.id, title: fullName(p), note: `Recall due ${p.nextRecallDue}`, to: `#/patients/${p.id}` })),
      ],
    },
    tasks: { open: tasksOf(db).filter((t) => t.status !== 'done').length, items: tasksOf(db).filter((t) => t.status !== 'done' || (t.doneAt || '').slice(0, 10) === now.slice(0, 10)).sort((x, y) => (x.status === 'done') - (y.status === 'done') || (y.priority === 'high') - (x.priority === 'high') || x.due.localeCompare(y.due)).slice(0, 12).map((t) => taskView(db, t)) },
    activity: db.activity.filter((x) => !loc || !x.locationId || x.locationId === loc).slice(0, 10).map((x) => ({ id: x.id, type: x.type, text: x.text, at: x.at, patientId: x.patientId || null })),
  });
});

const desk = (req) => { if (!['owner', 'admin', 'front_desk'].includes(req.role)) throw new HttpError(403, 'This is for reception, admins and owners'); };

/** Reception picks up, finishes or reopens a task a dentist asked for. */
r.patch('/tasks/:id', (req, res) => {
  desk(req);
  const t = setTaskStatus(req.db, req.params.id, String(req.body?.status || ''), { by: req.user, note: req.body?.note });
  req.store.save();
  res.json(taskView(req.db, t));
});

/** Reception's note to the dentist before they see the patient. Administrative only: no diagnosis, no treatment plan. */
r.put('/handoff/:appointmentId', (req, res) => {
  desk(req);
  const db = req.db; const a = find(db.appointments, req.params.appointmentId, 'Appointment');
  const v = db.visits.find((x) => x.appointmentId === a.id) || bad('Check the patient in before leaving a note for the dentist');
  const note = String(req.body?.note || '').trim().slice(0, 500);
  if (note.length < 2) bad('Write a short note for the dentist');
  v.handoff = { note, by: req.user, at: nowIso(), acknowledgedAt: null, acknowledgedBy: null };
  req.store.save();
  res.json(v.handoff);
});

export default r;
