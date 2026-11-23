import { Router } from 'express';
import { id, nowIso, addDays, addMinutes, bad, HttpError, log } from '../lib.js';
import { strongPassword, verifyPassword, createSession, issueCode, consumeCode, normEmail, normPhone, publicUser, ROLES, ROLE_LABEL, MANAGERS } from '../domain/auth.js';
import { DEMO } from '../registry.js';
import { sendEmail, codeEmail, mailConfigured, smsConfigured, canShowDevCodes, isProd } from '../domain/mailer.js';
import { rateLimit } from '../lib-ratelimit.js';
import { sendSms, intl } from '../domain/providers.js';

const r = Router();
const byTarget = (req) => String(req.body?.email || req.body?.phone || '').toLowerCase();
r.post('/login', rateLimit({ name: 'login', windowMs: 10 * 60000, max: 20, key: byTarget }));
for (const path of ['/code', '/signup/code']) r.post(path, rateLimit({ name: 'code', windowMs: 10 * 60000, max: 6, key: byTarget }));
for (const path of ['/verify', '/signup/verify', '/register']) r.post(path, rateLimit({ name: 'verify', windowMs: 10 * 60000, max: 20 }));

/** Sends a one-time code over its channel. Returns the code only when running locally with no provider, so nothing leaks in production. */
async function deliver({ channel, to, code, purpose, dial = '91' }) {
  if (channel === 'email') {
    if (mailConfigured()) { const m = codeEmail(code, purpose); await sendEmail({ to, ...m }); return {}; }
  } else if (smsConfigured()) { await sendSms(intl(to, dial), `${code} is your Clinovara verification code. It expires in 10 minutes.`); return {}; }
  if (canShowDevCodes(channel)) return { devCode: code, note: `No ${channel === 'email' ? 'email' : 'SMS'} provider is connected in this build, so the code is shown here.` };
  throw new HttpError(503, channel === 'email' ? 'Email delivery is not available right now. Please try again later.' : 'Mobile codes are not available yet. Use your email instead.');
}
/** Phone verification is skipped (and the phone stays unverified) while no SMS provider exists in production. */
const phoneVerificationOn = () => smsConfigured() || !isProd();

function membershipsOf(platform, userId) {
  return platform.db.memberships.filter((m) => m.userId === userId && m.status === 'active').map((m) => { const t = platform.db.tenants.find((x) => x.id === m.tenantId); return t ? { tenantId: t.id, slug: t.slug, name: t.name, role: m.role, plan: t.plan, demo: !!t.demo, onboardingCompleted: !!t.onboarding?.completed } : null; }).filter(Boolean);
}
function me(req, session) {
  const platform = req.registry.platform;
  const user = platform.db.users.find((u) => u.id === session.userId);
  const tenant = platform.db.tenants.find((t) => t.id === session.tenantId) || null;
  const membership = tenant ? platform.db.memberships.find((m) => m.userId === user.id && m.tenantId === tenant.id && m.status === 'active') : null;
  return { token: session.token, user: publicUser(user), tenant: tenant ? { id: tenant.id, slug: tenant.slug, name: tenant.name, city: tenant.city, plan: tenant.plan, trialEndsAt: tenant.trialEndsAt, demo: !!tenant.demo, onboarding: tenant.onboarding } : null, role: membership?.role || null, providerId: membership?.providerId || null, canManage: !!membership && MANAGERS.has(membership.role), memberships: membershipsOf(platform, user.id), roles: ROLES.map((x) => ({ id: x, label: ROLE_LABEL[x] })) };
}

const CLINIC_TYPES = ['General dental clinic', 'Multi-specialty dental clinic', 'Orthodontic clinic', 'Pediatric dental clinic', 'Oral surgery / implant centre', 'Dental chain / group', 'Other'];
/** Phone numbers are stored as national digits; +91 numbers must be exactly 10 digits, others 6-14. */
function checkPhone(raw, dial) {
  const phone = normPhone(raw);
  if (!phone) bad('A phone number is required');
  if (String(dial || '91') === '91' ? phone.length !== 10 : phone.length < 6 || phone.length > 14) bad('Enter a valid phone number for the selected country code');
  return phone;
}
const checkEmail = (e) => { const email = normEmail(e); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) bad('A valid email is required'); return email; };

