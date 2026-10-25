// What a preview screen is, and what render() is given.
//
// A screen is a presentational view (a pure component of props, no fetch, no
// cookies()) placed inside the real members shell by the harness, with no
// login and no database. Each area owns ONE registry file (events.tsx,
// discounts.tsx, you.tsx, invite.tsx, messages.tsx) that exports an array of
// these. Add yours; never edit another area's file.

import type { ReactNode } from "react";

import type { Flags, FlagName } from "@/lib/members/flags";
import type { TabKey } from "@/lib/members/routes";
import type { MemberSummary, ShellMode } from "@/components/members/shell/types";

export type PreviewParams = {
  /** ?state=<x>. One of the screen's `states` (the first when absent or unknown). */
  state: string;
  /** ?shell=web|app. */
  shell: ShellMode;
  /** ?member=<fixture>: the signed-in member (see app/dev-preview/fixtures.ts). */
  memberKey: string;
  member: MemberSummary | null;
  /** ?flags=a,b: the flags the harness turned on for this render (also the shell's tab set). */
  flags: Flags;
  /** ?unread=N: the number on the messages icon. */
  unread: number;
  /** Every query param, for anything screen-specific (?q=..., ?filter=...). */
  query: Record<string, string>;
};

export type PreviewScreen = {
  /** The URL segment: /dev-preview/<id>. Unique across all registry files. Prefix with your area: "events-list". */
  id: string;
  /** Human title for the index page. */
  title: string;
  /** The states this screen draws; the first is the default. ?state=<one of these>. */
  states: readonly string[];
  /** The screen's content: your <Main>…</Main>. Receives the params. */
  render: (params: PreviewParams) => ReactNode;
  /** The tab that is lit, as lib/members/routes.ts would say for this page (null: none). */
  tab?: TabKey | null;
  /** Draw the messages icon (Open Invite pages only). */
  showMessages?: boolean;
  /** The messages icon is the current page (the Messages pages). */
  messagesCurrent?: boolean;
  /** The photo button is the current page (You and its sub pages). */
  youCurrent?: boolean;
  /** "own": the page draws its own docked bar, so the shell draws no tab bar. */
  dock?: "tabs" | "own";
  /** "bare": no bar, header or dock (the photo gate). */
  chrome?: "full" | "bare";
  /** Flags on by default for this screen (when the URL has no ?flags=). */
  defaultFlags?: readonly FlagName[];
  /** Per-state overrides of the fields above (a state with its own docked bar, a gate with no chrome). */
  frame?: (params: PreviewParams) => PreviewFrameOverrides;
};

export type PreviewFrameOverrides = Partial<
  Pick<PreviewScreen, "tab" | "showMessages" | "messagesCurrent" | "youCurrent" | "dock" | "chrome">
>;
