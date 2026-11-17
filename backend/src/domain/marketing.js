/**
 * Marketing & patient engagement with human approval.
 *
 * Nothing here reaches a patient without a person approving it:
 *  - Prompts (the briefs the AI writes from) are drafts until an owner/admin approves them.
 *  - Campaigns move draft → pending_approval → approved → sent. Only approved campaigns can be sent.
 *  - Automatic thank-you / review requests are queued per visit and sent only after approval
 *    (or, if the clinic explicitly pre-approves the template, sent automatically with an audit entry).
 * Only patients who opted in receive marketing; reminders are transactional and unaffected.
 */
import { id, nowIso, addDays, dayKey, log, fullName, bad, find } from '../lib.js';
import { renderTemplate, sendCommunication } from './messaging.js';
import { emit } from './webhooks.js';
import { claudeJson, aiOn } from './claudeJson.js';

export const GOALS = [
  { id: 'thank_you', name: 'Thank-you after visit', hint: 'Warm note the day of the visit' },
  { id: 'review', name: 'Google review request', hint: 'Ask happy patients for a review' },
  { id: 'recall', name: 'Recall / cleaning reminder', hint: 'Bring overdue patients back' },
  { id: 'unscheduled', name: 'Unscheduled treatment nudge', hint: 'Patients who left without booking' },
  { id: 'festival', name: 'Festival greeting', hint: 'Diwali, Eid, Ugadi, New Year…' },
  { id: 'offer', name: 'Offer / new service', hint: 'Whitening month, aligner consult camp' },
  { id: 'referral', name: 'Referral request', hint: 'Ask patients to refer family' },
  { id: 'reactivation', name: 'Win back inactive patients', hint: 'No visit in 12+ months' },
  { id: 'birthday', name: 'Birthday wish', hint: 'A short note on the patient\'s birthday' },
  { id: 'welcome', name: 'New patient welcome', hint: 'After a first visit' },
  { id: 'aftercare', name: 'Aftercare check-in', hint: 'The day after a procedure' },
  { id: 'custom', name: 'Custom', hint: 'Your own brief' },
];

/** Messages sent for one patient and one event, on their own, once the visit or date arrives. */
export const AUTOMATIONS = [
  { id: 'thank_you', name: 'Thank-you after a visit', when: 'About an hour after a visit is marked done', needsOptIn: true },
  { id: 'review', name: 'Google review request', when: 'A few hours after a visit, once a review link is set', needsOptIn: true },
  { id: 'welcome', name: 'New patient welcome', when: 'After a patient\'s first completed visit', needsOptIn: true },
  { id: 'aftercare', name: 'Aftercare check-in', when: 'The day after a procedure or urgent visit', needsOptIn: false },
  { id: 'birthday', name: 'Birthday wish', when: 'On the patient\'s birthday, inside your send window', needsOptIn: true },
];
const AFTERCARE_VISITS = ['vt_procedure', 'vt_urgent'];

export const SEGMENTS = [
  { id: 'all', name: 'All opted-in patients' },
  { id: 'overdue_recall', name: 'Overdue for recall' },
  { id: 'unscheduled_treatment', name: 'Unscheduled treatment' },
  { id: 'new_30d', name: 'New patients (last 30 days)' },
  { id: 'inactive_12m', name: 'No visit in 12 months' },
  { id: 'visited_7d', name: 'Visited in the last 7 days' },
  { id: 'birthday_month', name: 'Birthday this month' },
  { id: 'kids', name: 'Children (under 16)' },
];

