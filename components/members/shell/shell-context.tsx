"use client";

// What the shell tells the pieces inside it (the top actions in a page's title
// row, the phone bar, the desktop header) without every page passing it down.
// `member` is a plain value, or a promise: the layout streams it so the shell
// paints at once and the photo arrives into its fixed 44px slot (useMember
// suspends until it does; every use sits in a Suspense with a blank slot).

import { createContext, use, useContext, type ReactNode } from "react";

import type { MemberSummary, ShellMode } from "./types";

export type ShellState = {
  mode: ShellMode;
  member: MemberSummary | null | Promise<MemberSummary | null>;
  /** The messages icon is drawn (Open Invite pages, with the Messages flag on). */
  showMessages: boolean;
  /** The messages icon is the current page (the Messages pages). */
  messagesCurrent: boolean;
  unread: number;
  /** The photo button is the current page (You and its sub pages). */
  youCurrent: boolean;
};

const DEFAULT_STATE: ShellState = {
  mode: "web",
  member: null,
  showMessages: false,
  messagesCurrent: false,
  unread: 0,
  youCurrent: false,
};

const ShellContext = createContext<ShellState>(DEFAULT_STATE);

export function ShellProvider({ value, children }: { value: ShellState; children: ReactNode }) {
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellState {
  return useContext(ShellContext);
}

function isPromise<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof (value as { then?: unknown } | null)?.then === "function";
}

// The member, suspending while a streamed promise is pending. Call inside a
// <Suspense>.
export function useMember(): MemberSummary | null {
  const { member } = useShell();
  return isPromise(member) ? use(member) : member;
}
