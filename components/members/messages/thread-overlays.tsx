"use client";

// What opens over a thread: the chat info sheet (a drawer from 768px), the
// "who?" step for plan chats, the report sheets (message, member, photo), "Report
// sent.", and the block and leave dialogs. One at a time; the thread view owns
// which (see overlay-types.ts) and every action here is local state in it.
//
// On a phone a sheet or dialog is fixed to the screen over a scrim; from 768px
// it sits inside the thread card (the info drawer on the right, the dialogs in
// the middle) over a card-wide scrim. messages.css does the placing; the markup
// is one drawing.
//
// Not designed, so built from the same pieces and listed in the hand-over:
//   - the "who?" step. A plan chat has several people, so "Report a member",
//     "Report a photo" and "Block a member" first ask who (a question chat has
//     one other person and goes straight on);
//   - what block and leave do afterwards (block hides that member's messages
//     in this view; leave goes back to the inbox).
//
// Kit counterparts: pages_msg.info_sheet_html(), sheet_report(),
// sheet_report_sent(), dialog_block(), dialog_leave().

import { useEffect, useRef, type Dispatch, type KeyboardEvent, type ReactNode, type SetStateAction } from "react";

import { Avatar, Button, Icon, type IconName } from "@/components/members/kit";
import { weekdayTime } from "@/lib/members/messages/format";
import {
  REASONS,
  REPORT_CONTACT,
  REPORT_FINE_PRINT,
  reportHeading,
  reportSentCopy,
  type ReportWhat,
} from "@/lib/members/messages/report-reasons";
import { threadSub, threadTitle } from "@/lib/members/messages/thread-copy";
import type { Chat, ChatMessage, ChatParticipant } from "@/lib/members/messages/types";
import { openInviteHref } from "@/lib/members/routes";
import { cn } from "@/lib/utils";
import type { Overlay } from "./overlay-types";
import { useDrawer } from "./use-wide";

type Props = {
  overlay: Overlay;
  setOverlay: Dispatch<SetStateAction<Overlay>>;
  chat: Chat;
  youId: string;
  muted: boolean;
  onMute: () => void;
  blockedIds: string[];
  onBlock: (memberId: string) => void;
  messageById: (id: string) => ChatMessage | null;
  onLeave: () => void;
};

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

// ---- the layer every sheet and dialog sits in -----------------------------------------------------

/**
 * The scrim and the box: a dialog the page behind cannot be reached from. Focus goes to the
 * element marked data-autofocus (the close button, or the safe button of a dialog), Tab stays
 * inside, and focus goes back to where it was when the layer closes. Escape is the thread view's.
 */
