// Load lib/emails (TypeScript) in plain Node: each file is transpiled with the
// repo's own TypeScript (no new dependency) into a temporary folder, with its
// relative imports pointed at the .mjs twins, and imported from there.
//
//   import { loadEmails } from './load-emails.mjs';
//   const emails = await loadEmails();          // lib/emails/index.ts
//   const supabase = await loadEmails('supabase.ts');
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const SRC = path.join(REPO, 'lib/emails');
const require = createRequire(path.join(REPO, 'package.json'));
const ts = require('typescript');

let outDir = null;
function build() {
  if (outDir) return outDir;
  outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lib-emails-'));
  for (const file of fs.readdirSync(SRC)) {
    if (!file.endsWith('.ts')) continue;
    const source = fs.readFileSync(path.join(SRC, file), 'utf8');
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false },
      fileName: file,
    });
    const js = outputText.replace(/(from\s+["'])(\.\/[^"']+)(["'])/g, (_m, a, spec, b) => `${a}${spec}.mjs${b}`);
    fs.writeFileSync(path.join(outDir, file.replace(/\.ts$/, '.mjs')), js);
  }
  return outDir;
}

export async function loadEmails(entry = 'index.ts') {
  const dir = build();
  return import(pathToFileURL(path.join(dir, entry.replace(/\.ts$/, '.mjs'))).href);
}
