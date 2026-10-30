import Link from "next/link";
import { notFound } from "next/navigation";

import { photoReasons } from "@/app/admin/photo-reasons";
import { requireAdmin } from "@/app/admin/require-admin";
import { countWords, dayDate, monthYear, queueAgo, time24, whenWords } from "@/components/admin/format";
import { QueueCardHead } from "@/components/admin/queue";
import { Avatar, Card, DL, SavedLine, type DLRow } from "@/components/admin/ui";
import type { ReportStatus } from "@/lib/server/reports";
import { ReportActions, type ReportActionsView } from "./ReportActions";
import { reportCard, STATUS_PILL, type ReportCardData } from "./reports-data";

// One report (msg-admin-moderation-1280 for a message, msg-admin-photo-report-1280 for a photo; a plan and a
// member in the same grammar): who reported it and when, the reason, where, the member's history, the thing
// reported (the message in its chat, the photo members see, the plan), then the actions and what each does.
// A report someone has acted on shows what was done instead.

const inline = (ago: string) => (ago === "Yesterday" || ago === "Just now" ? ago.toLowerCase() : ago);

function memberLine(d: ReportCardData): string | null {
  const m = d.member;
  if (!m) return d.report.about ? null : "Former member · account deleted";
  if (m.deleted) return "Former member · account deleted";
  const parts = [m.first, `member since ${monthYear(m.since)}`];
  if (d.report.kind === "photo" && d.photo) parts.push(`photo added ${dayDate(d.photo.addedAt)}`);
  parts.push(countWords(m.earlierReports, "earlier report", "earlier reports", "no earlier reports"));
  if (d.report.kind !== "photo") parts.push(`blocked by ${countWords(m.blockedBy, "member", "members")}`);
  if (m.state === "paused") parts.push("membership paused");
  if (m.state === "cancelled") parts.push("membership ended");
  return parts.join(" · ");
}

function outcome(status: ReportStatus, first: string): string {
  switch (status) {
    case "dismissed":
      return "Dismissed";
    case "message_removed":
      return "Message removed";
    case "plan_removed":
      return "Plan removed";
    case "photo_removed":
      return "Photo removed";
    case "suspended":
      return `${first} suspended`;
    case "warned":
      return "Warned (recorded only)";
    default:
      return "Open";
  }
}

function doneLine(status: ReportStatus, first: string): string {
  switch (status) {
    case "dismissed":
      return "Report dismissed. Nothing else changed.";
    case "message_removed":
      return "Message removed. Everyone in the chat sees “Message removed” now.";
    case "plan_removed":
      return "Plan removed. It’s off Open Invite and the people going have an Update.";
    case "photo_removed":
      return `Photo removed. ${first} is asked for a new one and gets an email with the reason.`;
    case "suspended":
      return `${first} is suspended. To lift it, resume the membership in Members.`;
    default:
      return "Saved.";
  }
}

