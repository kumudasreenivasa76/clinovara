// Copies the clinic data folder to backups/<timestamp>/ . Run: npm run backup  (schedule it daily on the server)
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = process.env.CLINOVARA_DATA_DIR || path.join(root, 'backend', 'data');
const dest = path.join(root, 'backups', new Date().toISOString().replace(/[:.]/g, '-'));
fs.cpSync(src, dest, { recursive: true });
const all = fs.readdirSync(path.join(root, 'backups')).sort();
for (const old of all.slice(0, Math.max(0, all.length - 30))) fs.rmSync(path.join(root, 'backups', old), { recursive: true, force: true });
console.log(`Backed up ${src} -> ${dest} (keeping the latest 30)`);
