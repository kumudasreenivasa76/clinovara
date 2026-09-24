/**
 * Multi-clinic registry. The platform store holds accounts, clinics (tenants), memberships, invites,
 * sessions and OTP codes. Each clinic has its own data file under data/tenants/<id>.json.
 */
import path from 'node:path';
import { jsonStore, createStore, DATA_DIR } from './store.js';
import { buildSeed, buildBlank } from './seed.js';
import { id, nowIso, addDays, dayKey } from './lib.js';
import { hashPassword } from './domain/auth.js';

export const DEMO = { slug: 'smilecare', email: 'demo@smilecare.example', password: 'demo1234', name: 'Dr. Ananya Rao' };

function initialPlatform() {
  return { users: [], tenants: [], memberships: [], invites: [], sessions: [], otps: [], createdAt: nowIso() };
}

export function createRegistry({ dataDir = DATA_DIR, memory = false } = {}) {
  const platform = jsonStore({ file: path.join(dataDir, 'platform.json'), memory, initial: initialPlatform, normalize: (p) => ({ ...initialPlatform(), ...p }) });
  const stores = new Map();

  function tenantStore(tenantId) {
    if (!stores.has(tenantId)) {
      const t = platform.db.tenants.find((x) => x.id === tenantId);
      if (!t) return null;
      stores.set(tenantId, createStore({ file: path.join(dataDir, 'tenants', `${tenantId}.json`), memory, initial: () => (t.demo ? buildSeed() : buildBlank(t)) }));
    }
    return stores.get(tenantId);
  }

  function slugify(name) {
    const base = String(name || 'clinic').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'clinic';
    let slug = base; let n = 2;
    while (platform.db.tenants.some((t) => t.slug === slug)) slug = `${base}-${n++}`;
    return slug;
  }

  function createTenant({ name, city = '', ownerId, demo = false, plan = 'trial', slug = null }) {
    const t = { id: id('ten'), slug: slug && !platform.db.tenants.some((x) => x.slug === slug) ? slug : slugify(name), name, city, ownerId, demo, plan, trialEndsAt: addDays(nowIso(), 30), createdAt: nowIso(), onboarding: { completed: demo, steps: {}, launchedAt: demo ? nowIso() : null } };
    platform.db.tenants.push(t);
    if (ownerId) platform.db.memberships.push({ id: id('mem'), userId: ownerId, tenantId: t.id, role: 'owner', status: 'active', createdAt: nowIso(), providerId: demo ? 'prov_rao' : null });
    platform.save();
    return t;
  }

  /** The demo clinic and its login exist from the first run so the product can be tried immediately. */
  function ensureDemo() {
    let user = platform.db.users.find((u) => u.email === DEMO.email);
    if (!user) { user = { id: id('usr'), name: DEMO.name, email: DEMO.email, phone: '9845012345', ...hashPassword(DEMO.password), createdAt: nowIso(), demo: true }; platform.db.users.push(user); }
    let tenant = platform.db.tenants.find((t) => t.slug === DEMO.slug);
    if (!tenant) tenant = createTenant({ name: 'SmileCare Dental', city: 'Bengaluru', ownerId: user.id, demo: true, plan: 'demo', slug: DEMO.slug });
    const ownerMem = platform.db.memberships.find((m) => m.userId === user.id && m.tenantId === tenant.id);
    if (ownerMem && !ownerMem.providerId) ownerMem.providerId = 'prov_rao';
    for (const [email, name, role, providerId] of [['frontdesk@smilecare.example', 'Kavitha (Front desk)', 'front_desk', null], ['vikram@smilecare.example', 'Dr. Vikram Menon', 'dentist', 'prov_menon']]) {
      let u = platform.db.users.find((x) => x.email === email);
      if (!u) { u = { id: id('usr'), name, email, phone: '', ...hashPassword(DEMO.password), createdAt: nowIso(), demo: true }; platform.db.users.push(u); }
      const existing = platform.db.memberships.find((m) => m.userId === u.id && m.tenantId === tenant.id);
      if (!existing) platform.db.memberships.push({ id: id('mem'), userId: u.id, tenantId: tenant.id, role, status: 'active', createdAt: nowIso(), providerId });
      else if (providerId && !existing.providerId) existing.providerId = providerId;
    }
    platform.save();
    // The seed's appointments, arrivals and tokens are all written relative to "today" at generation time.
    // Once a real day passes, "today" in the data no longer matches the calendar, so the kiosk, arrivals
    // board and doctor's day all show nothing due — reseed automatically instead of requiring a manual reset.
    const store = tenantStore(tenant.id);
    if (store && store.db.settings?.demoSeededDate !== dayKey(nowIso())) store.reset();
    return tenant;
  }

  function tenantBySlug(slug) { return platform.db.tenants.find((t) => t.slug === slug) || null; }

  /** Finds the clinic that holds a given forms token / kiosk code / FHIR api key. Loads stores lazily. */
  function findTenant(pred) {
    for (const t of platform.db.tenants) { const s = tenantStore(t.id); if (s && pred(s.db, t)) return { tenant: t, store: s }; }
    return null;
  }

  return { platform, tenantStore, createTenant, ensureDemo, tenantBySlug, findTenant, slugify, memory };
}