export async function ReportCard({ reportId, done }: { reportId: string; done?: string | null }) {
  await requireAdmin();
  const d = await reportCard(reportId);
  if (!d) notFound();
  const { report: r, member, chat, plan, photo } = d;
  const first = member?.first ?? r.about?.firstName ?? "Former member";
  const now = new Date();
  const isOpen = r.status === "open";
  const pill = STATUS_PILL[r.status];
  const photoReport = r.kind === "photo" || r.reason === "photo_not_them_or_unsuitable";

  const title =
    r.kind === "message" ? `Message from ${first}` : r.kind === "photo" ? `Photo of ${first}` : r.kind === "plan" ? `Plan from ${first}` : `Report about ${first}`;

  const rows: DLRow[] = [
    ["Reported by", `${d.reporterFirst}, ${inline(queueAgo(r.createdAt, now))}`],
    ["Reason", r.reasonLabel],
  ];
  if (chat && r.kind !== "plan") {
    const when = `${dayDate(chat.startsAt)}, ${time24(chat.startsAt)}`;
    rows.push(["Chat", `${chat.kind === "plan" ? "Plan chat" : "Question to the host"}, ${chat.planTitle} (${when}), ${countWords(chat.members, "member", "members")}`]);
  }
  rows.push([r.kind === "plan" ? "Host" : "Member", memberLine(d)]);
  if (!isOpen) {
    rows.push(["Outcome", `${outcome(r.status, first)}${r.actedAt ? `, ${whenWords(r.actedAt, now)}` : ""}`]);
    if (r.actionNote && r.status !== "photo_removed") rows.push(["Note", r.actionNote]);
  }

  // What the actions can do here.
  const suspendable = Boolean(member && !member.deleted && member.state === "active");
  const photoCurrent = Boolean(photo && (photo.status === "pending" || photo.status === "approved"));
  const planRemovable = Boolean(plan && (plan.removedAt || (plan.status === "scheduled" && !plan.started)));
  const view: ReportActionsView = {
    reportId: r.id,
    first,
    removeMessage: r.kind === "message" && Boolean(r.messageId),
    removePhoto: photoReport && photoCurrent,
    removePlan: r.kind === "plan" && plan && planRemovable ? { title: plan.title, going: plan.guests, reason: r.reasonLabel } : null,
    suspend: suspendable ? { hasSubscription: Boolean(member?.hasSubscription) } : null,
    photoReasons: photoReasons(),
  };

  // The note under the buttons says what each one does (as drawn), only for the buttons shown.
  const notes: string[] = [];
  if (view.removeMessage) notes.push("Remove replaces the message with “Message removed” for everyone.");
  if (view.removePhoto) notes.push(`Remove takes the photo down at once and asks ${first} to add another before using the members area. ${first} gets an email with the reason you pick.`);
  if (view.removePlan) notes.push("Remove takes the plan off Open Invite at once, closes its chat and tells the people going in their Updates.");
  if (r.kind === "plan" && plan && !planRemovable) notes.push(plan.status === "cancelled" ? "The host cancelled this plan already, so there is nothing to remove." : "This plan has started, so it can’t be removed now.");
  if (photoReport && photo && !photoCurrent) notes.push(photo.status === "removed" ? "This photo was removed already." : `${first} has changed this photo since. The new one is in Photos.`);
  if (view.suspend) notes.push(`Suspend pauses ${first}’s membership, which takes ${first} out of every chat and Open Invite until you resume it in Members.`);
  else if (member && !member.deleted && member.state === "paused") notes.push(`${first}’s membership is paused already.`);
  else if (member && !member.deleted && member.state === "cancelled") notes.push(`${first}’s membership has ended.`);
  notes.push("Dismiss closes the report and changes nothing.");

  const headId = `report-${r.id}`;
  const justDone = done && done === r.status;
  return (
    <Card labelledBy={headId}>
      <QueueCardHead id={headId} title={title} pill={pill.label} pillKind={pill.kind} />
      <DL className="q" rows={rows} />

      {r.kind === "message" &&
        (r.context && r.context.length ? (
          <div className="ad-ctx" aria-label="The message in its chat">
            {r.context.map((c) => (
              <div key={c.id} className={c.reported ? "l hit" : "l"} aria-current={c.reported ? "true" : undefined}>
                <b>{time24(c.at)}</b>
                <span>
                  <b>{c.senderName}</b> {c.text}
                  {c.removed && <em className="gone"> · removed</em>}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="ad-ctx">
            <div className="l hit">
              <b>{time24(r.createdAt)}</b>
              <span>
                <b>{first}</b> {r.messageText ?? "This message is no longer there."}
              </span>
            </div>
          </div>
        ))}

      {photoReport && (
        <div className="ad-pic">
          <Avatar name={first} photoUrl={r.photoUrl} size={132} />
          {photoCurrent ? (
            <p>
              <b>This is the photo members see.</b>
              It shows on Open Invite, in chats and on the redeem card. Only signed-in members can see it.
            </p>
          ) : photo?.status === "removed" ? (
            <p>
              <b>This photo was removed.</b>
              {photo.removedAt ? `Removed ${dayDate(photo.removedAt)}. ` : ""}Members no longer see it.
            </p>
          ) : (
            <p>
              <b>{first} has changed this photo since.</b>
              Members see the new one. It waits in Photos if it needs a look.
            </p>
          )}
        </div>
      )}

      {r.kind === "plan" && plan && (
        <div className="ad-ctx plan" aria-label="The plan">
          <span className="t">{plan.title}</span>
          <span className="m">
            {dayDate(plan.startsAt)}, {time24(plan.startsAt)} · {plan.place}
          </span>
          <span className="m">
            {plan.removedAt
              ? "Removed by the club"
              : plan.status === "cancelled"
                ? "Cancelled by the host"
                : `${countWords(plan.going, "going", "going")} of ${countWords(plan.places, "place", "places")}${plan.started ? " · started" : ""}`}
          </span>
          {plan.note && <span className="nt">{plan.note}</span>}
        </div>
      )}

      {isOpen ? (
        <ReportActions view={view} note={notes.join(" ")} />
      ) : (
        <div className="ad-qdone">
          {justDone ? <SavedLine>{doneLine(r.status, first)}</SavedLine> : <p className="ad-hint">This report is closed. Nothing more to do.</p>}
          {r.status === "suspended" && member && !member.deleted && (
            <Link className="ad-link" href={`/admin/members/${member.id}`}>
              Open {first} in Members
            </Link>
          )}
        </div>
      )}
    </Card>
  );
}
