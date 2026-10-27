// Run every Phase A foundation script in order, against PHASE_A_BASE (default http://localhost:3141).
//   tests/e2e/phase-a/server.sh start prod     # after: flock /tmp/next-build.lock npx next build --webpack
//   node tests/e2e/phase-a/run-all.mjs [--rebuild]   # --rebuild: 00 rebuilds the database first (drops public!)
//   tests/e2e/phase-a/server.sh stop
// The emails agent's own checks live in ./emails/ and are run separately.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const dir = path.dirname(new URL(import.meta.url).pathname);
const scripts = fs.readdirSync(dir).filter((f) => /^\d\d-.*\.mjs$/.test(f)).sort();
const results = [];
for (const script of scripts) {
  const args = script.startsWith('00-') && process.argv.includes('--rebuild') ? ['--rebuild'] : [];
  const started = Date.now();
  const r = spawnSync(process.execPath, [path.join(dir, script), ...args], { encoding: 'utf8', timeout: 600000 });
  const out = `${r.stdout}${r.stderr}`;
  const pass = r.status === 0 && /PASS /.test(out);
  const checks = /PASS \S+: (\d+) checks/.exec(out)?.[1] ?? '?';
  results.push({ script, pass, checks, s: Math.round((Date.now() - started) / 1000) });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${script} (${checks} checks, ${results.at(-1).s}s)`);
  if (!pass) console.log(out.split('\n').filter((l) => l.startsWith('FAIL') || l.includes('Error') || l.startsWith('  ')).slice(0, 30).join('\n'));
}
const failed = results.filter((x) => !x.pass);
console.log(`\n${results.length - failed.length}/${results.length} scripts green, ${results.reduce((n, x) => n + (Number(x.checks) || 0), 0)} checks`);
process.exit(failed.length ? 1 : 0);
