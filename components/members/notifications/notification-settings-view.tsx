"use client";

// Notification settings (/members/you/notifications): what a member hears about
// (Open Invite, Reminders, Club events) and how (Push, Email, Text).
//
// Eight switches at most, none nested. Every switch is 56 x 32, the whole row is
// its tap target (a label) unless the row holds a link, and the switch is always
// the row's last child so nothing moves when it is flipped. On a phone the
// channels are a section after the three groups; from 768px they are a card
// under them, and from 1024px the kit's right-hand rail.
//
// A switch flips at once and saves at once (saveTopic / saveChannel: the real
// server actions in app/members/you/notifications/actions.ts). When the save
// fails the switch goes back and the row says so; an offline browser fails
// before anything is sent. Switching Text on sends one check text first: the
// tick line ("We sent a text to check it’s you.") shows once the server says
// it went. Without the save props (the preview harness) the switches are local.
//
// Push (11 Nov 2026): the page passes pushChannel true where push is live for
// the member (MEMBERS_PUSH_LIVE, or a tester), else the Push row, its banner and
// its foot line are not drawn at all. With push, email no longer carries
// notifications: its row says what email is still for (account, bookings,
// payments) and has no switch. In the app the Push row follows the phone: not
// asked yet, it is off and a tap asks (iOS's own question); not allowed, the
// banner's Open Settings opens the app's page in the iPhone's Settings.
//
// In the app while Open Invite is hidden there (decision 6), the page passes
// openInvite false: no Open Invite group, and the Reminders line names Club
// events only (QR-04). The member's Open Invite switches are kept as they are.
//
// The number step is not designed: "Change number", "Add a number" and a tap
// on the Text row with no number go to Edit details (numberHref), where the
// phone number is edited. A changed number needs Text switched on again (a new
// check text). The phone's settings hand-off ("Open Settings") is the app's
// (lib/members/native-push.ts), or onOpenSettings in the preview harness.
//
// Kit counterparts: pages_notif.settings_main(), topic_sections(),
// channels_block(), srow(), sw().

