import { randomUUID } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { mkdirSync, openSync, closeSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
dotenv.config();

const url = new URL(process.env.PIPELINE_TEST_DATABASE_URL || process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Local PostgreSQL required');
const schema = `pipeline_test_${randomUUID().replaceAll('-', '')}`;
url.searchParams.set('schema', schema);
const database = url.toString();
const db = new PrismaClient({ datasources: { db: { url: database } } });
const root = path.resolve('..');
mkdirSync(path.join(root, 'audit-artifacts'), { recursive: true });
const children = [], logFiles = [];
const env = { ...process.env, DATABASE_URL: database, NODE_ENV: 'test', PIPELINE_ISOLATED_TESTS: 'true',
  AI_PROVIDER: 'mock', VISION_AI_PROVIDER: 'mock', STRUCTURE_AI_PROVIDER: 'mock', REVIEW_AI_PROVIDER: 'mock',
  RUN_LIVE_AI_TESTS: 'false', ENABLE_GEMINI: 'false', AI_API_KEY: '', GEMINI_API_KEY: '', OPENROUTER_API_KEY: '',
  LOCAL_STORAGE_PATH: `./storage/${schema}`, WEB_ORIGIN: 'http://127.0.0.1:3501',
};
async function waitFor(address) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try { if ((await fetch(address)).ok) return; } catch { /* Server is starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Server did not become ready: ${address}`);
}
function start(args, cwd, childEnv, name) {
  const fd = openSync(path.join(root, 'audit-artifacts', `${name}.log`), 'w');
  logFiles.push(fd);
  const child = spawn(process.execPath, args, { cwd, env: childEnv, stdio: ['ignore', fd, fd], windowsHide: true });
  children.push(child);
  return child;
}
let created = false;
try {
  await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`); created = true;
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate'], { env, stdio: 'inherit' });
  start(['scripts/audit-browser-server.mjs'], process.cwd(), env, 'browser-api');
  start(['node_modules/next/dist/bin/next', 'start', '--port', '3501', '--hostname', '127.0.0.1'], path.join(root, 'client'), { ...process.env, NODE_ENV: 'production' }, 'browser-client');
  await Promise.all([waitFor('http://127.0.0.1:4501/api/v1/health'), waitFor('http://127.0.0.1:3501')]);
  execFileSync('python', ['server/scripts/browser-smoke.py'], { cwd: root, env: { ...process.env, PYTHONPATH: path.join(root, '.audit-tools') }, stdio: 'inherit', timeout: 180000 });
} finally {
  for (const child of children) { if (child.exitCode === null) { child.kill(); await new Promise((resolve) => child.once('exit', resolve)); } }
  for (const fd of logFiles) closeSync(fd);
  if (created) await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  await db.$disconnect();
}
