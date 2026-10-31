"use client";

// Blocked members (/members/you/blocked): who you blocked, with one action per
// person. "Unblock" asks first (a sheet on a phone, a modal from 768px): it lets
// that person message you again, so it is one extra tap on purpose. Empty: "No
// one blocked." with the velvet rope standing on a 3px rule.
//
// Unblock calls `unblock` (app/members/you/blocked/actions.ts) and the row
// goes once the server says so; a failure keeps the row and says so in the
// sheet. Without `unblock` (the preview harness) the row goes at once. The
// block itself is made from a chat.
//
// Kit counterparts: pages_you.blocked_main(), blocked_row(), blocked_empty(),
// dlg_unblock(), dlg_modal_unblock().

import { useEffect, useRef, useState } from "react";

import { goToSessionEnded, isSessionEnded, type SessionEnded } from "@/components/members/session-ended";

import { Avatar, BackLink, BackRow, Button, Main, Rows, TitleBlock } from "@/components/members/kit";
import { dayMonth } from "@/lib/members/messages/format";
import type { BlockedMember } from "@/lib/members/messages/types";
import { ROUTES } from "@/lib/members/routes";
import { StandingDrawing } from "./art";
import "./blocked.css";
import { useDialog } from "./use-dialog";

function Confirm({
  name,
  onUnblock,
  onCancel,
  pending = false,
  error = null,
}: {
  name: string;
  onUnblock: () => void;
  onCancel: () => void;
  pending?: boolean;
  error?: string | null;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  useDialog(box, onCancel);
  return (
    <>
      <div className="mk-scrim" aria-hidden="true" onClick={onCancel} />
      <div
        ref={box}
        className="mk-sheet msg-blk-sheet"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="msg-blk-title"
        tabIndex={-1}
      >
        <div className="mk-grab" aria-hidden="true" />
        <h2 className="mk-h2" id="msg-blk-title">
          Unblock {name}?
        </h2>
        <p>
          {name} will be able to message you and ask you questions again. You’ll see {name}’s messages in plan chats you
          share. {name} isn’t told.
        </p>
        {error ? (
          <p role="alert" style={{ marginTop: 12, color: "var(--error)" }}>
            {error}
          </p>
        ) : null}
        <div className="msg-blk-acts">
          <Button onClick={onUnblock} pending={pending}>
            Unblock {name}
          </Button>
          <Button variant="outline" onClick={onCancel} data-autofocus>
            Cancel
          </Button>
        </div>
      </div>
    </>
  );
}

export function BlockedView({
  members,
  initialConfirmId = null,
  unblock: unblockAction,
}: {
  members: BlockedMember[];
  /** Preview only: start with this person's unblock confirm open. */
  initialConfirmId?: string | null;
  /** The real Unblock (app/members/you/blocked/actions.ts). Without it the row goes locally. */
  unblock?: (memberId: string) => Promise<{ ok: true } | { ok: false; error: string } | SessionEnded>;
}) {
  const [list, setList] = useState(members);
  const [confirmId, setConfirmId] = useState<string | null>(initialConfirmId);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const [moveFocus, setMoveFocus] = useState(0);
  const wrap = useRef<HTMLDivElement | null>(null);

  const confirming = list.find((item) => item.member.id === confirmId) ?? null;

  async function unblock() {
    if (!confirming || pending) return;
    const { id, firstName: name } = confirming.member;
    if (unblockAction) {
      setPending(true);
      setError(null);
      let result: Awaited<ReturnType<typeof unblockAction>>;
      try {
        result = await unblockAction(id);
      } catch {
        result = { ok: false, error: "That didn’t go through. Try again in a moment." };
      }
      setPending(false);
      if (isSessionEnded(result)) {
        goToSessionEnded();
        return;
      }
      if (!result.ok) {
        setError(result.error);
        return;
      }
    }
    setList((previous) => previous.filter((item) => item.member.id !== id));
    setConfirmId(null);
    setAnnounce(`${name} is unblocked.`);
    setMoveFocus((value) => value + 1);
  }

  function closeConfirm() {
    if (pending) return;
    setConfirmId(null);
    setError(null);
  }

  // The row you unblocked is gone, so focus goes to the next Unblock, or to "No one blocked.".
  useEffect(() => {
    if (moveFocus === 0) return;
    wrap.current?.querySelector<HTMLElement>(".msg-blk-row button, [data-empty-title]")?.focus({ preventScroll: true });
  }, [moveFocus]);

  return (
    <>
      <BackRow href={ROUTES.you} label="You" />
      <Main className="msg-blk-main" pad={false}>
        <div className="mk-wrap msg-blk-crumb">
          <div style={{ paddingTop: 32 }}>
            <BackLink href={ROUTES.you} label="You" />
          </div>
        </div>
        <TitleBlock
          title="Blocked members."
          sub="Only you see this list."
          lead="They can’t message you, and you won’t see their messages. They aren’t told."
          actions={null}
        />
        <div className="mk-wrap msg-blk-wrap" ref={wrap}>
          {list.length > 0 ? (
            <section className="msg-blk-list" aria-label="Blocked members">
              <Rows>
                {list.map((item) => (
                  <div className="mk-row msg-blk-row" key={item.member.id}>
                    <Avatar photoUrl={item.member.photoUrl} name={item.member.firstName} size={48} />
                    <span className="mk-body">
                      <span className="mk-title">{item.member.firstName}</span>
                      <span className="mk-meta">Blocked {dayMonth(item.blockedAt)}</span>
                    </span>
                    <span className="mk-end">
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={`Unblock ${item.member.firstName}`}
                        onClick={() => setConfirmId(item.member.id)}
                      >
                        Unblock
                      </Button>
                    </span>
                  </div>
                ))}
              </Rows>
            </section>
          ) : (
            <div className="msg-blk-empty">
              <div className="msg-stand">
                <div className="msg-stand-txt">
                  <h2 className="mk-h2" tabIndex={-1} data-empty-title>
                    No one blocked.
                  </h2>
                  <p>If someone makes things unpleasant, you can block them from a chat.</p>
                </div>
                <span className="msg-stand-art">
                  <StandingDrawing name="rope" height={118} line={2.1} />
                </span>
              </div>
            </div>
          )}
        </div>
      </Main>
      {confirming ? (
        <Confirm
          name={confirming.member.firstName}
          onUnblock={() => void unblock()}
          onCancel={closeConfirm}
          pending={pending}
          error={error}
        />
      ) : null}
      <div className="mk-sr" role="status" aria-live="polite">
        {announce}
      </div>
    </>
  );
}
