/**
 * In-app assistant for staff. It answers from the clinic's own data and points to the screen that does the job.
 * Rule-based: no AI key is needed, and every answer is something the app can verify. Dentists only see their own
 * patients' schedule; revenue and clinic-wide figures are limited to owners and admins.
 */
import { Router } from 'express';
import { dayKey, nowIso, fullName } from '../lib.js';
import { nextSlots } from '../domain/scheduling.js';
import { computeInsights } from '../domain/insights.js';
import { alertsFor } from './doctor.js';
import { aiMode } from '../domain/frontDesk.js';
import { claudeAsk, resolveAction, proposeAction } from '../domain/assistantAI.js';
import { growth } from '../domain/growth.js';
import { GOALS, segmentPatients } from '../domain/marketing.js';

const r = Router();

const HOW_TO = [
  { re: /(book|make|create|schedule).*(appointment|visit)|new appointment/, text: 'Open Schedule, click an empty slot or "Book appointment", choose the patient, treatment, dentist and time. The patient gets a confirmation and the forms link.', to: '#/schedule', label: 'Open Schedule' },
  { re: /(add|register|new).*(patient)|import patients/, text: 'Open Patients and click "Add patient". To bring patients from another system, use "Import CSV" on the same page.', to: '#/patients', label: 'Open Patients' },
  { re: /(check.?in|arrive|arrival|walk.?in)/, text: 'Patients check in at the kiosk, or mark them "Arrived" in Arrivals and queue. The waiting-room display shows their token.', to: '#/dashboard', label: 'Open the queue' },
  { re: /(payment|collect|receipt|pay)/, text: 'After a visit is completed, open it in Arrivals and queue and record the amount and mode. A receipt number is created automatically.', to: '#/dashboard', label: 'Open the queue' },
  { re: /(reminder|remind)/, text: 'Reminders due now are listed on the Schedule page. "Send all" sends each one once, in the patient\'s language.', to: '#/schedule', label: 'Open Schedule' },
  { re: /(cancel|reschedule|move).*(appointment|visit)?/, text: 'Open the appointment in Schedule and choose Reschedule or Cancel. Cancelling offers the slot to the next matching person on the waitlist.', to: '#/schedule', label: 'Open Schedule' },
  { re: /(hours|timing|holiday|closed|open)/, text: 'Working hours and chairs are per branch under Settings, Branches. Holidays are in the same place.', to: '#/settings', label: 'Open Settings' },
  { re: /(add|new|invite).*(dentist|doctor|staff|team|receptionist|hygienist)/, text: 'Settings has the dentist list, and the Team tab sends invitations with a role. Invited people land on the right home screen for their role.', to: '#/settings', label: 'Open Settings' },
  { re: /(fee|price|charge|cost)/, text: 'Visit-type fees and procedure fees are in Settings. The assistant and the website quote from these numbers.', to: '#/settings', label: 'Open Settings' },
  { re: /(export|download).*(patient|data)/, text: 'Patients, "Export CSV" downloads everyone on file.', to: '#/patients', label: 'Open Patients' },
  { re: /(whatsapp|sms|email).*(connect|set|enable|work)|provider/, text: 'Connections are listed under Settings, Integrations, with what each one needs to switch on.', to: '#/settings?tab=integrations', label: 'Open Integrations' },
];

const money = (db, n) => `${db.settings.locale?.currencySymbol || '₹'}${Number(n || 0).toLocaleString(db.settings.locale?.numberLocale || 'en-IN')}`;
const clock = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
const dayWord = (iso) => (dayKey(iso) === dayKey(nowIso()) ? 'today' : new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }));
const patientOf = (db, a) => db.patients.find((p) => p.id === a.patientId);
const vtName = (db, a) => db.settings.visitTypes.find((v) => v.id === a.visitTypeId)?.name || 'Visit';
const provName = (db, a) => db.settings.providers.find((p) => p.id === a.providerId)?.name || '';
const line = (db, a, withDentist) => ({ title: `${clock(a.start)}  ${patientOf(db, a) ? fullName(patientOf(db, a)) : 'Walk-in'}`, sub: `${vtName(db, a)}${withDentist ? ` · ${provName(db, a)}` : ''} · ${a.status.replace('_', ' ')}`, href: `#/patients/${a.patientId}` });
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9ऀ-෿\s']/g, ' ').replace(/\s+/g, ' ').trim();

