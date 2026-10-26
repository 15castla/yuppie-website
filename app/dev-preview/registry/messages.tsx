// Preview screens for Messages (Chats, Updates, threads) and Notification settings. OWNED BY THE MESSAGES BUILDER.
// Export an array of PreviewScreen (see ./types.ts). One id per screen: "msg-<name>", "notif-<name>", "blocked-<name>".
// Every screen draws on the example data adapter (lib/members/mock/messages.ts); web, app and computer are the
// harness's ?shell= and the viewport width, so each state below is one drawing at every width.

import { BlockedView } from "@/components/members/messages/blocked-view";
import { ChatEntryButtons, type ChatEntry } from "@/components/members/messages/chat-entry-buttons";
import { InboxView, type InboxState, type InboxTab } from "@/components/members/messages/inbox-view";
import { AvatarStack, Button, Card, DateColumn, Main } from "@/components/members/kit";
import { NotificationSettingsView } from "@/components/members/notifications/notification-settings-view";
import type { Overlay, ThreadPreview } from "@/components/members/messages/overlay-types";
import { ThreadView } from "@/components/members/messages/thread-view";
import {
  EXAMPLE_BLOCKED,
  EXAMPLE_CHATS,
  EXAMPLE_DRAFT_488,
  EXAMPLE_DRAFT_500,
  EXAMPLE_DRAFT_KEYBOARD,
  EXAMPLE_DRAFT_LINK,
  EXAMPLE_DRAFT_NUMBER,
  EXAMPLE_DRAFT_TYPING,
  EXAMPLE_NOW,
  EXAMPLE_PREFERENCES_APP,
  EXAMPLE_PREFERENCES_VARIANTS,
  EXAMPLE_PREFERENCES_WEB,
  EXAMPLE_THREADS,
  EXAMPLE_THREAD_VARIANTS,
  EXAMPLE_UPDATES,
  EXAMPLE_YOU,
  JASMIN,
  OLLIE,
  PRIYA,
  TOM,
} from "@/lib/members/mock/messages";
import type { ChatThread, NotificationPreferences } from "@/lib/members/messages/types";
import { ROUTES } from "@/lib/members/routes";
import type { ShellMode } from "@/components/members/shell/types";
import type { PreviewParams, PreviewScreen } from "./types";

const FLAGS = ["openInvite", "messages", "notifications"] as const;

// The Messages pages draw their own back row or thread header and no tab bar; the messages icon is the current page.
const MESSAGES_FRAME = {
  tab: null,
  showMessages: true,
  messagesCurrent: true,
  dock: "own" as const,
};

function settingsHref(params: PreviewParams): string | null {
  return params.flags.notifications ? ROUTES.youNotifications : null;
}

// ---- the inbox ------------------------------------------------------------------------------------

function inbox(params: PreviewParams, tab: InboxTab, state: InboxState, empty: boolean) {
  const chats = empty ? [] : EXAMPLE_CHATS;
  const updates = empty ? [] : EXAMPLE_UPDATES;
  const newest = chats.find((chat) => chat.status === "open");
  const thread = newest ? EXAMPLE_THREADS[newest.id] : null;
  return (
    <InboxView
      chats={chats}
      updates={updates}
      now={EXAMPLE_NOW}
      initialTab={tab}
      state={state}
      openChatId={thread?.chat.id ?? null}
      pane={thread ? <ThreadView thread={thread} now={EXAMPLE_NOW} youId={EXAMPLE_YOU.id} /> : null}
      settingsHref={settingsHref(params)}
      youId={EXAMPLE_YOU.id}
    />
  );
}

const inboxScreen: PreviewScreen = {
  id: "msg-inbox",
  title: "Messages: Chats",
  states: ["list", "empty", "loading", "error"],
  defaultFlags: FLAGS,
  ...MESSAGES_FRAME,
  render: (params) =>
    inbox(params, "chats", params.state === "loading" ? "loading" : params.state === "error" ? "error" : "ready", params.state === "empty"),
};

const updatesScreen: PreviewScreen = {
  id: "msg-updates",
  title: "Messages: Updates",
  states: ["list", "empty", "loading", "error"],
  defaultFlags: FLAGS,
  ...MESSAGES_FRAME,
  render: (params) =>
    inbox(params, "updates", params.state === "loading" ? "loading" : params.state === "error" ? "error" : "ready", params.state === "empty"),
};

// ---- a thread -------------------------------------------------------------------------------------

type ThreadState = {
  thread: ChatThread;
  /** The inbox row that is selected on a computer (the cancelled paid chat is the same row as the open one). */
  open?: string;
  preview?: ThreadPreview;
  /** Draw the whole conversation, no inner scroll (the design's "full"). */
  auto?: boolean;
};

