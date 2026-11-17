/**
 * AI help for the marketing screens. Everything here only PROPOSES: a plan becomes a draft campaign, an improved prompt
 * becomes a draft prompt. A person still approves before anything reaches a patient. No patient names or numbers are
 * sent to the model when planning; it sees counts only.
 */
import { dayKey, nowIso, bad } from '../lib.js';
import { claudeJson, aiOn } from './claudeJson.js';
import { GOALS, SEGMENTS, marketingSettings, marketingSystem, voiceText, segmentPatients, eligibleAudience, renderCopy, ruleDraft, nextSendWindow, DRAFT_SCHEMA } from './marketing.js';

const PLAN_GOALS = ['recall', 'unscheduled', 'festival', 'offer', 'referral', 'reactivation', 'birthday', 'custom'];

const FESTIVALS = /(diwali|deepavali|eid|christmas|new year|ugadi|pongal|sankranti|holi|onam|dussehra|navratri|raksha ?bandhan|ganesh|independence day|republic day|baisakhi|durga puja)/i;

/** Plain keyword reading of a request, for clinics without AI connected. */
export function ruleIntent(ask) {
  const t = String(ask || '').toLowerCase();
  const lang = /hindi|हिन्दी/.test(t) ? 'hi' : /kannada|ಕನ್ನಡ/.test(t) ? 'kn' : 'en';
  const fest = t.match(FESTIVALS);
  let goal = 'custom', segment = 'all', festival = '';
  if (fest) { goal = 'festival'; festival = fest[1].replace(/\b\w/g, (c) => c.toUpperCase()); }
  else if (/birthday/.test(t)) { goal = 'birthday'; segment = 'birthday_month'; }
  else if (/refer|bring (a )?(friend|family)/.test(t)) goal = 'referral';
  else if (/(not (seen|visited|come)|lapsed|inactive|win.?back|haven.?t (come|visited|been)|long time|over a year|12 months)/.test(t)) { goal = 'reactivation'; segment = 'inactive_12m'; }
  else if (/(pending|unfinished|incomplete|left without|recommended|treatment plan|root canal|crown|filling)/.test(t)) { goal = 'unscheduled'; segment = 'unscheduled_treatment'; }
  else if (/(cleaning|check.?up|recall|overdue|6.?month|six.?month)/.test(t) && !/camp|offer|free/.test(t)) { goal = 'recall'; segment = 'overdue_recall'; }
  else if (/(whiten|offer|discount|camp|aligner|brace|implant|promo|launch|new service|special|%|free)/.test(t)) goal = 'offer';
  if (/(kid|child|school|parent)/.test(t) && segment === 'all') segment = 'kids';
  else if (/new patient|first.?time|recent(ly)? joined/.test(t) && segment === 'all') segment = 'new_30d';
  return { goal, segment, lang, festival, brief: ['offer', 'custom', 'referral'].includes(goal) ? String(ask).trim().slice(0, 300).replace(/[.!?]*$/, '.') : '' };
}

export async function planCampaign(db, { ask, lang }) {
  const text = String(ask || '').trim().slice(0, 500);
  if (text.length < 4) bad('Tell me what you want to achieve, in a sentence');
  const counts = SEGMENTS.map((s) => ({ id: s.id, name: s.name, patients: segmentPatients(db, s.id).length }));
  let plan = null; let engine = 'rules';
  if (aiOn()) {
    try {
      const s = db.settings;
      const system = `${marketingSystem(db, lang || 'en')}
You are also the clinic's marketing planner. Turn the owner's request into ONE campaign: choose the goal and the audience segment that fit best, write the message, and say in one plain sentence why this audience. Only use ids from the lists. If the request needs an offer, put the offer details in "brief" exactly as the owner stated them and do not invent discounts, dates or prices.
Today is ${dayKey(nowIso())}. Clinic services: ${s.visitTypes.map((v) => v.name).join(', ')}. Festivals the clinic marked: ${(marketingSettings(db).festivals || []).map((f) => `${f.name} ${f.date}`).join('; ') || 'none'}.
Audience sizes right now (opted-in patients with a phone): ${counts.map((c) => `${c.id}=${c.patients}`).join(', ')}.`;
      const schema = { type: 'object', properties: { name: { type: 'string' }, goal: { type: 'string', enum: PLAN_GOALS }, segment: { type: 'string', enum: SEGMENTS.map((x) => x.id) }, lang: { type: 'string', enum: ['en', 'hi', 'kn'] }, festival: { type: 'string' }, brief: { type: 'string' }, body: { type: 'string' }, why: { type: 'string' }, notes: { type: 'string' } }, required: ['name', 'goal', 'segment', 'lang', 'festival', 'brief', 'body', 'why', 'notes'], additionalProperties: false };
      plan = await claudeJson({ system, user: text, schema, maxTokens: 1200 }); engine = 'claude';
    } catch (err) { console.warn('[marketing] planner fell back to rules:', err.message); plan = null; }
  }
  if (!plan) {
    const r = ruleIntent(text); const d = ruleDraft(db, r);
    const segName = SEGMENTS.find((x) => x.id === r.segment).name.toLowerCase();
    plan = { name: GOALS.find((g) => g.id === r.goal).name, ...r, lang: lang || r.lang, body: ruleDraft(db, { ...r, lang: lang || r.lang }).body, why: `Matched your request to "${GOALS.find((g) => g.id === r.goal).name}" for ${segName}.`, notes: d.notes };
  }
  if (!PLAN_GOALS.includes(plan.goal)) plan.goal = 'custom';
  if (!SEGMENTS.some((x) => x.id === plan.segment)) plan.segment = 'all';
  const audience = segmentPatients(db, plan.segment).length; const eligible = eligibleAudience(db, plan.segment).length;
  return { ...plan, engine, audienceCount: audience, eligibleCount: eligible, suggestedWhen: nextSendWindow(db), segmentName: SEGMENTS.find((x) => x.id === plan.segment).name };
}

