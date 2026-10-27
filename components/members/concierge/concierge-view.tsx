"use client";

// The Concierge, app only: an AI that recommends places and never books.
// A pure component of props (the page does the auth and hands over a
// snapshot), so the preview harness can draw every state. All interaction is
// local state: nothing is sent anywhere. With no backend yet, `script`
// stands in for it (canned replies after a short wait); the real one passes
// `send`.
//
//   first open   title block, the brick phone on its rule, "Try asking" tiles
//   a chat       compact header, the thread, recommendation cards, the memory
//                chip; waiting ("Looking for places…"), and "Not sent"
//   both         the composer above the tab bar; the "What the concierge
//                remembers" sheet with Forget everything
//
// Fixed and sticky parts (the composer, the compact header, the sheet and its
// confirm) are needs_device_check: see concierge.css and use-keyboard-offset.ts.

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { ExampleNote, Icon, Main, PerkDrawing, SectionTitle, TitleBlock } from "@/components/members/kit";
import type {
  ConciergeMemoryItem,
  ConciergeMessage,
  ConciergeReply,
  ConciergeScript,
  ConciergeSnapshot,
} from "@/lib/members/concierge/types";
import { cn } from "@/lib/utils";
import {
  bindTail,
  Composer,
  CompactBar,
  MemberBubble,
  MemorySheet,
  NotSent,
  ReplyBlock,
  Waiting,
} from "./concierge-parts";
import "./concierge.css";

export type ConciergeViewProps = {
  snapshot: ConciergeSnapshot;
  /** The fake adapter's canned replies. Ignored when `send` is given. */
  script?: ConciergeScript;
  /** The real backend's send (a server action). Rejects when there is no connection. */
  send?: (text: string) => Promise<ConciergeReply>;
  /** Preview harness only: open with the memory sheet showing. */
  initialSheet?: boolean;
  /** Preview harness only: and its confirm on top. */
  initialConfirm?: boolean;
  /** Preview harness only: something already typed. */
  initialDraft?: string;
  /** Preview harness only: focus the composer on arrival (the typing state). */
  autoFocusComposer?: boolean;
};

/** How long the canned replies take, so "Looking for places…" is seen. */
const REPLY_DELAY_MS = 1100;
/** How long an attempt with no connection takes to give up. */
const OFFLINE_DELAY_MS = 700;
/** How long after the composer loses focus the tab bar returns. */
const TYPING_END_DELAY_MS = 250;

function nowLabel(): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const replyDomId = (id: string) => `cn-reply-${id}`;

