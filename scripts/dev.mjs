#!/usr/bin/env node
/**
 * Dev launcher: API on 5194, Vite on 5195 (Vite proxies /api to the API).
 * One command, one Ctrl-C.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';
const pnpm = isWin ? 'pnpm.cmd' : 'pnpm';

const children = [];

const run = (label, command, args, useShell = false) => {
  const child = spawn(command, args, {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: useShell,
    env: { ...process.env, FORCE_COLOR: '1' },
  });
  const prefix = `[${label}]`;
  child.stdout.on('data', (chunk) => process.stdout.write(String(chunk).replace(/^/gm, `${prefix} `)));
  child.stderr.on('data', (chunk) => process.stderr.write(String(chunk).replace(/^/gm, `${prefix} `)));
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) console.error(`${prefix} exited with code ${code}`);
    shutdown(code ?? 0);
  });
  children.push(child);
  return child;
};

let closing = false;
const shutdown = (code = 0) => {
  if (closing) return;
  closing = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 400);
};

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log('\n  Salon Cards dev');
console.log('  ---------------');
console.log('  API    http://localhost:5194/api/health');
console.log('  App    http://localhost:5195\n');

run('api', process.execPath, [path.join(ROOT, 'server', 'index.mjs'), '--port', '5194']);
run('web', pnpm, ['exec', 'vite', '--port', '5195', '--strictPort'], isWin);