const READ = EXAMPLE_THREAD_VARIANTS.brunchRead;
const overlayOf = (overlay: Overlay): ThreadPreview => ({ overlay });

export const THREAD_STATES: Record<string, ThreadState> = {
  // plan chat: a new-messages divider, a phone number in a bubble, the host tag
  plan: { thread: EXAMPLE_THREADS["c-brunch"] },
  // a question: the intro block, one new message
  question: { thread: EXAMPLE_THREADS["c-tom"] },
  // a plan chat for a paid plan: the card icon in the system lines, the price in the pin
  paid: { thread: EXAMPLE_THREADS["c-comedy"] },
  // the host cancelled: refunded, and the chat is closed
  cancelled: { thread: EXAMPLE_THREADS["c-comedy-cancelled"], open: "c-comedy" },
  // closed, read only
  closed: { thread: EXAMPLE_THREADS["c-spin"] },
  // the whole conversation, no inner scroll
  full: { thread: EXAMPLE_THREADS["c-brunch"], auto: true },
  // typing: send fills ink, caret in the input
  typing: { thread: READ, preview: { draft: EXAMPLE_DRAFT_TYPING, focus: true } },
  // the keyboard up in the app: the pin folds to one line, the input stays visible
  keyboard: { thread: EXAMPLE_THREADS["c-brunch"], preview: { draft: EXAMPLE_DRAFT_KEYBOARD, focus: true, keyboard: 336 } },
  // a 330 character message from them, and 488 of 500 typed
  long: { thread: EXAMPLE_THREAD_VARIANTS.brunchLong, preview: { draft: EXAMPLE_DRAFT_488, focus: true } },
  // the limit: counter red, typing stops
  limit: { thread: EXAMPLE_THREAD_VARIANTS.brunchLong, preview: { draft: EXAMPLE_DRAFT_500, focus: true } },
  // a link is refused before send
  link: { thread: READ, preview: { draft: EXAMPLE_DRAFT_LINK, focus: true } },
  // a phone number goes through
  number: { thread: READ, preview: { draft: EXAMPLE_DRAFT_NUMBER, focus: true } },
  // a message on its way
  sending: { thread: READ, preview: { outgoing: [{ clientId: "local-sending", text: "See you outside at 09:45.", state: "sending" }] } },
  // a message that did not go: Retry and Delete
  failed: { thread: READ, preview: { outgoing: [{ clientId: "local-failed", text: "See you outside at 09:45.", state: "failed" }] } },
  // the first time ever: the safety note over the start of the chat
  safety: { thread: EXAMPLE_THREAD_VARIANTS.brunchFirstVisit },
  // a new question: the prompt fills the stream
  "new-question": { thread: EXAMPLE_THREADS["c-tom-new"], open: "c-tom" },
  // a message was reported and removed
  removed: { thread: EXAMPLE_THREAD_VARIANTS.walkRemoved },
  // a plan with four people going
  walk: { thread: EXAMPLE_THREADS["c-walk"] },
  // a long press: the bubble lifts above the scrim with its menu
  menu: { thread: EXAMPLE_THREADS["c-brunch"], preview: overlayOf({ kind: "menu", messageId: "c-brunch-m7" }) },
  // report, step 1: tap the message you want to report
  select: { thread: EXAMPLE_THREADS["c-walk"], preview: overlayOf({ kind: "select", pickedId: "c-walk-m3" }) },
};

