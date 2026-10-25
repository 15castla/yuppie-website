"use client";

// Messages: the inbox. Chats | Updates under the title; each list is rows of
// the kit's grammar. On a phone (and up to 1023px) it is one pane: this list,
// or the open chat. From 1024px the list sits at 380px beside the open chat (a
// card), and a selected row counts as read. Updates beside it show a card that
// previews the plan the selected update is about.
//
// States: ready, empty (a cream band with a drawing), loading (one muted line,
// aria-busy), error (a status card with "Try again"). Local state only: the
// tab, "Mark all as read", the update picked on a computer. Marking read in a
// real inbox is the backend's (see types.ts).
//
// Kit counterparts: pages_msg.inbox_page(), tab_seg(), inbox_rows(),
// upd_rows(), inbox_empty_band(), upd_empty_band().

import { useRouter } from "next/navigation";
import { Fragment, useEffect, useId, useState, type KeyboardEvent, type ReactNode } from "react";

import { BackLink, Button, Icon, KitLink, Main } from "@/components/members/kit";
import { updateGroup } from "@/lib/members/messages/format";
import type { Chat, UpdateItem } from "@/lib/members/messages/types";
import { ROUTES } from "@/lib/members/routes";
import { cn } from "@/lib/utils";
import "./messages.css";
import { StandingArt } from "./art";
import { markChatOpened, wasChatOpened } from "./read-state";
import { ChatRow, UpdateRow } from "./rows";
import { UpdatePane } from "./update-pane";
import { useTwoPanes } from "./use-wide";

export type InboxTab = "chats" | "updates";
export type InboxState = "ready" | "loading" | "error";

export type InboxViewProps = {
  chats: Chat[];
  updates: UpdateItem[];
  /** The clock the times are read against (the example clock in the preview). */
  now: string;
  /** "thread": the page is a chat (the list hides below 1024px and the thread shows). */
  mode?: "inbox" | "thread";
  initialTab?: InboxTab;
  state?: InboxState;
  /** The open chat (thread mode, or the chat beside the list on a computer). */
  openChatId?: string | null;
  /** The thread (a ThreadView), drawn in the right-hand pane from 1024px. */
  pane?: ReactNode;
  /** Where "Notification settings" goes; null when that page is switched off (the note and link are not drawn). */
  settingsHref?: string | null;
  /** The signed-in member's id (labels "Host · you" in the update card). */
  youId?: string | null;
  /** Preview only: a thread as tall as the whole conversation (no inner scroll). */
  auto?: boolean;
};

function EmptyBand({ tab, settingsHref }: { tab: InboxTab; settingsHref: string | null }) {
  if (tab === "chats") {
    return (
      <section className="msg-empty" aria-label="No chats yet">
        <div className="mk-wrap">
          <div className="msg-empty-in">
            <div className="msg-empty-words">
              <h2 className="mk-h2">No chats yet.</h2>
              <p>Chats start when you say you’re in on an Open Invite, or ask the host a question. They’ll all be here.</p>
              <div className="msg-empty-act">
                <Button blockPhone href={ROUTES.openInvite}>
                  See Open Invites
                </Button>
              </div>
            </div>
            <div className="msg-empty-art">
              <StandingArt name="coupes" phone={{ height: 190, line: 2.6 }} desktop={{ height: 210, line: 2.8 }} />
            </div>
          </div>
        </div>
      </section>
    );
  }
  return (
    <section className="msg-empty is-upd" aria-label="No updates yet">
      <div className="mk-wrap">
        <div className="msg-empty-in">
          <div className="msg-empty-words">
            <h2 className="mk-h2">No updates yet.</h2>
            <p>When someone joins or leaves your plan, or a plan you’re in changes, you’ll see it here.</p>
            <div className="msg-empty-act">
              <Button blockPhone href={ROUTES.openInvite}>
                See Open Invites
              </Button>
            </div>
            {settingsHref ? (
              <p className="msg-empty-link">
                <Button variant="quiet" href={settingsHref}>
                  Notification settings
                </Button>
              </p>
            ) : null}
          </div>
          <div className="msg-empty-art">
            <StandingArt name="trainer" phone={{ height: 164, line: 2.4 }} desktop={{ height: 210, line: 2.8 }} />
          </div>
        </div>
      </div>
    </section>
  );
}

