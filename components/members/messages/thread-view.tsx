"use client";

// One chat: the header, the pinned invite, the stream, and the docked composer.
// A card: on a phone it is the whole screen (exactly one viewport tall, the
// stream scrolls inside it, the composer is docked at the foot); from 768px it
// is a pale card in the page, and from 1024px it sits beside the inbox.
//
// Real data (app/members/messages/[chatId]/actions.ts and ../actions.ts):
//   - a sent message shows "Sending…" at once and lands when the server has it,
//     or shows "Not sent" with Retry and Delete (the same client id, so a retry
//     never posts twice). A refusal says why above the input: the link line,
//     "Slow down a moment." (the rate limit), and the rest in the server's words;
//   - polling, not sockets: while the thread is on screen it asks the server
//     again every few seconds (and marks it read). Only the stream changes:
//     the draft, the focus and the scroll position are never touched, so a new
//     message never interrupts typing;
//   - the "N new messages" divider stays where it was when the chat opened;
//   - mute, block, report, leave and the safety note go to the server; block,
//     report and leave wait for its answer in their sheet or dialog.
// `local` (the preview harness) keeps everything on this screen: a send settles
// after a moment and nothing is asked of the server.
//
// Interaction model (needs_device_check where a real phone matters):
//   - a long press (or a right click, or Enter on a focused bubble) lifts the
//     bubble above a scrim and opens a menu: Copy, and Report message on
//     others' messages;
//   - "Report a message" in chat info puts up an ink banner and lets you tap
//     the message;
//   - the composer follows the keyboard (visualViewport) and the pinned card
//     folds to one line while it is up;
//   - Enter sends where there is a hardware keyboard (a fine pointer);
//     on a phone it adds a line.

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

import {
  getThread as fetchThread,
  leaveChat,
  markSafetyNoteSeen,
  sendMessage,
  setChatMuted,
} from "@/app/members/messages/[chatId]/actions";
import { blockMember, sendReport } from "@/app/members/messages/actions";
import { Avatar, Button, Icon } from "@/components/members/kit";
import { announceUnreadChanged } from "@/components/members/shell/use-unread";
import { goToSessionEnded, isSessionEnded } from "@/components/members/session-ended";
import { containsLink } from "@/lib/members/messages/link-check";
import { SELECT_BANNER, closedNote } from "@/lib/members/messages/thread-copy";
import { buildRows, groupTime, memberOf, type GroupMessage, type StreamRow } from "@/lib/members/messages/thread-model";
import type { ChatMessage, ChatThread, OutgoingMessage, ReportDraft } from "@/lib/members/messages/types";
import { ROUTES, messageThreadHref } from "@/lib/members/routes";
import { cn } from "@/lib/utils";
import "./messages.css";
import type { Overlay, ThreadPreview } from "./overlay-types";
import { ThreadOverlays } from "./thread-overlays";
import {
  Bubble,
  ClosedComposer,
  Composer,
  DayRule,
  EmptyPrompt,
  NewDivider,
  QuestionIntro,
  SafetyNote,
  SystemLine,
  ThreadHeader,
  ThreadPin,
  type ComposerNotice,
} from "./thread-parts";
import { useTwoPanes } from "./use-wide";

/** How often an open thread asks the server again. */
const POLL_MS = 3000;
/** A page drawn longer ago than this (one the browser's Back brought back) asks again at once. */
const STALE_MS = 5000;
/** What a failure the member cannot act on says (the foundation's words, app/members/action-kit.ts). */
const TRY_AGAIN = "That didn’t go through. Try again in a moment.";

// ---- what you have written on this device ---------------------------------------------------------

type Local = { outgoing: OutgoingMessage[]; sent: ChatMessage[] };
type LocalAction =
  | { type: "queue"; message: OutgoingMessage }
  | { type: "retry"; clientId: string }
  | { type: "delete"; clientId: string }
  | { type: "fail"; clientId: string }
  | { type: "delivered"; clientId: string; message: ChatMessage }
  | { type: "settle"; clientId: string; online: boolean; sentAt: string; chatId: string; senderId: string };