export function defaultPrompts() {
  return [
    { id: 'pr_thank_you', goal: 'thank_you', name: 'Thank-you after a visit', status: 'approved', body: 'Write a short, warm WhatsApp thank-you from {{practice}} to {{firstName}} after today\'s {{visitType}} with {{provider}}. Mention we are available on this number for any question about aftercare, and that their next check-up is due in 6 months. No offers. Under 60 words. Plain text, no emojis.' },
    { id: 'pr_review', goal: 'review', name: 'Google review request', status: 'approved', body: 'Write a polite WhatsApp message from {{practice}} asking {{firstName}} to leave a Google review if they were happy with their visit, with this link: {{reviewLink}}. One sentence of thanks, one sentence asking, the link. Under 50 words. Do not offer anything in return for the review.' },
    { id: 'pr_recall', goal: 'recall', name: 'Recall reminder', status: 'approved', body: 'Write a friendly WhatsApp message from {{practice}} reminding {{firstName}} that their 6-monthly cleaning and check-up is due. Say they can reply BOOK to get a time at {{location}}. Mention the fee ₹{{cleaningFee}}. Under 60 words.' },
    { id: 'pr_unscheduled', goal: 'unscheduled', name: 'Unscheduled treatment nudge', status: 'approved', body: 'Write a caring, non-pushy WhatsApp message from {{practice}} to {{firstName}}: {{provider}} recommended {{treatment}} at their last visit; delaying can make treatment longer or costlier; we can help with timing and EMI. Invite them to reply to book. Under 70 words. No medical claims beyond this.' },
    { id: 'pr_festival', goal: 'festival', name: 'Festival greeting', status: 'draft', body: 'Write a warm {{festival}} greeting from the team at {{practice}} to {{firstName}}. One or two sentences, culturally appropriate, no offer, no medical content. Under 40 words. Language: {{language}}.' },
    { id: 'pr_offer', goal: 'offer', name: 'Offer / new service', status: 'draft', body: 'Write a WhatsApp announcement from {{practice}} about: {{brief}}. Include what it is, who it is for, validity, and "reply YES to book". Do not promise results. Under 80 words.' },
    { id: 'pr_referral', goal: 'referral', name: 'Referral request', status: 'draft', body: 'Write a short WhatsApp note from {{practice}} thanking {{firstName}} for being a patient and asking them to share our number with family or friends who need a dentist. Under 50 words. No discount unless {{brief}} mentions one.' },
    { id: 'pr_reactivation', goal: 'reactivation', name: 'Win-back message', status: 'draft', body: 'Write a gentle WhatsApp message from {{practice}} to {{firstName}}, who has not visited in over a year: we would love to see them for a check-up, reply BOOK for a convenient time at {{location}}. Under 50 words.' },
    { id: 'pr_birthday', goal: 'birthday', name: 'Birthday wish', status: 'draft', body: 'Write a short, warm WhatsApp birthday wish from {{practice}} to {{firstName}}. One or two sentences, genuine and not salesy. No offer, no medical content. Language: {{language}}. Under 35 words.' },
    { id: 'pr_welcome', goal: 'welcome', name: 'New patient welcome', status: 'draft', body: 'Write a warm WhatsApp message from {{practice}} to {{firstName}} after their first visit with {{provider}}: thank them for choosing us, say this number is the quickest way to book, ask questions or reschedule, and that we will remind them when their next check-up is due. Under 60 words.' },
    { id: 'pr_aftercare', goal: 'aftercare', name: 'Aftercare check-in', status: 'draft', body: 'Write a caring WhatsApp message from {{practice}} to {{firstName}} the day after their {{visitType}} with {{provider}}: ask how they are feeling, say mild soreness can be normal, and that if there is severe pain, swelling or bleeding they should reply here or call us right away. Do not give medicine advice. Under 60 words.' },
  ];
}

export function defaultMarketingSettings() {
  return {
    googleReviewUrl: '', quietHours: { start: '09:00', end: '20:00' }, optOutText: 'Reply STOP to opt out.',
    autoThankYou: { enabled: true, mode: 'queue' /* queue | auto (pre-approved template) */, delayMinutes: 60 }, autoReview: { enabled: true, mode: 'queue', delayHours: 4 }, festivals: [],
    automations: { welcome: { enabled: true, mode: 'queue' }, aftercare: { enabled: true, mode: 'queue' }, birthday: { enabled: true, mode: 'queue' } },
    frequencyCapDays: 7, // a patient is not sent another campaign within this many days
    voice: { tone: 'warm', about: '', avoid: '', signoff: '' },
  };
}

