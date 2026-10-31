// Run every Phase B script in order, against PHASE_B_BASE (default http://localhost:3241), on a build with the
// stage 2 switches on (tests/e2e/phase-b/server.sh build, then server.sh start prod).
//   node tests/e2e/phase-b/run-all.mjs [--rebuild]   # --rebuild: 00 rebuilds the database first (drops public!)
// It seeds the prefixes it needs first (seed.mjs is idempotent and adds the stage 2 fixtures): bf. and, when an
// agent runs it with its own PHASE_B_TAG, that prefix too. Stage 1's suite is tests/e2e/phase-a/run-all.mjs, on a
// build with the switches off. The emails agent's own checks are in ./emails/.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const dir = path.dirname(new URL(import.meta.url).pathname);
const scripts = fs.readdirSync(dir).filter((f) => /^\d\d-.*\.mjs$/.test(f)).sort();
const rebuild = process.argv.includes('--rebuild');
const results = [];
const seed = () => {
  for (const prefix of [...new Set(['bf.', process.env.PHASE_B_TAG].filter(Boolean))]) {
    const s = spawnSync(process.execPath, ['/home/claude/stack/tools/seed.mjs', '--prefix', prefix, '--quiet'], { encoding: 'utf8', timeout: 300000 });
    if (s.status !== 0) { console.log(`seed ${prefix} failed:\n${s.stdout}${s.stderr}`); process.exit(1); }
  }
};
seed();
for (const script of scripts) {
  const started = Date.now();
  const r = spawnSync(process.execPath, [path.join(dir, script), ...(script.startsWith('00-') && rebuild ? ['--rebuild'] : [])], { encoding: 'utf8', timeout: 900000 });
  const out = `${r.stdout}${r.stderr}`;
  const pass = r.status === 0 && /PASS /.test(out);
  const checks = /PASS \S+: (\d+) checks/.exec(out)?.[1] ?? '?';
  results.push({ script, pass, checks, s: Math.round((Date.now() - started) / 1000) });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${script} (${checks} checks, ${results.at(-1).s}s)`);
  if (!pass) console.log(out.split('\n').filter((l) => l.startsWith('FAIL') || l.includes('Error') || l.startsWith('  ')).slice(0, 30).join('\n'));
  // A rebuild drops every row: seed again before the next script.
  if (script.startsWith('00-') && rebuild) seed();
}
const failed = results.filter((x) => !x.pass);
console.log(`\n${results.length - failed.length}/${results.length} scripts green, ${results.reduce((n, x) => n + (Number(x.checks) || 0), 0)} checks`);
process.exit(failed.length ? 1 : 0);