/** Step 1 of sign-up: send a verification code to the business email or the phone. Nothing is created until both are verified at /register. */
r.post('/signup/code', async (req, res) => {
  const platform = req.registry.platform; const b = req.body || {};
  const channel = b.channel === 'phone' ? 'sms' : 'email';
  if (channel === 'sms' && !phoneVerificationOn()) return res.json({ skipped: true, channel });
  const to = channel === 'sms' ? checkPhone(b.phone, b.dial) : checkEmail(b.email);
  if (channel === 'email' && platform.db.users.some((u) => u.email === to)) throw new HttpError(409, 'An account with this email already exists. Log in instead.');
  const last = platform.db.otps.find((o) => o.to === to && o.purpose === 'signup');
  if (last && Date.now() - Date.parse(last.createdAt) < 30000) throw new HttpError(429, 'Please wait 30 seconds before asking for another code');
  const code = issueCode(platform, { channel, to, purpose: 'signup' });
  res.json({ sent: true, to, channel, ...(await deliver({ channel, to, code, purpose: 'signup', dial: String(b.dial || '91') })) });
});

/** Checks one code. On success the address is marked verified for 30 minutes so /register can complete. */
r.post('/signup/verify', (req, res) => {
  const platform = req.registry.platform; const b = req.body || {};
  const to = b.channel === 'phone' ? checkPhone(b.phone, b.dial) : checkEmail(b.email);
  consumeCode(platform, { to, purpose: 'signup', code: b.code });
  platform.db.otps = platform.db.otps.filter((o) => !(o.to === to && o.purpose === 'signup-ok'));
  platform.db.otps.push({ id: id('otp'), channel: b.channel === 'phone' ? 'sms' : 'email', to, purpose: 'signup-ok', code: 'ok', attempts: 0, expiresAt: addMinutes(nowIso(), 30), createdAt: nowIso() });
  platform.save();
  res.json({ verified: true, to });
});

/** Sign up: needs a verified email and phone code. Creates the account, the clinic, an owner membership and a session. `demo: true` starts from the demo data instead of a blank clinic. */
r.post('/register', (req, res) => {
  const platform = req.registry.platform; const b = req.body || {};
  if (!b.name?.trim()) bad('Your full name is required');
  if (!b.clinicName?.trim()) bad('Clinic name is required');
  if (!CLINIC_TYPES.includes(b.clinicType)) bad('Choose a clinic type');
  if (!b.country) bad('Choose a country');
  if (!b.city?.trim()) bad('City is required');
  if (!b.state?.trim()) bad('State / region is required');
  const email = checkEmail(b.email); const phone = checkPhone(b.phone, b.dial);
  if (b.password !== b.confirmPassword) bad('Passwords do not match');
  if (!b.acceptTerms) bad('Accept the Terms of Service and Privacy Policy to continue');
  if (platform.db.users.some((u) => u.email === email)) throw new HttpError(409, 'An account with this email already exists. Log in instead.');
  const hp = strongPassword(b.password);
  const okFor = (to) => platform.db.otps.some((o) => o.to === to && o.purpose === 'signup-ok' && o.expiresAt > nowIso());
  if (!okFor(email)) bad('Verify your email address first');
  const phoneChecked = phoneVerificationOn();
  if (phoneChecked && !okFor(phone)) bad('Verify your phone number first');
  platform.db.otps = platform.db.otps.filter((o) => !(o.purpose === 'signup-ok' && (o.to === email || o.to === phone)));
  const user = { id: id('usr'), name: b.name.trim(), email, phone, phoneDial: String(b.dial || '91'), ...hp, emailVerifiedAt: nowIso(), phoneVerifiedAt: phoneChecked ? nowIso() : null, termsAcceptedAt: nowIso(), createdAt: nowIso(), lastLoginAt: nowIso() };
  platform.db.users.push(user);
  const tenant = req.registry.createTenant({ name: b.clinicName.trim(), city: b.city.trim(), ownerId: user.id, demo: !!b.demo });
  const store = req.registry.tenantStore(tenant.id);
  if (!tenant.demo) { const s = store.db.settings; const dial = user.phoneDial; s.practice.phone = `+${dial} ${phone}`; s.practice.whatsapp = s.practice.phone; s.practice.email = email; s.practice.city = b.city.trim(); s.practice.state = String(b.state || '').trim(); s.practice.clinicType = b.clinicType; s.practice.country = b.country; s.practice.ownerName = user.name; store.save(); }
  log(store.db, 'settings', `${user.name} registered ${tenant.name} on Clinovara`);
  store.save();
  const session = createSession(platform, { userId: user.id, tenantId: tenant.id });
  res.status(201).json(me(req, session));
});

