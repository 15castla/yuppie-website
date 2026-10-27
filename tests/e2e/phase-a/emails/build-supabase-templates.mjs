// Writes supabase/templates/{magic_link,email_change,recovery}.html from
// lib/emails/supabase.ts (the same shell as every other email). Run it after
// changing the shell or EMAIL_COLOR_SCHEME (C-D1):
//
//   node tests/e2e/phase-a/emails/build-supabase-templates.mjs
//
// check-emails.mjs fails if the committed files differ from what this writes.
import fs from 'node:fs';
import path from 'node:path';
import { loadEmails, REPO } from './load-emails.mjs';

const supabase = await loadEmails('supabase.ts');
const dir = path.join(REPO, 'supabase/templates');
fs.mkdirSync(dir, { recursive: true });
for (const name of supabase.SUPABASE_TEMPLATE_NAMES) {
  const { html } = supabase.renderSupabaseTemplate(name);
  fs.writeFileSync(path.join(dir, `${name}.html`), html);
  console.log(`wrote supabase/templates/${name}.html (${html.length} bytes), subject: ${supabase.SUPABASE_SUBJECTS[name]}`);
}