// Sheets and dialogs over a thread. On a phone they are fixed over a scrim; from 768px the info sheet is the
// right-hand drawer inside the card and the dialogs sit in the middle of it.
export const OVERLAY_STATES: Record<string, ThreadState> = {
  // chat info, a plan chat: three people, mute, the four report and block rows, leave
  info: { thread: EXAMPLE_THREADS["c-brunch"], preview: overlayOf({ kind: "info" }) },
  // chat info, a question: the other person is named in the rows
  "info-question": { thread: EXAMPLE_THREADS["c-tom"], preview: overlayOf({ kind: "info" }) },
  // a plan chat asks who before it reports or blocks (not in the design)
  "pick-member": { thread: EXAMPLE_THREADS["c-brunch"], preview: overlayOf({ kind: "pick", purpose: "member" }) },
  // report a message: the quote, six reasons, one chosen
  "report-message": {
    thread: EXAMPLE_THREADS["c-walk"],
    preview: overlayOf({ kind: "report", what: "message", memberId: OLLIE.id, messageId: "c-walk-m3", reason: "pay_outside" }),
  },
  // report a member: seven reasons
  "report-member": {
    thread: EXAMPLE_THREADS["c-walk"],
    preview: overlayOf({ kind: "report", what: "member", memberId: OLLIE.id, reason: "pay_outside" }),
  },
  // report a photo: the photo at 64px, three reasons
  "report-photo": {
    thread: EXAMPLE_THREADS["c-tom"],
    preview: overlayOf({ kind: "report", what: "photo", memberId: TOM.id, reason: "not_them" }),
  },
  // nothing chosen yet: Send report waits
  "report-empty": {
    thread: EXAMPLE_THREADS["c-walk"],
    preview: overlayOf({ kind: "report", what: "message", memberId: OLLIE.id, messageId: "c-walk-m3", reason: null }),
  },
  // report sent, with the offer to block too
  "report-sent": { thread: EXAMPLE_THREADS["c-walk"], preview: overlayOf({ kind: "sent", what: "message", memberId: OLLIE.id }) },
  // block, the dialog
  block: { thread: EXAMPLE_THREADS["c-brunch"], preview: overlayOf({ kind: "block", memberId: PRIYA.id, from: "info" }) },
  // leave, the dialog
  leave: { thread: EXAMPLE_THREADS["c-brunch"], preview: overlayOf({ kind: "leave", from: "info" }) },
};

function threadScreen(id: string, title: string, states: Record<string, ThreadState>): PreviewScreen {
  const keys = Object.keys(states);
  return {
    id,
    title,
    states: keys,
    defaultFlags: FLAGS,
    ...MESSAGES_FRAME,
    render: (params) => {
      const state = states[params.state] ?? states[keys[0]];
      return (
        <InboxView
          mode="thread"
          chats={EXAMPLE_CHATS}
          updates={EXAMPLE_UPDATES}
          now={EXAMPLE_NOW}
          openChatId={state.open ?? state.thread.chat.id}
          auto={state.auto}
          pane={<ThreadView thread={state.thread} now={EXAMPLE_NOW} youId={EXAMPLE_YOU.id} preview={state.preview} />}
          settingsHref={settingsHref(params)}
          youId={EXAMPLE_YOU.id}
        />
      );
    },
  };
}

const threadStates = (keys: string[]) => Object.fromEntries(keys.map((key) => [key, THREAD_STATES[key]]));

// ---- notification settings ---------------------------------------------------------------------------

// A You sub page: no tab lit, the photo is the current page, no messages icon.
const YOU_SUB_FRAME = {
  tab: null,
  showMessages: false,
  messagesCurrent: false,
  youCurrent: true,
};

type NotificationState = { preferences: (shell: ShellMode) => NotificationPreferences; failedKey?: "reminder24" };

const NOTIFICATION_STATES: Record<string, NotificationState> = {
  // the defaults: on the web push is "App only", in the app it is a switch
  default: { preferences: (shell) => (shell === "app" ? EXAMPLE_PREFERENCES_APP : EXAMPLE_PREFERENCES_WEB) },
  // Text switched on: the check text was sent
  "text-on": { preferences: (shell) => withPush(EXAMPLE_PREFERENCES_VARIANTS.textOn, shell) },
  // no mobile number on file: the switch stays off
  "no-number": { preferences: (shell) => withPush(EXAMPLE_PREFERENCES_VARIANTS.noNumber, shell) },
  // a switch that failed to save: the row says so, the switch stays where it was
  error: { preferences: (shell) => withPush(EXAMPLE_PREFERENCES_VARIANTS.failed, shell), failedKey: "reminder24" },
  // the app, with notifications off in the phone's settings (on the web there is no push to be off)
  denied: { preferences: (shell) => (shell === "app" ? EXAMPLE_PREFERENCES_VARIANTS.denied : EXAMPLE_PREFERENCES_WEB) },
  // host updates off, 2 hours off, text on
  mixed: { preferences: (shell) => withPush(EXAMPLE_PREFERENCES_VARIANTS.mixed, shell) },
};

// Push follows the shell: a switch in the app, an "App only" row on the web.
function withPush(preferences: NotificationPreferences, shell: ShellMode): NotificationPreferences {
  return { ...preferences, pushPermission: shell === "app" ? "granted" : "unavailable" };
}

const notificationsScreen: PreviewScreen = {
  id: "notif-settings",
  title: "Notification settings",
  states: Object.keys(NOTIFICATION_STATES),
  defaultFlags: FLAGS,
  ...YOU_SUB_FRAME,
  render: (params) => {
    const state = NOTIFICATION_STATES[params.state] ?? NOTIFICATION_STATES.default;
    return (
      <NotificationSettingsView
        // a new state is a new page: the local switches start from its saved values
        key={`${params.shell}-${params.state}`}
        preferences={state.preferences(params.shell)}
        failedKey={state.failedKey ?? null}
      />
    );
  },
};