function localReducer(state: Local, action: LocalAction): Local {
  switch (action.type) {
    case "queue":
      return { ...state, outgoing: [...state.outgoing, action.message] };
    case "retry":
      return {
        ...state,
        outgoing: state.outgoing.map((m) => (m.clientId === action.clientId ? { ...m, state: "sending" } : m)),
      };
    case "delete":
      return { ...state, outgoing: state.outgoing.filter((m) => m.clientId !== action.clientId) };
    case "fail":
      return {
        ...state,
        outgoing: state.outgoing.map((m) => (m.clientId === action.clientId ? { ...m, state: "failed" } : m)),
      };
    case "delivered":
      return {
        outgoing: state.outgoing.filter((m) => m.clientId !== action.clientId),
        sent: state.sent.some((m) => m.id === action.message.id) ? state.sent : [...state.sent, action.message],
      };
    case "settle": {
      // The preview harness only: no server, so the message lands here (or fails with the browser offline).
      const pending = state.outgoing.find((m) => m.clientId === action.clientId);
      if (!pending) return state;
      if (!action.online) return localReducer(state, { type: "fail", clientId: action.clientId });
      return localReducer(state, {
        type: "delivered",
        clientId: action.clientId,
        message: {
          kind: "text",
          id: `local-${action.clientId}`,
          clientId: action.clientId,
          chatId: action.chatId,
          senderId: action.senderId,
          text: pending.text,
          sentAt: action.sentAt,
          status: "visible",
        },
      });
    }
  }
}

/** A client id the server accepts (letters, digits, - and _, up to 64): a retry sends the same one. */
function newClientId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const INPUT_MAX_HEIGHT = 113.4;

