import { execFileSync } from 'node:child_process';
import { cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
execFileSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc')], { cwd: root, stdio: 'inherit' });
for (const [source, destination] of [
  ['src/skills', 'dist/skills'],
  ['src/modules/ai/fixtures', 'dist/modules/ai/fixtures'],
  ['ELEMENTOR_SKILL.md', 'dist/ELEMENTOR_SKILL.md'],
]) cpSync(path.join(root, source), path.join(root, destination), { recursive: true });
