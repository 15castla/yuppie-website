import { notFound } from "next/navigation";

import { photoReasons } from "@/app/admin/photo-reasons";
import { requireAdmin } from "@/app/admin/require-admin";
import { countWords, monthYear, queueAgo, whenWords } from "@/components/admin/format";
import { Icon } from "@/components/admin/icons";
import { QueueCardHead } from "@/components/admin/queue";
import { Avatar, Card, DL, SavedLine, type DLRow } from "@/components/admin/ui";
import { PHOTO_REMOVAL_LABELS } from "@/lib/server/photos";
import { PhotoActions } from "./PhotoActions";
import { photoCard, photoReportReason } from "./photos-data";

// One photo (photo-admin-queue-1280, -reported, -changed): the photo at 176px (a changed one: Before and Now),
// the member, when it was added, the automatic face check, where it shows (or the "Use it anyway" note), the
// open report about it, then Keep photo and Remove and ask for a new one, and what each does. A photo someone
// has checked shows what was done.

const inline = (ago: string) => (ago === "Yesterday" || ago === "Just now" ? ago.toLowerCase() : ago);

export async function PhotoCard({ photoId, done }: { photoId: string; done?: string | null }) {
  await requireAdmin();
  const d = await photoCard(photoId);
  if (!d) notFound();
  const { photo, member, report } = d;
  const first = member.first;
  const now = new Date();
  const live = photo.status === "pending" || photo.status === "approved";
  const reported = Boolean(report) && live;
  const toCheck = photo.status === "pending" || reported;
  const changed = photo.source === "changed";

  const title = reported ? `Photo from ${first}` : changed ? `New photo from ${first}` : `Photo from ${first}`;
  const pill = toCheck
    ? reported
      ? { label: "Reported", kind: "ink" as const }
      : { label: changed ? "Changed" : "New", kind: "plain" as const }
    : photo.status === "removed"
      ? { label: "Removed", kind: "muted" as const }
      : { label: "Kept", kind: "plain" as const };

  const face =
    photo.face_check === "found" ? (
      <span className="ad-face ok">
        <Icon name="check" size={18} />
        Face found
      </span>
    ) : photo.face_check === "none" ? (
      <span className="ad-face bad">
        <Icon name="circle-alert" size={18} />
        No face found
      </span>
    ) : (
      <span className="ad-face skip">Not checked</span>
    );

  const rows: DLRow[] = [];
  if (reported && report) {
    rows.push(["Reported by", `${report.by}, ${inline(queueAgo(report.at, now))}`]);
    rows.push(["Reason", photoReportReason(report.reason)]);
  }
  rows.push(["Member", `${first} · member since ${monthYear(member.since)}${reported ? ` · ${countWords(d.earlierReports, "earlier report", "earlier reports", "no earlier reports")}` : ""}`]);
  rows.push([changed ? "Changed" : "Added", whenWords(photo.created_at, now)]);
  rows.push(["Automatic check", face]);
  if (photo.face_check === "none") rows.push(["Note", `${first} chose “Use it anyway” when we asked`]);
  else rows.push(["Shows on", "Open Invite, chats, Who’s in, redeem cards"]);
  if (!toCheck) {
    const at = photo.reviewed_at ?? photo.removed_at;
    if (photo.status === "removed") {
      rows.push(["Outcome", `Removed: ${photo.removal_reason ? PHOTO_REMOVAL_LABELS[photo.removal_reason] : "by the club"}${at ? `, ${whenWords(at, now)}` : ""}`]);
    } else if (photo.status === "replaced") {
      rows.push(["Outcome", `${photo.reviewed_at ? `Kept, ${whenWords(photo.reviewed_at, now)}. ` : ""}${first} has changed it since.`]);
    } else if (photo.reviewed_at) {
      rows.push(["Outcome", `Kept, ${whenWords(photo.reviewed_at, now)}`]);
    }
  }

  const justDone = (done === "kept" && photo.status === "approved") || (done === "removed" && photo.status === "removed");
  const headId = `photo-${photo.id}`;
  const canRemove = live && member.current && !member.deleted;
  return (
    <Card labelledBy={headId}>
      <QueueCardHead id={headId} title={title} pill={pill.label} pillKind={pill.kind} />
      <div className="ad-pbody">
        {changed && d.beforeUrl ? (
          <div className="ad-pics two">
            <figure>
              <Avatar name={first} photoUrl={d.beforeUrl} size={144} />
              <figcaption>Before</figcaption>
            </figure>
            <figure>
              <Avatar name={first} photoUrl={d.url} size={144} />
              <figcaption>Now</figcaption>
            </figure>
          </div>
        ) : (
          <div className="ad-pics one">
            <Avatar name={first} photoUrl={d.url} size={176} />
          </div>
        )}
        <DL className="q" rows={rows} />
      </div>
      {justDone ? (
        <div className="ad-qdone">
          <SavedLine>
            {photo.status === "removed" ? `Photo removed. ${first} is asked for a new one and gets an email with the reason.` : `Photo kept. Nothing changes for ${first}.`}
          </SavedLine>
        </div>
      ) : canRemove ? (
        <PhotoActions
          photoId={photo.id}
          first={first}
          canKeep={toCheck}
          reasons={photoReasons()}
          note={`${toCheck ? "Keep photo clears it from this list and changes nothing. " : ""}Remove and ask for a new one takes the photo off Open Invite and every chat at once. ${first} gets an email with the reason you pick, and sees the Add your photo screen when Club Yuppie next opens.`}
        />
      ) : (
        <div className="ad-qdone">
          <p className="ad-hint">{photo.status === "removed" ? "This photo is off Club Yuppie. Nothing more to do." : `${first} has a newer photo now. Nothing more to do here.`}</p>
        </div>
      )}
    </Card>
  );
}
