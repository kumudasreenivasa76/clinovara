import { Router } from 'express';
import { brandOf, cleanBranding, bad, log, nowIso, csvCell, parseCsv } from '../lib.js';
import { defaultSettings } from '../seed.js';
import { sanitizeProcedures, procedures as procedureCatalogue } from '../domain/catalogue.js';

const r = Router();

function publicSettings(s) {
  const { integrations, ...rest } = s;
  return { ...rest, integrations: integrations ? { ...integrations, apiKey: integrations.apiKey ? 'set' : '', webhooks: (integrations.webhooks || []).map(({ secret, ...w }) => { void secret; return w; }) } : undefined };
}

/** What a signed-out visitor may see: the clinic's public profile and nothing from the back office. */
function visitorView(s) {
  const pr = s.practice || {}; const l = s.locale || {};
  return {
    practice: { name: pr.name, tagline: pr.tagline, phone: pr.phone, whatsapp: pr.whatsapp, email: pr.email, address: pr.address, website: pr.website, city: pr.city, state: pr.state, hours: pr.hours, logo: pr.logo },
    locale: { currencySymbol: l.currencySymbol, numberLocale: l.numberLocale, phoneCountryCode: l.phoneCountryCode, languages: l.languages, defaultLanguage: l.defaultLanguage, timezone: l.timezone },
    locations: (s.locations || []).map((x) => ({ id: x.id, name: x.name, address: x.address, phone: x.phone, hours: x.hours })),
    branding: brandOf(s),
  };
}
r.get('/', (req, res) => { if (req.role === 'public') return res.json({ ...visitorView(req.db.settings), tenant: { slug: req.tenant.slug, name: req.tenant.name } }); res.json({ ...publicSettings(req.db.settings), tenant: { slug: req.tenant.slug, name: req.tenant.name, plan: req.tenant.plan } }); });

r.put('/', (req, res) => {
  const body = req.body || {};
  const s = req.db.settings;
  const prevNext = Number(s.billing?.nextNumber) || 1;
  if (body.branding !== undefined) s.branding = cleanBranding(body.branding);
  for (const key of ['practice', 'locale', 'locations', 'providers', 'visitTypes', 'faqs', 'escalationKeywords', 'rules', 'templates', 'consentText', 'paymentModes', 'insuranceOptions', 'holidays', 'marketing', 'afterHours', 'aftercare', 'procedures', 'fees', 'assistant', 'billing', 'goals']) {
    if (body[key] !== undefined) s[key] = ['practice', 'rules', 'locale'].includes(key) ? { ...s[key], ...body[key] } : body[key];
  }
  if (!Array.isArray(s.visitTypes) || !s.visitTypes.length) bad('At least one visit type is required');
  if (!Array.isArray(s.locations) || !s.locations.length) bad('At least one branch is required');
  for (const vt of s.visitTypes) { vt.keywords = vt.keywords || []; vt.durationMin = Number(vt.durationMin) || 30; vt.fee = Number(vt.fee) || 0; }
  for (const p of s.providers) { p.locationIds = Array.isArray(p.locationIds) ? p.locationIds.filter((l) => s.locations.some((x) => x.id === l)) : []; p.consultationFee = Number(p.consultationFee) || 0; }
  for (const f of s.faqs || []) f.keywords = f.keywords || [];
  // An owner who adds herself as a dentist is that dentist: link her login so My home opens on her own patients.
  if (req.membership && !req.membership.providerId && ['owner', 'admin'].includes(req.role)) {
    const norm = (n) => String(n || '').toLowerCase().replace(/^dr\.?\s+/, '').replace(/[^a-z ]/g, '').trim();
    const me = norm(req.user); const mine = s.providers.filter((p) => me && norm(p.name) === me);
    if (mine.length === 1) { req.membership.providerId = mine[0].id; req.registry.platform.save(); }
  }
  for (const t of s.templates || []) if (typeof t.body === 'string') t.body = { en: t.body };
  if (body.procedures !== undefined) s.procedures = sanitizeProcedures(body.procedures);
  if (body.billing !== undefined) {
    const b = s.billing; b.gstRate = Math.min(28, Math.max(0, Number(b.gstRate) || 0)); b.receiptPrefix = String(b.receiptPrefix || 'RCP').replace(/[^A-Za-z0-9-]/g, '').slice(0, 8) || 'RCP';
    b.nextNumber = Math.max(prevNext, Math.floor(Number(b.nextNumber)) || 1); // never reissue a used number
  }
  if (s.fees && !['fixed', 'range', 'flexible'].includes(s.fees.mode)) s.fees.mode = 'fixed';
  log(req.db, 'settings', `${req.user} updated practice settings`);
  req.store.save();
  res.json(publicSettings(s));
});

