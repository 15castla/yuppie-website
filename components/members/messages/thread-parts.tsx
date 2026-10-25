"use client";

// The pieces of a thread that are pure markup: the header, the pinned card,
// the stream's furniture (day rule, system line, the new-messages divider, a
// question's intro, the first-time safety note, the empty prompt) and the
// docked composer. The thread view (thread-view.tsx) owns the state and
// passes it in. Kit counterparts: pages_msg.thead(), pin_html(),
// stream_html(), composer(), safety_note(), empty_thread().

import { useRef, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode, type RefObject } from "react";

import { Avatar, AvatarStack, Button, DateColumn, Icon, KitLink, Pill } from "@/components/members/kit";
import { dateTile } from "@/lib/members/messages/format";
import {
  LINK_BLOCKED_LINE,
  emptyPrompt,
  pinCopy,
  questionIntro,
  threadSub,
  threadTitle,
} from "@/lib/members/messages/thread-copy";
import type { GroupMessage, StreamRow } from "@/lib/members/messages/thread-model";
import { MESSAGE_COUNTER_FROM, MESSAGE_COUNTER_NEAR, MESSAGE_MAX_LENGTH, type Chat } from "@/lib/members/messages/types";
import { ROUTES, openInviteHref } from "@/lib/members/routes";
import { cn } from "@/lib/utils";

export function ThreadHeader({ chat, infoOpen, onInfo }: { chat: Chat; infoOpen: boolean; onInfo: () => void }) {
  return (
    <header className="msg-thead">
      <KitLink href={ROUTES.messages} className="msg-back" aria-label="Back to Messages">
        <Icon name="chevron-left" size={26} />
      </KitLink>
      <div className="msg-mid">
        {chat.kind === "question" && chat.other ? (
          <Avatar photoUrl={chat.other.photoUrl} name={chat.other.firstName} size={36} />
        ) : null}
        <div className="msg-tt">
          <b>{threadTitle(chat)}</b>
          <span>{threadSub(chat)}</span>
        </div>
      </div>
      <div className="msg-end">
        <button
          type="button"
          className="mk-icon-btn mk-bare"
          aria-label="Chat info"
          aria-haspopup="dialog"
          aria-expanded={infoOpen}
          onClick={onInfo}
        >
          <Icon name="info" size={24} />
        </button>
      </div>
    </header>
  );
}

export function ThreadPin({ chat, youId, compact }: { chat: Chat; youId: string; compact: boolean }) {
  const pin = pinCopy(chat, youId);
  const href = openInviteHref(chat.plan.id);
  if (compact) {
    return (
      <KitLink href={href} className="msg-pin is-compact">
        <span className="msg-pb">
          <b>{pin.compact[0]}</b>
          <span>{pin.compact[1]}</span>
        </span>
        <Icon name="chevron-right" size={20} />
      </KitLink>
    );
  }
  const tile = dateTile(chat.plan.startsAt);
  return (
    <KitLink href={href} className="msg-pin">
      <span className="msg-lead">
        {pin.lead === "people" ? (
          <AvatarStack
            ring="var(--cream)"
            people={chat.plan.going.slice(0, 4).map((member) => ({ photoUrl: member.photoUrl, name: member.firstName }))}
          />
        ) : (
          <DateColumn weekday={tile.weekday} day={tile.day} />
        )}
      </span>
      <span className="msg-pb">
        <b>{pin.title}</b>
        <span>
          {pin.posted ? <em className="msg-x">{pin.posted}</em> : null}
          {pin.rest}
        </span>
      </span>
      <Icon name="chevron-right" size={22} />
    </KitLink>
  );
}

export function DayRule({ label }: { label: string }) {
  return <div className="msg-day">{label}</div>;
}

export function NewDivider({ label }: { label: string }) {
  return (
    <div className="msg-new" role="separator">
      <Pill kind="ink">{label}</Pill>
    </div>
  );
}

export function SystemLine({ row }: { row: Extract<StreamRow, { kind: "system" }> }) {
  return (
    <div className="msg-sys">
      {row.icon ? <Icon name={row.icon} size={15} className="msg-sysico" /> : null}
      {row.bold ? <b>{row.bold}</b> : null}
      {row.text}
    </div>
  );
}

export function QuestionIntro({ chat, youId }: { chat: Chat; youId: string }) {
  const intro = questionIntro(chat, youId);
  return (
    <div className="msg-intro">
      <Avatar photoUrl={intro.member?.photoUrl} name={intro.name} size={64} />
      <b>{intro.name}</b>
      <small>{intro.line}</small>
      <p>{intro.note}</p>
    </div>
  );
}

export function SafetyNote({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="msg-safety" role="note">
      <span className="ic">
        <Icon name="shield" size={20} />
      </span>
      <div className="tx">
        <b>Meet somewhere public.</b>
        <p>Keep payments inside Club Yuppie.</p>
        <div className="act">
          <Button size="sm" onClick={onDismiss}>
            Got it
          </Button>
        </div>
      </div>
    </div>
  );
}

export function EmptyPrompt({ chat }: { chat: Chat }) {
  const prompt = emptyPrompt(chat);
  return (
    <div className="msg-empty-thread">
      <h3 className="mk-h3">{prompt.title}</h3>
      <p>{prompt.body}</p>
    </div>
  );
}

