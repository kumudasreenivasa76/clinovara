/**
 * A tiny Express-compatible router so the real backend routes can run inside the browser for the
 * hosted demo. Supports Router(), get/post/put/patch/delete with ":param" paths, use(path?, fn|router),
 * 4-arg error handlers, req.query/params/body/get(), res.status/json/send/setHeader/sendStatus.
 */
const esc = (s) => s.replace(/\\/g, '').replace(/[.*+?^${}()|[\]]/g, (c) => `\\${c}`);
function compile(path, prefix = false) {
  const keys = [];
  const src = esc(path).replace(/\/:([A-Za-z_]+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; });
  return { re: new RegExp(prefix ? `^${src}(?=/|$)` : `^${src}$`), keys };
}

export function Router() {
  const layers = [];
  const r = {
    handle(req, res, done) {
      let i = 0;
      const next = async (err) => {
        const layer = layers[i++];
        if (!layer) return done(err);
        const isRouter = !!layer.handler.handle;
        const arity = isRouter ? 3 : layer.handler.length;
        if (err && arity !== 4) return next(err);
        if (!err && arity === 4) return next();
        if (layer.route) {
          if (layer.method !== req.method) return next(err);
          const m = layer.re.re.exec(req.path);
          if (!m) return next(err);
          const params = {}; layer.re.keys.forEach((k, j) => { params[k] = decodeURIComponent(m[j + 1]); });
          req.params = params;
          try { await layer.handler(req, res, next); } catch (e) { next(e); }
          return;
        }
        if (layer.re) {
          const m = layer.re.re.exec(req.path);
          if (!m) return next(err);
          const params = {}; layer.re.keys.forEach((k, j) => { params[k] = decodeURIComponent(m[j + 1]); });
          req.params = params;
          const saved = req.path;
          req.path = req.path.slice(m[0].length) || '/';
          const restore = (e) => { req.path = saved; next(e); };
          try {
            if (isRouter) layer.handler.handle(req, res, restore);
            else if (err) await layer.handler(err, req, res, restore);
            else await layer.handler(req, res, restore);
          } catch (e) { restore(e); }
          return;
        }
        try {
          if (isRouter) layer.handler.handle(req, res, next);
          else if (err) await layer.handler(err, req, res, next);
          else await layer.handler(req, res, next);
        } catch (e) { next(e); }
      };
      next();
    },
    use(a, b) {
      if (typeof a === 'string') layers.push({ re: compile(a, true), handler: b });
      else layers.push({ re: null, handler: a });
      return r;
    },
  };
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    r[method] = (path, handler) => { if (path instanceof RegExp) return r; layers.push({ route: true, method: method.toUpperCase(), re: compile(path), handler }); return r; };
  }
  return r;
}

export default function express() {
  const app = Router();
  app.set = () => app; // settings such as 'trust proxy' mean nothing in the browser
  app.listen = () => ({ address: () => ({ port: 0 }), close() {} });
  /** Dispatches a fetch-style request through the app; resolves to a Response. */
  app.dispatch = (url, init = {}) => new Promise((resolve) => {
    const u = new URL(url, 'http://demo.local');
    const headers = {}; for (const [k, v] of Object.entries(init.headers || {})) headers[k.toLowerCase()] = v;
    const query = {}; u.searchParams.forEach((v, k) => { query[k] = v; });
    let body = null;
    if (init.body) { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    const req = { method: (init.method || 'GET').toUpperCase(), path: u.pathname, originalUrl: u.pathname + u.search, query, body, params: {}, get: (h) => headers[h.toLowerCase()] };
    const out = { status: 200, headers: {} };
    let finished = false;
    const finish = (payload) => {
      if (finished) return; finished = true;
      const text = payload == null ? '' : typeof payload === 'string' ? payload : JSON.stringify(payload);
      resolve(new Response(text, { status: out.status, headers: { 'content-type': typeof payload === 'string' ? 'text/plain; charset=utf-8' : 'application/json', ...out.headers } }));
    };
    const res = {
      status(s) { out.status = s; return res; },
      setHeader(k, v) { out.headers[k] = v; },
      json(o) { finish(o); },
      send(o) { finish(o); },
      sendStatus(s) { out.status = s; finish(''); },
      sendFile() { out.status = 404; finish({ error: 'Not available in the demo' }); },
    };
    app.handle(req, res, (err) => { if (err) { out.status = err.status || 500; finish({ error: err.message }); } else { out.status = 404; finish({ error: `No route for ${req.method} ${req.path}` }); } });
  });
  return app;
}
express.json = () => (req, res, next) => next();
express.static = () => (req, res, next) => next();
