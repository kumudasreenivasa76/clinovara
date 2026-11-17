import crypto from 'node:crypto';
import { nowIso, addDays, addMinutes, bad, HttpError, id, digits } from '../lib.js';

export const ROLES = ['owner', 'admin', 'front_desk', 'dentist', 'hygienist'];
export const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', front_desk: 'Front desk', dentist: 'Dentist', hygienist: 'Hygienist' };
/** Who may change clinic configuration, team and integrations. */
export const MANAGERS = new Set(['owner', 'admin']);

export function hashPassword(password) {
  if (!password || String(password).length < 8) bad('Password must be at least 8 characters');
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { passwordSalt: salt, passwordHash: hash };
}
export function verifyPassword(user, password) {
  if (!user?.passwordHash) return false;
  const hash = crypto.scryptSync(String(password || ''), user.passwordSalt, 64);
  const stored = Buffer.from(user.passwordHash, 'hex');
  return hash.length === stored.length && crypto.timingSafeEqual(hash, stored);
}

export function createSession(platform, { userId, tenantId, days = 30 }) {
  const s = { token: crypto.randomBytes(32).toString('base64url'), userId, tenantId, createdAt: nowIso(), expiresAt: addDays(nowIso(), days) };
  platform.db.sessions.push(s);
  platform.db.sessions = platform.db.sessions.filter((x) => x.expiresAt > nowIso()).slice(-2000);
  platform.save();
  return s;
}
export function sessionFromRequest(platform, req) {
  const auth = req.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '') || req.query.session;
  if (!token) return null;
  const s = platform.db.sessions.find((x) => x.token === token);
  if (!s || s.expiresAt < nowIso()) return null;
  return s;
}

/** One-time codes for mobile login and password reset. Delivery is simulated: the code is returned as devCode and logged. */
export function issueCode(platform, { channel, to, purpose }) {
  const code = String(crypto.randomInt(100000, 999999));
  platform.db.otps = platform.db.otps.filter((o) => o.expiresAt > nowIso() && !(o.to === to && o.purpose === purpose));
  platform.db.otps.push({ id: id('otp'), channel, to, purpose, code, attempts: 0, expiresAt: addMinutes(nowIso(), 10), createdAt: nowIso() });
  platform.save();
  if (process.env.NODE_ENV !== 'production') console.log(`[auth] ${purpose} code for ${to}: ${code}`);
  return code;
}
export function consumeCode(platform, { to, purpose, code }) {
  const o = platform.db.otps.find((x) => x.to === to && x.purpose === purpose && x.expiresAt > nowIso());
  if (!o) throw new HttpError(400, 'Code expired or not requested. Request a new one.');
  o.attempts += 1;
  if (o.attempts > 5) { platform.db.otps = platform.db.otps.filter((x) => x !== o); platform.save(); throw new HttpError(400, 'Too many attempts. Request a new code.'); }
  if (o.code !== String(code || '').trim()) { platform.save(); throw new HttpError(400, 'Incorrect code'); }
  platform.db.otps = platform.db.otps.filter((x) => x !== o);
  platform.save();
  return true;
}

export const normEmail = (e) => String(e || '').trim().toLowerCase();
export const normPhone = (p) => digits(p, '91');
export function publicUser(u) { if (!u) return null; const { passwordHash, passwordSalt, ...rest } = u; void passwordHash; void passwordSalt; return rest; }
