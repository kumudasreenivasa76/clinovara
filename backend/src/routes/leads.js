/**
 * Demo-call requests from the public website. These belong to the platform (the company selling Clinovara), not to any clinic,
 * so they are stored on the platform record. If email is configured the team is notified and the requester gets the agenda.
 */
import { Router } from 'express';
import { id, nowIso, bad, HttpError, useTimezone, DEFAULT_TZ } from '../lib.js';
import { normEmail } from '../domain/auth.js';
import { mailConfigured, sendEmail } from '../domain/mailer.js';
import { rateLimit } from '../lib-ratelimit.js';

const r = Router();
const SLOT_TIMES = [[11, 0], [14, 30], [17, 0]]; // call times in India Standard Time
const MAX_PER_SLOT = 2;
const SIZES = ['Just me', '2 to 3 dentists', '4 to 8 dentists', '9 or more dentists', 'Several branches'];

export const AGENDA = [
  ['5 min', 'Your clinic today', 'How patients book, check in and get reminded now, and where time is lost.'],
  ['10 min', 'Live walkthrough', 'A patient message becomes a booking, the kiosk check-in, the dentist\'s screen, and payment.'],
  ['5 min', 'Growth and marketing', 'Recall reminders, review requests and what each campaign led to, with an owner approving every message.'],
  ['5 min', 'Setup and pricing', 'Importing your patients, going live in about ten minutes, and what it costs for a clinic your size.'],
  ['5 min', 'Your questions', 'Data protection, WhatsApp, your current software and anything else.'],
];

/** Wall-clock IST time for a calendar day, as an instant. The process zone is set to IST around the call. */
function slotsFor(platform, now = new Date()) {
  useTimezone(DEFAULT_TZ);
  const taken = new Map();
  for (const l of platform.db.leads || []) if (l.slot && l.status !== 'cancelled') taken.set(l.slot, (taken.get(l.slot) || 0) + 1);
  const out = []; const day = new Date(now);
  for (let n = 0; n < 21 && out.length < 12 * SLOT_TIMES.length; n++) {
    const d = new Date(day.getFullYear(), day.getMonth(), day.getDate() + n);
    if ([0, 6].includes(d.getDay())) continue; // weekdays only
    for (const [h, m] of SLOT_TIMES) {
      const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0, 0);
      if (at.getTime() < now.getTime() + 3 * 3600000) continue; // at least three hours' notice
      const iso = at.toISOString();
      out.push({ start: iso, available: (taken.get(iso) || 0) < MAX_PER_SLOT });
    }
  }
  return out.slice(0, 15);
}

r.get('/slots', (req, res) => res.json({ tz: DEFAULT_TZ, minutes: 30, slots: slotsFor(req.registry.platform), agenda: AGENDA, sizes: SIZES }));

r.post('/demo', rateLimit({ name: 'lead', windowMs: 60 * 60000, max: 6 }), async (req, res) => {
  const platform = req.registry.platform; const b = req.body || {};
  const name = String(b.name || '').trim().slice(0, 80); const clinic = String(b.clinic || '').trim().slice(0, 100);
  const email = normEmail(b.email); const phone = String(b.phone || '').replace(/[^\d+]/g, '').slice(0, 16);
  if (!name) bad('Please enter your name');
  if (!clinic) bad('Please enter your clinic name');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) bad('Please enter a valid email address');
  if (phone.replace(/\D/g, '').length < 10) bad('Please enter a phone number with at least 10 digits');
  const slot = b.slot ? new Date(b.slot) : null;
  let chosen = null;
  if (slot) {
    chosen = slotsFor(platform).find((x) => new Date(x.start).getTime() === slot.getTime());
    if (!chosen) throw new HttpError(400, 'That time is no longer offered. Please pick another.');
    if (!chosen.available) throw new HttpError(409, 'That time has just been taken. Please pick another.');
  }
  const lead = { id: id('lead'), createdAt: nowIso(), status: 'new', name, clinic, email, phone, city: String(b.city || '').slice(0, 60), size: SIZES.includes(b.size) ? b.size : '', software: String(b.software || '').slice(0, 80), message: String(b.message || '').slice(0, 600), slot: chosen ? chosen.start : null, source: String(b.source || 'website').slice(0, 40) };
  platform.db.leads.push(lead); platform.save();
  console.log(`[lead] demo request from ${name} (${clinic}) ${lead.slot ? 'for ' + lead.slot : 'no time chosen'}`);
  const when = lead.slot ? new Date(lead.slot).toLocaleString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZone: DEFAULT_TZ }) + ' IST' : 'a time we will agree by email';
  if (mailConfigured()) {
    const agendaText = AGENDA.map(([t, h, d]) => `${t}: ${h}. ${d}`).join('\n');
    const notify = [];
    notify.push(sendEmail({ to: email, subject: 'Your Clinovara demo call', text: `Hi ${name},\n\nThanks for asking for a demo. We have you down for ${when} (30 minutes).\n\nAgenda\n${agendaText}\n\nIt helps if you have your current appointment book or software open. If the time does not work, just reply to this email.\n\nClinovara` }).catch(() => {}));
    if (process.env.SALES_EMAIL) notify.push(sendEmail({ to: process.env.SALES_EMAIL, subject: `Demo request: ${clinic}`, text: `${name} (${clinic}), ${email}, ${phone}\n${lead.city} · ${lead.size} · uses: ${lead.software || 'not said'}\nWants: ${when}\n${lead.message}` }).catch(() => {}));
    await Promise.all(notify);
  }
  res.status(201).json({ ok: true, when, confirmedByEmail: mailConfigured(), agenda: AGENDA });
});

export default r;
