/* Browser stand-ins for the few Node built-ins the backend touches. Demo only. */
const enc = new TextEncoder();
function hex(bytes) { return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(''); }
function fnv(str) { // deterministic pseudo-hash for the demo's password check; not for real use
  let h1 = 0x811c9dc5, h2 = 0x01000193; const s = enc.encode(str);
  for (const b of s) { h1 ^= b; h1 = Math.imul(h1, 0x01000193) >>> 0; h2 = (h2 + b * 31) >>> 0; }
  const out = new Uint8Array(64); for (let i = 0; i < 64; i++) { h1 = Math.imul(h1 ^ (i + 1), 0x01000193) >>> 0; out[i] = (h1 ^ (h2 >>> (i % 24))) & 255; }
  return out;
}
export const crypto = {
  randomBytes(n) { const a = new Uint8Array(n); globalThis.crypto.getRandomValues(a); return { toString(f) { if (f === 'hex') return hex(a); const b = btoa(String.fromCharCode(...a)); return f === 'base64url' ? b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : b; } }; },
  randomInt(min, max) { const a = new Uint32Array(1); globalThis.crypto.getRandomValues(a); return min + (a[0] % (max - min)); },
  scryptSync(password, salt) { const b = fnv(`${salt}:${password}`); return { toString: () => hex(b), length: b.length, bytes: b }; },
  timingSafeEqual(a, b) { const x = a.bytes || a; const y = b.bytes || b; if (x.length !== y.length) return false; let d = 0; for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i]; return d === 0; },
  createHmac(_algo, key) { let data = ''; return { update(s) { data += s; return this; }, digest() { return hex(fnv(`${key}|${data}`)); } }; },
};
export default crypto;
export const fs = { existsSync: () => false, readFileSync() { throw new Error('no fs'); }, writeFileSync() {}, renameSync() {}, mkdirSync() {}, unlinkSync() {} };
export const path = { join: (...p) => p.filter(Boolean).join('/').replace(/\/+/g, '/'), dirname: (p) => p.split('/').slice(0, -1).join('/') || '/', resolve: (...p) => p.join('/') };
export const url = { fileURLToPath: (u) => String(u) };
export const Buffer = { from: (s) => ({ toString: (f) => (f === 'base64' ? btoa(unescape(encodeURIComponent(s))) : String(s)) }), };