export const TONES = { warm: 'warm and personal, like a friendly receptionist who knows the patient', professional: 'polite, clear and professional', playful: 'light and cheerful, still respectful', brief: 'very short and to the point' };

export function marketingSettings(db) {
  const m = (db.settings.marketing ||= defaultMarketingSettings());
  const d = defaultMarketingSettings();
  m.automations = { ...d.automations, ...(m.automations || {}) };
  m.voice = { ...d.voice, ...(m.voice || {}) };
  if (m.frequencyCapDays === undefined) m.frequencyCapDays = d.frequencyCapDays;
  db.settings.marketingPrompts ||= defaultPrompts();
  // Prompts added in newer versions reach existing clinics once, as drafts. A prompt the clinic deleted is not brought back.
  const seeded = (db.settings.marketingPromptsSeeded ||= ['pr_thank_you', 'pr_review', 'pr_recall', 'pr_unscheduled', 'pr_festival', 'pr_offer', 'pr_referral', 'pr_reactivation']);
  for (const p of defaultPrompts()) if (!seeded.includes(p.id)) { seeded.push(p.id); if (!db.settings.marketingPrompts.some((x) => x.id === p.id)) db.settings.marketingPrompts.push(p); }
  return m;
}

/** What the clinic has told the AI about how it speaks. Used in every AI prompt. */
export function voiceText(db) {
  const v = marketingSettings(db).voice;
  return [`Tone: ${TONES[v.tone] || TONES.warm}.`, v.about && `About the clinic: ${v.about}`, v.avoid && `Never mention or say: ${v.avoid}`, v.signoff && `Sign off with: ${v.signoff}`].filter(Boolean).join(' ');
}

/** Campaign messages are limited to one per patient within the cap, so people are not messaged again and again. */
export function recentlyMarketed(db, patientId, days, now = nowIso()) {
  if (!days) return false;
  const since = addDays(now, -days);
  return db.communications.some((c) => c.patientId === patientId && c.type === 'marketing' && c.sentAt >= since);
}
export function eligibleAudience(db, segmentId, locationId = null) {
  const days = marketingSettings(db).frequencyCapDays;
  return segmentPatients(db, segmentId, { locationId }).filter((p) => !recentlyMarketed(db, p.id, days));
}

export function segmentPatients(db, segmentId, { locationId = null } = {}) {
  const now = nowIso(); const today = dayKey(now);
  let list = db.patients.filter((p) => p.marketingOptIn !== false && p.phone && (!locationId || p.locationId === locationId));
  const age = (p) => (p.dob ? Math.floor((new Date(now) - new Date(p.dob)) / (365.25 * 86400000)) : null);
  switch (segmentId) {
    case 'overdue_recall': return list.filter((p) => p.nextRecallDue && p.nextRecallDue < today && !db.appointments.some((a) => a.patientId === p.id && ['scheduled', 'confirmed'].includes(a.status) && a.start > now));
    case 'unscheduled_treatment': return list.filter((p) => db.treatmentPlans.some((tp) => tp.patientId === p.id && !tp.nextVisitScheduled && tp.items.some((i) => ['recommended', 'accepted'].includes(i.status))));
    case 'new_30d': return list.filter((p) => p.createdAt >= addDays(now, -30));
    case 'inactive_12m': { const cutoff = dayKey(addDays(now, -365)); return list.filter((p) => (p.lastVisit ? p.lastVisit < cutoff : (p.createdAt || '') < addDays(now, -365))); } // a patient who only just joined is not lapsed
    case 'visited_7d': return list.filter((p) => p.lastVisit && p.lastVisit >= dayKey(addDays(now, -7)));
    case 'birthday_month': return list.filter((p) => p.dob && p.dob.slice(5, 7) === today.slice(5, 7));
    case 'kids': return list.filter((p) => { const a = age(p); return a !== null && a < 16; });
    default: return list;
  }
}

/* ---------- Copy generation ---------- */