// ---- where an invite hands over to chat ---------------------------------------------------------------

// A stand-in for the Open Invite page's card (that page is another builder's): just enough of it to show where the
// chat buttons sit. "I'm in" is drawn as the invite page's own button.
const HANDOVER: Record<string, { entry: ChatEntry; going: string; plan: "class" | "climb"; join?: boolean }> = {
  // the member is in: Open chat, with the chats that have news
  in: { entry: { kind: "in", href: ROUTES.messages, unread: 2 }, going: "3 going, 1 place left", plan: "class" },
  // the member has not said yes: I'm in, and Ask Jasmin a question under it
  ask: {
    entry: { kind: "ask", href: ROUTES.messages, hostName: "Jasmin" },
    going: "3 going, 1 place left",
    plan: "class",
    join: true,
  },
  // the host, someone asked a question
  host: { entry: { kind: "host", href: ROUTES.messages, questions: 2 }, going: "1 going, 3 places left", plan: "climb" },
};

const handoverScreen: PreviewScreen = {
  id: "msg-handover",
  title: "Messages: hand-over from an invite",
  states: Object.keys(HANDOVER),
  defaultFlags: FLAGS,
  tab: "invite",
  showMessages: true,
  render: (params) => {
    const state = HANDOVER[params.state] ?? HANDOVER.in;
    const [people, date, title, meta] =
      state.plan === "class"
        ? [[JASMIN, PRIYA, EXAMPLE_YOU], { weekday: "Sat", day: "24" }, "Saturday morning class + brunch", "10:00 · Psycle, Oxford Circus"]
        : [[EXAMPLE_YOU], { weekday: "Wed", day: "4" }, "Climbing and a pint", "18:30 · The Boulder Yard"];
    return (
      <Main>
        <div className="mk-wrap" style={{ paddingTop: 24 }}>
          <Card>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <DateColumn weekday={date.weekday} day={date.day} />
              <div style={{ minWidth: 0 }}>
                <div className="mk-h3">{title}</div>
                <div className="mk-meta-line">{meta}</div>
              </div>
            </div>
            <div style={{ margin: "14px 0 16px", display: "flex", alignItems: "center", gap: 10 }}>
              <AvatarStack
                people={people.map((person) => ({ photoUrl: person.photoUrl, name: person.firstName }))}
                ring="var(--pale)"
              />
              <span style={{ font: "400 14px/1.35 var(--font-body)" }}>{state.going}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* the Open Invite page's own "I'm in" button, for the picture only */}
              {state.join ? <Button block>I’m in</Button> : null}
              <ChatEntryButtons entry={state.entry} />
            </div>
          </Card>
        </div>
      </Main>
    );
  },
};

// ---- blocked members ----------------------------------------------------------------------------------

const blockedScreen: PreviewScreen = {
  id: "blocked-members",
  title: "Blocked members",
  states: ["list", "empty", "unblock"],
  defaultFlags: FLAGS,
  ...YOU_SUB_FRAME,
  render: (params) => (
    <BlockedView
      // a new state is a new page: the local list starts from its saved values
      key={`${params.shell}-${params.state}`}
      members={params.state === "empty" ? [] : EXAMPLE_BLOCKED}
      initialConfirmId={params.state === "unblock" ? EXAMPLE_BLOCKED[0].member.id : null}
    />
  ),
};

export const messagesScreens: PreviewScreen[] = [
  inboxScreen,
  updatesScreen,
  threadScreen(
    "msg-thread",
    "Messages: a chat",
    threadStates([
      "plan",
      "question",
      "paid",
      "walk",
      "typing",
      "keyboard",
      "long",
      "limit",
      "link",
      "number",
      "sending",
      "failed",
      "closed",
      "cancelled",
      "full",
      "safety",
      "new-question",
      "removed",
      "menu",
      "select",
    ]),
  ),
  threadScreen(
    "msg-sheet",
    "Messages: chat info and reports",
    Object.fromEntries(
      ["info", "info-question", "pick-member", "report-message", "report-member", "report-photo", "report-empty", "report-sent"].map(
        (key) => [key, OVERLAY_STATES[key]],
      ),
    ),
  ),
  threadScreen("msg-dialog", "Messages: block and leave", Object.fromEntries(["block", "leave"].map((key) => [key, OVERLAY_STATES[key]]))),
  handoverScreen,
  notificationsScreen,
  blockedScreen,
];
