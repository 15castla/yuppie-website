"use client";

// Blocked members (/members/you/blocked): who you blocked, with one action per
// person. "Unblock" asks first (a sheet on a phone, a modal from 768px): it lets
// that person message you again, so it is one extra tap on purpose. Empty: "No
// one blocked." with the velvet rope standing on a 3px rule.
//
// Local state only: unblocking removes the row here. The backend needs a list
// and an unblock endpoint (BlockedMember and BlockAction in
// lib/members/messages/types.ts); the block itself is made from a chat.
//
// Kit counterparts: pages_you.blocked_main(), blocked_row(), blocked_empty(),
// dlg_unblock(), dlg_modal_unblock().

import { useEffect, useRef, useState } from "react";

import { Avatar, BackLink, BackRow, Button, Main, Rows, TitleBlock } from "@/components/members/kit";
import { dayMonth } from "@/lib/members/messages/format";
import type { BlockedMember } from "@/lib/members/messages/types";
import { ROUTES } from "@/lib/members/routes";
import { StandingDrawing } from "./art";
import "./blocked.css";
import { useDialog } from "./use-dialog";

function Confirm({ name, onUnblock, onCancel }: { name: string; onUnblock: () => void; onCancel: () => void }) {
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
        <div className="msg-blk-acts">
          <Button onClick={onUnblock}>Unblock {name}</Button>
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
}: {
  members: BlockedMember[];
  /** Preview only: start with this person's unblock confirm open. */
  initialConfirmId?: string | null;
}) {
  const [list, setList] = useState(members);
  const [confirmId, setConfirmId] = useState<string | null>(initialConfirmId);
  const [announce, setAnnounce] = useState("");
  const [moveFocus, setMoveFocus] = useState(0);
  const wrap = useRef<HTMLDivElement | null>(null);

  const confirming = list.find((item) => item.member.id === confirmId) ?? null;

  function unblock() {
    if (!confirming) return;
    const name = confirming.member.firstName;
    setList((previous) => previous.filter((item) => item.member.id !== confirming.member.id));
    setConfirmId(null);
    setAnnounce(`${name} is unblocked.`);
    setMoveFocus((value) => value + 1);
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
        <Confirm name={confirming.member.firstName} onUnblock={unblock} onCancel={() => setConfirmId(null)} />
      ) : null}
      <div className="mk-sr" role="status" aria-live="polite">
        {announce}
      </div>
    </>
  );
}
