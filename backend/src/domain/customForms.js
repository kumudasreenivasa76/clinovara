/**
 * Clinic-defined forms that travel with the standard pre-visit packet: a general consent, a photo
 * consent, a screening questionnaire and so on. A clinic writes them once (by hand, from an uploaded
 * list of questions, or from an AI draft), chooses who gets them, and patients answer on the same
 * link as their other forms. Answers live on the form packet under `custom[formId]`.
 */
import { id, nowIso, bad, HttpError } from '../lib.js';
import { aiOn, claudeJson } from './claudeJson.js';

export const FIELD_TYPES = ['text', 'textarea', 'yesno', 'choice', 'checkbox', 'date', 'phone', 'email', 'info', 'signature'];
const HAS_OPTIONS = new Set(['choice', 'checkbox']);
const MAX_FIELDS = 40;

/** Ready-made forms a clinic can start from. */
export const STARTERS = [
  { key: 'general_consent', name: 'General consent for dental treatment', description: 'Signed once before treatment begins.', fields: [
    { type: 'info', label: 'I understand that the dentist will examine me and explain the treatment, its risks, alternatives and cost before it starts. I can ask questions and withdraw my consent at any time.' },
    { type: 'yesno', label: 'I have understood the above and consent to examination and treatment', required: true },
    { type: 'yesno', label: 'I agree to dental X-rays if the dentist advises them', required: true },
    { type: 'signature', label: 'Full name of patient or guardian', required: true },
    { type: 'date', label: 'Date', required: true },
  ] },
  { key: 'photo_consent', name: 'Photo and review consent', description: 'Permission to use treatment photos and reviews.', fields: [
    { type: 'yesno', label: 'The clinic may take photos of my teeth for my treatment record', required: true },
    { type: 'choice', label: 'The clinic may use my photos, with my face hidden, for', options: ['Nothing outside my record', 'Teaching other dentists', 'The clinic website and social media'], required: true },
    { type: 'signature', label: 'Full name', required: true },
  ] },
  { key: 'guardian', name: 'Parent or guardian details', description: 'For patients under 18.', fields: [
    { type: 'text', label: 'Parent or guardian full name', required: true },
    { type: 'choice', label: 'Relationship to the patient', options: ['Mother', 'Father', 'Grandparent', 'Legal guardian', 'Other'], required: true },
    { type: 'text', label: 'Mobile number', required: true },
    { type: 'yesno', label: 'I consent to treatment for this child', required: true },
  ] },
  { key: 'health_update', name: 'Health update since last visit', description: 'A quick check for returning patients.', fields: [
    { type: 'yesno', label: 'Has your health changed since your last visit?', required: true },
    { type: 'textarea', label: 'If yes, tell us what changed' },
    { type: 'yesno', label: 'Are you taking any new medicines?', required: true },
    { type: 'yesno', label: 'Are you pregnant or could you be?' },
  ] },
];

export const formsOf = (db) => (db.settings.customForms ||= []);