export function InboxView({
  chats,
  updates,
  now,
  mode = "inbox",
  initialTab = "chats",
  state = "ready",
  openChatId = null,
  pane = null,
  settingsHref = null,
  youId = null,
  auto = false,
}: InboxViewProps) {
  const router = useRouter();
  const twoPanes = useTwoPanes();
  const ids = useId();
  const [tab, setTab] = useState<InboxTab>(initialTab);
  const [allRead, setAllRead] = useState(false);
  const [readUpdates, setReadUpdates] = useState<readonly string[]>([]);
  const [pickedUpdate, setPickedUpdate] = useState<string | null>(null);

  const isThread = mode === "thread";
  // The chat you are looking at is read: the thread page, or the chat beside the list on a computer.
  const reading = isThread || twoPanes ? openChatId : null;
  useEffect(() => {
    if (reading) markChatOpened(reading);
  }, [reading]);
  const empty = state === "ready" && (tab === "chats" ? chats.length === 0 : updates.length === 0);
  const selectedUpdate = updates.find((update) => update.id === pickedUpdate) ?? updates[0] ?? null;

  // What counts as unread right now. On a computer the open chat, and the
  // update shown in the card, are being read.
  const chatUnread = (chat: Chat) =>
    chat.unreadCount > 0 && !wasChatOpened(chat.id) && !(twoPanes && tab === "chats" && chat.id === openChatId);
  const updateUnread = (update: UpdateItem) =>
    !update.read &&
    !allRead &&
    !readUpdates.includes(update.id) &&
    !(twoPanes && tab === "updates" && update.id === selectedUpdate?.id);

  const chatsUnread = chats.filter(chatUnread).length;
  const updatesUnread = updates.filter(updateUnread).length;

  const open = chats.filter((chat) => chat.status === "open");
  const closed = chats.filter((chat) => chat.status === "closed");

  const what = tab === "chats" ? "chats" : "updates";
  const loading = state === "loading";
  const showPane = !empty && state === "ready";

  const tabs: { key: InboxTab; label: string; count: number }[] = [
    { key: "chats", label: "Chats", count: chatsUnread },
    { key: "updates", label: "Updates", count: updatesUnread },
  ];

  function onTabKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next: InboxTab = tab === "chats" ? "updates" : "chats";
    setTab(next);
    document.getElementById(`${ids}-tab-${next}`)?.focus();
  }

  function pickUpdate(update: UpdateItem) {
    setPickedUpdate(update.id);
    setReadUpdates((previous) => (previous.includes(update.id) ? previous : [...previous, update.id]));
  }

  // Updates, grouped by day, in the order given (newest first).
  const groups: { label: string; items: UpdateItem[] }[] = [];
  for (const update of updates) {
    const label = updateGroup(update.at, now);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(update);
    else groups.push({ label, items: [update] });
  }

  let body: ReactNode;
  if (loading) {
    body = <p className="msg-loadline">Getting your {what}.</p>;
  } else if (state === "error") {
    body = (
      <div className="msg-status" role="alert">
        <span className="ic">
          <Icon name="circle-alert" size={18} />
        </span>
        <div>
          <b>Couldn’t load your {what}.</b>
          <p>Check your connection and try again.</p>
          <Button size="sm" onClick={() => router.refresh()}>
            Try again
          </Button>
        </div>
      </div>
    );
  } else if (empty) {
    body = null;
  } else if (tab === "chats") {
    body = (
      <div className="msg-body">
        {open.length > 0 ? (
          <div className="msg-rows">
            {open.map((chat) => (
              <ChatRow
                key={chat.id}
                chat={chat}
                now={now}
                selected={chat.id === openChatId}
                current={chat.id === openChatId && (isThread || twoPanes)}
                unread={chatUnread(chat)}
              />
            ))}
          </div>
        ) : null}
        {closed.length > 0 ? (
          <>
            <div className="msg-group-label">
              <span className="mk-term">Closed</span>
            </div>
            <div className="msg-rows">
              {closed.map((chat) => (
                <ChatRow
                  key={chat.id}
                  chat={chat}
                  now={now}
                  selected={chat.id === openChatId}
                  current={chat.id === openChatId && (isThread || twoPanes)}
                  unread={chatUnread(chat)}
                />
              ))}
            </div>
          </>
        ) : null}
        <div className="msg-note">
          <Icon name="info" size={20} />
          <p>Every chat belongs to an Open Invite. Ask a question or say you’re in, and it appears here.</p>
        </div>
      </div>
    );
  } else {
    body = (
      <div className="msg-body">
        {groups.map((group, index) => (
          <Fragment key={group.label}>
            <div className={cn("msg-group-label", index === 0 && "is-first")}>
              <span className="mk-term">{group.label}</span>
              {index === 0 && updatesUnread > 0 ? (
                <Button variant="quiet" onClick={() => setAllRead(true)}>
                  Mark all as read
                </Button>
              ) : null}
            </div>
            <div className="msg-rows">
              {group.items.map((update) => (
                <UpdateRow
                  key={update.id}
                  update={update}
                  now={now}
                  selected={twoPanes && update.id === selectedUpdate?.id}
                  unread={updateUnread(update)}
                  onSelect={
                    twoPanes
                      ? (event) => {
                          event.preventDefault();
                          pickUpdate(update);
                        }
                      : undefined
                  }
                />
              ))}
            </div>
          </Fragment>
        ))}
        {settingsHref ? (
          <div className="msg-note">
            <Icon name="bell" size={20} />
            <p>
              Choose what Club Yuppie tells you about in{" "}
              <KitLink className="mk-inline-link" href={settingsHref}>
                Notification settings
              </KitLink>
              .
            </p>
          </div>
        ) : null}
      </div>
    );
  }

  const rightPane =
    tab === "updates" ? (
      selectedUpdate ? (
        <UpdatePane update={selectedUpdate} now={now} youId={youId} />
      ) : null
    ) : (
      pane
    );

  return (
    <>
      {isThread ? null : (
        <header className="msg-top">
          <BackLink href={ROUTES.openInvite} label="Open Invite" />
        </header>
      )}
      <Main className={cn("msg-main", isThread && "is-thread", auto && "is-auto", empty && "is-empty")} busy={loading}>
        <div className="msg-wrap">
          <div className={cn("msg-split", isThread ? "is-thread" : "is-inbox")}>
            <section className="msg-list-col" aria-label="Messages">
              <div className="msg-head">
                <h1 className="mk-h1">Messages.</h1>
                <p className="mk-sub-serif">Details, sorted.</p>
              </div>
              <div className="msg-segwrap">
                <div className="mk-seg msg-seg" role="tablist" aria-label="Messages" onKeyDown={onTabKey}>
                  {tabs.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      role="tab"
                      id={`${ids}-tab-${item.key}`}
                      aria-selected={tab === item.key}
                      aria-controls={`${ids}-panel`}
                      aria-label={item.count ? `${item.label}, ${item.count} unread` : item.label}
                      tabIndex={tab === item.key ? 0 : -1}
                      onClick={() => setTab(item.key)}
                    >
                      <span>{item.label}</span>
                      {item.count ? (
                        <span className="msg-segn" aria-hidden="true">
                          {item.count}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
              <div id={`${ids}-panel`} role="tabpanel" aria-labelledby={`${ids}-tab-${tab}`}>
                {body}
              </div>
            </section>
            {showPane && rightPane ? <section className="msg-pane-col">{rightPane}</section> : null}
          </div>
        </div>
        {empty ? <EmptyBand tab={tab} settingsHref={settingsHref} /> : null}
      </Main>
    </>
  );
}