export function ClosedComposer({ note }: { note: string }) {
  return (
    <div className="msg-comp is-closed">
      <span className="ic">
        <Icon name="lock" size={20} />
      </span>
      <div>
        <b>This chat is closed</b>
        <span>{note}</span>
      </div>
    </div>
  );
}

export function Composer({
  draft,
  link,
  keyboardUp,
  inputRef,
  onChange,
  onKeyDown,
  onSend,
}: {
  draft: string;
  link: boolean;
  keyboardUp: boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
}) {
  const length = draft.length;
  const has = draft.trim().length > 0;
  const off = !has || link;
  const label = !has ? "Send, disabled: write a message first" : link ? "Send, disabled: remove the link first" : "Send";
  const counter: ReactNode =
    length >= MESSAGE_COUNTER_FROM ? (
      <div
        className={cn(
          "msg-count",
          length >= MESSAGE_MAX_LENGTH ? "is-max" : length >= MESSAGE_COUNTER_NEAR ? "is-near" : undefined,
        )}
        aria-live="polite"
      >
        <span>
          {length}/{MESSAGE_MAX_LENGTH}
        </span>
        {length >= MESSAGE_MAX_LENGTH ? <span>Message is at the limit</span> : null}
      </div>
    ) : null;
  return (
    <div className={cn("msg-comp", keyboardUp && "has-kb")}>
      {link ? (
        <div className="msg-comp-line" role="status">
          <Icon name="link-off" size={20} />
          <span>{LINK_BLOCKED_LINE}</span>
        </div>
      ) : null}
      {counter}
      <div className="msg-comp-row">
        <textarea
          ref={inputRef}
          className="msg-input"
          rows={1}
          maxLength={MESSAGE_MAX_LENGTH}
          placeholder="Write a message"
          aria-label="Message"
          enterKeyHint="send"
          autoComplete="off"
          value={draft}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          className={cn("msg-send", off && "is-off")}
          aria-label={label}
          aria-disabled={off || undefined}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (!off) onSend();
          }}
        >
          <Icon name="arrow-up" size={24} />
        </button>
      </div>
    </div>
  );
}

// ---- one message bubble ---------------------------------------------------------------------------------

const LONG_PRESS_MS = 450;
const MOVE_SLOP = 10;

/**
 * A bubble. In the report picker (mode "select") someone else's sent message is a button that
 * picks it. Otherwise a sent message opens its menu on a long press (touch), a right click, or
 * Enter / Space on the focused bubble.
 */
export function Bubble({
  message,
  mine,
  senderId,
  mode,
  lifted,
  picked,
  onOpenMenu,
  onReport,
}: {
  message: GroupMessage;
  mine: boolean;
  senderId: string;
  mode: "menu" | "select";
  lifted: boolean;
  picked: boolean;
  onOpenMenu: (target: HTMLElement, messageId: string) => void;
  onReport: (memberId: string, messageId: string) => void;
}) {
  const press = useRef<{ timer: number; x: number; y: number } | null>(null);
  const selecting = mode === "select";
  const sent = message.state === "sent";
  const reportable = selecting && !mine && sent;
  const openable = !selecting && sent;
  const interactive = reportable || openable;

  function cancelPress() {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  }
  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (reportable) onReport(senderId, message.id);
    else onOpenMenu(event.currentTarget, message.id);
  }
  function onPointerDown(event: PointerEvent<HTMLElement>) {
    if (!openable || event.pointerType === "mouse") return;
    const target = event.currentTarget;
    cancelPress();
    press.current = {
      x: event.clientX,
      y: event.clientY,
      timer: window.setTimeout(() => {
        press.current = null;
        onOpenMenu(target, message.id);
      }, LONG_PRESS_MS),
    };
  }
  function onPointerMove(event: PointerEvent<HTMLElement>) {
    const start = press.current;
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > MOVE_SLOP) cancelPress();
  }
  function onContextMenu(event: MouseEvent<HTMLElement>) {
    if (!openable) return;
    event.preventDefault();
    cancelPress();
    onOpenMenu(event.currentTarget, message.id);
  }

  return (
    <div
      className={cn(
        "msg-b",
        message.state === "sending" && "is-sending",
        message.state === "removed" && "is-removed",
        lifted && "is-lift",
        picked && "is-pick",
        selecting && interactive && "is-selectable",
      )}
      data-mid={message.id}
      data-mine={mine ? "1" : "0"}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={reportable ? `Report: ${message.text}` : undefined}
      aria-haspopup={openable ? "menu" : undefined}
      onClick={reportable ? () => onReport(senderId, message.id) : undefined}
      onKeyDown={interactive ? onKeyDown : undefined}
      onPointerDown={openable ? onPointerDown : undefined}
      onPointerMove={openable ? onPointerMove : undefined}
      onPointerUp={openable ? cancelPress : undefined}
      onPointerCancel={openable ? cancelPress : undefined}
      onPointerLeave={openable ? cancelPress : undefined}
      onContextMenu={openable ? onContextMenu : undefined}
    >
      {message.state === "removed" ? "Message removed" : message.text}
    </div>
  );
}
