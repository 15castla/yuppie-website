// The members preview harness. /dev-preview/<screen>?shell=web|app&state=<x>
// &member=<fixture>&flags=openInvite,concierge&unread=N renders a registered
// screen inside the real members shell with no login and no database, so a
// screen can be built, looked at and photographed on its own. A 404 unless
// MEMBERS_PREVIEW=1 (see layout.tsx); never set it on a real deployment.
//
//   MEMBERS_PREVIEW=1 npx next dev --webpack -p 3101
//
// /dev-preview lists every registered screen. Registry files: ./registry.

import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";

import { MembersFrame } from "@/components/members/shell/members-frame";
import { MembersShell } from "@/components/members/shell/members-shell";
import { tabsFor } from "@/components/members/shell/tabs";
import type { ShellMode } from "@/components/members/shell/types";
import { FLAG_NAMES, noFlags, type FlagName, type Flags } from "@/lib/members/flags";
import { MEMBER_KEYS, memberFixture } from "../fixtures";
import { findScreen, PREVIEW_SCREENS } from "../registry";
import type { PreviewParams } from "../registry/types";
import { StatusBarMock } from "../status-bar";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseFlags(value: string | undefined, fallback: readonly FlagName[]): Flags {
  const result = noFlags();
  const names = value === undefined ? fallback : value.split(",").map((name) => name.trim());
  for (const name of names) {
    if ((FLAG_NAMES as readonly string[]).includes(name)) result[name as FlagName] = true;
  }
  return result;
}

function Index() {
  return (
    <main className="pv-index">
      <h1>Members preview</h1>
      <p>
        Screens rendered inside the real members shell, with no login and no database. Add{" "}
        <code>?shell=app</code> for the app, <code>?state=&lt;state&gt;</code>,{" "}
        <code>?member=&lt;fixture&gt;</code> ({MEMBER_KEYS.join(", ")}), <code>?flags=openInvite,concierge</code>{" "}
        <code>?unread=3</code> and <code>?route=/members/open-invite</code> (draw it in the shell the real
        route table gives that path).
      </p>
      <ul>
        {PREVIEW_SCREENS.map((screen) => (
          <li key={screen.id}>
            <b>
              <Link href={`/dev-preview/${screen.id}`}>{screen.id}</Link>
            </b>
            <span>{screen.title}</span>
            {screen.states.map((state) => (
              <Link key={state} href={`/dev-preview/${screen.id}?state=${state}`}>
                {state}
              </Link>
            ))}
          </li>
        ))}
      </ul>
    </main>
  );
}

export default async function DevPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ screen?: string[] }>;
  searchParams: Promise<SearchParams>;
}) {
  if (process.env.MEMBERS_PREVIEW !== "1") notFound();

  const { screen: segments } = await params;
  const query = await searchParams;
  if (!segments || segments.length === 0) return <Index />;
  if (segments.length > 1) notFound();
  const screen = findScreen(segments[0]);
  if (!screen) notFound();

  const shell: ShellMode = first(query.shell) === "app" ? "app" : "web";
  const stateParam = first(query.state);
  const state = stateParam && screen.states.includes(stateParam) ? stateParam : screen.states[0];
  const memberKey = first(query.member) ?? "sam";
  const memberValue = memberFixture(memberKey);
  const flags = parseFlags(first(query.flags), screen.defaultFlags ?? []);
  const unread = Math.max(0, Number.parseInt(first(query.unread) ?? "0", 10) || 0);
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    const single = first(value);
    if (single !== undefined) flat[key] = single;
  }

  const previewParams: PreviewParams = {
    state,
    shell,
    memberKey,
    member: memberValue instanceof Promise ? null : memberValue,
    flags,
    unread,
    query: flat,
  };
  const frame = { ...screen, ...screen.frame?.(previewParams) };
  const tabs = tabsFor({ mode: shell, flags });
  const device = shell === "app" && first(query.device) !== "0";
  // The phone's own insets, simulated (the real app injects them): the
  // status area (59px) and the home indicator (34px).
  const insets =
    shell === "app"
      ? ({ "--safe-top": "59px", "--safe-bottom": "34px" } as CSSProperties)
      : undefined;

  // ?route=/members/open-invite renders the screen in the REAL layout's shell
  // (MembersShell), which works out the lit tab, the messages icon, the dock
  // and the chrome from lib/members/routes.ts, as the live layout does. Without
  // it the screen's own frame fields decide (see registry/types.ts).
  const route = first(query.route);
  if (route) {
    return (
      <MembersShell
        mode={shell}
        tabs={tabs}
        member={memberValue}
        messagesEnabled={flags.messages}
        unread={unread}
        pathname={route}
        style={insets}
      >
        {device ? <StatusBarMock /> : null}
        {screen.render(previewParams)}
      </MembersShell>
    );
  }

  return (
    <MembersFrame
      mode={shell}
      tabs={tabs}
      activeTab={frame.tab ?? null}
      member={memberValue}
      unread={unread}
      showMessages={frame.showMessages ?? false}
      messagesCurrent={frame.messagesCurrent ?? false}
      youCurrent={frame.youCurrent ?? false}
      dock={frame.dock ?? "tabs"}
      chrome={frame.chrome ?? "full"}
      style={insets}
    >
      {device ? <StatusBarMock /> : null}
      {screen.render(previewParams)}
    </MembersFrame>
  );
}