const RULE_COPY = {
  thank_you: { en: 'Thank you for visiting {{practice}} today, {{firstName}}. It was a pleasure looking after you. If you have any question about aftercare, just reply here and our team will help. Your next check-up is due in about 6 months; we will remind you. — Team {{practice}}', hi: 'नमस्ते {{firstName}}, आज {{practice}} आने के लिए धन्यवाद। देखभाल के बारे में कोई भी प्रश्न हो तो यहाँ जवाब दें, हमारी टीम मदद करेगी। आपकी अगली जाँच लगभग 6 महीने बाद है; हम याद दिला देंगे। — टीम {{practice}}' },
  review: { en: 'Hi {{firstName}}, thank you for choosing {{practice}}. If you were happy with your visit, a Google review would mean a lot to our team: {{reviewLink}}. Thank you!', hi: 'नमस्ते {{firstName}}, {{practice}} चुनने के लिए धन्यवाद। यदि आप अपनी विज़िट से खुश हैं, तो Google पर एक समीक्षा हमारी टीम के लिए बहुत मायने रखेगी: {{reviewLink}}। धन्यवाद!' },
  recall: { en: 'Hi {{firstName}}, your 6-monthly cleaning and check-up at {{practice}} is due. Regular cleaning keeps gums healthy and catches small problems early. Reply BOOK and we will find a convenient time at {{location}}. Fee ₹{{cleaningFee}}.', hi: 'नमस्ते {{firstName}}, {{practice}} में आपकी 6-मासिक सफाई और जाँच का समय हो गया है। BOOK भेजें और हम {{location}} में सुविधाजनक समय तय कर देंगे। शुल्क ₹{{cleaningFee}}।' },
  unscheduled: { en: 'Hi {{firstName}}, at your last visit {{provider}} recommended {{treatment}}. Waiting can make treatment longer or costlier, so we wanted to check in. We can help with timing and no-cost EMI. Reply here and we will find a slot that suits you.', hi: 'नमस्ते {{firstName}}, पिछली विज़िट में {{provider}} ने {{treatment}} की सलाह दी थी। देरी से इलाज लंबा या महँगा हो सकता है। समय और नो-कॉस्ट EMI में हम मदद कर सकते हैं। यहाँ जवाब दें, हम आपके लिए समय तय करेंगे।' },
  festival: { en: 'Warm {{festival}} wishes to you and your family, {{firstName}}, from all of us at {{practice}}. May the season bring you health and happiness.', hi: '{{firstName}}, आपको और आपके परिवार को {{practice}} की पूरी टीम की ओर से {{festival}} की हार्दिक शुभकामनाएँ। यह मौसम आपके लिए स्वास्थ्य और खुशियाँ लाए।' },
  offer: { en: 'Hi {{firstName}}, news from {{practice}}: {{brief}} Reply YES to book or ask a question.', hi: 'नमस्ते {{firstName}}, {{practice}} की ओर से: {{brief}} बुक करने या प्रश्न पूछने के लिए YES भेजें।' },
  referral: { en: 'Hi {{firstName}}, thank you for trusting {{practice}} with your smile. If a friend or family member needs a dentist, please share our number — we would be glad to look after them too. {{brief}}', hi: 'नमस्ते {{firstName}}, {{practice}} पर भरोसे के लिए धन्यवाद। यदि किसी मित्र या परिवार के सदस्य को दंत चिकित्सक की ज़रूरत हो, तो कृपया हमारा नंबर साझा करें। {{brief}}' },
  reactivation: { en: 'Hi {{firstName}}, it has been a while since we saw you at {{practice}}. A check-up keeps small issues from becoming big ones. Reply BOOK for a convenient time at {{location}}; we would love to see you again.', hi: 'नमस्ते {{firstName}}, {{practice}} में आपको देखे काफी समय हो गया है। एक जाँच छोटी समस्याओं को बड़ा होने से रोकती है। {{location}} में सुविधाजनक समय के लिए BOOK भेजें।' },
  birthday: { en: 'Happy birthday, {{firstName}}! Everyone at {{practice}} wishes you a wonderful year ahead, full of good health and big smiles.', hi: 'जन्मदिन मुबारक, {{firstName}}! {{practice}} की पूरी टीम की ओर से आपको स्वस्थ और मुस्कुराता हुआ नया साल मुबारक।' },
  welcome: { en: 'Hi {{firstName}}, thank you for choosing {{practice}}. This number is the quickest way to book, reschedule or ask us anything, and we will remind you when your next check-up is due. We look forward to seeing you again.', hi: 'नमस्ते {{firstName}}, {{practice}} चुनने के लिए धन्यवाद। बुक करने, समय बदलने या कोई भी प्रश्न पूछने के लिए यही नंबर सबसे आसान है। अगली जाँच का समय होने पर हम याद दिलाएँगे।' },
  aftercare: { en: 'Hi {{firstName}}, this is {{practice}} checking in after your {{visitType}}. How are you feeling? Some soreness can be normal for a day or two. If you have severe pain, swelling or bleeding, please reply here or call us right away and we will see you.', hi: 'नमस्ते {{firstName}}, {{practice}} की ओर से आपका हालचाल पूछ रहे हैं। थोड़ा दर्द एक-दो दिन सामान्य हो सकता है। यदि तेज़ दर्द, सूजन या खून आए तो तुरंत यहाँ जवाब दें या हमें कॉल करें।' },
  custom: { en: '{{brief}}', hi: '{{brief}}' },
};