function myAppointments(req, date) {
  const mine = req.membership?.providerId && ['dentist', 'hygienist'].includes(req.role) ? req.membership.providerId : null;
  return req.db.appointments.filter((a) => dayKey(a.start) === date && !['cancelled'].includes(a.status) && (!mine || a.providerId === mine)).sort((a, b) => a.start.localeCompare(b.start));
}
function findPatients(db, text) {
  const words = norm(text).split(' ').filter((w) => w.length > 1 && !['patient', 'find', 'show', 'about', 'details', 'for', 'the', 'of', 'me', 'info', 'tell', 'who', 'is', 'search', 'lookup', 'look', 'up'].includes(w));
  if (!words.length) return [];
  return db.patients.filter((p) => { const hay = norm(`${p.firstName} ${p.lastName} ${p.phone}`); return words.every((w) => hay.includes(w)); }).slice(0, 5);
}

function ruleAsk(req, res) {
  const db = req.db; const text = String(req.body?.message || '').trim().slice(0, 400);
  const q = norm(text); const today = dayKey(nowIso()); const manager = ['owner', 'admin'].includes(req.role);
  const dentistOnly = ['dentist', 'hygienist'].includes(req.role);
  const out = (reply, items, suggestions) => res.json({ reply, items: items || [], suggestions: suggestions || [] });
  if (!q) return out('Ask about today\'s schedule, a patient, open slots, or how to do something in the app.');

  if (/\b(next|who'?s next|up next)\b/.test(q) && /\b(patient|who|up|next)\b/.test(q) && !/slot|available|free/.test(q)) {
    const list = myAppointments(req, today).filter((a) => ['scheduled', 'confirmed', 'arrived', 'checking_in', 'ready'].includes(a.status));
    const a = list.find((x) => new Date(x.start) > new Date(Date.now() - 30 * 60000)) || list[0];
    if (!a) return out(dentistOnly ? 'You have no more patients today.' : 'No more appointments today.');
    const p = patientOf(db, a); const alerts = p ? alertsFor(db, p) : [];
    return out(`${p ? fullName(p) : 'Walk-in'} at ${clock(a.start)}, ${vtName(db, a)}${dentistOnly ? '' : ` with ${provName(db, a)}`}.${alerts.length ? ` ${alerts.length} alert${alerts.length > 1 ? 's' : ''} on file.` : ''}`, alerts.map((x) => ({ title: x.text || x.label || String(x), sub: `${x.level || 'note'} alert`, href: `#/patients/${a.patientId}` })).concat([{ title: 'Open record', sub: '', href: `#/patients/${a.patientId}` }]));
  }

  // Questions that start like "how do I ..." are explanations, never lookups.
  if (/^(how|where|what is|can i|can you|help me|i want to|i need to)/.test(q)) for (const h of HOW_TO) if (h.re.test(q)) return out(h.text, [{ title: h.label, sub: '', href: h.to }]);

  // Patient lookup: "patient rohan", "find meera krishnan", "who is rohan"
  if (/^(find|show|search|lookup|look up|who is|patient|about|details|tell me about)\b/.test(q)) {
    const hits = findPatients(db, q);
    if (hits.length === 1) {
      const p = hits[0]; const alerts = alertsFor(db, p);
      const appts = db.appointments.filter((a) => a.patientId === p.id && a.status !== 'cancelled').sort((a, b) => a.start.localeCompare(b.start));
      const last = [...appts].reverse().find((a) => a.start < nowIso()); const next = appts.find((a) => a.start >= nowIso());
      const unpaid = appts.filter((a) => a.status === 'completed' && a.paymentStatus !== 'paid').length;
      const bits = [`${fullName(p)}${p.dob ? `, born ${p.dob}` : ''}`, p.phone ? `Phone ${p.phone}` : null, last ? `Last visit ${dayWord(last.start)} (${vtName(db, last)})` : 'No previous visits', next ? `Next appointment ${dayWord(next.start)} at ${clock(next.start)}` : 'Nothing booked', unpaid ? `${unpaid} unpaid visit${unpaid > 1 ? 's' : ''}` : null].filter(Boolean);
      return out(bits.join('. ') + '.', [...alerts.map((a) => ({ title: a.text || a.label || String(a), sub: `${a.level || 'note'} alert`, href: `#/patients/${p.id}` })), { title: 'Open full record', sub: '', href: `#/patients/${p.id}` }]);
    }
    if (hits.length > 1) return out(`${hits.length} patients match. Which one?`, hits.map((p) => ({ title: fullName(p), sub: p.phone || '', href: `#/patients/${p.id}` })));
    return out('No patient matches that. Try the first name, last name or phone number.');
  }

  if (/(slot|availab|free|open|earliest|opening)/.test(q) && !/(how do|how to)/.test(q)) {
    const vts = db.settings.visitTypes;
    const vt = vts.find((v) => q.includes(norm(v.name).split(' ')[0]) || (v.keywords || []).some((k) => k.length > 3 && q.includes(norm(k)))) || vts.find((v) => v.id === 'vt_newpatient') || vts[0];
    const providerId = dentistOnly ? req.membership?.providerId || null : null;
    const slots = nextSlots(db, { visitTypeId: vt.id, providerId, limit: 6 });
    if (!slots.length) return out(`No open slots found for ${vt.name} in the next 3 weeks.`);
    return out(`Next openings for ${vt.name}:`, slots.map((s) => ({ title: `${dayWord(s.start)}  ${clock(s.start)}`, sub: provName(db, { providerId: s.providerId }), href: '#/schedule' })), ['Open slots for a cleaning', 'Open slots for an urgent visit']);
  }

  // Marketing and growth: results, opportunities, and drafting a campaign (a draft only, with confirmation).
  if (/(draft|create|start|write|send|make).*(recall|reminder|check.?up|win.?back|reactivat|inactive|campaign|nudge|unscheduled|birthday|greeting)/.test(q)) {
    if (dentistOnly) return out('Campaigns are set up by the front desk or an admin.');
    const pick = /(win.?back|reactivat|inactive)/.test(q) ? ['reactivation', 'inactive_12m'] : /(unscheduled|nudge|treatment)/.test(q) ? ['unscheduled', 'unscheduled_treatment'] : /(birthday|greeting)/.test(q) ? ['festival', 'birthday_month'] : ['recall', 'overdue_recall'];
    const n = segmentPatients(db, pick[1]).length;
    if (!n) return out(`No opted-in patients match "${GOALS.find((g) => g.id === pick[0]).name}" right now.`);
    req.__actions = [];
    proposeAction(req, 'campaign', { goal: pick[0], segment: pick[1] }, `Create a draft "${GOALS.find((g) => g.id === pick[0]).name}" message for ${n} patient${n === 1 ? '' : 's'}. It will need approval before anything is sent`);
    return res.json({ reply: `${n} patient${n === 1 ? '' : 's'} match. I can prepare a draft message for them. It will not be sent until an owner approves it.`, items: [], actions: req.__actions, suggestions: [] });
  }
  if (/(marketing|growth|campaign|opportunit|bookings from|review request|who should i (message|contact))/.test(q) && !/how (do|to)/.test(q)) {
    if (!manager) return out('Marketing results are visible to owners and admins.');
    const g = growth(db, { days: 30 });
    const opp = g.opportunities.map((o) => ({ title: `${o.count} ${o.title.toLowerCase()}`, sub: o.hint, href: '#/marketing' }));
    return out(`Last 30 days: ${g.now.messages} message${g.now.messages === 1 ? '' : 's'} sent to ${g.now.reached} patient${g.now.reached === 1 ? '' : 's'}, ${g.now.bookings} booking${g.now.bookings === 1 ? '' : 's'} followed within ${g.attributionDays} days (${money(db, g.now.revenue)} collected), ${g.now.reviewRequests} review request${g.now.reviewRequests === 1 ? '' : 's'}.${opp.length ? ' Worth messaging now:' : ''}`, [...opp, { title: 'Open growth', sub: '', href: '#/marketing' }], opp.length ? ['Draft a recall reminder', 'Draft a win-back message'] : []);
  }

  if (/(schedule|appointments?|today|tomorrow|agenda|my day|list)/.test(q) && !/(how|cancel|reschedule|book|make|create)/.test(q)) {
    const date = /tomorrow/.test(q) ? dayKey(new Date(Date.now() + 864e5).toISOString()) : today;
    const list = myAppointments(req, date);
    if (!list.length) return out(`No appointments ${date === today ? 'today' : 'tomorrow'}.`);
    return out(`${list.length} appointment${list.length > 1 ? 's' : ''} ${date === today ? 'today' : 'tomorrow'}${list.filter((a) => a.status === 'completed').length ? `, ${list.filter((a) => a.status === 'completed').length} finished` : ''}.`, list.map((a) => line(db, a, !dentistOnly)));
  }

  if (/(waiting|queue|in the room|waiting room)/.test(q)) {
    const waiting = db.visits.filter((v) => dayKey(v.arrivedAt) === today && ['arrived', 'checking_in', 'needs_attention', 'ready', 'called'].includes(v.status));
    return out(waiting.length ? `${waiting.length} in the waiting room. Longest wait ${Math.max(...waiting.map((v) => Math.round((Date.now() - new Date(v.arrivedAt)) / 60000)))} minutes.` : 'No one is waiting.', [{ title: 'Open the live queue', sub: '', href: '#/dashboard' }]);
  }

  if (/(unpaid|owe|outstanding|collect|balance)/.test(q)) {
    const list = db.appointments.filter((a) => a.status === 'completed' && a.paymentStatus !== 'paid');
    return out(list.length ? `${list.length} completed visit${list.length > 1 ? 's' : ''} not yet paid, ${money(db, list.reduce((s, a) => s + (a.fee || 0), 0))} in total.` : 'Every completed visit is paid.', list.slice(0, 6).map((a) => ({ title: patientOf(db, a) ? fullName(patientOf(db, a)) : 'Walk-in', sub: `${vtName(db, a)} · ${money(db, a.fee)}`, href: '#/dashboard' })));
  }

  if (/(revenue|collected|income|earn|money|sales)/.test(q)) {
    if (!manager) return out('Revenue figures are visible to owners and admins.');
    const i = computeInsights(db, { days: /month|30/.test(q) ? 30 : 7 });
    return out(`Collected ${money(db, i.revenue.collected)} in the last ${i.windowDays} days, ${money(db, i.revenue.today)} today. Outstanding after completed visits: ${money(db, i.revenue.outstanding)}.`, [{ title: 'Open insights', sub: '', href: '#/insights' }]);
  }

  if (/(no.?show|cancellation|missed)/.test(q)) {
    if (!manager) return out('Clinic-wide figures are visible to owners and admins.');
    const i = computeInsights(db, { days: 30 });
    return out(`Last 30 days: ${i.cancellations.noShows} no-shows and ${i.cancellations.total} cancellations (${i.cancellations.late} late). Combined rate ${i.cancellations.rate ?? 0}%.`, [{ title: 'Open insights', sub: '', href: '#/insights' }]);
  }

  if (/(attention|todo|to do|task|pending|what.*(should|need)|open items|inbox|message|callback)/.test(q)) {
    const needsStaff = db.conversations.filter((c) => c.status === 'needs_staff').length;
    const callbacks = (db.callbacks || []).filter((c) => c.status === 'open' || !c.status).length;
    const unpaid = db.appointments.filter((a) => a.status === 'completed' && a.paymentStatus !== 'paid').length;
    const items = [needsStaff && { title: `${needsStaff} patient message${needsStaff > 1 ? 's' : ''} waiting`, sub: 'Front desk inbox', href: '#/inbox' }, callbacks && { title: `${callbacks} callback${callbacks > 1 ? 's' : ''} to make`, sub: 'Callbacks', href: '#/callbacks' }, unpaid && { title: `${unpaid} unpaid visit${unpaid > 1 ? 's' : ''}`, sub: 'Arrivals and queue', href: '#/dashboard' }].filter(Boolean);
    return out(items.length ? 'Open items:' : 'No open items right now.', items);
  }

  for (const h of HOW_TO) if (h.re.test(q)) return out(h.text, [{ title: h.label, sub: '', href: h.to }]);

  if (/^(hi|hello|hey|help|what can you do)/.test(q)) return out('I can look up today\'s schedule, a patient\'s details, open slots, unpaid visits and open items, and explain how to do common tasks.', [], ['Today\'s schedule', 'Who is next?', 'Open slots this week', 'What needs attention?']);
  return out('I can answer questions about today\'s schedule, a patient, open slots, unpaid visits and open items, or explain how to do a task. Try one of these.', [], ['Today\'s schedule', 'Who is next?', 'Open slots this week', 'How do I add a patient?']);
}

/** Claude answers when an API key is configured; the rule engine above is the fallback, so the assistant never goes dark. */
r.post('/ask', async (req, res) => {
  if (aiMode() === 'claude') {
    try { return res.json(await claudeAsk(req, { history: Array.isArray(req.body?.history) ? req.body.history : [] })); }
    catch (e) { console.error('[assistant] Claude unavailable, using rules:', e.message); }
  }
  return ruleAsk(req, res);
});

/** What the assistant says first: today in a few lines and the one or two things worth doing next, from live data and per role. */
r.get('/brief', (req, res) => {
  const db = req.db; const today = dayKey(nowIso()); const manager = ['owner', 'admin'].includes(req.role); const dentistOnly = ['dentist', 'hygienist'].includes(req.role);
  const hour = new Date().getHours(); const first = String(req.user || '').replace(/^(dr|mr|mrs|ms)\.?\s+/i, '').split(' ')[0];
  const hello = `${hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'}${first ? `, ${first}` : ''}.`;
  const own = dentistOnly ? req.membership?.providerId : null;
  const todays = db.appointments.filter((a) => dayKey(a.start) === today && a.status !== 'cancelled' && (!own || a.providerId === own));
  const done = todays.filter((a) => a.status === 'completed').length;
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const lines = [todays.length ? `${plural(todays.length, 'appointment')} ${dentistOnly ? 'on your list' : 'today'}, ${done} finished.` : `No appointments ${dentistOnly ? 'on your list' : 'booked'} today.`];
  const suggestions = [];
  if (dentistOnly) {
    const next = todays.filter((a) => ['scheduled', 'confirmed', 'arrived', 'checking_in', 'ready'].includes(a.status)).sort((a, b) => a.start.localeCompare(b.start))[0];
    if (next) { const pt = patientOf(db, next); lines.push(`Next: ${pt ? fullName(pt) : 'Walk-in'} at ${clock(next.start)}.`); suggestions.push('Who is next?'); }
    suggestions.push('My schedule today');
  } else {
    const waitingMsgs = db.conversations.filter((c) => c.status === 'needs_staff').length;
    const unpaid = db.appointments.filter((a) => a.status === 'completed' && a.paymentStatus !== 'paid').length;
    if (waitingMsgs) lines.push(`${plural(waitingMsgs, 'patient message')} waiting for staff.`);
    if (unpaid) lines.push(`${plural(unpaid, 'completed visit')} not yet paid.`);
    const tomorrow = dayKey(new Date(Date.now() + 864e5).toISOString());
    const toConfirm = db.appointments.filter((a) => dayKey(a.start) === tomorrow && a.status === 'scheduled').length;
    if (toConfirm) lines.push(`${plural(toConfirm, 'appointment')} tomorrow still to confirm.`);
    if (manager) {
      const pending = (db.settings.marketingQueue || []).filter((x) => x.status === 'pending_approval').length + (db.settings.marketingCampaigns || []).filter((x) => x.status === 'pending_approval').length;
      if (pending) lines.push(`${plural(pending, 'marketing item')} waiting for your approval.`);
      const top = growth(db, { days: 30 }).opportunities[0];
      if (top) { lines.push(`${top.count} patient${top.count === 1 ? ' is' : 's are'} worth a message: ${top.title.toLowerCase()}.`); suggestions.push(top.goal === 'recall' ? 'Draft a recall reminder' : top.goal === 'reactivation' ? 'Draft a win-back message' : top.goal === 'unscheduled' ? 'Draft a treatment nudge' : 'Draft a birthday greeting'); }
      suggestions.push('Marketing results');
    }
    suggestions.push("Today's schedule", 'What needs attention?');
  }
  res.json({ greeting: hello, lines, suggestions: [...new Set(suggestions)].slice(0, 4), count: Math.max(0, lines.length - 1) });
});

/** Confirm or dismiss an action the assistant proposed. */
r.post('/action', (req, res) => {
  res.json(resolveAction(req, String(req.body?.actionId || ''), req.body?.decision === 'confirm' ? 'confirm' : 'dismiss'));
});

export default r;