r.post('/login', (req, res) => {
  const platform = req.registry.platform; const b = req.body || {};
  const email = normEmail(b.email);
  const user = platform.db.users.find((u) => u.email === email);
  if (!user || !verifyPassword(user, b.password)) throw new HttpError(401, 'Email or password is incorrect');
  const ms = membershipsOf(platform, user.id);
  if (!ms.length) throw new HttpError(403, 'This account is not a member of any clinic yet');
  const tenantId = (b.tenantSlug && ms.find((m) => m.slug === b.tenantSlug)?.tenantId) || (ms.some((m) => m.tenantId === user.lastTenantId) ? user.lastTenantId : ms[0].tenantId);
  user.lastLoginAt = nowIso(); user.lastTenantId = tenantId; platform.save();
  res.json(me(req, createSession(platform, { userId: user.id, tenantId })));
});

r.post('/demo', (req, res) => {
  const platform = req.registry.platform;
  const tenant = req.registry.ensureDemo();
  const role = ['owner', 'front_desk', 'dentist'].includes(req.body?.role) ? req.body.role : 'owner';
  const email = role === 'front_desk' ? 'frontdesk@smilecare.example' : role === 'dentist' ? 'vikram@smilecare.example' : DEMO.email;
  const user = platform.db.users.find((u) => u.email === email);
  res.json(me(req, createSession(platform, { userId: user.id, tenantId: tenant.id, days: 1 })));
});

/** Mobile OTP login / password reset. The code is returned as `devCode` because no SMS provider is connected. */
r.post('/code', async (req, res) => {
  const platform = req.registry.platform; const b = req.body || {};
  const purpose = b.purpose === 'reset' ? 'reset' : 'login';
  const to = b.phone ? normPhone(b.phone) : normEmail(b.email);
  if (!to) bad('Enter your mobile number or email');
  const channel = b.phone ? 'sms' : 'email';
  const user = platform.db.users.find((u) => (b.phone ? u.phone === to : u.email === to));
  // Same answer whether or not the account exists, so this cannot be used to discover who has an account (in production).
  if (!user) { if (isProd()) return res.json({ sent: true, to, channel }); throw new HttpError(404, 'No account found for that number or email'); }
  const code = issueCode(platform, { channel, to, purpose });
  res.json({ sent: true, to, channel, ...(await deliver({ channel, to, code, purpose, dial: user.phoneDial || '91' })) });
});
r.post('/verify', (req, res) => {
  const platform = req.registry.platform; const b = req.body || {};
  const to = b.phone ? normPhone(b.phone) : normEmail(b.email);
  const purpose = b.purpose === 'reset' ? 'reset' : 'login';
  consumeCode(platform, { to, purpose, code: b.code });
  const user = platform.db.users.find((u) => (b.phone ? u.phone === to : u.email === to));
  if (!user) throw new HttpError(404, 'Account not found');
  if (purpose === 'reset') { Object.assign(user, strongPassword(b.newPassword)); platform.save(); }
  const ms = membershipsOf(platform, user.id);
  if (!ms.length) throw new HttpError(403, 'This account is not a member of any clinic yet');
  user.lastLoginAt = nowIso(); platform.save();
  res.json(me(req, createSession(platform, { userId: user.id, tenantId: ms.some((m) => m.tenantId === user.lastTenantId) ? user.lastTenantId : ms[0].tenantId })));
});

