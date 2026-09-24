import { Router } from 'express';
import { computeInsights } from '../domain/insights.js';

const r = Router();
r.get('/', (req, res) => res.json(computeInsights(req.db, { days: Math.min(365, Math.max(1, Number(req.query.days || 30))), locationId: req.query.locationId ? String(req.query.locationId) : null })));
export default r;
