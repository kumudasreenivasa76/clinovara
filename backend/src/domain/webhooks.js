/**
 * Outbound webhooks for EHR / PMS integration. Each active webhook subscribed to an event receives a
 * signed JSON POST. Deliveries are logged in `db.webhookLog`. Sending is fire-and-forget so it never
 * blocks the request that triggered it.
 */
import crypto from 'node:crypto';
import { id, nowIso } from '../lib.js';

export const EVENTS = [
  'appointment.booked', 'appointment.rescheduled', 'appointment.cancelled', 'appointment.confirmed',
  'patient.created', 'patient.updated', 'patient.arrived', 'visit.ready', 'visit.completed',
  'forms.completed', 'consent.signed', 'treatment_plan.created', 'conversation.escalated', 'communication.sent', 'payment.recorded',
  'ehr.export', 'call.ended', 'test.ping',
];

let inFlight = [];
export function emit(db, event, payload) {
  const hooks = (db.settings.integrations?.webhooks || []).filter((w) => w.active !== false && (event === 'test.ping' || !w.events?.length || w.events.includes(event)));
  if (!hooks.length) return;
  const body = JSON.stringify({ id: id('evt'), event, at: nowIso(), practice: db.settings.practice.name, data: payload });
  for (const w of hooks) {
    const entry = { id: id('whl'), webhookId: w.id, event, url: w.url, at: nowIso(), status: 'pending', responseCode: null, error: null };
    db.webhookLog.unshift(entry);
    if (db.webhookLog.length > 300) db.webhookLog.length = 300;
    const sig = w.secret ? crypto.createHmac('sha256', w.secret).update(body).digest('hex') : '';
    const p = fetch(w.url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-clinovara-event': event, 'x-clinovara-signature': sig ? `sha256=${sig}` : '' }, body, signal: AbortSignal.timeout(8000) })
      .then((res) => { entry.status = res.ok ? 'delivered' : 'failed'; entry.responseCode = res.status; })
      .catch((err) => { entry.status = 'failed'; entry.error = err.message; })
      .finally(() => { entry.completedAt = nowIso(); inFlight = inFlight.filter((x) => x !== p); });
    inFlight.push(p);
  }
}

export function pending() { return Promise.allSettled(inFlight); }
