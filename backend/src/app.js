import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError, useTimezone } from './lib.js';
import { createRegistry } from './registry.js';
import { sessionFromRequest, MANAGERS } from './domain/auth.js';
import authRoutes from './routes/auth.js';
import { deliverable } from './domain/mailer.js';
import teamRoutes from './routes/team.js';
import onboardingRoutes from './routes/onboarding.js';
import settingsRoutes from './routes/settings.js';
import patientRoutes from './routes/patients.js';
import appointmentRoutes from './routes/appointments.js';
import conversationRoutes from './routes/conversations.js';
import formRoutes from './routes/forms.js';
import kioskRoutes from './routes/kiosk.js';
import arrivalRoutes from './routes/arrivals.js';
import frontDeskRoutes from './routes/frontdesk.js';
import dentistRoutes from './routes/dentist.js';
import voiceRoutes from './routes/voice.js';
import treatmentRoutes from './routes/treatmentPlans.js';
import communicationRoutes from './routes/communications.js';
import insightRoutes from './routes/insights.js';
import adminRoutes from './routes/admin.js';
import fhirRoutes from './routes/fhir.js';
import integrationRoutes from './routes/integrations.js';
import marketingRoutes from './routes/marketing.js';
import assistantRoutes from './routes/assistant.js';
import dashboardRoutes from './routes/dashboard.js';
import leadsRoutes from './routes/leads.js';
import doctorRoutes from './routes/doctor.js';
import callRoutes from './routes/calls.js';
import publicRoutes from './routes/public.js';
import doctorToolsRoutes from './routes/doctorTools.js';
import { callbacks as callbackRoutes, estimates as estimateRoutes, calendar as calendarRoutes } from './routes/ops.js';
import { aiMode } from './domain/frontDesk.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Routes a patient-facing page may call without a staff session, given a clinic (x-tenant header or ?t=slug). */
const PUBLIC_TENANT = [
  [/^\/kiosk\//, ['GET', 'POST']],
  [/^\/forms\/token\//, ['GET', 'PUT', 'POST']],
  [/^\/forms\/sections$/, ['GET']],
  [/^\/arrivals\/board$/, ['GET']],
  [/^\/conversations(\/[^/]+(\/messages)?)?$/, ['GET', 'POST']],
  [/^\/calls(\/[^/]+(\/messages|\/end))?$/, ['POST']],
  [/^\/voice\/(incoming|calls\/[^/]+\/(turn|tool|transcript|end))$/, ['POST']], // the phone media bridge; each call checks x-voice-secret
  [/^\/patients$/, ['GET']],
  [/^\/settings$/, ['GET']],
  [/^\/public\/(clinic|slots|book)$/, ['GET', 'POST']],
  [/^\/calendar\/appointment\//, ['GET']],
];
/**
 * Who may reach what, for logged-in staff. Checked for every request before any route runs, so a
 * screen hidden in the app is also closed on the server. First matching rule wins; anything not
 * listed is open to every staff role and guarded inside its own route where it needs to be.
 */
const OWNERS = ['owner', 'admin'];
const DESK = ['owner', 'admin', 'front_desk'];
const CLINICAL = ['owner', 'admin', 'dentist', 'hygienist'];
const ANY = null; // every method
export const ROLE_RULES = [
  { area: 'Recent activity feed', re: /^\/admin\/activity$/, methods: ['GET'], roles: [...DESK, 'dentist', 'hygienist'] },
  { area: 'Full data export, import and reset', re: /^\/admin(\/|$)/, methods: ANY, roles: OWNERS },
  { area: 'Integrations, API keys and webhooks', re: /^\/integrations(\/|$)/, methods: ANY, roles: OWNERS },
  { area: 'Phone voice assistant settings', re: /^\/voice\/(status|settings)$/, methods: ANY, roles: OWNERS },
  { area: 'Clinic revenue dashboard', re: /^\/dashboard(\/|$)/, methods: ANY, roles: OWNERS },
  // /insights is open to all staff on purpose: the route itself leaves revenue out for anyone who is not an owner or admin.
  { area: 'Team, roles and invitations', re: /^\/team(\/|$)/, methods: ANY, roles: OWNERS },
  { area: 'Export the patient list', re: /^\/patients\/export\.csv$/, methods: ANY, roles: OWNERS },
  { area: 'Import patients', re: /^\/patients\/import$/, methods: ANY, roles: OWNERS },
  { area: 'Export or import the fee list', re: /^\/settings\/procedures\/(export\.csv|import)$/, methods: ANY, roles: OWNERS },
  { area: 'Change clinic settings and branding', re: /^\/settings(\/|$)/, methods: ['PUT', 'POST', 'PATCH', 'DELETE'], roles: OWNERS },
  { area: 'Create, edit, send or delete your own forms', re: /^\/forms\/templates/, methods: ['POST', 'PUT', 'PATCH', 'DELETE'], roles: OWNERS },
  { area: 'Marketing and campaigns', re: /^\/marketing(\/|$)/, methods: ANY, roles: DESK },
  { area: 'Front desk dashboard, tasks and handoff notes', re: /^\/frontdesk(\/|$)/, methods: ANY, roles: DESK },
  { area: 'Take payments and issue receipts', re: /^\/arrivals\/[^/]+\/(payment|receipt\/send)$/, methods: ['POST'], roles: DESK },
  { area: 'Dentist workspace', re: /^\/dentist(\/|$)/, methods: ANY, roles: CLINICAL },
  { area: 'Clinical notes, prescriptions and charts', re: /^\/doctor(\/|$)/, methods: ANY, roles: CLINICAL },
];
const ruleFor = (path, method) => ROLE_RULES.find((r) => r.re.test(path) && (!r.methods || r.methods.includes(method)));
/** The same table in plain words, for the Roles and permissions screen. */
export const permissionMatrix = () => ROLE_RULES.map((r) => ({ area: r.area, access: r.methods && !r.methods.includes('GET') ? 'change' : 'view and change', roles: r.roles }));

/** Configuration endpoints only owners and admins may change. */
const MANAGE_ONLY = [[/^\/settings/, ['PUT', 'POST']], [/^\/integrations/, ['POST', 'PUT', 'PATCH', 'DELETE']], [/^\/team/, ['POST', 'PATCH', 'DELETE']], [/^\/onboarding/, ['POST']], [/^\/admin\/(import|reset)/, ['POST']]];

export function createApp({ registry = createRegistry(), frontendBase = process.env.CLINOVARA_FRONTEND_URL || 'http://localhost:5190/' } = {}) {
  registry.ensureDemo();
  useTimezone(null);
  const app = express();
  app.disable('x-powered-by');
  if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
  app.use(express.json({ limit: '8mb', type: ['application/json', 'application/fhir+json'] }));
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-user-name, x-api-key, x-tenant, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=15552000');
    req.registry = registry;
    req.frontendBase = frontendBase;
    req.session = sessionFromRequest(registry.platform, req);
    next();
  });

  app.get('/api/health', (req, res) => {
    const demo = registry.tenantBySlug('smilecare');
    res.json({ ok: true, ai: aiMode(), time: new Date().toISOString(), version: '3.0', demoAvailable: !!demo, clinics: registry.platform.db.tenants.length, verification: { email: deliverable('email'), sms: deliverable('sms') } });
  });
  app.use('/api/auth', authRoutes);
  app.use('/api/leads', leadsRoutes); // public website: demo-call requests, no clinic involved

  // Resolve the clinic for every other /api route.
  app.use('/api', (req, res, next) => {
    if (req.path.startsWith('/health') || req.path.startsWith('/auth') || req.path.startsWith('/leads')) return next();
    const platform = registry.platform;
    let tenant = null; let role = null; let userName = null;
    if (req.session) {
      tenant = platform.db.tenants.find((t) => t.id === req.session.tenantId) || null;
      const user = platform.db.users.find((u) => u.id === req.session.userId);
      const m = tenant && platform.db.memberships.find((x) => x.userId === req.session.userId && x.tenantId === tenant.id && x.status === 'active');
      if (!tenant || !m) return next(new HttpError(401, 'Your session is no longer valid. Please log in again.'));
      role = m.role; userName = user?.name || 'Staff';
      req.membership = m;
    } else if (req.path.startsWith('/calendar/provider/') && req.query.key) {
      const key = String(req.query.key);
      const hit = registry.findTenant((db) => (db.settings.integrations?.calendarKey && db.settings.integrations.calendarKey === key) || db.settings.providers.some((p) => p.calendarKey && p.calendarKey === key));
      if (!hit) return next(new HttpError(401, 'Calendar feed key is not valid'));
      req.calendarKeyProvider = registry.tenantStore(hit.tenant.id).db.settings.providers.find((p) => p.calendarKey === key)?.id || null;
      tenant = hit.tenant; role = 'integration'; userName = 'Calendar';
    } else if (req.path.startsWith('/fhir')) {
      const key = req.get('x-api-key') || (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
      const hit = key ? registry.findTenant((db) => db.settings.integrations?.apiKey && db.settings.integrations.apiKey === key) : null;
      if (hit) { tenant = hit.tenant; role = 'integration'; userName = 'EHR integration'; }
      else if (req.query.t) { const t = registry.tenantBySlug(String(req.query.t)); if (t && t.demo && !registry.tenantStore(t.id).db.settings.integrations?.apiKey) { tenant = t; role = 'integration'; userName = 'EHR integration'; } } // keyless access is for the sample-data demo clinic only
      if (!tenant) return next(new HttpError(401, 'Invalid or missing API key (x-api-key header)'));
    } else {
      const allowed = PUBLIC_TENANT.some(([re, methods]) => re.test(req.path) && methods.includes(req.method));
      if (!allowed) return next(new HttpError(401, 'Please log in'));
      const slug = req.get('x-tenant') || req.query.t;
      if (slug) tenant = registry.tenantBySlug(String(slug));
      if (!tenant && req.path.startsWith('/forms/token/')) { const tok = req.path.split('/')[3]; const hit = registry.findTenant((db) => db.formPackets.some((p) => p.token === tok)); tenant = hit?.tenant || null; }
      if (!tenant) return next(new HttpError(404, 'Clinic not found. Open this page from the clinic link.'));
      role = 'public'; userName = req.get('x-user-name') || (req.path.startsWith('/kiosk') ? 'Kiosk' : 'Patient');
    }
    if (role === 'public' && req.path === '/patients' && !tenant.demo) return next(new HttpError(401, 'Please log in'));
    if (req.session) {
      const rule = ruleFor(req.path, req.method);
      if (rule && !rule.roles.includes(role)) return next(new HttpError(403, `Your role does not have access to this: ${rule.area.toLowerCase()}`));
    }
    if (role !== 'integration' && role !== 'public' && MANAGE_ONLY.some(([re, methods]) => re.test(req.path) && methods.includes(req.method)) && !MANAGERS.has(role)) return next(new HttpError(403, 'Only clinic owners and admins can change this'));
    const store = registry.tenantStore(tenant.id);
    req.tenant = tenant; req.store = store; req.db = store.db; req.role = role; req.user = userName;
    useTimezone(store.db.settings?.locale?.timezone);
    next();
  });

  app.use('/api/team', teamRoutes);
  app.use('/api/onboarding', onboardingRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/patients', patientRoutes);
  app.use('/api', appointmentRoutes);
  app.use('/api/conversations', conversationRoutes);
  app.use('/api/forms', formRoutes);
  app.use('/api/kiosk', kioskRoutes);
  app.use('/api/arrivals', arrivalRoutes);
  app.use('/api/frontdesk', frontDeskRoutes);
  app.use('/api/dentist', dentistRoutes);
  app.use('/api/voice', voiceRoutes);
  app.use('/api/treatment-plans', treatmentRoutes);
  app.use('/api/communications', communicationRoutes);
  app.use('/api/insights', insightRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/integrations', integrationRoutes);
  app.use('/api/marketing', marketingRoutes);
  app.use('/api/doctor', doctorRoutes);
  app.use('/api/doctor', doctorToolsRoutes);
  app.use('/api/public', publicRoutes);
  app.use('/api/calls', callRoutes);
  app.use('/api/callbacks', callbackRoutes);
  app.use('/api/assistant', assistantRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/estimates', estimateRoutes);
  app.use('/api/calendar', calendarRoutes);
  app.use('/api/fhir', fhirRoutes);

  const dist = path.join(here, '..', '..', 'frontend', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use((req, res) => res.status(404).json({ error: `No route for ${req.method} ${req.path}` }));
  app.use((err, req, res, next) => {
    void next;
    const status = err instanceof HttpError ? err.status : (err.type === 'entity.parse.failed' ? 400 : 500);
    if (status === 500) console.error(err);
    res.status(status).json({ error: err.message || 'Unexpected error' });
  });
  return app;
}