r.get('/me', (req, res) => { if (!req.session) throw new HttpError(401, 'Not logged in'); res.json(me(req, req.session)); });
r.post('/logout', (req, res) => { const platform = req.registry.platform; if (req.session) { platform.db.sessions = platform.db.sessions.filter((s) => s.token !== req.session.token); platform.save(); } res.json({ ok: true }); });
r.post('/switch', (req, res) => {
  if (!req.session) throw new HttpError(401, 'Not logged in');
  const platform = req.registry.platform;
  const m = platform.db.memberships.find((x) => x.userId === req.session.userId && x.tenantId === req.body?.tenantId && x.status === 'active');
  if (!m) throw new HttpError(403, 'You are not a member of that clinic');
  req.session.tenantId = m.tenantId; const user = platform.db.users.find((u) => u.id === req.session.userId); user.lastTenantId = m.tenantId; platform.save();
  res.json(me(req, req.session));
});
r.patch('/me', (req, res) => {
  if (!req.session) throw new HttpError(401, 'Not logged in');
  const platform = req.registry.platform; const user = platform.db.users.find((u) => u.id === req.session.userId); const b = req.body || {};
  if (b.name) user.name = b.name.trim();
  if (b.phone !== undefined) user.phone = normPhone(b.phone);
  if (b.newPassword) { if (!verifyPassword(user, b.currentPassword)) throw new HttpError(400, 'Current password is incorrect'); Object.assign(user, strongPassword(b.newPassword)); }
  platform.save();
  res.json(me(req, req.session));
});

/** Invitation acceptance (the invite itself is created in /api/team). */
r.get('/invite/:token', (req, res) => {
  const platform = req.registry.platform;
  const inv = platform.db.invites.find((i) => i.token === req.params.token);
  if (!inv || inv.status !== 'pending' || inv.expiresAt < nowIso()) throw new HttpError(404, 'This invitation is no longer valid');
  const tenant = platform.db.tenants.find((t) => t.id === inv.tenantId);
  const existing = platform.db.users.find((u) => u.email === inv.email);
  res.json({ clinic: tenant?.name, role: inv.role, roleLabel: ROLE_LABEL[inv.role], email: inv.email, name: inv.name, invitedBy: inv.invitedByName, existingAccount: !!existing });
});
r.post('/invite/:token/accept', (req, res) => {
  const platform = req.registry.platform; const b = req.body || {};
  const inv = platform.db.invites.find((i) => i.token === req.params.token);
  if (!inv || inv.status !== 'pending' || inv.expiresAt < nowIso()) throw new HttpError(404, 'This invitation is no longer valid');
  let user = platform.db.users.find((u) => u.email === inv.email);
  if (user) { if (!verifyPassword(user, b.password)) throw new HttpError(401, 'Enter the password of your existing account to accept'); }
  else { user = { id: id('usr'), name: (b.name || inv.name || '').trim() || inv.email, email: inv.email, phone: normPhone(b.phone), ...strongPassword(b.password), createdAt: nowIso() }; platform.db.users.push(user); }
  if (!platform.db.memberships.some((m) => m.userId === user.id && m.tenantId === inv.tenantId)) platform.db.memberships.push({ id: id('mem'), userId: user.id, tenantId: inv.tenantId, role: inv.role, status: 'active', createdAt: nowIso(), invitedBy: inv.invitedBy, providerId: inv.providerId || null });
  inv.status = 'accepted'; inv.acceptedAt = nowIso(); user.lastTenantId = inv.tenantId; platform.save();
  res.json(me(req, createSession(platform, { userId: user.id, tenantId: inv.tenantId })));
});

/** What each role may do, for the Roles and permissions screen. */
r.get('/permissions', async (req, res) => {
  const { permissionMatrix } = await import('../app.js');
  res.json({ roles: [['owner', 'Owner'], ['admin', 'Admin'], ['front_desk', 'Front desk'], ['dentist', 'Dentist'], ['hygienist', 'Hygienist']].map(([id, label]) => ({ id, label })), matrix: permissionMatrix() });
});

export default r;