import { useEffect, useId, useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { BackLink, BackRow, Button, Card, Icon, Main, Pill, Rows, SectionTitle, TitleBlock } from "@/components/members/kit";
import type {
  NotificationChannel,
  NotificationPreferences,
  NotificationTopic,
} from "@/lib/members/messages/types";
import { ROUTES } from "@/lib/members/routes";
import { goToSessionEnded, isSessionEnded, type SessionEnded } from "@/components/members/session-ended";
import { askNative, nativePush, onNative, openNativeSettings } from "@/lib/members/native-push";
import { cn } from "@/lib/utils";
import "./notifications.css";

type SettingKey = NotificationTopic | NotificationChannel;

const noSubscribe = () => () => {};

/** What a save answers (app/members/you/notifications/actions.ts): the preferences as saved, or the row's words. */
export type NotificationSaveResult =
  | { ok: true; preferences: NotificationPreferences }
  | { ok: false; error: string; reason?: string }
  | SessionEnded;

/** The page's own failure line (notifications spec 3.1). */
const SAVE_FAILED = "Couldn’t save that. Check your connection and try again.";

export type NotificationSettingsViewProps = {
  preferences: NotificationPreferences;
  /** Whether the Push channel exists at all. False in stage 2 (MEMBERS_PUSH_LIVE off): no Push row. The preview harness draws the design's rows. */
  pushChannel?: boolean;
  /** Whether Open Invite is on in this shell. False in the app while it is hidden there: no Open Invite group. */
  openInvite?: boolean;
  /** Save one topic switch. Without it (the preview harness) the switches are local only. */
  saveTopic?: (topic: NotificationTopic, on: boolean) => Promise<NotificationSaveResult>;
  /** Save one channel switch (Text on sends the check text first). */
  saveChannel?: (channel: NotificationChannel, on: boolean) => Promise<NotificationSaveResult>;
  /** Preview only: the row whose save failed (the switch stays where it was, the row says so). */
  failedKey?: SettingKey | null;
  /** The number step ("Change number", "Add a number", a tap on the Text row with no number): Edit details. */
  numberHref?: string;
  /** The phone's own notification settings (app only, once push exists). Not designed yet. */
  onOpenSettings?: () => void;
};

function Switch({
  on,
  label,
  describedBy,
  onToggle,
  id,
}: {
  on: boolean;
  label: string;
  describedBy?: string;
  onToggle?: () => void;
  /** Set when the row's words are a label for this switch (the Text row, which also holds a link). */
  id?: string;
}) {
  return (
    <button
      data-needs-net=""
      id={id}
      type="button"
      className="ntf-sw"
      role="switch"
      aria-checked={on}
      aria-label={label}
      aria-describedby={describedBy}
      onClick={onToggle}
    />
  );
}

function SettingRow({
  id,
  title,
  meta,
  end,
  extra,
  fixed = false,
  interactive = false,
  onActivate,
  labelFor,
}: {
  id: string;
  title: string;
  meta: ReactNode;
  /** What sits at the end: the switch, or a pill. */
  end: (describedBy: string) => ReactNode;
  /** Under the text: a tick line, a link, an error. The switch then lines up with the title. */
  extra?: ReactNode;
  /** A row with nothing to switch (a pill). */
  fixed?: boolean;
  /** The row holds a link, so the row itself is not a label. */
  interactive?: boolean;
  onActivate?: () => void;
  /** The id of the row's switch: the title and detail become a label for it, so a tap on the words flips it. The link stays outside the label. */
  labelFor?: string;
}) {
  // A tap on a link inside the row is the link's own; the row only takes the taps around it.
  const activate = onActivate
    ? (event: MouseEvent<HTMLDivElement>) => {
        if ((event.target as HTMLElement).closest("a")) return;
        onActivate();
      }
    : undefined;
  const metaId = `${id}-meta`;
  const className = cn("mk-row ntf-row", extra ? "has-x" : null, fixed && "is-fixed", labelFor && "is-labelled");
  const words = (
    <>
      <span className="mk-title">{title}</span>
      <span className="mk-meta" id={metaId}>
        {meta}
      </span>
    </>
  );
  const inner = (
    <>
      <span className="mk-body">
        {labelFor ? (
          <label className="ntf-lab" htmlFor={labelFor}>
            {words}
          </label>
        ) : (
          words
        )}
        {extra}
      </span>
      <span className="mk-end">{end(metaId)}</span>
    </>
  );
  if (fixed || interactive) {
    return (
      <div className={className} onClick={activate}>
        {inner}
      </div>
    );
  }
  return <label className={className}>{inner}</label>;
}

// What happened in bold, then what to do: "Couldn’t save that. Check your connection and try again."
function SaveError({ message = SAVE_FAILED }: { message?: string }) {
  const at = message.search(/\.\s/);
  const head = at > 0 ? message.slice(0, at + 1) : message;
  const rest = at > 0 ? message.slice(at + 1) : "";
  return (
    <p className="ntf-e" role="alert">
      <Icon name="circle-alert" size={15} />
      <span>
        <b>{head}</b>
        {rest}
      </span>
    </p>
  );
}

export function NotificationSettingsView({
  preferences,
  pushChannel = true,
  openInvite = true,
  saveTopic,
  saveChannel,
  failedKey = null,
  numberHref,
  onOpenSettings,
}: NotificationSettingsViewProps) {
  const base = useId();
  const router = useRouter();
  const [topics, setTopics] = useState(preferences.topics);
  const [channels, setChannels] = useState(preferences.channels);
  const [textCheck, setTextCheck] = useState(preferences.textCheck);
  const [failed, setFailed] = useState<{ key: SettingKey; error: string } | null>(failedKey ? { key: failedKey, error: SAVE_FAILED } : null);
  // A switch whose save is on its way takes no second tap until the answer is in.
  const saving = useRef(new Set<SettingKey>());

  const number = preferences.mobileNumber;
  const [permission, setPermission] = useState(preferences.pushPermission);
  const [asking, setAsking] = useState(false);
  // Whether this is the app with notifications: known only in the page (the server cannot tell), false while hydrating.
  const native = useSyncExternalStore(noSubscribe, nativePush, () => false);
  // In the app the phone's answer can change while this page is open (back from Settings): follow it.
  useEffect(() => {
    if (!pushChannel || !nativePush()) return;
    return onNative((event) => {
      if (event.type === "status") setPermission(event.status);
    });
  }, [pushChannel]);
  const openSettings = () => (onOpenSettings ? onOpenSettings() : openNativeSettings());
  async function askPush() {
    if (asking) return;
    setAsking(true);
    const answer = await askNative();
    setPermission(answer);
    setAsking(false);
    if (answer === "granted" && !channels.push) void flip("push", "channel");
  }
  const failedOn = (key: SettingKey) => (failed?.key === key ? <SaveError message={failed.error} /> : null);
  const numberStep = numberHref ? () => router.push(numberHref) : undefined;

  function apply(key: SettingKey, kind: "topic" | "channel", on: boolean) {
    if (kind === "topic") setTopics((previous) => ({ ...previous, [key]: on }));
    else setChannels((previous) => ({ ...previous, [key]: on }));
  }

  // A switch flips at once and saves. If the save fails (or cannot go: offline), it goes back and its row says so.
  async function flip(key: SettingKey, kind: "topic" | "channel") {
    if (saving.current.has(key)) return;
    const next = kind === "topic" ? !topics[key as NotificationTopic] : !channels[key as NotificationChannel];
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setFailed({ key, error: SAVE_FAILED });
      return;
    }
    setFailed(null);
    apply(key, kind, next);
    const save = kind === "topic" ? saveTopic && (() => saveTopic(key as NotificationTopic, next)) : saveChannel && (() => saveChannel(key as NotificationChannel, next));
    if (!save) {
      // The preview harness: local only. Switching Text on "sends" the check text; off clears the tick line.
      if (key === "text") setTextCheck(next ? "sent" : "none");
      return;
    }
    if (key === "text" && !next) setTextCheck("none");
    saving.current.add(key);
    let result: NotificationSaveResult;
    try {
      result = await save();
    } catch {
      result = { ok: false, error: SAVE_FAILED };
    }
    saving.current.delete(key);
    if (isSessionEnded(result)) {
      goToSessionEnded();
      return;
    }
    if (!result.ok) {
      apply(key, kind, !next);
      setFailed({ key, error: result.error || SAVE_FAILED });
      return;
    }
    // Only this switch (and the check text) is taken from the answer, so a second switch still saving keeps its place.
    const saved = result.preferences;
    apply(key, kind, kind === "topic" ? saved.topics[key as NotificationTopic] : saved.channels[key as NotificationChannel]);
    if (key === "text") setTextCheck(saved.textCheck);
  }

  function topicRow(scope: string, key: NotificationTopic, title: string, meta: string) {
    const id = `${base}-${scope}-${key}`;
    return (
      <SettingRow
        id={id}
        title={title}
        meta={meta}
        extra={failedOn(key)}
        end={(describedBy) => (
          <Switch on={topics[key]} label={title} describedBy={describedBy} onToggle={() => void flip(key, "topic")} />
        )}
      />
    );
  }

  function channelRows(scope: string) {
    const id = (key: string) => `${base}-${scope}-${key}`;
    const pushSwitchable = permission !== "unavailable";
    const pushOff = permission === "denied";
    // Not asked yet (the app can ask): off, and a tap asks.
    const pushAsk = permission === "not_asked" && native;
    const pushRow = !pushChannel ? null : pushSwitchable ? (
      <SettingRow
        id={id("push")}
        title="Push"
        meta={pushOff ? "Off in your iPhone’s settings." : pushAsk ? "Not turned on yet on this iPhone." : channels.push ? "On this iPhone." : "Off. Nothing comes to this iPhone."}
        extra={failedOn("push")}
        end={(describedBy) => (
          <Switch
            id={id("push-switch")}
            on={!pushOff && !pushAsk && channels.push}
            label="Push"
            describedBy={describedBy}
            onToggle={pushOff ? undefined : pushAsk ? () => void askPush() : () => void flip("push", "channel")}
          />
        )}
      />
    ) : (
      <SettingRow
        id={id("push")}
        title="Push"
        meta="In the Club Yuppie app on your iPhone."
        fixed
        end={() => <Pill>App only</Pill>}
      />
    );
    return (
      <Rows>
        {pushRow}
        {pushChannel ? (
          // With push, email is only for the account (11 Nov 2026): no switch.
          <SettingRow
            id={id("email")}
            title="Email"
            meta={`Your account, bookings and payments only, to ${preferences.email}.`}
            fixed
            end={() => <Pill>Always on</Pill>}
          />
        ) : (
          <SettingRow
            id={id("email")}
            title="Email"
            meta={`Reminders, bookings and chat nudges, to ${preferences.email}.`}
            extra={failedOn("email")}
            end={(describedBy) => (
              <Switch on={channels.email} label="Email" describedBy={describedBy} onToggle={() => void flip("email", "channel")} />
            )}
          />
        )}
        {number ? (
          <SettingRow
            id={id("text")}
            title="Text"
            meta={`Reminders only, to ${number}.`}
            interactive
            labelFor={id("text-switch")}
            extra={
              <>
                {channels.text && textCheck === "sent" ? (
                  <p className="ntf-ok">
                    <Icon name="check" size={15} />
                    <span>We sent a text to check it’s you.</span>
                  </p>
                ) : null}
                <span className="ntf-link">
                  {numberHref ? (
                    <Button variant="quiet" href={numberHref}>
                      Change number
                    </Button>
                  ) : (
                    <Button variant="quiet">Change number</Button>
                  )}
                </span>
                {failedOn("text")}
              </>
            }
            end={(describedBy) => (
              <Switch
                id={id("text-switch")}
                on={channels.text}
                label="Text"
                describedBy={describedBy}
                onToggle={() => void flip("text", "channel")}
              />
            )}
          />
        ) : (
          // No number on file: the switch stays off, and a tap on the row opens the number step.
          <SettingRow
            id={id("text")}
            title="Text"
            meta="Add a mobile number to get reminders by text."
            interactive
            onActivate={numberStep}
            extra={
              <>
                <span className="ntf-link">
                  {numberHref ? (
                    <Button variant="quiet" href={numberHref}>
                      Add a number
                    </Button>
                  ) : (
                    <Button variant="quiet">Add a number</Button>
                  )}
                </span>
                {failedOn("text")}
              </>
            }
            end={(describedBy) => <Switch on={false} label="Text" describedBy={describedBy} />}
          />
        )}
      </Rows>
    );
  }

  function channelsBlock(scope: string, card: boolean) {
    const banner =
      pushChannel && permission === "denied" ? (
        <div className="ntf-banner">
          <Icon name="bell-off" size={22} />
          <div>
            <p>
              <b>Notifications are off for Club Yuppie on this iPhone.</b> Turn them on in Settings to get push.
            </p>
            <Button variant="quiet" onClick={openSettings}>
              Open Settings
            </Button>
          </div>
        </div>
      ) : null;
    const foot =
      pushChannel && (permission === "granted" || permission === "not_asked") ? (
        <p className="ntf-foot">You can also change push in your phone’s settings.</p>
      ) : null;
    const inner = (
      <>
        <SectionTitle title="How we tell you" />
        <p className="ntf-intro">
          {pushChannel ? "Push for everything, text for reminders if you like. Text is off until you turn it on." : "Pick as many as you like. Text is off until you turn it on."}
        </p>
        {banner}
        {channelRows(scope)}
        {foot}
      </>
    );
    return card ? <Card className="ntf-card">{inner}</Card> : <section className="mk-section">{inner}</section>;
  }

  return (
    <>
      <BackRow href={ROUTES.you} label="Profile" />
      <Main className="ntf-sub">
        <div className="mk-wrap ntf-crumb">
          <div style={{ paddingTop: 32 }}>
            <BackLink href={ROUTES.you} label="Profile" />
          </div>
        </div>
        <TitleBlock title="Notifications." sub="Only what you need." actions={null} />
        <div className="mk-wrap">
          <div className="mk-cols">
            <div className="ntf-main-col">
              {openInvite ? (
                <section className="mk-section">
                  <SectionTitle title="Open Invite" />
                  <Rows>
                    {topicRow("t", "host", "Plans you host", "People joining or leaving, questions, messages and payments.")}
                    {topicRow("t", "in", "Plans you’re in", "Messages, replies, and changes or cancellations from the host.")}
                  </Rows>
                </section>
              ) : null}
              <section className="mk-section">
                <SectionTitle title="Reminders" />
                {/* NEW COPY without Open Invite (QR-04): the design's line minus "Open Invite plans and". */}
                <p className="ntf-intro">{openInvite ? "For Open Invite plans and Club events you’re booked on." : "For Club events you’re booked on."}</p>
                <Rows>
                  {topicRow("t", "reminder24", "24 hours before", "The day before, with the time and place.")}
                  {topicRow("t", "reminder2", "2 hours before", "A last nudge on the day.")}
                </Rows>
              </section>
              <section className="mk-section">
                <SectionTitle title="Club events" />
                <Rows>
                  <SettingRow
                    id={`${base}-t-booked`}
                    title="Booking confirmed"
                    meta="We always email your booking and the exact address."
                    fixed
                    end={() => <Pill>Always on</Pill>}
                  />
                  {topicRow("t", "clubChanges", "Changes", "If a date, time or place changes.")}
                </Rows>
              </section>
              <div className="mk-show-phone">{channelsBlock("p", false)}</div>
            </div>
            <aside className="mk-rail mk-show-desk">{channelsBlock("d", true)}</aside>
          </div>
        </div>
      </Main>
    </>
  );
}