export function renderCopy(db, body, ctx) {
  const m = marketingSettings(db);
  const cleaning = db.settings.visitTypes.find((v) => v.id === 'vt_cleaning');
  const vars = { practice: db.settings.practice.name, firstName: ctx.patient?.firstName || 'there', provider: ctx.provider?.name || 'your dentist', visitType: ctx.visitType?.name || 'visit', location: ctx.location?.name || db.settings.locations?.[0]?.name || '', reviewLink: m.googleReviewUrl || '[add your Google review link in Marketing → Settings]', cleaningFee: (cleaning?.fee || 0).toLocaleString('en-IN'), treatment: ctx.treatment || 'the recommended treatment', festival: ctx.festival || 'festival', brief: ctx.brief || '', language: ctx.lang || 'en' };
  return String(body || '').replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
}

const LANG_WORD = (lang) => (lang === 'hi' ? 'Hindi (Devanagari)' : lang === 'kn' ? 'Kannada' : 'English');
export const DRAFT_SCHEMA = { type: 'object', properties: { body: { type: 'string' }, notes: { type: 'string', description: 'What a reviewer should check before approving' } }, required: ['body', 'notes'], additionalProperties: false };

export function marketingSystem(db, lang) {
  const m = marketingSettings(db);
  return `You write patient messages for ${db.settings.practice.name}, a dental clinic in India, sent on WhatsApp. Rules: never make medical claims or promises of results; no discounts unless the brief states one; no urgency tricks; respect that patients may be anxious; keep placeholders like {{firstName}} exactly as given so they can be personalised; write in ${LANG_WORD(lang)}; end with "${m.optOutText}". ${voiceText(db)} Return JSON only.`;
}

async function claudeDraft(db, { prompt, lang, sample }) {
  return claudeJson({ system: marketingSystem(db, lang), user: `Brief (approved by the clinic):\n${prompt}\n\nExample personalisation values: ${JSON.stringify(sample)}`, schema: DRAFT_SCHEMA, maxTokens: 800 });
}

export async function draftCopy(db, { goal, promptId, lang = 'en', brief = '', festival = '' }) {
  marketingSettings(db);
  const prompt = promptId ? find(db.settings.marketingPrompts, promptId, 'Prompt') : db.settings.marketingPrompts.find((p) => p.goal === goal);
  if (prompt && prompt.status !== 'approved') bad(`The prompt "${prompt.name}" has not been approved yet. An owner or admin must approve it under Marketing → Prompts before the AI can use it.`);
  const m = marketingSettings(db);
  const useClaude = aiOn();
  const sample = { firstName: 'Meera', provider: db.settings.providers[0]?.name || 'Dr. Rao', treatment: 'a crown on tooth 46', location: db.settings.locations?.[0]?.name || '' };
  if (useClaude && prompt) {
    try { const out = await claudeDraft(db, { prompt: renderCopy(db, prompt.body, { brief, festival, lang }), lang, sample }); return { body: out.body, notes: out.notes, engine: 'claude', promptId: prompt.id }; }
    catch (err) { console.warn('[marketing] Claude failed, using rules:', err.message); }
  }
  const base = (RULE_COPY[goal] || RULE_COPY.custom)[lang === 'hi' ? 'hi' : 'en'];
  const body = `${renderCopy(db, base, { brief, festival, lang }).replace(/\{\{(firstName|provider|treatment)\}\}/g, (x) => x)}\n${m.optOutText}`;
  return { body, notes: 'Rule-based draft: check names, fee, and link before approving.', engine: 'rules', promptId: prompt?.id || null };
}

