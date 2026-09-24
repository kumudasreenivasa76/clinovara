/**
 * Chair-time estimation. Uses the clinic's own history first (arrival → done timings per visit type and per
 * dentist), falling back to dental procedure norms. Every estimate returns a breakdown so staff can see why.
 */
import { minutesBetween, nowIso, addDays } from '../lib.js';

/** Typical chair time in minutes for common dental procedures (keyword → minutes). */
export const PROCEDURE_NORMS = [
  ['scaling', 40], ['cleaning', 40], ['polish', 20], ['check-up', 20], ['checkup', 20], ['consult', 25], ['new patient', 45], ['opg', 10], ['x-ray', 10],
  ['composite', 40], ['filling', 40], ['gic', 30], ['sealant', 20], ['fluoride', 15],
  ['root canal', 75], ['rct', 75], ['pulpotomy', 45], ['re-rct', 90],
  ['crown prep', 60], ['crown', 60], ['bridge', 90], ['veneer', 60], ['post and core', 45], ['cementation', 30],
  ['extraction', 40], ['wisdom', 60], ['surgical', 75], ['impaction', 90],
  ['implant', 90], ['sinus lift', 120], ['bone graft', 90],
  ['braces', 45], ['aligner', 30], ['adjustment', 20], ['wire change', 20], ['bonding', 60], ['debond', 45],
  ['whitening', 60], ['bleaching', 60], ['denture', 45], ['night guard', 30], ['impression', 25],
  ['gum surgery', 60], ['flap', 75], ['curettage', 45], ['suture removal', 15], ['review', 15], ['follow-up', 20], ['urgent', 30], ['pain', 30], ['child', 30],
];

function pct(xs, p) { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; }
const round5 = (n) => Math.max(10, Math.round(n / 5) * 5);

/** Observed chair time per visit type and per provider from completed visits. */
export function observed(db, { days = 180 } = {}) {
  const since = addDays(nowIso(), -days);
  const byType = {}; const byProv = {}; const all = [];
  for (const v of db.visits) {
    if (!v.broughtBackAt || !v.doneAt || v.arrivedAt < since) continue;
    const a = db.appointments.find((x) => x.id === v.appointmentId); if (!a) continue;
    const chair = minutesBetween(v.broughtBackAt, v.doneAt); if (chair < 5 || chair > 300) continue;
    (byType[a.visitTypeId] ||= []).push(chair); (byProv[a.providerId] ||= []).push({ chair, visitTypeId: a.visitTypeId }); all.push(chair);
  }
  return { byType, byProv, all };
}

