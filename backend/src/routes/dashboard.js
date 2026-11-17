/**
 * Owner dashboard analytics: one period compared with the one before it, daily series, mixes and breakdowns.
 * Everything is derived from appointments and patients already on file; days follow the clinic's time zone.
 */
import { Router } from 'express';
import { dayKey, nowIso, addDays, HttpError } from '../lib.js';

const r = Router();
const SOURCE = { staff: 'Front desk', website: 'Website', ai: 'AI assistant', patient: 'Kiosk and portal' };
const HOURS = Array.from({ length: 12 }, (_, i) => i + 8); // 8am to 7pm
const mins = (a, b) => Math.max(0, (new Date(b) - new Date(a)) / 60000);
const hhmm = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
const sum = (xs) => xs.reduce((s, x) => s + x, 0);

r.get('/', (req, res) => {
  if (!['owner', 'admin'].includes(req.role)) throw new HttpError(403, 'Clinic-wide figures are for owners and admins');
  const db = req.db; const now = nowIso();
  const N = Math.min(90, Math.max(7, Number(req.query.days) || 30));
  const loc = req.query.locationId ? String(req.query.locationId) : null;
  const dayAt = (i) => dayKey(addDays(now, -i));
  const cur = Array.from({ length: N }, (_, i) => dayAt(N - 1 - i));
  const prev = Array.from({ length: N }, (_, i) => dayAt(2 * N - 1 - i));
  const curSet = new Set(cur); const prevSet = new Set(prev);
  const appts = db.appointments.filter((a) => !loc || a.locationId === loc);
  const patients = db.patients.filter((p) => !loc || p.locationId === loc);
  const vt = (id) => db.settings.visitTypes.find((v) => v.id === id)?.name || 'Other';
  const hours = db.settings.practice?.hours || {};
  const dayMinutes = (day) => { const h = hours[['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(`${day}T12:00:00`).getDay()]]; return h ? hhmm(h[1]) - hhmm(h[0]) : 0; };
  const providers = db.settings.providers.filter((p) => p.role === 'Dentist' || p.role === 'Hygienist');

  const inSet = (set) => (a) => set.has(dayKey(a.start));
  const metrics = (set, days) => {
    const list = appts.filter(inSet(set)); const live = list.filter((a) => a.status !== 'cancelled');
    const completed = list.filter((a) => a.status === 'completed'); const noShows = list.filter((a) => a.status === 'no_show');
    const paid = appts.filter((a) => a.paymentStatus === 'paid' && a.paidAt && set.has(dayKey(a.paidAt)));
    const revenue = sum(paid.map((a) => a.paidAmount || 0));
    const booked = sum(live.filter((a) => ['completed', 'arrived', 'scheduled', 'confirmed', 'in_chair'].includes(a.status)).map((a) => mins(a.start, a.end)));
    const open = sum(days.map(dayMinutes)) * Math.max(1, providers.length);
    return {
      appointments: live.length, completed: completed.length, noShows: noShows.length, cancellations: list.filter((a) => a.status === 'cancelled').length, revenue,
      avgTicket: paid.length ? Math.round(revenue / paid.length) : 0,
      newPatients: patients.filter((p) => p.createdAt && set.has(dayKey(p.createdAt))).length,
      noShowRate: completed.length + noShows.length ? Math.round((noShows.length / (completed.length + noShows.length)) * 100) : 0,
      utilisation: open ? Math.min(100, Math.round((booked / open) * 100)) : 0,
    };
  };
  const now_ = metrics(curSet, cur); const before = metrics(prevSet, prev);

  const series = cur.map((day) => {
    const list = appts.filter((a) => dayKey(a.start) === day);
    return { day, appointments: list.filter((a) => a.status !== 'cancelled').length, completed: list.filter((a) => a.status === 'completed').length, noShows: list.filter((a) => a.status === 'no_show').length,
      revenue: sum(appts.filter((a) => a.paymentStatus === 'paid' && a.paidAt && dayKey(a.paidAt) === day).map((a) => a.paidAmount || 0)),
      newPatients: patients.filter((p) => p.createdAt && dayKey(p.createdAt) === day).length };
  });

  const period = appts.filter(inSet(curSet));
  const statusMix = ['completed', 'scheduled', 'confirmed', 'arrived', 'no_show', 'cancelled'].map((s) => ({ status: s, count: period.filter((a) => a.status === s).length })).filter((x) => x.count);
  const treat = new Map();
  for (const a of period.filter((x) => x.status !== 'cancelled')) { const k = vt(a.visitTypeId); const e = treat.get(k) || { name: k, count: 0, revenue: 0 }; e.count += 1; if (a.paymentStatus === 'paid') e.revenue += a.paidAmount || 0; treat.set(k, e); }
  const paidPeriod = appts.filter((a) => a.paymentStatus === 'paid' && a.paidAt && curSet.has(dayKey(a.paidAt)));
  const modes = new Map(); for (const a of paidPeriod) { const k = a.paymentMode || 'Other'; const e = modes.get(k) || { mode: k, amount: 0, count: 0 }; e.amount += a.paidAmount || 0; e.count += 1; modes.set(k, e); }
  const src = new Map(); for (const a of period.filter((x) => x.status !== 'cancelled')) { const k = SOURCE[a.source] || 'Other'; src.set(k, (src.get(k) || 0) + 1); }
  const heat = Array.from({ length: 7 }, () => HOURS.map(() => 0));
  for (const a of period.filter((x) => x.status !== 'cancelled')) { const t = new Date(a.start); const h = t.getHours() - 8; if (h >= 0 && h < HOURS.length) heat[t.getDay()][h] += 1; }

  const returningBase = period.filter((a) => a.status !== 'cancelled');
  const returning = returningBase.filter((a) => appts.some((x) => x.patientId === a.patientId && x.status === 'completed' && x.start < a.start)).length;
  const team = providers.map((p) => {
    const mine = period.filter((a) => a.providerId === p.id); const done = mine.filter((a) => a.status === 'completed');
    const booked = sum(mine.filter((a) => a.status !== 'cancelled' && a.status !== 'no_show').map((a) => mins(a.start, a.end))); const open = sum(cur.map(dayMinutes));
    return { id: p.id, name: p.name, role: p.role, appointments: mine.filter((a) => a.status !== 'cancelled').length, completed: done.length, noShows: mine.filter((a) => a.status === 'no_show').length,
      revenue: sum(appts.filter((a) => a.providerId === p.id && a.paymentStatus === 'paid' && a.paidAt && curSet.has(dayKey(a.paidAt))).map((a) => a.paidAmount || 0)), utilisation: open ? Math.min(100, Math.round((booked / open) * 100)) : 0 };
  }).sort((a, b) => b.revenue - a.revenue);

  const month = dayKey(now).slice(0, 7); const dom = Number(dayKey(now).slice(8)); const dim = new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate();
  const monthRevenue = sum(appts.filter((a) => a.paymentStatus === 'paid' && a.paidAt && dayKey(a.paidAt).startsWith(month)).map((a) => a.paidAmount || 0));
  const target = Number(db.settings.goals?.monthlyRevenue) || 0;

  res.json({
    days: N, from: cur[0], to: cur[N - 1], now: now_, previous: before, series, statusMix,
    treatments: [...treat.values()].sort((a, b) => b.count - a.count).slice(0, 7),
    paymentModes: [...modes.values()].sort((a, b) => b.amount - a.amount),
    sources: [...src.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
    heat: { hours: HOURS, rows: heat, days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] },
    patients: { total: patients.length, newInPeriod: now_.newPatients, returningPercent: returningBase.length ? Math.round((returning / returningBase.length) * 100) : 0 },
    team,
    goal: { month, target, collected: monthRevenue, dayOfMonth: dom, daysInMonth: dim, projected: dom ? Math.round((monthRevenue / dom) * dim) : 0 },
    generatedAt: now,
  });
});

export default r;