/* ---------- Prompt tools ---------- */

const CHECKS = [
  { id: 'length', test: /(under|within|max(imum)?|no more than) \d+ words/i, add: 'Keep it under 60 words.', why: 'Has no length limit' },
  { id: 'claims', test: /(no|not|never|avoid)[^.]{0,40}(medical claim|promise|guarantee)/i, add: 'Make no medical claims and no promises of results.', why: 'Does not forbid medical claims' },
  { id: 'name', test: /\{\{firstName\}\}/, add: 'Address the patient as {{firstName}}.', why: 'Does not use the patient\'s name' },
  { id: 'cta', test: /(reply|book|call|yes)/i, add: 'End with one clear next step, such as replying BOOK.', why: 'Has no clear next step' },
  { id: 'plain', test: /(plain|simple|short|warm|friendly|polite)/i, add: 'Use simple, friendly words.', why: 'Does not set a tone' },
];

export async function improvePrompt(db, { body, goal }) {
  const text = String(body || '').trim();
  if (text.length < 10) bad('Write the prompt first');
  if (aiOn()) {
    try {
      const out = await claudeJson({
        system: `You improve prompts that a dental clinic uses to have an AI write WhatsApp messages to patients. Keep the clinic's intent. Make the prompt specific: who the message is from and to, the single purpose, what to include, a word limit, what to avoid (medical claims, pressure, promises of results, discounts not in the brief), and the language. Keep every {{placeholder}} that is already there; you may add these: practice, firstName, provider, visitType, treatment, location, festival, brief, reviewLink, cleaningFee, language. ${voiceText(db)} Return JSON only.`,
        user: `Goal: ${goal || 'custom'}\n\nPrompt to improve:\n${text}`,
        schema: { type: 'object', properties: { body: { type: 'string' }, changes: { type: 'array', items: { type: 'string' } } }, required: ['body', 'changes'], additionalProperties: false }, maxTokens: 900,
      });
      return { ...out, engine: 'claude' };
    } catch (err) { console.warn('[marketing] improve fell back to rules:', err.message); }
  }
  const missing = CHECKS.filter((c) => !c.test.test(text));
  const stop = (x) => (/[.!?]$/.test(x) ? x : `${x}.`);
  const body2 = missing.length ? `${stop(text.replace(/\s+$/, ''))} ${missing.map((c) => c.add).join(' ')}` : text;
  return { body: body2, changes: missing.length ? missing.map((c) => c.why + '. Added a line for it.') : ['Nothing obvious to add. The prompt already sets length, tone and a next step.'], engine: 'rules' };
}

/** Try a prompt on a real patient's details without saving anything or messaging anyone. Works on unapproved prompts. */
export async function testPrompt(db, { body, goal, lang = 'en', patientId, brief = '', festival = '' }) {
  const patient = db.patients.find((p) => p.id === patientId) || db.patients.find((p) => p.marketingOptIn !== false && p.phone) || db.patients[0];
  const provider = db.settings.providers[0];
  const ctx = { patient, provider, brief, festival, lang, treatment: 'a crown on tooth 46', location: db.settings.locations?.[0] };
  const rendered = renderCopy(db, body, ctx);
  if (aiOn()) {
    try {
      const out = await claudeJson({ system: marketingSystem(db, lang), user: `Brief (being tested by the clinic, not yet approved):\n${rendered}\n\nExample personalisation values: ${JSON.stringify({ firstName: patient?.firstName, provider: provider?.name })}`, schema: DRAFT_SCHEMA, maxTokens: 700 });
      return { body: renderCopy(db, out.body, ctx), notes: out.notes, engine: 'claude', patientFirstName: patient?.firstName || null };
    } catch (err) { console.warn('[marketing] prompt test fell back:', err.message); }
  }
  const d = ruleDraft(db, { goal, lang, brief, festival });
  return { body: renderCopy(db, d.body, ctx), notes: 'AI is not connected, so this is the built-in wording for this goal. Connect Claude to see what your prompt really produces.', engine: 'rules', patientFirstName: patient?.firstName || null };
}
