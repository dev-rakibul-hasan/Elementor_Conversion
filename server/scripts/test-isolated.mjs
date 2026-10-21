import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();
const url = new URL(process.env.PIPELINE_TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/design_to_elementor');
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Isolated tests require a local PostgreSQL server');
const schema = `pipeline_test_${randomUUID().replaceAll('-', '')}`;
if (!/^pipeline_test_[a-f0-9]{32}$/.test(schema)) throw new Error('Invalid temporary test schema');
url.searchParams.set('schema', schema);
const database = url.toString();
const prisma = new PrismaClient({ datasources: { db: { url: database } } });
let created = false;
let exitCode = 0;
try {
  await prisma.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  created = true;
  const env = { ...process.env, DATABASE_URL: database, NODE_ENV: 'test', PIPELINE_ISOLATED_TESTS: 'true', RUN_LIVE_AI_TESTS: 'false', LOCAL_STORAGE_PATH: `./storage/${schema}` };
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate'], { env, stdio: 'inherit' });
  execFileSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--no-file-parallelism', ...process.argv.slice(2)], { env, stdio: 'inherit' });
} catch (error) { console.error(error.message); exitCode = 1; }
finally {
  if (created) await prisma.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  await prisma.$disconnect();
  // Test storage is intentionally preserved for inspection. It contains synthetic fixtures only.
}
process.exitCode = exitCode;