/** The built-in wording for a goal, with no AI and no prompt approval needed. Used for one-tap campaigns from the growth screen. */
export function ruleDraft(db, { goal, lang = 'en', brief = '', festival = '' }) {
  const m = marketingSettings(db);
  const base = (RULE_COPY[goal] || RULE_COPY.custom)[lang === 'hi' ? 'hi' : 'en'];
  return { body: `${renderCopy(db, base, { brief, festival, lang })}
${m.optOutText}`, notes: 'Built-in wording: check names and details before approving.', engine: 'rules', promptId: null };
}

/* ---------- Campaigns ---------- */

export function createCampaign(db, { name, goal, segment = 'all', locationId = null, lang = 'en', body, notes = '', brief = '', festival = '', promptId = null, engine = 'manual', by = 'Staff', scheduledFor = null }) {
  if (!GOALS.some((g) => g.id === goal)) bad('Unknown goal');
  if (!SEGMENTS.some((s) => s.id === segment)) bad('Unknown segment');
  if (!body?.trim()) bad('Message body is required');
  const c = { id: id('cmp'), name: name || GOALS.find((g) => g.id === goal).name, goal, segment, locationId, lang, body, notes, brief, festival, promptId, engine, status: 'draft', createdBy: by, createdAt: nowIso(), updatedAt: nowIso(), history: [{ at: nowIso(), by, action: 'created' }], scheduledFor, audienceCount: segmentPatients(db, segment, { locationId }).length, eligibleCount: eligibleAudience(db, segment, locationId).length, sentCount: 0 };
  db.settings.marketingCampaigns ||= [];
  db.settings.marketingCampaigns.unshift(c);
  return c;
}

export function transition(db, campaign, action, { by, role, reason = '' }) {
  const managers = ['owner', 'admin'];
  const allowed = { submit: ['draft', 'rejected'], approve: ['pending_approval'], reject: ['pending_approval', 'approved'], withdraw: ['pending_approval', 'approved'], send: ['approved'] };
  if (!allowed[action]?.includes(campaign.status)) bad(`Cannot ${action} a campaign that is ${campaign.status.replace('_', ' ')}`);
  if (['approve', 'reject', 'send'].includes(action) && !managers.includes(role)) bad('Only an owner or admin can approve, reject, or send campaigns');
  if (action === 'approve' && campaign.createdBy === by && role !== 'owner') bad('A campaign must be approved by someone other than its author (owners excepted)');
  const next = { submit: 'pending_approval', approve: 'approved', reject: 'rejected', withdraw: 'draft', send: 'sent' }[action];
  campaign.status = next; campaign.updatedAt = nowIso();
  if (action === 'approve') { campaign.approvedBy = by; campaign.approvedAt = nowIso(); }
  campaign.history.push({ at: nowIso(), by, action, reason });
  return campaign;
}

