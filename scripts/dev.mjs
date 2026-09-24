import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const opts = { stdio: 'inherit', shell: process.platform === 'win32' };

const backend = spawn(npm, ['run', 'dev'], { ...opts, cwd: path.join(root, 'backend') });
const frontend = spawn(npm, ['run', 'dev'], { ...opts, cwd: path.join(root, 'frontend') });

function stop() { backend.kill(); frontend.kill(); process.exit(0); }
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
