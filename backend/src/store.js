import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COLLECTIONS } from './lib.js';
import { buildSeed } from './seed.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.CLINOVARA_DATA_DIR || path.join(here, '..', 'data');

/**
 * Encryption at rest. When CLINOVARA_DATA_KEY is set, every data file is written as AES-256-GCM ciphertext
 * and read back with the same key. Plain files written before the key was set are read once and encrypted
 * on their next save. A file that is encrypted but cannot be opened (no key, or the wrong key) stops the
 * server: it is never replaced by a fresh document, because that would destroy the clinic's data.
 */
export class DataKeyError extends Error {}
let cachedKey = null; let cachedFor = null;
function dataKey() {
  const secret = process.env.CLINOVARA_DATA_KEY || '';
  if (!secret) return null;
  if (cachedFor !== secret) { cachedKey = crypto.scryptSync(secret, 'clinovara-data-v1', 32); cachedFor = secret; }
  return cachedKey;
}
export function encodeData(doc) {
  const key = dataKey();
  if (!key) return JSON.stringify(doc, null, 2);
  const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([c.update(JSON.stringify(doc), 'utf8'), c.final()]);
  return JSON.stringify({ clinovaraEncrypted: 1, alg: 'aes-256-gcm', iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') });
}
export function decodeData(text) {
  const raw = JSON.parse(text);
  if (!raw || raw.clinovaraEncrypted !== 1) return raw;
  const key = dataKey();
  if (!key) throw new DataKeyError('This data file is encrypted. Set CLINOVARA_DATA_KEY to the key it was written with, then start the server again.');
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(raw.iv, 'base64'));
    d.setAuthTag(Buffer.from(raw.tag, 'base64'));
    return JSON.parse(Buffer.concat([d.update(Buffer.from(raw.data, 'base64')), d.final()]).toString('utf8'));
  } catch { throw new DataKeyError('This data file could not be opened with the current CLINOVARA_DATA_KEY. The key is wrong, or the file was changed. Nothing has been overwritten.'); }
}

/** Generic debounced JSON-file store. `initial()` builds the first document. */
export function jsonStore({ file, memory = false, initial, normalize = (x) => x }) {
  let db;
  const load = () => {
    if (memory) return normalize(initial());
    try { return normalize(decodeData(fs.readFileSync(file, 'utf8'))); }
    catch (e) { if (e instanceof DataKeyError) throw e; const d = normalize(initial()); write(d); return d; }
  };
  function write(d) {
    if (memory) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, encodeData(d));
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