/** First open: the brick phone on its rule under the intro, then three questions to start with. */
function FirstOpen({ suggestions, onPick }: { suggestions: string[]; onPick: (text: string) => void }) {
  return (
    <>
      <section className="cn-hero" aria-label="What the concierge does">
        <div className="mk-wrap">
          <div className="cn-hero-in">
            <p className="mk-lead cn-intro">
              Ask the AI concierge where to go. <span className="mk-nb">It recommends.</span>{" "}
              <span className="mk-nb">You book.</span>
            </p>
            <span className="mk-art cn-art" aria-hidden="true">
              <PerkDrawing name="phone" />
            </span>
          </div>
        </div>
      </section>
      <section className="mk-section mk-first" style={{ marginBottom: 28 }}>
        <div className="mk-wrap">
          <SectionTitle title="Try asking" />
          <div className="cn-tiles">
            {suggestions.map((suggestion) => (
              <button key={suggestion} type="button" className="cn-tile" onClick={() => onPick(suggestion)}>
                <span className="cn-t">{bindTail(suggestion)}</span>
                <span className="cn-go" aria-hidden="true">
                  <Icon name="arrow-up-right" size={18} />
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

export function ConciergeView({
  snapshot,
  script,
  send,
  initialSheet = false,
  initialConfirm = false,
  initialDraft = "",
  autoFocusComposer = false,
}: ConciergeViewProps) {
  const [messages, setMessages] = useState<ConciergeMessage[]>(snapshot.messages);
  const [memory, setMemory] = useState<ConciergeMemoryItem[]>(snapshot.memory);
  const [draft, setDraft] = useState(initialDraft);
  const [sheetOpen, setSheetOpen] = useState(initialSheet || initialConfirm);
  // true while the composer has focus. A server-rendered autofocus (the harness's typing state) happens before
  // React is listening, so the harness's flag starts it on.
  const [typing, setTyping] = useState(autoFocusComposer);

  const started = messages.length > 0;
  const waiting = messages.some((message) => message.role === "member" && message.status === "pending");
  const canSend = draft.trim().length > 0 && !waiting;
  const inMemory = useMemo(() => new Set(memory.map((item) => item.id)), [memory]);

  // ------------------------------------------------------------ sending

  const alive = useRef(true);
  const timers = useRef(new Set<number>());
  const scriptCursor = useRef(0);
  const replyCount = useRef(0);
  const messageCount = useRef(0);

  useEffect(() => {
    alive.current = true;
    const pending = timers.current;
    return () => {
      alive.current = false;
      pending.forEach((timer) => window.clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const ask = useCallback(
    (text: string): Promise<ConciergeReply> => {
      if (send) return send(text);
      return new Promise<ConciergeReply>((resolve, reject) => {
        const replies = script?.replies ?? [];
        const exact = replies.find((candidate) => candidate.prompt === text);
        const open = replies.filter((candidate) => candidate.prompt === null);
        const chosen = exact ?? (open.length > 0 ? open[scriptCursor.current++ % open.length] : undefined);
        if (!chosen) {
          reject(new Error("No reply"));
          return;
        }
        const timer = window.setTimeout(() => {
          timers.current.delete(timer);
          replyCount.current += 1;
          resolve({ ...chosen.reply, id: `${chosen.reply.id}-${replyCount.current}`, at: nowLabel() });
        }, REPLY_DELAY_MS);
        timers.current.add(timer);
      });
    },
    [send, script],
  );

  const setStatus = useCallback((id: string, status: "sent" | "pending" | "failed") => {
    setMessages((previous) =>
      previous.map((message) => (message.role === "member" && message.id === id ? { ...message, status } : message)),
    );
  }, []);

  const deliver = useCallback(
    (id: string, text: string) => {
      setStatus(id, "pending");
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        // No connection: it still looks like an attempt (a moment of "Looking for places…"), so Try again
        // visibly does something before it says "Not sent" again.
        const timer = window.setTimeout(() => {
          timers.current.delete(timer);
          setStatus(id, "failed");
        }, OFFLINE_DELAY_MS);
        timers.current.add(timer);
        return;
      }
      ask(text).then(
        (reply) => {
          if (!alive.current) return;
          setMessages((previous) => [
            ...previous.map((message) =>
              message.role === "member" && message.id === id ? { ...message, status: "sent" as const } : message,
            ),
            { role: "concierge" as const, ...reply },
          ]);
          const learned = reply.remembered;
          if (learned) {
            setMemory((previous) => (previous.some((item) => item.id === learned.id) ? previous : [...previous, learned]));
          }
        },
        () => {
          if (alive.current) setStatus(id, "failed");
        },
      );
    },
    [ask, setStatus],
  );

  const submit = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text || waiting) return;
      messageCount.current += 1;
      const id = `you-${messageCount.current}`;
      setMessages((previous) => [...previous, { role: "member", id, at: nowLabel(), text, status: "pending" }]);
      setDraft("");
      deliver(id, text);
    },
    [deliver, waiting],
  );

  // ------------------------------------------------------------ scrolling

  const threadRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const seen = useRef(snapshot.messages.length);
  const settled = useRef(messages);

  useEffect(() => {
    const onScroll = () => {
      const root = document.documentElement;
      nearBottom.current = root.scrollHeight - (window.scrollY + window.innerHeight) < 160;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToEnd = useCallback((smooth: boolean) => {
    const top = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: Math.max(0, top), behavior: smooth && !prefersReducedMotion() ? "smooth" : "auto" });
  }, []);

  // A reply that fits is scrolled into full view; one taller than the room
  // (cards, long advice) is scrolled to its first line, not its last.
  const reveal = useCallback(
    (domId: string) => {
      const page = threadRef.current?.parentElement;
      const reply = document.getElementById(domId);
      const bar = page?.querySelector<HTMLElement>(".cn-bar");
      const composer = page?.querySelector<HTMLElement>(".cn-composer");
      if (!reply || !bar || !composer) {
        scrollToEnd(true);
        return;
      }
      const replyBox = reply.getBoundingClientRect();
      const room = composer.getBoundingClientRect().top - bar.getBoundingClientRect().bottom;
      if (replyBox.height + 16 <= room) {
        scrollToEnd(true);
        return;
      }
      window.scrollTo({
        top: window.scrollY + replyBox.top - bar.getBoundingClientRect().bottom - 12,
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
    },
    [scrollToEnd],
  );

  // Arriving on a conversation: start at its end. Next resets the scroll to the top of a page it has just
  // entered, in the same commit, so this waits one frame.
  useEffect(() => {
    if (seen.current === 0) return;
    const frame = requestAnimationFrame(() => scrollToEnd(false));
    return () => cancelAnimationFrame(frame);
  }, [scrollToEnd]);

  // A new message: a reply that fits is brought fully into view, a taller one to its first line; the member's
  // own message (and a status change at the foot) keeps the page on the end.
  useLayoutEffect(() => {
    if (settled.current === messages) return;
    settled.current = messages;
    const previous = seen.current;
    seen.current = messages.length;
    const last = messages[messages.length - 1];
    if (!last) return;
    if (messages.length > previous && last.role === "concierge") reveal(replyDomId(last.id));
    else if (messages.length > previous || nearBottom.current) scrollToEnd(true);
  }, [messages, reveal, scrollToEnd]);

  // the tab bar steps aside while typing, which moves the foot: stay on the last message
  useLayoutEffect(() => {
    if (started && nearBottom.current) scrollToEnd(false);
  }, [typing, started, scrollToEnd]);

  // ------------------------------------------------------------ memory

  // the sheet closed: focus goes back to the button that opened it
  const memoryButton = useRef<HTMLButtonElement>(null);
  const sheetWasOpen = useRef(sheetOpen);
  useEffect(() => {
    if (sheetWasOpen.current && !sheetOpen) memoryButton.current?.focus({ preventScroll: true });
    sheetWasOpen.current = sheetOpen;
  }, [sheetOpen]);

  const forgetOne = useCallback((id: string) => {
    setMemory((previous) => previous.filter((item) => item.id !== id));
  }, []);

  const forgetAll = useCallback(() => setMemory([]), []);

  // Focus in: the tab bar steps aside at once. Focus out: it comes back a moment later, because a tap on a
  // button in the thread blurs the input first and the layout must not move before that tap has landed.
  const typingTimer = useRef<number | null>(null);
  const onTypingChange = useCallback((next: boolean) => {
    if (typingTimer.current !== null) {
      window.clearTimeout(typingTimer.current);
      timers.current.delete(typingTimer.current);
      typingTimer.current = null;
    }
    if (next) {
      setTyping(true);
      return;
    }
    const timer = window.setTimeout(() => {
      timers.current.delete(timer);
      typingTimer.current = null;
      setTyping(false);
    }, TYPING_END_DELAY_MS);
    typingTimer.current = timer;
    timers.current.add(timer);
  }, []);

  // ------------------------------------------------------------ draw

  const composer = (
    <Composer
      value={draft}
      onChange={setDraft}
      onSubmit={() => submit(draft)}
      canSend={canSend}
      placeholder={started && waiting ? "Ask a follow-up" : "Ask where to go"}
      onTypingChange={onTypingChange}
      autoFocus={autoFocusComposer}
      inert={sheetOpen}
    />
  );

  // One tree for both layouts, so the composer (and its focus, and the keyboard) survives the first message.
  return (
    <Main pad={false} className={cn("cn-page", typing && "cn-typing")}>
      {started ? (
        <>
          <CompactBar onOpenMemory={() => setSheetOpen(true)} memoryRef={memoryButton} inert={sheetOpen} />
          {/* Example screens on the live site: once the chat starts the title block (which carries the note) is gone,
              so a one-line strip stays under the bar (kit/example-note). Nothing outside an <ExampleScope>. */}
          <ExampleNote inside className="cn-ex" lead="Example chat." rest="Made-up places. Nothing you write is sent." />
        </>
      ) : (
        <TitleBlock title="Concierge." sub="It learns your taste." />
      )}
      {started ? (
        <div className="cn-thread-wrap" ref={threadRef} inert={sheetOpen}>
          {/* aria-busy on the thread while the concierge is thinking (spec screen 3), never on <main>: the native splash waits on a <main> without it */}
          <div className="cn-thread" role="log" aria-label="Conversation with the concierge" aria-busy={waiting}>
            {messages.map((message) => {
              if (message.role === "concierge") {
                return (
                  <ReplyBlock
                    key={message.id}
                    reply={message}
                    domId={replyDomId(message.id)}
                    inMemory={inMemory}
                    onUndo={forgetOne}
                  />
                );
              }
              return (
                <Fragment key={message.id}>
                  <MemberBubble message={message} />
                  {message.status === "failed" ? <NotSent onRetry={() => deliver(message.id, message.text)} /> : null}
                </Fragment>
              );
            })}
            {waiting ? <Waiting /> : null}
          </div>
        </div>
      ) : (
        <FirstOpen suggestions={snapshot.suggestions} onPick={submit} />
      )}
      {composer}
      {started && sheetOpen ? (
        <MemorySheet
          memory={memory}
          onRemove={forgetOne}
          onForgetAll={forgetAll}
          onClose={() => setSheetOpen(false)}
          startConfirming={initialConfirm}
        />
      ) : null}
    </Main>
  );
}
