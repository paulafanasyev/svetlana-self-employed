import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const failures = [];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else if (entry.isFile() && path.endsWith('.js')) out.push(path);
  }
  return out;
}

for (const file of [...walk('backend/src'), ...walk('backend/scripts')]) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) failures.push(`${file}: ${result.stderr || result.stdout}`);
}

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const packageJson = readFileSync('package.json', 'utf8');
const forbidden = [
  ['lint placeholder', packageJson.includes('lint placeholder')],
  ['non-blocking npm audit', workflow.includes('npm audit --omit=dev --audit-level=high || true')],
  ['public storage static mount', readFileSync('backend/src/server.js', 'utf8').includes("prefix: '/storage/'")],
];
for (const [label, bad] of forbidden) if (bad) failures.push(label);

if (failures.length) {
  console.error('Static checks failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Static checks passed.');