/** Cleans a form coming from the browser, an upload or the AI. Unknown field types become short text. */
export function cleanForm(input = {}, existing = null) {
  const name = String(input.name || '').trim().slice(0, 80);
  if (!name) bad('Give the form a name');
  const fields = (Array.isArray(input.fields) ? input.fields : []).slice(0, MAX_FIELDS).map((f) => {
    const label = String(f?.label || '').trim().slice(0, 600);
    if (!label) return null;
    const type = FIELD_TYPES.includes(f.type) ? f.type : 'text';
    const options = HAS_OPTIONS.has(type) ? [...new Set((Array.isArray(f.options) ? f.options : String(f.options || '').split(/[,\n]/)).map((o) => String(o).trim().slice(0, 80)).filter(Boolean))].slice(0, 12) : [];
    if (HAS_OPTIONS.has(type) && options.length < 2) bad(`"${label.slice(0, 40)}" needs at least two choices`);
    return { id: /^fld_[a-z0-9]+$/i.test(String(f.id || '')) ? f.id : id('fld'), label, type, options, required: type === 'info' ? false : !!f.required, showIf: f.showIf?.fieldId ? { fieldId: String(f.showIf.fieldId), equals: String(f.showIf.equals ?? 'yes').slice(0, 80) } : null, _from: f.id };
  }).filter(Boolean);
  // A question can depend on an earlier yes/no or choice question. Anything else is dropped rather than left dangling.
  fields.forEach((f, i) => {
    if (f.showIf) { const dep = fields.slice(0, i).find((x) => x.id === f.showIf.fieldId || x._from === f.showIf.fieldId); f.showIf = dep && ['yesno', 'choice'].includes(dep.type) ? { fieldId: dep.id, equals: f.showIf.equals } : null; }
  });
  fields.forEach((f) => { delete f._from; });
  if (!fields.some((f) => f.type !== 'info')) bad('Add at least one question for the patient to answer');
  const appliesTo = input.appliesTo === 'visitTypes' ? 'visitTypes' : 'all';
  const visitTypeIds = appliesTo === 'visitTypes' ? [...new Set((input.visitTypeIds || []).map(String))] : [];
  if (appliesTo === 'visitTypes' && !visitTypeIds.length) bad('Choose at least one visit type, or send the form to everyone');
  return {
    id: existing?.id || id('frm'), name, description: String(input.description || '').trim().slice(0, 200), fields, appliesTo, visitTypeIds,
    active: input.active !== false, version: !existing ? 1 : (existing.version || 1) + (JSON.stringify(existing.fields) === JSON.stringify(fields) ? 0 : 1), createdAt: existing?.createdAt || nowIso(), updatedAt: nowIso(),
  };
}

/** The clinic forms that go with one appointment. */
export function formsFor(db, appointment) {
  if (!appointment) return [];
  return formsOf(db).filter((f) => f.active && (f.appliesTo === 'all' || f.visitTypeIds.includes(appointment.visitTypeId)));
}

/** Checks a patient's answers against the form and stores them on the packet. */
export function saveAnswers(db, pk, formId, data = {}, { by = 'patient' } = {}) {
  const form = formsOf(db).find((f) => f.id === formId);
  if (!form) throw new HttpError(404, 'That form is no longer in use');
  const clean = {};
  for (const f of form.fields) {
    if (f.type === 'info') continue;
    if (f.showIf && clean[f.showIf.fieldId] !== f.showIf.equals) { clean[f.id] = ''; continue; }   // hidden by an earlier answer
    let v = data[f.id];
    if (f.type === 'yesno') v = v === true || v === 'yes' ? 'yes' : v === false || v === 'no' ? 'no' : '';
    else if (f.type === 'checkbox') v = (Array.isArray(v) ? v : String(v ?? '').split(',')).map((x) => String(x).trim()).filter((x) => f.options.includes(x)).join(', ');
    else v = String(v ?? '').trim().slice(0, f.type === 'textarea' ? 2000 : 300);
    if (f.type === 'choice' && v && !f.options.includes(v)) v = '';
    if (f.type === 'date' && v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) v = '';
    if (f.type === 'phone' && v && v.replace(/\D/g, '').length < 10) bad(`Enter a phone number with at least 10 digits: ${f.label.slice(0, 60)}`);
    if (f.type === 'email' && v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) bad(`That email address does not look right: ${f.label.slice(0, 60)}`);
    if (f.required && !v) bad(`Please answer: ${f.label.slice(0, 80)}`);
    clean[f.id] = v;
  }
  // The questions as they were worded when answered are kept with the answers, so a later edit of the form never rewrites a past submission.
  (pk.custom ||= {})[form.id] = { complete: true, data: clean, at: nowIso(), by, formName: form.name, formVersion: form.version || 1, fields: form.fields };
  return pk.custom[form.id];
}

/** What a packet shows for its clinic forms: each form with whether it is done and the answers given. */
export function customView(db, pk, appointment, { withFields = true } = {}) {
  return formsFor(db, appointment).map((f) => {
    const ans = pk.custom?.[f.id];
    return { id: f.id, name: f.name, description: f.description, version: f.version || 1, answeredVersion: ans?.formVersion || null, complete: !!ans?.complete, at: ans?.at || null, by: ans?.by || null, data: ans?.data || {}, ...(withFields ? { fields: f.fields, answeredFields: ans?.fields || null } : {}) };
  });
}

// ── turning plain text into questions ───────────────────────────────────────

