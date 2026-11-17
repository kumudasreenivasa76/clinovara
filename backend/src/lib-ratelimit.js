/** Small in-memory limiter, enough for a single node. Keyed by IP plus an optional per-request key (e.g. the address being verified). */
const hits = new Map();
export function rateLimit({ windowMs, max, name, key = () => '' }) {
  return (req, res, next) => {
    if (process.env.NODE_ENV === 'test' || process.env.CLINOVARA_RATELIMIT === 'off') return next();
    const k = `${name}|${req.ip}|${key(req)}`; const now = Date.now();
    const arr = (hits.get(k) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) { res.setHeader('Retry-After', Math.ceil(windowMs / 1000)); return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' }); }
    arr.push(now); hits.set(k, arr);
    if (hits.size > 5000) for (const [kk, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(kk);
    next();
  };
}