const hourOf = (t) => Number(String(t).split(':')[0]);
/** Marketing messages only go out inside the quiet-hours window set under Marketing settings. */
export function sendWindowOpen(db, when = new Date()) {
  const m = marketingSettings(db); const h = when.getHours();
  return h >= hourOf(m.quietHours.start) && h < hourOf(m.quietHours.end);
}
/** The next moment a send is allowed: now if the window is open, otherwise the next opening time. */
export function nextSendWindow(db, from = new Date()) {
  if (sendWindowOpen(db, from)) return from.toISOString();
  const m = marketingSettings(db); const t = new Date(from); t.setHours(hourOf(m.quietHours.start), 0, 0, 0);
  if (t <= from) t.setDate(t.getDate() + 1);
  return t.toISOString();
}
export const windowMessage = (db) => { const m = marketingSettings(db); return `Marketing messages go out between ${m.quietHours.start} and ${m.quietHours.end} only.`; };

/** Sends every approved campaign whose scheduled time has come, if the send window is open. Run by the background job. */
export function dispatchScheduledCampaigns(db, { now = nowIso() } = {}) {
  let n = 0;
  for (const c of db.settings.marketingCampaigns || []) {
    if (c.status !== 'approved' || !c.scheduledFor || c.scheduledFor > now || !sendWindowOpen(db, new Date(now))) continue;
    try { transition(db, c, 'send', { by: 'Scheduled send', role: 'owner' }); sendCampaign(db, c, { by: 'Scheduled send', now: new Date(now) }); c.scheduledFor = null; n++; }
    catch (err) { c.status = 'approved'; c.scheduleError = err.message; }
  }
  return n;
}

export function sendCampaign(db, campaign, { by, now = new Date() }) {
  if (!sendWindowOpen(db, now)) bad(`${windowMessage(db)} Schedule it, or send within those hours.`);
  const everyone = segmentPatients(db, campaign.segment, { locationId: campaign.locationId });
  const patients = eligibleAudience(db, campaign.segment, campaign.locationId); // patients messaged within the frequency cap are skipped
  campaign.skippedRecent = everyone.length - patients.length;
  let n = 0;
  for (const p of patients) {
    const tp = db.treatmentPlans.find((t) => t.patientId === p.id && !t.nextVisitScheduled);
    const prov = db.settings.providers.find((x) => x.id === tp?.providerId);
    const body = renderCopy(db, campaign.body, { patient: p, provider: prov, treatment: tp?.items.filter((i) => ['recommended', 'accepted'].includes(i.status)).map((i) => i.procedure).join(', '), location: (db.settings.locations || []).find((l) => l.id === p.locationId), festival: campaign.festival, brief: campaign.brief, lang: campaign.lang });
    sendCommunication(db, { patientId: p.id, type: 'marketing', body, meta: { campaignId: campaign.id, goal: campaign.goal }, by: `Campaign: ${campaign.name}` });
    n++;
  }
  campaign.sentCount = n; campaign.sentAt = nowIso(); campaign.sentBy = by;
  log(db, 'marketing', `${by} sent campaign "${campaign.name}" to ${n} patient${n === 1 ? '' : 's'}${campaign.skippedRecent ? ` (${campaign.skippedRecent} skipped: messaged within ${marketingSettings(db).frequencyCapDays} days)` : ''}`);
  emit(db, 'campaign.sent', { campaignId: campaign.id, goal: campaign.goal, sentCount: n });
  return n;
}

/* ---------- Automatic per-patient messages (thank-you, review, welcome, aftercare, birthday) ---------- */

const modeFor = (m, goal) => (goal === 'thank_you' ? m.autoThankYou : goal === 'review' ? m.autoReview : m.automations?.[goal])?.mode;
const enabledFor = (m, goal) => !!(goal === 'thank_you' ? m.autoThankYou : goal === 'review' ? m.autoReview : m.automations?.[goal])?.enabled;

