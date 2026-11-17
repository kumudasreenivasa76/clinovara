/**
 * Guided clinic onboarding. Progress lives on the tenant record; content is written through the normal
 * settings/patients endpoints so nothing here duplicates business rules. `status` derives each step's
 * completeness from the actual data, so the checklist stays honest even if a step is edited later.
 */
import { Router } from 'express';
import { nowIso, log } from '../lib.js';
import { VISIT_TYPE_PRESETS, defaultHolidays } from '../seed.js';
import { templateBody } from '../domain/messaging.js';

const r = Router();

/** `core` steps are the short guided path to a working front desk; the rest are optional and can be finished later from the dashboard banner. */
export const STEPS = [
  { key: 'profile', title: 'Clinic profile', hint: 'Name, contact, registrations', core: true, minutes: 3 },
  { key: 'branches', title: 'Branches & hours', hint: 'Address, timings, holidays, chairs', core: true, minutes: 3 },
  { key: 'team', title: 'Dentists & team', hint: 'Dentists, hygienists, staff logins', core: true, minutes: 4 },
  { key: 'services', title: 'Services & fees', hint: 'Visit types, durations, ₹', core: true, minutes: 3 },
  { key: 'launch', title: 'Go live', hint: 'Kiosk, display, test booking', core: true, minutes: 2 },
  { key: 'payments', title: 'Payments & schemes', hint: 'UPI, cards, cashless, PM-JAY, CGHS', minutes: 2 },
  { key: 'languages', title: 'Languages & messages', hint: 'WhatsApp, Hindi/Kannada templates', minutes: 3 },
  { key: 'frontdesk', title: 'AI front desk', hint: 'Approved answers, escalation, Claude', minutes: 5 },
  { key: 'patients', title: 'Patients', hint: 'Import from your current software', minutes: 5 },
  { key: 'marketing', title: 'Marketing & thank-yous', hint: 'Review link, approvals, prompts', minutes: 4 },
  { key: 'integrations', title: 'Integrations', hint: 'Email, SMS, WhatsApp, webhooks (optional)', minutes: 5 },
];

export function onboardingStatus(req) {
  const db = req.db; const s = db.settings; const t = req.tenant;
  const platform = req.registry.platform;
  const members = platform.db.memberships.filter((m) => m.tenantId === t.id && m.status === 'active').length;
  const invites = platform.db.invites.filter((i) => i.tenantId === t.id && i.status === 'pending' && i.expiresAt > nowIso()).length;
  const checks = {
    profile: [['Clinic name', !!s.practice.name && s.practice.name !== 'My Dental Clinic'], ['Phone or WhatsApp number', !!(s.practice.phone || s.practice.whatsapp)], ['Email', !!s.practice.email], ['Street address', !!s.practice.address], ['City & state', !!(s.practice.city && s.practice.state)]],
    branches: [['At least one branch with an address', s.locations.some((l) => l.address)], ['Opening hours set', s.locations.every((l) => Object.values(l.hours || s.practice.hours).some(Boolean))], ['Holidays reviewed', (s.holidays || []).length > 0], ['Kiosk code per branch', s.locations.every((l) => l.kioskCode)]],
    team: [['At least one dentist', s.providers.some((p) => p.role === 'Dentist')], ['Every dentist assigned to a branch', s.providers.every((p) => p.locationIds?.length)], ['Consultation fees set', s.providers.filter((p) => p.role === 'Dentist').every((p) => p.consultationFee > 0)]],
    services: [['Visit types configured', s.visitTypes.length >= 3], ['Fees set on paid visit types', s.visitTypes.filter((v) => ['vt_cleaning', 'vt_newpatient', 'vt_urgent'].includes(v.id)).every((v) => v.fee > 0)], ['Patient words for the AI', s.visitTypes.every((v) => v.keywords?.length)]],
    payments: [['Payment modes', (s.paymentModes || []).length > 0], ['Insurance / schemes reviewed', (s.insuranceOptions || []).length > 0], ['Payment FAQ mentions your prices', /₹\s?\d/.test(s.faqs.find((f) => f.id === 'faq_payment')?.answer || '')]],
    languages: [['Languages chosen', (s.locale?.languages || []).length >= 1], ['Default channel chosen', !!s.locale?.defaultChannel], ['Templates reviewed', s.templates.every((tp) => !!templateBody(db, tp, 'en'))]],
    frontdesk: [['Hours FAQ matches your timings', !(s.faqs.find((f) => f.id === 'faq_hours')?.answer || '').includes('Whitefield')], ['Location FAQ has your address', !/update the address/i.test(s.faqs.find((f) => f.id === 'faq_location')?.answer || '')], ['Insurance FAQ lists your insurers', !!s.faqs.find((f) => f.id === 'faq_insurance')?.answer], ['Escalation words reviewed', (s.escalationKeywords || []).length > 0]],
    patients: [['Patients imported or added', db.patients.length > 0]],
    marketing: [['Google review link added', !!s.marketing?.googleReviewUrl], ['Thank-you messages configured', !!s.marketing?.autoThankYou], ['Prompts reviewed by an owner', (s.marketingPrompts || []).some((p) => p.status === 'approved' && p.approvedBy)]],
    integrations: [['(Optional) API key generated', !!s.integrations?.apiKey], ['(Optional) Messaging provider chosen', !!s.integrations?.messaging?.provider && s.integrations.messaging.provider !== 'none']],
    launch: [['Clinic launched', !!t.onboarding?.completed]],
  };
  const steps = STEPS.map((st) => { const items = checks[st.key].map(([label, ok]) => ({ label, ok })); const optional = st.key === 'integrations'; const done = optional || items.every((i) => i.ok); return { ...st, items, done, optional, skipped: !!t.onboarding?.steps?.[`${st.key}Skipped`] }; });
  const required = steps.filter((x) => x.core);
  const percent = Math.round((required.filter((x) => x.done).length / required.length) * 100);
  return { steps, percent, completed: !!t.onboarding?.completed, launchedAt: t.onboarding?.launchedAt || null, presets: { visitTypes: VISIT_TYPE_PRESETS, holidays: defaultHolidays() }, kioskUrl: `${req.frontendBase}#/kiosk?t=${t.slug}&code=${s.locations[0]?.kioskCode || ''}`, boardUrl: `${req.frontendBase}#/board?t=${t.slug}&location=${s.locations[0]?.id || ''}`, chatUrl: `${req.frontendBase}#/patient?t=${t.slug}`, tenant: { slug: t.slug, name: t.name, plan: t.plan, trialEndsAt: t.trialEndsAt } };
}

r.get('/', (req, res) => res.json(onboardingStatus(req)));
r.post('/mark', (req, res) => {
  const t = req.tenant; t.onboarding ||= { steps: {} }; t.onboarding.steps ||= {};
  for (const k of Object.keys(req.body || {})) t.onboarding.steps[k] = req.body[k];
  req.registry.platform.save();
  res.json(onboardingStatus(req));
});
r.post('/complete', (req, res) => {
  const t = req.tenant; t.onboarding ||= { steps: {} }; t.onboarding.completed = true; t.onboarding.launchedAt = nowIso();
  req.registry.platform.save();
  log(req.db, 'settings', `${req.user} completed onboarding — ${t.name} is live`); req.store.save();
  res.json(onboardingStatus(req));
});
r.post('/reopen', (req, res) => { const t = req.tenant; t.onboarding ||= { steps: {} }; t.onboarding.completed = false; req.registry.platform.save(); res.json(onboardingStatus(req)); });

export default r;
