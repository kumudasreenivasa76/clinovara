import { Router } from 'express';
import { sendEmail, mailConfigured } from '../domain/mailer.js';
import crypto from 'node:crypto';
import { id, nowIso, addDays, bad, HttpError, log } from '../lib.js';
import { ROLES, ROLE_LABEL, MANAGERS, publicUser, normEmail } from '../domain/auth.js';

const r = Router();

function list(req) {
  const platform = req.registry.platform;
  const members = platform.db.memberships.filter((m) => m.tenantId === req.tenant.id && m.status === 'active').map((m) => { const u = platform.db.users.find((x) => x.id === m.userId); return { id: m.id, userId: m.userId, role: m.role, roleLabel: ROLE_LABEL[m.role], providerId: m.providerId || null, user: publicUser(u), joinedAt: m.createdAt, isYou: m.userId === req.session.userId }; });
  const invites = platform.db.invites.filter((i) => i.tenantId === req.tenant.id && i.status === 'pending' && i.expiresAt > nowIso()).map((i) => ({ id: i.id, email: i.email, name: i.name, role: i.role, roleLabel: ROLE_LABEL[i.role], providerId: i.providerId, link: `${req.frontendBase}#/invite/${i.token}`, expiresAt: i.expiresAt, invitedByName: i.invitedByName }));
  return { members, invites, roles: ROLES.map((x) => ({ id: x, label: ROLE_LABEL[x] })) };
}

r.get('/', (req, res) => res.json(list(req)));

r.post('/invites', async (req, res) => {
  const platform = req.registry.platform; const b = req.body || {};
  const email = normEmail(b.email);
  if (!email) bad('Email is required');
  if (!ROLES.includes(b.role)) bad('Choose a role');
  if (b.role === 'owner' && req.role !== 'owner') throw new HttpError(403, 'Only the owner can invite another owner');
  const user = platform.db.users.find((u) => u.email === email);
  if (user && platform.db.memberships.some((m) => m.userId === user.id && m.tenantId === req.tenant.id && m.status === 'active')) bad('That person is already on the team');
  platform.db.invites = platform.db.invites.filter((i) => !(i.tenantId === req.tenant.id && i.email === email && i.status === 'pending'));
  const inv = { id: id('inv'), token: crypto.randomBytes(18).toString('base64url'), tenantId: req.tenant.id, email, name: b.name || '', role: b.role, providerId: b.providerId || null, invitedBy: req.session.userId, invitedByName: req.user, status: 'pending', createdAt: nowIso(), expiresAt: addDays(nowIso(), 7) };
  platform.db.invites.push(inv); platform.save();
  log(req.db, 'team', `${req.user} invited ${email} as ${ROLE_LABEL[b.role]}`); req.store.save();
  const link = `${req.frontendBase}#/invite/${inv.token}`;
  // The link is always returned so it can also be shared on WhatsApp; it is emailed too when an email provider is configured.
  let emailed = false;
  if (mailConfigured()) {
    try { await sendEmail({ to: email, subject: `${req.user} invited you to ${req.tenant.name} on Clinovara`, text: `${req.user} invited you to join ${req.tenant.name} as ${ROLE_LABEL[b.role]}.

Accept the invitation: ${link}

The link works for 7 days.`, html: `<p>${req.user} invited you to join <b>${req.tenant.name}</b> as ${ROLE_LABEL[b.role]}.</p><p><a href="${link}">Accept the invitation</a></p><p style="color:#666;font-size:13px">The link works for 7 days.</p>` }); emailed = true; } catch { /* the owner can still share the link */ }
  }
  res.status(201).json({ ...list(req), link, emailed, note: emailed ? `Invitation emailed to ${email}.` : 'Share this link with your team member.' });
});
r.delete('/invites/:id', (req, res) => { const platform = req.registry.platform; platform.db.invites = platform.db.invites.filter((i) => !(i.id === req.params.id && i.tenantId === req.tenant.id)); platform.save(); res.json(list(req)); });

r.patch('/members/:id', (req, res) => {
  const platform = req.registry.platform; const m = platform.db.memberships.find((x) => x.id === req.params.id && x.tenantId === req.tenant.id);
  if (!m) throw new HttpError(404, 'Member not found');
  const b = req.body || {};
  if (b.role) {
    if (!ROLES.includes(b.role)) bad('Unknown role');
    if ((m.role === 'owner' || b.role === 'owner') && req.role !== 'owner') throw new HttpError(403, 'Only the owner can change owner roles');
    if (m.role === 'owner' && b.role !== 'owner' && platform.db.memberships.filter((x) => x.tenantId === req.tenant.id && x.role === 'owner' && x.status === 'active').length === 1) bad('A clinic needs at least one owner');
    m.role = b.role;
  }
  if (b.providerId !== undefined) m.providerId = b.providerId || null;
  platform.save();
  res.json(list(req));
});
r.delete('/members/:id', (req, res) => {
  const platform = req.registry.platform; const m = platform.db.memberships.find((x) => x.id === req.params.id && x.tenantId === req.tenant.id);
  if (!m) throw new HttpError(404, 'Member not found');
  if (m.role === 'owner') bad('Transfer ownership before removing an owner');
  if (m.userId === req.session.userId) bad('You cannot remove yourself');
  m.status = 'removed'; m.removedAt = nowIso(); platform.save();
  res.json(list(req));
});

export { MANAGERS };
export default r;