/** Puts one message in the approval queue (or straight to approved when the clinic pre-approved the prompt). Returns null if it already exists. */
export function queueMessage(db, { goal, patient, appointment = null, ctx = {}, delayMin = 0, key }) {
  const m = marketingSettings(db);
  db.settings.marketingQueue ||= [];
  key ||= `${goal}:${appointment?.id || patient.id}`;
  if (db.settings.marketingQueue.some((q) => q.key === key || (appointment && q.appointmentId === appointment.id && q.goal === goal && !q.key))) return null;
  const prompt = db.settings.marketingPrompts.find((p) => p.goal === goal);
  const lang = patient.preferredLanguage || 'en';
  const base = RULE_COPY[goal][lang === 'hi' ? 'hi' : 'en'];
  const body = renderCopy(db, base, { patient, lang, ...ctx }) + (['thank_you', 'review', 'aftercare'].includes(goal) ? '' : `\n${m.optOutText}`);
  const item = { id: id('mq'), key, goal, appointmentId: appointment?.id || null, patientId: patient.id, body, lang, status: 'pending_approval', createdAt: nowIso(), sendAfter: new Date(Date.now() + delayMin * 60000).toISOString(), promptId: prompt?.id || null, promptApproved: prompt?.status === 'approved' };
  // "auto" mode: the template was pre-approved by a human; send without per-message approval and record who approved the template.
  if (modeFor(m, goal) === 'auto' && item.promptApproved) { item.status = 'approved'; item.approvedBy = `Pre-approved template (${prompt.approvedBy || 'owner'})`; item.approvedAt = nowIso(); }
  db.settings.marketingQueue.unshift(item);
  return item;
}

export function queueVisitFollowups(db, appointment) {
  const m = marketingSettings(db);
  const patient = db.patients.find((p) => p.id === appointment.patientId);
  if (!patient) return [];
  const optedOut = patient.marketingOptIn === false;
  const ctx = { provider: db.settings.providers.find((p) => p.id === appointment.providerId), visitType: db.settings.visitTypes.find((v) => v.id === appointment.visitTypeId), location: (db.settings.locations || []).find((l) => l.id === appointment.locationId) };
  const out = []; const add = (goal, delayMin) => { if (!enabledFor(m, goal)) return; const q = queueMessage(db, { goal, patient, appointment, ctx, delayMin }); if (q) out.push(q); };
  if (!optedOut) {
    add('thank_you', m.autoThankYou?.delayMinutes || 60);
    if (m.googleReviewUrl) add('review', (m.autoReview?.delayHours || 4) * 60);
    const completed = db.appointments.filter((a) => a.patientId === patient.id && a.status === 'completed').length;
    if (completed <= 1) add('welcome', 180);
  }
  if (AFTERCARE_VISITS.includes(appointment.visitTypeId)) add('aftercare', 20 * 60); // a care message, so it does not depend on marketing opt-in
  return out;
}

/** Birthday wishes: once a year per patient, queued on the day. Run by the background job. */
export function queueBirthdays(db, { now = new Date() } = {}) {
  const m = marketingSettings(db);
  if (!enabledFor(m, 'birthday')) return 0;
  const md = dayKey(now.toISOString()).slice(5); const year = dayKey(now.toISOString()).slice(0, 4);
  let n = 0;
  for (const p of db.patients) {
    if (p.marketingOptIn === false || !p.phone || !p.dob || p.dob.slice(5) !== md) continue;
    if (queueMessage(db, { goal: 'birthday', patient: p, key: `birthday:${p.id}:${year}`, delayMin: 0 })) n++;
  }
  return n;
}

const SEND_IN_WINDOW_ONLY = new Set(['birthday', 'welcome']);
const COMM_TYPE = { review: 'review_request', thank_you: 'thank_you', aftercare: 'aftercare' };

export function dispatchQueue(db, { by = 'Clinovara', now = nowIso() } = {}) {
  db.settings.marketingQueue ||= [];
  let n = 0;
  for (const item of db.settings.marketingQueue) {
    if (item.status !== 'approved' || item.sendAfter > now) continue;
    if (SEND_IN_WINDOW_ONLY.has(item.goal) && !sendWindowOpen(db, new Date(now))) continue;
    const type = COMM_TYPE[item.goal] || 'marketing';
    sendCommunication(db, { patientId: item.patientId, type, body: item.body, appointmentId: item.appointmentId, meta: { queueId: item.id, goal: item.goal }, by });
    item.status = 'sent'; item.sentAt = now; n++;
  }
  db.settings.marketingQueue = db.settings.marketingQueue.filter((q) => q.status !== 'sent' || q.sentAt > addDays(now, -30));
  return n;
}