function Layer({
  kind,
  label,
  labelledBy,
  onClose,
  under = false,
  children,
}: {
  kind: "sheet" | "dialog";
  label?: string;
  labelledBy?: string;
  onClose: () => void;
  /** Drawn behind a dialog that was opened from it (a computer keeps the drawer in view); not reachable. */
  under?: boolean;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  // A phone's sheet is modal. From 768px it is a drawer: the thread beside it stays readable and usable.
  const drawer = useDrawer();
  const modal = kind === "dialog" || !drawer;

  useEffect(() => {
    if (under) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const target = box.current?.querySelector<HTMLElement>("[data-autofocus]") ?? box.current;
    target?.focus({ preventScroll: true });
    return () => {
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [under]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!modal || event.key !== "Tab" || !box.current) return;
    const items = Array.from(box.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null,
    );
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === box.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <>
      {under ? null : <div className="msg-scrim-phone" aria-hidden="true" onClick={onClose} />}
      {kind === "dialog" ? <div className="msg-scrim-card" aria-hidden="true" onClick={onClose} /> : null}
      <div
        ref={box}
        className={cn(kind === "sheet" ? "msg-sheet" : "msg-dialog", under && "is-under")}
        role={kind === "sheet" ? "dialog" : "alertdialog"}
        aria-modal={modal && !under ? true : undefined}
        aria-label={label}
        aria-labelledby={labelledBy}
        aria-hidden={under ? true : undefined}
        inert={under}
        tabIndex={under ? undefined : -1}
        onKeyDown={onKeyDown}
      >
        {kind === "sheet" ? <div className="msg-grab" aria-hidden="true" /> : null}
        {children}
      </div>
    </>
  );
}

function SheetHeader({
  title,
  sub,
  titleId,
  onClose,
  closeLabel = "Close",
}: {
  title: ReactNode;
  sub?: ReactNode;
  titleId: string;
  onClose?: () => void;
  closeLabel?: string;
}) {
  return (
    <div className="msg-sheet-hd">
      <div>
        <h2 className="mk-h2" id={titleId}>
          {title}
        </h2>
        {sub ? <p>{sub}</p> : null}
      </div>
      {onClose ? (
        <button type="button" className="mk-icon-btn mk-bare" aria-label={closeLabel} onClick={onClose} data-autofocus>
          <Icon name="x" size={24} />
        </button>
      ) : null}
    </div>
  );
}

function memberOf(chat: Chat, memberId: string): ChatParticipant | null {
  return chat.participants.find((p) => p.member.id === memberId) ?? null;
}

// ---- chat info ----------------------------------------------------------------------------------

function InfoRow({
  icon,
  title,
  meta,
  danger,
  chevron = true,
  onClick,
}: {
  icon: IconName;
  title: string;
  meta: string;
  danger?: boolean;
  chevron?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={cn("msg-li", danger && "is-danger")} onClick={onClick}>
      <Icon name={icon} size={22} />
      <span className="tx">
        <b>{title}</b>
        <span>{meta}</span>
      </span>
      {chevron ? <Icon name="chevron-right" size={20} /> : null}
    </button>
  );
}

function InfoSheet({
  chat,
  muted,
  onMute,
  setOverlay,
  under = false,
}: Pick<Props, "chat" | "muted" | "onMute" | "setOverlay"> & { under?: boolean }) {
  const close = () => setOverlay({ kind: "none" });
  const isQuestion = chat.kind === "question";
  const others = chat.participants.filter((p) => !p.isYou);
  // The host first, you last.
  const people = [...chat.participants].sort((a, b) => Number(b.role === "host") - Number(a.role === "host") || Number(a.isYou) - Number(b.isYou));
  const other = isQuestion ? (chat.other ?? others[0]?.member ?? null) : null;
  const name = other?.firstName ?? "";

  // A question has one other person; a plan chat asks who first (unless there is only one).
  function aboutMember(purpose: "member" | "photo" | "block") {
    const only = others.length === 1 ? others[0].member.id : isQuestion && other ? other.id : null;
    if (!only) {
      setOverlay({ kind: "pick", purpose });
      return;
    }
    if (purpose === "block") setOverlay({ kind: "block", memberId: only, from: "info" });
    else setOverlay({ kind: "report", what: purpose, memberId: only, reason: null });
  }

  return (
    <Layer kind="sheet" label="Chat info" onClose={close} under={under}>
      <SheetHeader title={threadTitle(chat)} sub={threadSub(chat)} titleId="msg-info-title" onClose={close} />
      <div style={{ marginTop: 14 }}>
        <Button variant="outline" size="sm" href={openInviteHref(chat.plan.id)}>
          See the invite
        </Button>
      </div>
      <div className="msg-sec">
        <div className="msg-sec-t">In this chat · {chat.participants.length}</div>
        <div className="msg-who-row">
          {people.map((p) => (
            <div className="msg-person" key={p.member.id}>
              <Avatar photoUrl={p.member.photoUrl} name={p.member.firstName} size={48} />
              <span>
                {p.member.firstName}
                {p.isYou || p.role === "host" ? (
                  <small>{p.isYou ? (p.role === "host" ? "Host · you" : "You") : "Host"}</small>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="msg-list">
        <button type="button" className="msg-li" role="switch" aria-checked={muted} onClick={onMute}>
          <Icon name="bell-off" size={22} />
          <span className="tx">
            <b>Mute notifications</b>
            <span>You’ll still see new messages here.</span>
          </span>
          <span className={cn("msg-switch", !muted && "is-off")} aria-hidden="true" />
        </button>
        <InfoRow
          icon="flag"
          title="Report a message"
          meta="Pick a message that breaks the rules."
          onClick={() => setOverlay({ kind: "select" })}
        />
        <InfoRow
          icon="user-x"
          title={isQuestion ? `Report ${name}` : "Report a member"}
          meta={isQuestion ? `Tell us if ${name} is making things unpleasant.` : "Tell us if someone is making things unpleasant."}
          onClick={() => aboutMember("member")}
        />
        <InfoRow
          icon="image"
          title={isQuestion ? `Report ${name}’s photo` : "Report a photo"}
          meta={isQuestion ? "Tell us if it isn’t them or isn’t suitable." : "Tell us if a photo isn’t them or isn’t suitable."}
          onClick={() => aboutMember("photo")}
        />
        <InfoRow
          icon="ban"
          title={isQuestion ? `Block ${name}` : "Block a member"}
          meta={
            isQuestion
              ? `${name} can’t message you, and you won’t see ${name}’s messages.`
              : "They can’t message you, and you won’t see their messages."
          }
          onClick={() => aboutMember("block")}
        />
        <InfoRow
          icon="log-out"
          title="Leave chat"
          meta="Your place in the plan stays."
          danger
          chevron={false}
          onClick={() => setOverlay({ kind: "leave", from: "info" })}
        />
      </div>
    </Layer>
  );
}

// ---- who? (plan chats) ---------------------------------------------------------------------------

const PICK_TITLES = { member: "Report a member", photo: "Report a photo", block: "Block a member" } as const;

function PickSheet({
  chat,
  purpose,
  setOverlay,
}: Pick<Props, "chat" | "setOverlay"> & { purpose: "member" | "photo" | "block" }) {
  const close = () => setOverlay({ kind: "none" });
  const others = chat.participants.filter((p) => !p.isYou);
  return (
    <Layer kind="sheet" labelledBy="msg-pick-title" onClose={close}>
      <SheetHeader title={PICK_TITLES[purpose]} titleId="msg-pick-title" onClose={close} />
      <div className="msg-list">
        {others.map((p) => (
          <button
            type="button"
            key={p.member.id}
            className="msg-li"
            onClick={() =>
              purpose === "block"
                ? setOverlay({ kind: "block", memberId: p.member.id, from: "info" })
                : setOverlay({ kind: "report", what: purpose, memberId: p.member.id, reason: null })
            }
          >
            <Avatar photoUrl={p.member.photoUrl} name={p.member.firstName} size={40} />
            <span className="tx">
              <b>{p.member.firstName}</b>
              {p.role === "host" ? <span>Host</span> : null}
            </span>
            <Icon name="chevron-right" size={20} />
          </button>
        ))}
      </div>
    </Layer>
  );
}

// ---- report ---------------------------------------------------------------------------------------

function ReportSheet({
  chat,
  what,
  memberId,
  messageId,
  reason,
  messageById,
  setOverlay,
}: Pick<Props, "chat" | "messageById" | "setOverlay"> & {
  what: ReportWhat;
  memberId: string;
  messageId?: string;
  reason: string | null;
}) {
  const close = () => setOverlay({ kind: "none" });
  const message = messageId ? messageById(messageId) : null;
  const who = memberOf(chat, message?.senderId ?? memberId)?.member ?? null;
  const name = who?.firstName ?? "them";
  const { title, question } = reportHeading(what, name);
  const reasons = REASONS[what];
  const radios = useRef<(HTMLButtonElement | null)[]>([]);

  const choose = (id: string) => setOverlay({ kind: "report", what, memberId, messageId, reason: id });
  const selectedIndex = reasons.findIndex((r) => r.id === reason);

  function onRadioKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + reasons.length) % reasons.length;
    choose(reasons[next].id);
    radios.current[next]?.focus();
  }

  return (
    <Layer kind="sheet" labelledBy="msg-report-title" onClose={close}>
      <SheetHeader title={title} titleId="msg-report-title" onClose={close} />
      {what === "message" ? (
        <div className="msg-quote">
          <Avatar photoUrl={who?.photoUrl} name={who?.firstName} size={32} />
          <div>
            <b>
              {name}
              {message ? ` · ${weekdayTime(message.sentAt)}` : ""}
            </b>
            {message?.text}
          </div>
        </div>
      ) : what === "member" ? (
        <div className="msg-quote">
          <Avatar photoUrl={who?.photoUrl} name={who?.firstName} size={32} />
          <div>
            <b>{name}</b>In {chat.plan.title}
          </div>
        </div>
      ) : (
        <div className="msg-quote is-photo">
          <Avatar photoUrl={who?.photoUrl} name={who?.firstName} size={64} />
          <div>
            <b>{name}’s photo</b>
            In {chat.plan.title}. Only people in this chat can see it.
          </div>
        </div>
      )}
      <div className="msg-sec-t" style={{ marginTop: 16, marginBottom: 0 }}>
        {question}
      </div>
      <div className="msg-list" style={{ marginTop: 8 }} role="radiogroup" aria-label={question}>
        {reasons.map((r, index) => {
          const on = r.id === reason;
          return (
            <button
              type="button"
              key={r.id}
              ref={(node) => {
                radios.current[index] = node;
              }}
              className="msg-li"
              role="radio"
              aria-checked={on}
              tabIndex={on || (selectedIndex < 0 && index === 0) ? 0 : -1}
              onClick={() => choose(r.id)}
              onKeyDown={(event) => onRadioKey(event, index)}
            >
              <span className="tx">
                <b>{r.label}</b>
              </span>
              <span className={cn("msg-radio", on && "is-on")} aria-hidden="true" />
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: 16 }}>
        <Button
          disabled={!reason}
          onClick={() => {
            if (reason) setOverlay({ kind: "sent", what, memberId: who?.id ?? memberId });
          }}
        >
          Send report
        </Button>
      </div>
      <p className="msg-fine">{REPORT_FINE_PRINT}</p>
    </Layer>
  );
}

function SentSheet({
  chat,
  what,
  memberId,
  blocked,
  setOverlay,
}: Pick<Props, "chat" | "setOverlay"> & { what: ReportWhat; memberId: string; blocked: boolean }) {
  const close = () => setOverlay({ kind: "none" });
  const name = memberOf(chat, memberId)?.member.firstName ?? "They";
  const copy = reportSentCopy(what, name);
  return (
    <Layer kind="sheet" labelledBy="msg-sent-title" onClose={close}>
      <SheetHeader title="Report sent." sub={copy.sub} titleId="msg-sent-title" />
      <ul className="msg-ul" style={{ marginTop: 14 }}>
        {copy.lines.map((line) => (
          <li key={line}>
            <Icon name="check" size={18} />
            <span>{line}</span>
          </li>
        ))}
      </ul>
      <p className="msg-fine" style={{ textAlign: "left", marginTop: 12 }}>
        Anything else we should know? Email{" "}
        <a href={`mailto:${REPORT_CONTACT}`} style={{ color: "var(--ink)", fontWeight: 700, textDecoration: "underline" }}>
          {REPORT_CONTACT}
        </a>
        .
      </p>
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        {blocked ? null : (
          <Button variant="outline" onClick={() => setOverlay({ kind: "block", memberId, afterReport: true })}>
            Block {name} too
          </Button>
        )}
        <Button onClick={close} data-autofocus>
          Done
        </Button>
      </div>
    </Layer>
  );
}

// ---- block and leave ----------------------------------------------------------------------------

function BlockDialog({
  chat,
  memberId,
  from,
  setOverlay,
  onBlock,
}: Pick<Props, "chat" | "setOverlay" | "onBlock"> & { memberId: string; from?: "info" }) {
  // Cancel goes back to where it was opened from.
  const cancel = () => setOverlay(from === "info" ? { kind: "info" } : { kind: "none" });
  const name = memberOf(chat, memberId)?.member.firstName ?? "They";
  return (
    <Layer kind="dialog" labelledBy="msg-block-title" onClose={cancel}>
      <h2 className="mk-h2" id="msg-block-title">
        Block {name}?
      </h2>
      <p className="mk-lead">Here’s what happens.</p>
      <ul className="msg-ul">
        <li>
          <Icon name="check" size={18} />
          <span>{name} can’t message you or ask you questions.</span>
        </li>
        <li>
          <Icon name="check" size={18} />
          <span>
            You won’t see {name}’s messages, even in plan chats you share. {name} still sees yours.
          </span>
        </li>
        <li>
          <Icon name="check" size={18} />
          <span>{name} isn’t told. You can unblock anyone on your You page.</span>
        </li>
      </ul>
      <div className="acts">
        <Button onClick={() => onBlock(memberId)}>Block {name}</Button>
        <Button variant="outline" onClick={cancel} data-autofocus>
          Cancel
        </Button>
      </div>
      <p className="fine">Blocking doesn’t report {name}. To tell us what happened, report a message too.</p>
    </Layer>
  );
}

function LeaveDialog({
  chat,
  from,
  setOverlay,
  onLeave,
}: Pick<Props, "chat" | "setOverlay" | "onLeave"> & { from?: "info" }) {
  const stay = () => setOverlay(from === "info" ? { kind: "info" } : { kind: "none" });
  return (
    <Layer kind="dialog" labelledBy="msg-leave-title" onClose={stay}>
      <h2 className="mk-h2" id="msg-leave-title">
        Leave this chat?
      </h2>
      <p className="mk-lead">
        You’ll stop getting messages from {chat.plan.title}. Your place in the plan stays, and you can rejoin from the
        invite.
      </p>
      <div className="acts">
        <Button onClick={onLeave}>Leave chat</Button>
        <Button variant="outline" onClick={stay} data-autofocus>
          Stay in chat
        </Button>
      </div>
      <p className="fine">Only want it quiet? Mute notifications instead.</p>
    </Layer>
  );
}

// ---- the one the thread view draws ------------------------------------------------------------------

export function ThreadOverlays(props: Props) {
  const { overlay, setOverlay, chat, muted, onMute, blockedIds, onBlock, messageById, onLeave } = props;
  switch (overlay.kind) {
    case "info":
      return <InfoSheet chat={chat} muted={muted} onMute={onMute} setOverlay={setOverlay} />;
    case "pick":
      return <PickSheet chat={chat} purpose={overlay.purpose} setOverlay={setOverlay} />;
    case "report":
      return (
        <ReportSheet
          chat={chat}
          what={overlay.what}
          memberId={overlay.memberId}
          messageId={overlay.messageId}
          reason={overlay.reason}
          messageById={messageById}
          setOverlay={setOverlay}
        />
      );
    case "sent":
      return (
        <SentSheet
          chat={chat}
          what={overlay.what}
          memberId={overlay.memberId}
          blocked={blockedIds.includes(overlay.memberId)}
          setOverlay={setOverlay}
        />
      );
    case "block":
      return (
        <>
          {overlay.from === "info" ? <InfoSheet chat={chat} muted={muted} onMute={onMute} setOverlay={setOverlay} under /> : null}
          <BlockDialog chat={chat} memberId={overlay.memberId} from={overlay.from} setOverlay={setOverlay} onBlock={onBlock} />
        </>
      );
    case "leave":
      return (
        <>
          {overlay.from === "info" ? <InfoSheet chat={chat} muted={muted} onMute={onMute} setOverlay={setOverlay} under /> : null}
          <LeaveDialog chat={chat} from={overlay.from} setOverlay={setOverlay} onLeave={onLeave} />
        </>
      );
    default:
      return null;
  }
}
