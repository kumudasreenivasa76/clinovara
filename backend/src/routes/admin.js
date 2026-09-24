import { Router } from 'express';
import { COLLECTIONS, bad } from '../lib.js';

const r = Router();

r.get('/activity', (req, res) => res.json(req.db.activity.slice(0, Number(req.query.limit || 50))));
r.get('/export', (req, res) => {
  res.setHeader('Content-Disposition', `attachment; filename="clinovara-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json(req.db);
});
r.post('/import', (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || !body.settings?.practice) bad('Not a Clinovara backup file');
  for (const c of COLLECTIONS) if (c !== 'settings' && body[c] && !Array.isArray(body[c])) bad(`Collection ${c} must be an array`);
  req.store.replace(body);
  res.json({ ok: true });
});
r.post('/reset', (req, res) => { req.store.reset(); res.json({ ok: true, practice: req.store.db.settings.practice.name, demo: !!req.tenant.demo }); });

export default r;