export function ThreadView({
  thread,
  now,
  youId,
  preview,
  local = false,
  beside = false,
}: {
  thread: ChatThread;
  /** The clock the times are read against (the server's when the page was drawn; the example clock in the preview). */
  now: string;
  youId: string;
  /** Preview only: start in a state that is otherwise transient (see overlay-types). */
  preview?: ThreadPreview;
  /** Preview harness only: nothing goes to the server; a send settles on this screen. */
  local?: boolean;
  /** Drawn beside the inbox (the inbox page): only on screen from 1024px, so it reads and polls only then. */
  beside?: boolean;
}) {
  const router = useRouter();
  const twoPanes = useTwoPanes();
  const onScreen = !beside || twoPanes;
  const live = !local;

  // The thread as the server last gave it. A new one from the page (a refresh, or a question that has just
  // been asked: the page keeps this view mounted) replaces it.
  const [base, setBase] = useState(thread);
  const [propThread, setPropThread] = useState(thread);
  if (thread !== propThread) {
    setPropThread(thread);
    setBase(thread);
  }
  const { chat } = base;
  const closed = chat.status === "closed";
  const chatIdRef = useRef(thread.chat.id);
  useEffect(() => {
    chatIdRef.current = base.chat.id;
  }, [base.chat.id]);

  // "N new messages": where the divider was when the chat opened. Polls read the chat as they go, so the
  // server's own marker moves on; the divider does not.
  const [divider] = useState(() =>
    thread.firstUnreadId && thread.chat.unreadCount > 0 ? { id: thread.firstUnreadId, count: thread.chat.unreadCount } : null,
  );
  const [clock, setClock] = useState(now);

  const [overlay, setOverlay] = useState<Overlay>(preview?.overlay ?? { kind: "none" });
  const [draft, setDraft] = useState(preview?.draft ?? "");
  const [notice, setNotice] = useState<ComposerNotice | null>(preview?.notice ?? null);
  const [here, dispatch] = useReducer(localReducer, {
    outgoing: (preview?.outgoing ?? []).map((m) => ({ ...m })),
    sent: [],
  });
  const [muted, setMuted] = useState(preview?.muted ?? chat.muted);
  const [blockedIds, setBlockedIds] = useState<string[]>(
    preview?.blockedIds ?? chat.participants.filter((p) => p.blockedByYou).map((p) => p.member.id),
  );
  const [safety, setSafety] = useState(!thread.safetyNoteSeen);
  const [keyboardUp, setKeyboardUp] = useState(Boolean(preview?.keyboard));
  const [announce, setAnnounce] = useState("");

  const cardRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const streamRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const lastBubbleRef = useRef<HTMLElement | null>(null);
  const fromBubbleRef = useRef(false);
  const timersRef = useRef<number[]>([]);
  const startedRef = useRef<{ wall: number } | null>(null);
  const textsRef = useRef<Map<string, string>>(new Map());

  const link = containsLink(draft);
  const canSend = draft.trim().length > 0 && !link;

  // What the server has, plus what you sent here that a poll has not brought back yet. A message still on its
  // way that a poll already returned (the poll won the race) is drawn once, from the server.
  const items = useMemo(() => {
    const known = new Set(base.items.map((item) => item.id));
    return [...base.items, ...here.sent.filter((message) => !known.has(message.id))];
  }, [base.items, here.sent]);
  const outgoing = useMemo(() => {
    const landed = new Set(
      base.items.filter((item) => item.kind === "text" && item.senderId === youId).map((item) => (item as ChatMessage).clientId),
    );
    return here.outgoing.filter((message) => !landed.has(message.clientId));
  }, [base.items, here.outgoing, youId]);

  const rows = useMemo(
    () =>
      buildRows({
        // The divider's count is the one from when the chat opened.
        chat: { ...chat, unreadCount: divider?.count ?? 0 },
        items,
        sentHere: [],
        outgoing,
        blockedIds,
        firstUnreadId: divider?.id ?? null,
        youId,
        now: clock,
      }),
    [chat, items, outgoing, blockedIds, divider, youId, clock],
  );

  const messageById = useCallback(
    (id: string) => items.find((item): item is ChatMessage => item.kind === "text" && item.id === id) ?? null,
    [items],
  );

  // ---- the clock: the page's clock, advancing from when the page opened --------------------------
  useEffect(() => {
    startedRef.current = { wall: Date.now() };
    const timers = timersRef.current;
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, []);
  const stamp = useCallback(() => {
    const started = startedRef.current?.wall ?? Date.now();
    return new Date(Date.parse(now) + (Date.now() - started)).toISOString();
  }, [now]);

  // ---- polling: the thread again every few seconds while it is on screen ---------------------------
  // Messages from others that arrive are announced (politely) for a screen reader.
  useEffect(() => {
    const map = textsRef.current;
    for (const item of base.items) if (item.kind === "text") map.set(item.id, item.senderId);
  }, [base.items]);

  // Leaving stops the polls first (a poll must never race the leave), and a poll never puts a member back in.
  const leftRef = useRef(false);
  const inflightRef = useRef<Promise<void> | null>(null);
  const poll = useCallback(async (): Promise<void> => {
    if (leftRef.current) return;
    const answer = await fetchThread(chatIdRef.current, { markRead: true, poll: true });
    if (leftRef.current) return;
    if (isSessionEnded(answer)) return goToSessionEnded();
    if (answer === null) {
      // Not yours any more (you left it elsewhere, or blocked the other person in a question).
      if (beside) router.refresh();
      else router.replace(ROUTES.messages);
      return;
    }
    if ("ok" in answer) return; // a failure: keep what is on screen and ask again next time
    const fresh = answer.items.filter(
      (item): item is ChatMessage =>
        item.kind === "text" && item.senderId !== youId && item.status === "visible" && !textsRef.current.has(item.id),
    );
    setBase(answer);
    setClock(new Date().toISOString());
    if (fresh.length > 0) {
      const last = fresh[fresh.length - 1];
      setAnnounce(`New message from ${memberOf(answer.chat, last.senderId)?.firstName ?? "someone"}`);
    }
  }, [beside, router, youId]);

  useEffect(() => {
    if (!live || !onScreen) return;
    let alive = true;
    let busy = false;
    const tick = async () => {
      if (busy || !alive || leftRef.current || document.visibilityState === "hidden") return;
      busy = true;
      const run = poll().catch(() => {
        // offline or the server did not answer: the next tick tries again
      });
      inflightRef.current = run;
      await run;
      inflightRef.current = null;
      busy = false;
    };
    // Beside the inbox the chat was not read when the page was drawn: it is read now that it is on screen. A
    // thread brought back from the browser's history (Back) was drawn a while ago: it is asked for again now.
    if (beside) void tick().then(() => announceUnreadChanged());
    else if (Date.now() - Date.parse(now) > STALE_MS) void tick();
    const timer = window.setInterval(tick, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [live, onScreen, beside, poll, now]);

  // ---- the safety note: shown once ever (decision 5 A), so it counts as seen once it is on screen -------
  const safetyMarked = useRef(false);
  useEffect(() => {
    if (!live || !safety || !onScreen || safetyMarked.current) return;
    safetyMarked.current = true;
    markSafetyNoteSeen().catch(() => {
      safetyMarked.current = false;
    });
  }, [live, safety, onScreen]);

  // ---- keep the newest message in view -----------------------------------------------------------
  // The stream is a column-reverse scroller: it starts at, and stays at, the
  // newest message by itself (also on the server-rendered first paint). This
  // only handles the input growing and the keyboard moving it.
  const fit = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight + 3, INPUT_MAX_HEIGHT)}px`;
  }, []);
  useLayoutEffect(() => {
    fit();
  }, [draft, fit]);

  useEffect(() => {
    const el = inputRef.current;
    if (!preview?.focus || !el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
    el.scrollTop = el.scrollHeight;
  }, [preview?.focus]);

  // ---- the keyboard (needs_device_check): the page is as tall as what the keyboard leaves ----------
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const update = () => {
      const covered = window.innerHeight - vv.height - vv.offsetTop;
      const up = covered > 120 && vv.width < 768;
      setKeyboardUp(up || Boolean(preview?.keyboard));
      if (up) {
        root.style.setProperty("--msg-vh", `${vv.height}px`);
        window.scrollTo(0, 0);
      } else {
        root.style.removeProperty("--msg-vh");
      }
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      root.style.removeProperty("--msg-vh");
    };
  }, [preview?.keyboard]);

  // ---- the info drawer ends at the composer ------------------------------------------------------
  // From 768px the drawer sits inside the card and the composer is drawn over its foot, so the drawer
  // stops at the composer's top edge (messages.css reads --msg-comp-h). The composer grows with what is
  // typed, so the height is kept up to date rather than assumed.
  useEffect(() => {
    const card = cardRef.current;
    const composer = card?.querySelector<HTMLElement>(".msg-comp");
    if (!card || !composer || typeof ResizeObserver === "undefined") return;
    const sync = () => card.style.setProperty("--msg-comp-h", `${composer.getBoundingClientRect().height}px`);
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(composer);
    return () => {
      observer.disconnect();
      card.style.removeProperty("--msg-comp-h");
    };
  }, [closed]);

  // ---- sending -----------------------------------------------------------------------------------
  const deliver = useCallback(
    async (clientId: string, text: string) => {
      if (local) {
        timersRef.current.push(
          window.setTimeout(
            () =>
              dispatch({
                type: "settle",
                clientId,
                online: typeof navigator === "undefined" || navigator.onLine !== false,
                sentAt: stamp(),
                chatId: chatIdRef.current,
                senderId: youId,
              }),
            700,
          ),
        );
        return;
      }
      let answer: Awaited<ReturnType<typeof sendMessage>>;
      try {
        answer = await sendMessage({ chatId: chatIdRef.current, text, clientId });
      } catch {
        dispatch({ type: "fail", clientId });
        setAnnounce("Not sent");
        return;
      }
      if (isSessionEnded(answer)) return goToSessionEnded();
      if (answer.ok) {
        dispatch({ type: "delivered", clientId, message: answer.message });
        textsRef.current.set(answer.message.id, youId);
        setNotice(null);
        setAnnounce("Sent");
        if (answer.chatId !== chatIdRef.current) {
          // The first question: the chat exists now. The page keeps this view (its key is the plan's question),
          // so the composer keeps its focus while the address moves to the real chat.
          chatIdRef.current = answer.chatId;
          router.replace(messageThreadHref(answer.chatId), { scroll: false });
        }
        return;
      }
      if (!("reason" in answer)) {
        // Something unexpected: the designed "Not sent", with Retry and Delete.
        dispatch({ type: "fail", clientId });
        setAnnounce("Not sent");
        return;
      }
      if (answer.reason === "rate_limited") {
        // Kept, so Retry sends it once the minute is up.
        dispatch({ type: "fail", clientId });
        setNotice({ icon: "clock", text: answer.error }); // the line is a status: it is read out itself
        return;
      }
      // Refused for good: the words go above the input and the text goes back into it to change.
      dispatch({ type: "delete", clientId });
      setDraft((current) => (current.trim() ? current : text));
      setNotice({ icon: answer.reason === "link" ? "link-off" : "circle-alert", text: answer.error });
      if (answer.reason === "closed" || answer.reason === "not_in_chat" || answer.reason === "blocked") void poll().catch(() => {});
    },
    [local, poll, router, stamp, youId],
  );

  function send() {
    if (!canSend) return;
    const clientId = local ? `local-${Date.now().toString(36)}` : newClientId();
    const text = draft.trim();
    dispatch({ type: "queue", message: { clientId, text, state: "sending" } });
    setDraft("");
    setNotice(null);
    setAnnounce("Sending");
    void deliver(clientId, text);
  }
  function retry(clientId: string) {
    const pending = here.outgoing.find((m) => m.clientId === clientId);
    if (!pending) return;
    dispatch({ type: "retry", clientId });
    setNotice(null);
    void deliver(clientId, pending.text);
  }

  function onInputKey(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    event.preventDefault();
    send();
  }

  function onDraft(value: string) {
    setDraft(value);
    // A refusal's line goes once the message is changed.
    if (notice) setNotice(null);
  }

  // ---- bubbles: long press, right click, Enter, and picking a message to report --------------------
  const selecting = overlay.kind === "select";
  const menuOpen = overlay.kind === "menu";

  function openMenu(target: HTMLElement, messageId: string) {
    lastBubbleRef.current = target;
    fromBubbleRef.current = true;
    setOverlay({ kind: "menu", messageId });
  }
  // The menu sits next to the pressed bubble, placed from its own rectangle.
  const placeMenu = useCallback(
    (node: HTMLDivElement | null) => {
      menuRef.current = node;
      if (!node || overlay.kind !== "menu") return;
      const bubble = streamRef.current?.querySelector<HTMLElement>(`[data-mid="${overlay.messageId}"]`);
      if (!bubble) return;
      const rect = bubble.getBoundingClientRect();
      const mine = bubble.dataset.mine === "1";
      const { offsetWidth: width, offsetHeight: height } = node;
      let top = rect.bottom + 8;
      if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 8);
      const left = Math.min(Math.max(8, mine ? rect.right - width : rect.left), window.innerWidth - width - 8);
      node.style.top = `${top}px`;
      node.style.left = `${left}px`;
    },
    [overlay],
  );
  useEffect(() => {
    if (menuOpen) menuRef.current?.querySelector<HTMLElement>("button")?.focus();
  }, [menuOpen]);

  function closeOverlay() {
    setOverlay({ kind: "none" });
  }

  // Whatever started at a bubble's menu (the menu itself, Copy, and the report sheets reached from "Report
  // message") hands focus back to that bubble when it closes, by any route: Escape, a tap on the scrim, the
  // close button, Done. Without it focus falls to <body> and a keyboard user starts again from the top.
  useEffect(() => {
    if (overlay.kind !== "none" || !fromBubbleRef.current) return;
    fromBubbleRef.current = false;
    const bubble = lastBubbleRef.current;
    if (bubble?.isConnected) bubble.focus({ preventScroll: true });
  }, [overlay.kind]);

  // Escape closes whatever is open.
  useEffect(() => {
    if (overlay.kind === "none") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOverlay({ kind: "none" });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [overlay.kind]);

  async function copyMessage(id: string) {
    const message = messageById(id);
    setOverlay({ kind: "none" });
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message.text);
      setAnnounce("Copied");
    } catch {
      setAnnounce("Couldn’t copy");
    }
  }

  // ---- what chat info changes ------------------------------------------------------------------------
  async function toggleMute() {
    const next = !muted;
    setMuted(next);
    if (local) return;
    try {
      const answer = await setChatMuted(chatIdRef.current, next);
      if (isSessionEnded(answer)) return goToSessionEnded();
      if (!answer.ok) throw new Error("not saved");
    } catch {
      setMuted(!next);
      setAnnounce(TRY_AGAIN);
    }
  }

  /** Block: null when it is done, or the words to show in the dialog. */
  async function block(memberId: string): Promise<string | null> {
    const name = chat.participants.find((p) => p.member.id === memberId)?.member.firstName ?? "They";
    if (live) {
      let answer: Awaited<ReturnType<typeof blockMember>>;
      try {
        answer = await blockMember({ memberId, chatId: chatIdRef.current });
      } catch {
        return TRY_AGAIN;
      }
      if (isSessionEnded(answer)) {
        goToSessionEnded();
        return null;
      }
      if (!answer.ok) return answer.error;
      announceUnreadChanged();
    }
    setBlockedIds((previous) => (previous.includes(memberId) ? previous : [...previous, memberId]));
    setOverlay({ kind: "none" });
    setAnnounce(`${name} is blocked. You won’t see their messages.`);
    // A question with someone you blocked is gone from your chats (the server no longer shows it to you).
    if (live && chat.kind === "question") router.replace(ROUTES.messages);
    return null;
  }

  /** Report: null when it is sent (the sheet moves on to "Report sent."), or the words to show in the sheet. */
  async function report(draftReport: ReportDraft): Promise<string | null> {
    if (local) return null;
    try {
      const answer = await sendReport(draftReport);
      if (isSessionEnded(answer)) {
        goToSessionEnded();
        return null;
      }
      return answer.ok ? null : answer.error;
    } catch {
      return TRY_AGAIN;
    }
  }

  /** Leave: null when it is done (back to the inbox), or the words to show in the dialog. */
  async function leave(): Promise<string | null> {
    if (live) {
      leftRef.current = true;
      await inflightRef.current;
      try {
        const answer = await leaveChat(chatIdRef.current);
        if (isSessionEnded(answer)) {
          goToSessionEnded();
          return null;
        }
        if (!answer.ok) {
          leftRef.current = false;
          return answer.error;
        }
      } catch {
        leftRef.current = false;
        return TRY_AGAIN;
      }
      announceUnreadChanged();
    }
    router.push(ROUTES.messages);
    // The inbox drawn fresh (the router may hold one from before the leave).
    if (live) router.refresh();
    return null;
  }

  // ---- the stream --------------------------------------------------------------------------------
  const avatarOn = chat.kind === "plan";
  const whoOn = chat.kind === "plan";
  const empty = rows.length === 0 && !safety;

  function bubble(message: GroupMessage, row: Extract<StreamRow, { kind: "group" }>): ReactNode {
    return (
      <Bubble
        key={message.id}
        message={message}
        mine={row.mine}
        senderId={row.sender?.id ?? ""}
        mode={overlay.kind === "select" ? "select" : "menu"}
        lifted={overlay.kind === "menu" && overlay.messageId === message.id}
        picked={overlay.kind === "select" && overlay.pickedId === message.id}
        onOpenMenu={openMenu}
        onReport={(memberId, messageId) =>
          setOverlay({ kind: "report", what: "message", memberId, messageId, reason: null })
        }
      />
    );
  }

  function group(row: Extract<StreamRow, { kind: "group" }>): ReactNode {
    const last = row.messages[row.messages.length - 1];
    let tail: ReactNode;
    if (last.state === "sending") {
      tail = (
        <div className="msg-state">
          <span className="msg-sendmuted">Sending…</span>
        </div>
      );
    } else if (last.state === "failed") {
      tail = (
        <div className="msg-state">
          <span className="msg-err">
            <Icon name="circle-alert" size={16} />
            Not sent
          </span>
          <Button variant="quiet" onClick={() => retry(last.clientId ?? last.id)}>
            Retry
          </Button>
          <Button variant="quiet" onClick={() => dispatch({ type: "delete", clientId: last.clientId ?? last.id })}>
            Delete
          </Button>
        </div>
      );
    } else {
      tail = <span className="msg-t">{groupTime(row)}</span>;
    }
    const sender = row.sender;
    return (
      <div key={row.key} className={cn("msg-grp", row.mine ? "is-me" : "is-them", !row.mine && !avatarOn && "no-av")}>
        {!row.mine && avatarOn ? <Avatar photoUrl={sender?.photoUrl} name={sender?.firstName} size={32} /> : null}
        <div className="msg-col">
          {!row.mine && whoOn ? (
            <span className="msg-who">
              {sender?.firstName}
              {row.isHost ? (
                <>
                  {" "}
                  <span className="msg-host">Host</span>
                </>
              ) : null}
            </span>
          ) : null}
          {row.messages.map((message) => bubble(message, row))}
          {tail}
        </div>
      </div>
    );
  }

  const streamClass = cn("msg-stream", safety && "is-top", empty && "is-center");

  return (
    <div className="msg-card" ref={cardRef}>
      <ThreadHeader chat={chat} infoOpen={overlay.kind === "info"} onInfo={() => setOverlay({ kind: "info" })} />
      {selecting ? (
        <div className="msg-banner" role="status">
          <span>{SELECT_BANNER}</span>
          <Button variant="quiet" onClick={() => setOverlay({ kind: "none" })}>
            Cancel
          </Button>
        </div>
      ) : null}
      <ThreadPin chat={chat} youId={youId} compact={keyboardUp} />
      <div className={streamClass} ref={streamRef} onScroll={menuOpen ? () => setOverlay({ kind: "none" }) : undefined}>
        <div className="msg-stream-in">
          {safety ? <SafetyNote onDismiss={() => setSafety(false)} /> : null}
          {chat.kind === "question" && !empty ? <QuestionIntro chat={chat} youId={youId} /> : null}
          {rows.map((row) => {
            switch (row.kind) {
              case "day":
                return <DayRule key={row.key} label={row.label} />;
              case "new":
                return <NewDivider key={row.key} label={row.label} />;
              case "system":
                return <SystemLine key={row.key} row={row} />;
              case "group":
                return group(row);
            }
          })}
          {empty ? <EmptyPrompt chat={chat} /> : null}
        </div>
      </div>
      {closed ? (
        <ClosedComposer note={closedNote(chat)} />
      ) : (
        <Composer
          draft={draft}
          link={link}
          notice={notice}
          keyboardUp={keyboardUp}
          inputRef={inputRef}
          onChange={onDraft}
          onKeyDown={onInputKey}
          onSend={send}
        />
      )}
      {preview?.keyboard ? (
        <div className="msg-kb" aria-hidden="true" style={{ height: preview.keyboard }}>
          <div>
            iOS keyboard (placeholder)
            <small>Height varies by device and text size. needs_device_check</small>
          </div>
        </div>
      ) : null}
      {menuOpen ? (
        <>
          <div className="msg-scrim-phone" aria-hidden="true" onClick={closeOverlay} />
          <div className="msg-scrim-card" aria-hidden="true" onClick={closeOverlay} />
          <div className="msg-menu" role="menu" aria-label="Message" ref={placeMenu}>
            {(() => {
              const message = messageById(overlay.messageId);
              const mine = message?.senderId === youId;
              return (
                <>
                  <button type="button" role="menuitem" className="msg-li" onClick={() => copyMessage(overlay.messageId)}>
                    <Icon name="copy" size={20} />
                    <span className="tx">
                      <b>Copy</b>
                    </span>
                  </button>
                  {mine || !message ? null : (
                    <button
                      type="button"
                      role="menuitem"
                      className="msg-li"
                      onClick={() =>
                        setOverlay({
                          kind: "report",
                          what: "message",
                          memberId: message.senderId,
                          messageId: message.id,
                          reason: null,
                        })
                      }
                    >
                      <Icon name="flag" size={20} />
                      <span className="tx">
                        <b>Report message</b>
                      </span>
                    </button>
                  )}
                </>
              );
            })()}
          </div>
        </>
      ) : null}
      <ThreadOverlays
        overlay={overlay}
        setOverlay={setOverlay}
        chat={chat}
        youId={youId}
        muted={muted}
        onMute={toggleMute}
        blockedIds={blockedIds}
        onBlock={block}
        onReport={report}
        messageById={messageById}
        onLeave={leave}
        initialError={preview?.stepError ?? null}
      />
      <div className="msg-sr" role="status" aria-live="polite">
        {announce}
      </div>
    </div>
  );
}