/** Guesses the kind of answer a question wants from the way it is written. */
function fieldFromLine(line) {
  let text = line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim();
  if (!text) return null;
  const required = /\*\s*$/.test(text) || /\(required\)/i.test(text);
  text = text.replace(/\*\s*$/, '').replace(/\(required\)/i, '').trim();
  // "Question: a, b, c" or "Question (a / b / c)" is a choice
  const m = text.match(/^(.{3,}?)(?::|\?)\s*([^?]+(?:[,/|][^?]+)+)$/) || text.match(/^(.{3,}?)\s*\(([^()]+(?:[,/|][^()]+)+)\)\s*\??$/);
  if (m) {
    const options = m[2].split(/[,/|]/).map((o) => o.trim()).filter(Boolean);
    if (options.length >= 2 && options.every((o) => o.length <= 60)) {
      if (options.length === 2 && /^(yes|no|y|n)$/i.test(options[0]) && /^(yes|no|y|n)$/i.test(options[1])) return { type: 'yesno', label: m[1].trim().replace(/[:?]?$/, '?'), required };
      return { type: 'choice', label: m[1].trim(), options, required };
    }
  }
  if (/\b(signature|sign here|signed by|full name of (the )?(patient|guardian))\b/i.test(text)) return { type: 'signature', label: text, required: true };
  if (/\b(date of|^date$|dob|birth)\b/i.test(text) && text.length < 60) return { type: 'date', label: text, required };
  if (/^(do|does|did|are|is|have|has|had|will|would|can|could|may|should)\b.*\?$/i.test(text) || /^i (agree|consent|understand|confirm|allow|authori[sz]e|permit)\b/i.test(text)) return { type: 'yesno', label: text, required: required || /^i (agree|consent|understand|confirm)/i.test(text) };
  if (/\b(describe|explain|details|comments|tell us|list|anything else|other information)\b/i.test(text)) return { type: 'textarea', label: text, required };
  if (!/\?$/.test(text) && text.length > 110) return { type: 'info', label: text };
  return { type: 'text', label: text, required };
}

/** An uploaded list of questions (one per line, or a CSV whose first column is the question) becomes form fields. */
export function fieldsFromText(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) bad('That file has no questions in it');
  const csv = lines.length > 1 && lines.filter((l) => l.includes(',')).length >= lines.length * 0.8 && /^(question|label|field)\b/i.test(lines[0]);
  const fields = [];
  for (const line of csv ? lines.slice(1) : lines) {
    if (csv) {
      const cells = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"').trim());
      const [label, type, options, req] = cells;
      if (!label) continue;
      fields.push({ label, type: FIELD_TYPES.includes(String(type || '').toLowerCase()) ? String(type).toLowerCase() : fieldFromLine(label)?.type || 'text', options: String(options || '').split(/[|/;]/).map((o) => o.trim()).filter(Boolean), required: /^(y|yes|true|1|required)$/i.test(String(req || '')) });
    } else {
      const f = fieldFromLine(line);
      if (f) fields.push(f);
    }
    if (fields.length >= MAX_FIELDS) break;
  }
  if (!fields.length) bad('We could not find any questions in that file');
  return fields.map((f) => (f.type === 'choice' && (f.options || []).length < 2 ? { ...f, type: 'text', options: [] } : f));
}

// ── drafting a form from a description ──────────────────────────────────────

