import { Router } from 'express';
import { id, nowIso, addDays, bad, HttpError, log } from '../lib.js';
import { hashPassword, verifyPassword, createSession, issueCode, consumeCode, normEmail, normPhone, publicUser, ROLES, ROLE_LABEL, MANAGERS } from '../domain/auth.js';
import { DEMO } from '../registry.js';

const r = Router();

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

/** Sign up: creates the account, the clinic, an owner membership and a session. `demo: true` starts from the demo data instead of a blank clinic. */
r.post('/register', (req, res) => {
  const platform = req.registry.platform; const b = req.body || {};
  const email = normEmail(b.email); const phone = normPhone(b.phone);
  if (!b.name?.trim()) bad('Your name is required');
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) bad('A valid email is required');
  if (phone && phone.length !== 10) bad('Mobile number must be 10 digits');
  if (!b.clinicName?.trim()) bad('Clinic name is required');
  if (platform.db.users.some((u) => u.email === email)) throw new HttpError(409, 'An account with this email already exists. Log in instead.');
  const user = { id: id('usr'), name: b.name.trim(), email, phone, ...hashPassword(b.password), createdAt: nowIso(), lastLoginAt: nowIso() };
  platform.db.users.push(user);
  const tenant = req.registry.createTenant({ name: b.clinicName.trim(), city: b.city || '', ownerId: user.id, demo: !!b.demo });
  const store = req.registry.tenantStore(tenant.id);
  if (!tenant.demo) { const s = store.db.settings; s.practice.phone = b.clinicPhone || (phone ? `+91 ${phone.slice(0, 5)} ${phone.slice(5)}` : ''); s.practice.whatsapp = s.practice.phone; s.practice.email = email; s.practice.city = b.city || ''; store.save(); }
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
r.post('/code', (req, res) => {
  const platform = req.registry.platform; const b = req.body || {};
  const purpose = b.purpose === 'reset' ? 'reset' : 'login';
  const to = b.phone ? normPhone(b.phone) : normEmail(b.email);
  if (!to) bad('Enter your mobile number or email');
  const user = platform.db.users.find((u) => (b.phone ? u.phone === to : u.email === to));
  if (!user) throw new HttpError(404, 'No account found for that number or email');
  const code = issueCode(platform, { channel: b.phone ? 'sms' : 'email', to, purpose });
  res.json({ sent: true, to, channel: b.phone ? 'sms' : 'email', devCode: code, note: 'No SMS/email provider is connected in this build, so the code is shown here.' });
});
r.post('/verify', (req, res) => {
  const platform = req.registry.platform; const b = req.body || {};
  const to = b.phone ? normPhone(b.phone) : normEmail(b.email);
  const purpose = b.purpose === 'reset' ? 'reset' : 'login';
  consumeCode(platform, { to, purpose, code: b.code });
  const user = platform.db.users.find((u) => (b.phone ? u.phone === to : u.email === to));
  if (!user) throw new HttpError(404, 'Account not found');
  if (purpose === 'reset') { Object.assign(user, hashPassword(b.newPassword)); platform.save(); }
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
  if (b.newPassword) { if (!verifyPassword(user, b.currentPassword)) throw new HttpError(400, 'Current password is incorrect'); Object.assign(user, hashPassword(b.newPassword)); }
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
  else { user = { id: id('usr'), name: (b.name || inv.name || '').trim() || inv.email, email: inv.email, phone: normPhone(b.phone), ...hashPassword(b.password), createdAt: nowIso() }; platform.db.users.push(user); }
  if (!platform.db.memberships.some((m) => m.userId === user.id && m.tenantId === inv.tenantId)) platform.db.memberships.push({ id: id('mem'), userId: user.id, tenantId: inv.tenantId, role: inv.role, status: 'active', createdAt: nowIso(), invitedBy: inv.invitedBy, providerId: inv.providerId || null });
  inv.status = 'accepted'; inv.acceptedAt = nowIso(); user.lastTenantId = inv.tenantId; platform.save();
  res.json(me(req, createSession(platform, { userId: user.id, tenantId: inv.tenantId })));
});

export default r;
