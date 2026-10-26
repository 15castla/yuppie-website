"use client";

// One chat: the header, the pinned invite, the stream, and the docked composer.
// A card: on a phone it is the whole screen (exactly one viewport tall, the
// stream scrolls inside it, the composer is docked at the foot); from 768px it
// is a pale card in the page, and from 1024px it sits beside the inbox.
//
// All local state, no backend: a sent message goes through "Sending…" and
// lands (or, with the browser offline, "Not sent" with Retry and Delete);
// mute, block and the report steps change only this view. Phone numbers go
// through; a link is refused before send with the designed line.
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

import { Avatar, Button, Icon } from "@/components/members/kit";
import { containsLink } from "@/lib/members/messages/link-check";
import { SELECT_BANNER, closedNote } from "@/lib/members/messages/thread-copy";
import { buildRows, groupTime, type GroupMessage, type StreamRow } from "@/lib/members/messages/thread-model";
import type { ChatMessage, ChatThread, OutgoingMessage } from "@/lib/members/messages/types";
import { ROUTES } from "@/lib/members/routes";
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
} from "./thread-parts";

// ---- what you have written on this device ---------------------------------------------------------

type Local = { outgoing: OutgoingMessage[]; sent: ChatMessage[] };
type LocalAction =
  | { type: "queue"; message: OutgoingMessage }
  | { type: "retry"; clientId: string }
  | { type: "delete"; clientId: string }
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
    case "settle": {
      const pending = state.outgoing.find((m) => m.clientId === action.clientId);
      if (!pending) return state;
      if (!action.online) {
        return {
          ...state,
          outgoing: state.outgoing.map((m) => (m.clientId === action.clientId ? { ...m, state: "failed" } : m)),
        };
      }
      const delivered: ChatMessage = {
        kind: "text",
        id: `local-${action.clientId}`,
        clientId: action.clientId,
        chatId: action.chatId,
        senderId: action.senderId,
        text: pending.text,
        sentAt: action.sentAt,
        status: "visible",
      };
      return {
        outgoing: state.outgoing.filter((m) => m.clientId !== action.clientId),
        sent: [...state.sent, delivered],
      };
    }
  }
}

const INPUT_MAX_HEIGHT = 113.4;

export function ThreadView({
  thread,
  now,
  youId,
  preview,
}: {
  thread: ChatThread;
  /** The clock the times are read against (the example clock in the preview). */
  now: string;
  youId: string;
  /** Preview only: start in a state that is otherwise transient (see overlay-types). */
  preview?: ThreadPreview;
}) {
  const { chat } = thread;
  const router = useRouter();
  const closed = chat.status === "closed";

  const [overlay, setOverlay] = useState<Overlay>(preview?.overlay ?? { kind: "none" });
  const [draft, setDraft] = useState(preview?.draft ?? "");
  const [local, dispatch] = useReducer(localReducer, {
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
  const timersRef = useRef<number[]>([]);
  const counterRef = useRef(0);
  const startedRef = useRef<{ wall: number } | null>(null);

  const link = containsLink(draft);
  const canSend = draft.trim().length > 0 && !link;

  const rows = useMemo(
    () =>
      buildRows({
        chat,
        items: thread.items,
        sentHere: local.sent,
        outgoing: local.outgoing,
        blockedIds,
        firstUnreadId: thread.firstUnreadId,
        youId,
        now,
      }),
    [chat, thread.items, thread.firstUnreadId, local, blockedIds, youId, now],
  );

  const messageById = useCallback(
    (id: string) =>
      [...thread.items, ...local.sent].find((item): item is ChatMessage => item.kind === "text" && item.id === id) ?? null,
    [thread.items, local.sent],
  );

  // ---- the clock: the example clock, advancing from when the page opened -------------------------
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
  const settle = useCallback(
    (clientId: string) => {
      dispatch({
        type: "settle",
        clientId,
        online: typeof navigator === "undefined" || navigator.onLine !== false,
        sentAt: stamp(),
        chatId: chat.id,
        senderId: youId,
      });
    },
    [chat.id, stamp, youId],
  );
  const schedule = useCallback(
    (clientId: string) => {
      timersRef.current.push(window.setTimeout(() => settle(clientId), 700));
    },
    [settle],
  );

  function send() {
    if (!canSend) return;
    counterRef.current += 1;
    const clientId = `local-${counterRef.current}`;
    dispatch({ type: "queue", message: { clientId, text: draft.trim(), state: "sending" } });
    setDraft("");
    schedule(clientId);
    setAnnounce("Sending");
  }
  function retry(clientId: string) {
    dispatch({ type: "retry", clientId });
    schedule(clientId);
  }

  function onInputKey(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    event.preventDefault();
    send();
  }

  // ---- bubbles: long press, right click, Enter, and picking a message to report --------------------
  const selecting = overlay.kind === "select";
  const menuOpen = overlay.kind === "menu";

  function openMenu(target: HTMLElement, messageId: string) {
    lastBubbleRef.current = target;
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
    const back = overlay.kind === "menu" ? lastBubbleRef.current : null;
    setOverlay({ kind: "none" });
    if (back) back.focus({ preventScroll: true });
  }

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

  function block(memberId: string) {
    const name = chat.participants.find((p) => p.member.id === memberId)?.member.firstName ?? "They";
    setBlockedIds((previous) => (previous.includes(memberId) ? previous : [...previous, memberId]));
    setOverlay({ kind: "none" });
    setAnnounce(`${name} is blocked. You won’t see their messages.`);
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
          keyboardUp={keyboardUp}
          inputRef={inputRef}
          onChange={setDraft}
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
        onMute={() => setMuted((value) => !value)}
        blockedIds={blockedIds}
        onBlock={block}
        messageById={messageById}
        onLeave={() => router.push(ROUTES.messages)}
      />
      <div className="msg-sr" role="status" aria-live="polite">
        {announce}
      </div>
    </div>
  );
}