const SIGN = [{ type: 'signature', label: 'Full name of patient or guardian', required: true }, { type: 'date', label: 'Date', required: true }];
/** Without an AI key: recognise the common kinds of dental front-desk form and build a sensible starting point. */
function ruleDraft(prompt) {
  const p = prompt.toLowerCase();
  const title = prompt.trim().replace(/^(please\s+)?(make|create|write|draft|build|generate|i need|we need)\s+(me\s+)?(a|an|the)?\s*/i, '').replace(/\s+form\.?$/i, '').replace(/[.!?]+$/, '');
  const name = (title ? title[0].toUpperCase() + title.slice(1) : 'New form').slice(0, 70);
  if (/photo|picture|video|social|testimonial|review/.test(p)) return { ...STARTERS[1], name: /consent/.test(p) ? name : STARTERS[1].name };
  if (/child|kid|minor|guardian|parent|pediatric|paediatric/.test(p)) return { ...STARTERS[2] };
  if (/update|since (your )?last|returning|recall/.test(p)) return { ...STARTERS[3] };
  if (/covid|fever|cough|screen|infection|symptom/.test(p)) return { name: 'Health screening', description: 'Answered on the day of the visit.', fields: [
    { type: 'yesno', label: 'Do you have a fever, cough or sore throat today?', required: true },
    { type: 'yesno', label: 'Have you been unwell in the last 7 days?', required: true },
    { type: 'yesno', label: 'Has anyone at home been unwell in the last 7 days?', required: true },
    { type: 'textarea', label: 'If you answered yes to any of these, please give details' },
  ] };
  if (/feedback|satisfaction|experience|rate/.test(p)) return { name: 'Visit feedback', description: 'Sent after the visit.', fields: [
    { type: 'choice', label: 'How was your visit?', options: ['Excellent', 'Good', 'Okay', 'Poor'], required: true },
    { type: 'yesno', label: 'Did the dentist explain your treatment clearly?', required: true },
    { type: 'textarea', label: 'What could we do better?' },
  ] };
  if (/implant|extraction|surgery|root canal|rct|whitening|braces|aligner|orthodon|sedation|anaesth|anesth/.test(p)) {
    const proc = (p.match(/implant|extraction|surgery|root canal|rct|whitening|braces|aligner|sedation/) || ['the procedure'])[0];
    return { name: `Consent for ${proc === 'rct' ? 'root canal treatment' : proc}`, description: 'Signed before the procedure.', fields: [
      { type: 'info', label: `The dentist has explained ${proc === 'the procedure' ? 'the procedure' : `the ${proc}`}, why it is advised, the risks, the alternatives and the cost. I have had the chance to ask questions.` },
      { type: 'yesno', label: 'I have understood the explanation and consent to this treatment', required: true },
      { type: 'yesno', label: 'I have told the dentist about my medicines, allergies and health conditions', required: true },
      { type: 'yesno', label: 'I understand the aftercare instructions I will be given', required: true },
      ...SIGN,
    ] };
  }
  if (/consent|agree|permission|authori[sz]/.test(p)) return { ...STARTERS[0], name: /general/.test(p) ? STARTERS[0].name : name };
  return { name, description: '', fields: [
    { type: 'text', label: 'What is the main reason for your visit?', required: true },
    { type: 'yesno', label: 'Is this your first visit to our clinic?', required: true },
    { type: 'textarea', label: 'Is there anything else you would like us to know?' },
  ] };
}

const DRAFT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['name', 'description', 'fields'],
  properties: {
    name: { type: 'string' }, description: { type: 'string' },
    fields: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['label', 'type', 'required', 'options'], properties: { label: { type: 'string' }, type: { type: 'string', enum: FIELD_TYPES }, required: { type: 'boolean' }, options: { type: 'array', items: { type: 'string' } } } } },
  },
};

/** Drafts a form from a one-line description. Claude writes it when a key is set; otherwise a rule-based draft. Always a draft for staff to edit. */
export async function draftForm(db, prompt) {
  const ask = String(prompt || '').trim().slice(0, 600);
  if (ask.length < 4) bad('Describe the form you need, for example "consent form for tooth extraction"');
  if (aiOn()) {
    try {
      const out = await claudeJson({
        system: `You draft short administrative and consent forms for the front desk of a dental clinic in India called ${db.settings.practice?.name || 'the clinic'}. Patients fill them on a phone before a visit. Write in plain English at a reading level a non-native speaker can follow. Use at most 10 fields. Field types: info (a statement to read, no answer), yesno, choice (give 2 to 6 options), text, textarea, date, signature (the patient types their full name). Consent forms must start with an info field stating what is being consented to and end with a signature and a date. Never ask for card numbers, passwords or Aadhaar numbers. Do not give medical advice or promise outcomes.`,
        user: `Draft this form: ${ask}`, schema: DRAFT_SCHEMA, maxTokens: 1400,
      });
      return { engine: 'claude', form: { name: out.name, description: out.description, fields: out.fields } };
    } catch (e) { console.error('[forms] AI draft failed, using the built-in drafts', e.message); }
  }
  return { engine: 'rules', form: ruleDraft(ask) };
}