function normsFor(text) {
  const t = String(text || '').toLowerCase(); let total = 0; const hits = [];
  for (const [k, m] of PROCEDURE_NORMS) if (t.includes(k) && !hits.some((h) => h.k.includes(k) || k.includes(h.k))) { hits.push({ k, m }); total += m; }
  // tooth numbers: each extra tooth adds 40% of the procedure norm
  const teeth = (t.match(/#\s?\d{2}|\b[1-4][1-8]\b/g) || []).length;
  if (teeth > 1 && hits.length) total += Math.round(0.4 * hits[0].m * (teeth - 1));
  return { total, hits, teeth };
}

/** Per visit type: scheduled length vs observed, with a suggestion and the reason. */
export function visitTypeSuggestions(db) {
  const obs = observed(db);
  return db.settings.visitTypes.map((vt) => {
    const xs = obs.byType[vt.id] || [];
    const n = xs.length; const p50 = pct(xs, 0.5); const p75 = pct(xs, 0.75);
    const norm = normsFor(vt.name).total || null;
    let suggested; let basis; let confidence;
    if (n >= 5) { suggested = round5(p75 + 5); basis = `Based on ${n} completed visits: half finish within ${p50} min, three in four within ${p75} min, plus 5 min turnover.`; confidence = n >= 15 ? 'high' : 'medium'; }
    else if (n > 0) { suggested = round5((p75 * n + (norm || vt.durationMin) * (5 - n)) / 5 + 5); basis = `Only ${n} completed visit${n === 1 ? '' : 's'} so far; blended with typical dental norms.`; confidence = 'low'; }
    else { suggested = norm ? round5(norm + 5) : vt.durationMin; basis = norm ? 'No history yet; typical time for this procedure plus 5 min turnover.' : 'No history and no matching norm; keeping your setting.'; confidence = norm ? 'low' : 'none'; }
    const delta = suggested - vt.durationMin;
    return { visitTypeId: vt.id, name: vt.name, current: vt.durationMin, suggested, delta, n, p50, p75, basis, confidence, action: Math.abs(delta) >= 10 ? (delta > 0 ? 'Running long: patients wait. Consider lengthening.' : 'Ends early: chairs sit idle. Consider shortening.') : 'Your setting matches what actually happens.' };
  });
}

/** Estimate for one booking: visit type + notes/procedures + who + patient context. */
export function estimateAppointment(db, { visitTypeId, providerId = null, patientId = null, notes = '', items = [] }) {
  const vt = db.settings.visitTypes.find((v) => v.id === visitTypeId);
  if (!vt) return { minutes: 30, breakdown: [{ label: 'Default', minutes: 30 }], confidence: 'none' };
  const obs = observed(db);
  const breakdown = [];
  const xs = obs.byType[vt.id] || [];
  let base = xs.length >= 5 ? round5(pct(xs, 0.75)) : vt.durationMin;
  breakdown.push({ label: xs.length >= 5 ? `${vt.name} (your last ${xs.length} visits, 75th percentile)` : `${vt.name} (scheduled length)`, minutes: base });
  const text = [notes, ...items.map((i) => i.procedure || i)].join('; ');
  const norms = normsFor(text);
  let extra = 0;
  if (norms.hits.length) {
    // The visit type already covers one procedure of its own kind; add the rest.
    const covered = normsFor(vt.name).hits.map((h) => h.k);
    for (const h of norms.hits) if (!covered.includes(h.k)) { extra += h.m; breakdown.push({ label: `${h.k} (procedure norm)`, minutes: h.m }); }
    if (norms.teeth > 1) { const t = Math.round(0.4 * norms.hits[0].m * (norms.teeth - 1)); extra += t; breakdown.push({ label: `${norms.teeth} teeth`, minutes: t }); }
  }
  let factor = 1;
  if (providerId && obs.byProv[providerId]?.length >= 5 && obs.all.length >= 10) {
    const mine = obs.byProv[providerId].map((x) => x.chair); const p = pct(mine, 0.5) / pct(obs.all, 0.5);
    if (p > 1.1 || p < 0.9) { factor = Math.min(1.3, Math.max(0.8, p)); breakdown.push({ label: `${db.settings.providers.find((x) => x.id === providerId)?.name || 'This dentist'} runs ${p > 1 ? 'longer' : 'quicker'} than average`, minutes: Math.round((base + extra) * (factor - 1)) }); }
  }
  if (patientId) {
    const p = db.patients.find((x) => x.id === patientId);
    const pk = db.formPackets.filter((k) => k.patientId === patientId).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))[0];
    if (p && !p.lastVisit) { extra += 10; breakdown.push({ label: 'First visit (history, x-rays, explanation)', minutes: 10 }); }
    if (pk?.sections.dentalConcerns?.data?.anxiety === 'very') { extra += 10; breakdown.push({ label: 'Patient reports high anxiety', minutes: 10 }); }
    const age = p?.dob ? (new Date() - new Date(p.dob)) / (365.25 * 86400000) : null;
    if (age !== null && age < 8) { extra += 10; breakdown.push({ label: 'Young child', minutes: 10 }); }
  }
  const minutes = round5((base + extra) * factor);
  return { minutes, breakdown, confidence: xs.length >= 15 ? 'high' : xs.length >= 5 ? 'medium' : 'low', scheduled: vt.durationMin };
}
