import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COLLECTIONS } from './lib.js';
import { buildSeed } from './seed.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.CLINOVARA_DATA_DIR || path.join(here, '..', 'data');

/** Generic debounced JSON-file store. `initial()` builds the first document. */
export function jsonStore({ file, memory = false, initial, normalize = (x) => x }) {
  let db;
  const load = () => {
    if (memory) return normalize(initial());
    try { return normalize(JSON.parse(fs.readFileSync(file, 'utf8'))); }
    catch { const d = normalize(initial()); write(d); return d; }
  };
  function write(d) {
    if (memory) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(d, null, 2));
    fs.renameSync(tmp, file);
  }
  db = load();
  let timer = null;
  const api = {
    get db() { return db; },
    save() { if (memory) return; clearTimeout(timer); timer = setTimeout(() => write(db), 60); },
    flush() { write(db); },
    replace(next) { db = normalize(next); write(db); },
    reset() { db = normalize(initial()); write(db); },
    remove() { if (!memory) try { fs.unlinkSync(file); } catch { /* ignore */ } },
  };
  return api;
}

function normalizeTenant(raw) {
  const db = {};
  for (const c of COLLECTIONS) db[c] = raw?.[c] ?? (c === 'settings' ? {} : []);
  return db;
}

/** A clinic's data store. `initial` defaults to the demo seed for backwards compatibility. */
export function createStore({ file = path.join(DATA_DIR, 'db.json'), memory = false, initial = buildSeed } = {}) {
  const store = jsonStore({ file, memory, initial, normalize: normalizeTenant });
  // Older data files (before branches/locale) are replaced by the initial document.
  if (!store.db.settings?.practice || !store.db.settings?.locale) store.reset();
  return store;
}
