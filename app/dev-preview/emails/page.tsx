// The email preview: /dev-preview/emails draws any email from its example
// fixtures at 320, 390 and 640 wide, in light and in the designed dark
// (C-D1), with its subject, preheader and plain-text part, and every text
// with its character count. ?email=<name>&fixture=<id> picks one; ?all=1
// draws every email and state at one width (?w=390). A 404 unless
// MEMBERS_PREVIEW=1 (the harness layout); never set it on a real deployment.

import Link from "next/link";
import { headers } from "next/headers";

import { EMAIL_AUDIENCE, EMAIL_FROM, EMAIL_REPLY_TO, renderText, smsCount, TEXT_NAMES, type EmailName } from "@/lib/emails";
import { TEXT_FIXTURES } from "@/lib/emails/fixtures";
import { AutoFrame } from "./auto-frame";
import { AUTH_PREFIX, previewEntries, renderPreview } from "./preview-data";
import "./emails-preview.css";

export const metadata = { title: "Emails preview", robots: { index: false, follow: false } };

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const WIDTHS = [320, 390, 640] as const;

function rawHref(name: string, fixture: string, dark: boolean) {
  return `/dev-preview/emails/raw/${name}?fixture=${encodeURIComponent(fixture)}${dark ? "&dark=1" : ""}`;
}

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

function Texts() {
  return (
    <section className="pve-texts" aria-labelledby="pve-texts-h">
      <h2 id="pve-texts-h">Texts</h2>
      <p className="pve-texts-intro">
        Sender name ClubYuppie. A text is one part up to 160 standard characters; one character outside the standard
        alphabet (a curly apostrophe, an ellipsis, most accents) makes the whole text Unicode, 70 a part. Plan titles are
        cut at 40 characters and places at 30, with no ellipsis; typed punctuation is written plain.
      </p>
      {TEXT_NAMES.map((name) =>
        TEXT_FIXTURES[name].map((fx) => {
          const body = renderText(name, fx.data);
          const c = smsCount(body);
          return (
            <div key={`${name}-${fx.id}`} className="pve-text" data-text={`${name}/${fx.id}`}>
              <p className="pve-text-name">
                <b>{name}</b> {fx.label}
              </p>
              <p className="pve-bubble">{body}</p>
              <p className={`pve-count${c.parts > 1 ? " pve-count-warn" : ""}`}>
                {c.characters} of {c.limit} characters, {c.encoding}
                {c.encoding === "Unicode" ? " (a character outside the standard alphabet makes it Unicode)" : ""}, {c.parts}{" "}
                {c.parts === 1 ? "text" : "texts"}
              </p>
            </div>
          );
        }),
      )}
    </section>
  );
}

export default async function EmailsPreviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const query = await searchParams;
  const entries = previewEntries();
  const site = await origin();
  const all = first(query.all) === "1";
  const allWidth = Number(first(query.w)) || 390;
  const name = first(query.email) ?? entries[0].name;
  const entry = entries.find((e) => e.name === name) ?? entries[0];
  const fixtureId = first(query.fixture) ?? entry.fixtures[0].id;
  const fixture = entry.fixtures.find((f) => f.id === fixtureId) ?? entry.fixtures[0];
  const rendered = renderPreview(entry.name, fixture.id, site);
  const audience = entry.name.startsWith(AUTH_PREFIX) ? "Supabase Auth (the member)" : EMAIL_AUDIENCE[entry.name as EmailName];

  return (
    <main className="pve">
      <header className="pve-head">
        <h1>Emails and texts.</h1>
        <p>
          Every email from <code>lib/emails</code>, drawn from its example fixtures (example content only). Dark is the
          designed dark of decision C-D1, forced on; mail apps show it only where they honour{" "}
          <code>prefers-color-scheme</code>. <Link href="/dev-preview/emails?all=1">All at 390</Link> ·{" "}
          <Link href="/dev-preview/emails?all=1&w=320">all at 320</Link> · <Link href="/dev-preview">screens</Link>
        </p>
      </header>

      <nav className="pve-nav" aria-label="Emails">
        <ul>
          {entries.map((e) => (
            <li key={e.name}>
              <b>{e.title}</b>
              {e.fixtures.map((f) => (
                <Link
                  key={f.id}
                  href={`/dev-preview/emails?email=${e.name}&fixture=${f.id}`}
                  aria-current={!all && e.name === entry.name && f.id === fixture.id ? "page" : undefined}
                >
                  {f.label}
                </Link>
              ))}
            </li>
          ))}
        </ul>
      </nav>

      {all ? (
        <section className="pve-all" aria-label={`Every email at ${allWidth}`}>
          {entries.flatMap((e) =>
            e.fixtures.map((f) => (
              <figure key={`${e.name}-${f.id}`}>
                <figcaption>
                  <b>{e.title}</b> {f.label}
                </figcaption>
                <AutoFrame src={rawHref(e.name, f.id, false)} width={allWidth} title={`${e.title}: ${f.label}`} />
              </figure>
            )),
          )}
        </section>
      ) : rendered ? (
        <section className="pve-one" aria-label={`${entry.title}: ${fixture.label}`}>
          <h2>
            {entry.title} <span>{fixture.label}</span>
          </h2>
          <table className="pve-meta">
            <tbody>
              <tr>
                <th>From</th>
                <td>{EMAIL_FROM}</td>
              </tr>
              <tr>
                <th>Reply-To</th>
                <td>{entry.name.startsWith(AUTH_PREFIX) ? "(Supabase SMTP settings)" : EMAIL_REPLY_TO}</td>
              </tr>
              <tr>
                <th>To</th>
                <td>{audience}</td>
              </tr>
              <tr>
                <th>Subject</th>
                <td>
                  <b>{rendered.subject}</b> ({Array.from(rendered.subject).length} characters)
                </td>
              </tr>
              <tr>
                <th>Preheader</th>
                <td>
                  {rendered.preheader} ({Array.from(rendered.preheader).length} characters)
                </td>
              </tr>
            </tbody>
          </table>
          {[false, true].map((dark) => (
            <div key={String(dark)} className={`pve-row${dark ? " pve-dark" : ""}`}>
              <h3>{dark ? "Dark (designed, C-D1 B)" : "Light"}</h3>
              <div className="pve-frames">
                {WIDTHS.map((w) => (
                  <figure key={w}>
                    <figcaption>{w}</figcaption>
                    <AutoFrame src={rawHref(entry.name, fixture.id, dark)} width={w} title={`${entry.title} at ${w}${dark ? ", dark" : ""}`} />
                  </figure>
                ))}
              </div>
            </div>
          ))}
          <h3>Plain-text part</h3>
          <pre className="pve-plain">{rendered.text}</pre>
          <p className="pve-links">
            <a href={rawHref(entry.name, fixture.id, false)}>Open the email on its own</a> ·{" "}
            <a href={`${rawHref(entry.name, fixture.id, false)}&part=text`}>plain text</a>
          </p>
        </section>
      ) : null}

      <Texts />
    </main>
  );
}