r.post('/reset', (req, res) => { const keep = req.db.settings.integrations; req.db.settings = { ...defaultSettings(), integrations: keep || defaultSettings().integrations }; req.store.save(); res.json(publicSettings(req.db.settings)); });

/* ---------- Procedure & fee catalogue: CSV export/import (bulk-edit in a spreadsheet, then re-import) ---------- */

const PROC_CSV_COLUMNS = ['id', 'name', 'category', 'fee', 'minFee', 'maxFee', 'durationMin', 'keywords', 'aftercareId', 'quote', 'active'];
const PROC_ALIASES = { procedure: 'name', 'procedure name': 'name', service: 'name', min: 'minFee', 'min fee': 'minFee', max: 'maxFee', 'max fee': 'maxFee', minutes: 'durationMin', duration: 'durationMin', 'duration (min)': 'durationMin', 'words patients use': 'keywords', synonyms: 'keywords', aftercare: 'aftercareId', 'aftercare id': 'aftercareId', 'aftercare template': 'aftercareId', quotable: 'quote', 'quote to patients': 'quote', enabled: 'active' };

r.get('/procedures/export.csv', (req, res) => {
  const rows = [PROC_CSV_COLUMNS.join(',')];
  for (const p of procedureCatalogue(req.db)) rows.push(PROC_CSV_COLUMNS.map((c) => csvCell(c === 'keywords' ? (p.keywords || []).join(', ') : p[c])).join(','));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="procedures-${nowIso().slice(0, 10)}.csv"`);
  res.send('﻿' + rows.join('\n'));
});

r.post('/procedures/import', (req, res) => {
  const db = req.db;
  const text = String(req.body?.csv || '').replace(/^﻿/, '');
  if (!text.trim()) bad('csv is required');
  const rows = parseCsv(text);
  if (rows.length < 2) bad('CSV needs a header row and at least one procedure');
  const header = rows[0].map((h) => { const k = h.trim(); const lk = k.toLowerCase(); return PROC_ALIASES[lk] || (PROC_CSV_COLUMNS.includes(k) ? k : (PROC_CSV_COLUMNS.find((c) => c.toLowerCase() === lk) || k)); });
  const existing = procedureCatalogue(db);
  const bool = (v, fallback) => (v === '' || v === undefined ? fallback : /^(true|yes|y|1)$/i.test(v));
  let created = 0; let updated = 0; const errors = [];
  rows.slice(1).forEach((cells, i) => {
    const rec = {}; header.forEach((h, j) => { rec[h] = (cells[j] || '').trim(); });
    if (!rec.name) { errors.push(`Row ${i + 2}: missing procedure name`); return; }
    let p = (rec.id && existing.find((x) => x.id === rec.id)) || existing.find((x) => x.name.toLowerCase() === rec.name.toLowerCase());
    const patch = {
      name: rec.name, category: rec.category || p?.category || 'General',
      fee: rec.fee !== '' && rec.fee !== undefined ? Number(rec.fee) || 0 : (p?.fee ?? 0),
      minFee: rec.minFee !== '' && rec.minFee !== undefined ? Number(rec.minFee) : (p?.minFee ?? null),
      maxFee: rec.maxFee !== '' && rec.maxFee !== undefined ? Number(rec.maxFee) : (p?.maxFee ?? null),
      durationMin: rec.durationMin !== '' && rec.durationMin !== undefined ? Number(rec.durationMin) || 30 : (p?.durationMin ?? 30),
      keywords: rec.keywords ? rec.keywords.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean) : (p?.keywords || []),
      aftercareId: rec.aftercareId || p?.aftercareId || null,
      quote: bool(rec.quote, p?.quote !== false), active: bool(rec.active, p?.active !== false),
    };
    if (p) { Object.assign(p, patch); updated++; }
    else { existing.push({ id: rec.id || `pr_${rec.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 24)}_${Date.now().toString(36)}`, ...patch }); created++; }
  });
  db.settings.procedures = sanitizeProcedures(existing);
  log(db, 'settings', `${req.user} imported the procedure catalogue from CSV: ${created} added, ${updated} updated${errors.length ? `, ${errors.length} skipped` : ''}`);
  req.store.save();
  res.json({ created, updated, errors, columns: PROC_CSV_COLUMNS, procedures: db.settings.procedures });
});

export default r;
