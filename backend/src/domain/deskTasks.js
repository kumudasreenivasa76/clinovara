/**
 * Tasks a dentist hands to reception, and notes reception hands to a dentist. Each task has an owner,
 * a priority, a due date, the patient and appointment it is about, a status and a history of who did
 * what. Reception works them from the front desk dashboard; the dentist sees them close.
 */
import { id, nowIso, dayKey, bad, find, fullName, log } from '../lib.js';

export const TASK_TYPES = {
  book_next: 'Schedule next appointment', callback: 'Call patient back', reschedule: 'Reschedule appointment', reminder: 'Send patient a reminder',
  fee_query: 'Answer a fee or availability question', missing_docs: 'Request missing documents', clarification: 'Clarify pre-visit form with patient',
  checkout: 'Checkout instruction', delay: 'Dentist running late', other: 'Other request',
};
export const STATUSES = ['pending', 'in_progress', 'done'];

export const tasksOf = (db) => (db.deskTasks ||= []);

export function addTask(db, { type, title, description = '', patientId = null, appointmentId = null, providerId = null, priority = 'normal', due = null, by = 'Staff' }) {
  if (!TASK_TYPES[type]) bad('Unknown task type');
  const now = nowIso();
  const t = {
    id: id('tsk'), type, title: String(title || TASK_TYPES[type]).slice(0, 120), description: String(description || '').slice(0, 500),
    patientId, appointmentId, providerId, assignedTo: 'reception', priority: priority === 'high' ? 'high' : 'normal',
    due: /^\d{4}-\d{2}-\d{2}$/.test(String(due || '')) ? due : dayKey(now), status: 'pending', createdAt: now, createdBy: by, seenByDentist: false,
    history: [{ at: now, by, action: 'created' }],
  };
  tasksOf(db).unshift(t);
  const who = patientId ? fullName(db.patients.find((p) => p.id === patientId)) : null;
  log(db, 'task', `${by} asked reception: ${t.title}${who ? ` (${who})` : ''}`, { patientId, appointmentId });
  return t;
}

export function setTaskStatus(db, taskId, status, { by = 'Staff', note = '' } = {}) {
  const t = find(tasksOf(db), taskId, 'Task');
  if (!STATUSES.includes(status)) bad('Unknown task status');
  const now = nowIso();
  t.status = status; t.updatedAt = now;
  if (status === 'done') { t.doneAt = now; t.doneBy = by; t.seenByDentist = false; } else { t.doneAt = null; t.doneBy = null; }
  if (note) t.resolution = String(note).slice(0, 300);
  t.history.push({ at: now, by, action: status === 'done' ? 'completed' : status === 'in_progress' ? 'started' : 'reopened', note: note ? String(note).slice(0, 300) : undefined });
  return t;
}

export function taskView(db, t) {
  const p = t.patientId ? db.patients.find((x) => x.id === t.patientId) : null;
  const a = t.appointmentId ? db.appointments.find((x) => x.id === t.appointmentId) : null;
  const prov = t.providerId ? db.settings.providers.find((x) => x.id === t.providerId) : null;
  return { ...t, typeLabel: TASK_TYPES[t.type], patientName: p ? fullName(p) : null, patientPhone: p?.phone || null, appointmentStart: a?.start || null, providerName: prov?.name || null, overdue: t.status !== 'done' && t.due < dayKey(nowIso()) };
}
