"use client";

// The report card's actions (msg-admin-moderation-1280, msg-admin-photo-report-1280): Remove message, Remove
// photo (with the reason the member sees), Remove plan, Suspend (stage 1's pause, asking about Stripe with the
// box ticked: B-D2) and Dismiss report; then a note saying what each does. Remove message and Dismiss are one tap,
// as drawn; the others ask first. "Warn" is not offered: it would only be recorded (no warning note exists yet).

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import {
  adminDismissReport,
  adminRemoveReportedMessage,
  adminRemoveReportedPhoto,
  adminRemoveReportedPlan,
  adminSuspendReportedMember,
} from "@/app/admin/reports-actions";
import { BusyButton } from "@/components/admin/bits";
import { CheckRow, Dialog } from "@/components/admin/dialog";
import { RemovePhotoDialog, type PhotoReason } from "@/components/admin/remove-photo-dialog";
import { ErrorLine } from "@/components/admin/ui";

type Busy = null | "message" | "photo" | "plan" | "suspend" | "dismiss";
type Result = { ok: true } | { ok: false; error: string };

export type ReportActionsView = {
  reportId: string;
  first: string;
  /** What the primary action is: the thing reported. */
  removeMessage: boolean;
  removePhoto: boolean;
  removePlan: { title: string; going: number; reason: string } | null;
  suspend: { hasSubscription: boolean } | null;
  photoReasons: PhotoReason[];
};

export function ReportActions({ view, note }: { view: ReportActionsView; note: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [busy, setBusy] = useState<Busy>(null);
  const [, startTransition] = useTransition();
  const [dialog, setDialog] = useState<null | "photo" | "plan" | "suspend">(null);
  const [stripeBox, setStripeBox] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { first } = view;

  function run(which: Exclude<Busy, null>, call: () => Promise<Result>, done: string) {
    setError(null);
    setBusy(which);
    startTransition(async () => {
      let result: Result;
      try {
        result = await call();
      } catch {
        result = { ok: false, error: "We couldn’t save that. Try again in a moment." };
      }
      setBusy(null);
      if (!result.ok) {
        setDialog(null);
        setError(result.error);
        // Someone else may have dealt with it: show the report as it is now.
        router.refresh();
        return;
      }
      setDialog(null);
      // The card says what happened (?done=), on this report's own page, so the line survives the list moving on.
      const next = new URLSearchParams();
      const tab = params.get("tab");
      if (tab) next.set("tab", tab);
      next.set("done", done);
      const target = `/admin/reports/${view.reportId}?${next.toString()}`;
      if (pathname === `/admin/reports/${view.reportId}`) router.replace(target, { scroll: false });
      else router.push(target, { scroll: false });
      router.refresh();
    });
  }

  const any = busy !== null;
  const primary = view.removeMessage ? "message" : view.removePhoto ? "photo" : view.removePlan ? "plan" : "suspend";
  const cls = (which: string) => (which === primary ? undefined : "secondary");

  return (
    <>
      <div className="ad-acts q">
        {view.removeMessage && (
          <BusyButton type="button" className={cls("message")} busy={busy === "message"} busyLabel="Removing…" disabled={any} onClick={() => run("message", () => adminRemoveReportedMessage(view.reportId), "message_removed")}>
            Remove message
          </BusyButton>
        )}
        {view.removePhoto && (
          <button type="button" className={`ad-btn ${cls("photo") ?? ""}`} disabled={any} onClick={() => setDialog("photo")}>
            Remove photo
          </button>
        )}
        {view.removePlan && (
          <button type="button" className={`ad-btn ${cls("plan") ?? ""}`} disabled={any} onClick={() => setDialog("plan")}>
            Remove plan
          </button>
        )}
        {view.suspend && (
          <button
            type="button"
            className={`ad-btn ${cls("suspend") ?? ""}`}
            disabled={any}
            onClick={() => {
              setStripeBox(true);
              setDialog("suspend");
            }}
          >
            Suspend {first}
          </button>
        )}
        <BusyButton type="button" className="secondary" busy={busy === "dismiss"} busyLabel="Dismissing…" disabled={any} onClick={() => run("dismiss", () => adminDismissReport(view.reportId), "dismissed")}>
          Dismiss report
        </BusyButton>
      </div>
      {error && <ErrorLine>{error}</ErrorLine>}
      <p className="ad-qnote">{note}</p>

      {view.removePhoto && (
        <RemovePhotoDialog
          open={dialog === "photo"}
          first={first}
          reasons={view.photoReasons}
          busy={busy === "photo"}
          onClose={() => setDialog(null)}
          onConfirm={(reason) => run("photo", () => adminRemoveReportedPhoto(view.reportId, reason), "photo_removed")}
        />
      )}

      {view.removePlan && (
        <Dialog
          open={dialog === "plan"}
          title={`Remove ${view.removePlan.title}?`}
          onClose={() => setDialog(null)}
          busy={busy === "plan"}
          testId="dialog-remove-plan"
          actions={
            <>
              <BusyButton type="button" className="danger solid" busy={busy === "plan"} busyLabel="Removing…" onClick={() => run("plan", () => adminRemoveReportedPlan(view.reportId, view.removePlan!.reason), "plan_removed")}>
                Remove plan
              </BusyButton>
              <button type="button" className="ad-btn secondary" disabled={busy === "plan"} onClick={() => setDialog(null)}>
                Keep the plan
              </button>
            </>
          }
        >
          <p className="ad-p">
            It comes off Open Invite at once and its chat closes.{" "}
            {view.removePlan.going === 0
              ? "Nobody is going yet."
              : view.removePlan.going === 1
                ? "The one person going sees that it was cancelled in their Updates."
                : `The ${view.removePlan.going} people going see that it was cancelled in their Updates.`}{" "}
            No email goes out. This can’t be undone.
          </p>
        </Dialog>
      )}

      {view.suspend && (
        <Dialog
          open={dialog === "suspend"}
          title={`Suspend ${first}?`}
          onClose={() => setDialog(null)}
          busy={busy === "suspend"}
          testId="dialog-suspend"
          actions={
            <>
              <BusyButton type="button" busy={busy === "suspend"} busyLabel="Suspending…" onClick={() => run("suspend", () => adminSuspendReportedMember(view.reportId, { stripe: view.suspend!.hasSubscription && stripeBox }), "suspended")}>
                Suspend {first}
              </BusyButton>
              <button type="button" className="ad-btn secondary" disabled={busy === "suspend"} onClick={() => setDialog(null)}>
                Keep {first} active
              </button>
            </>
          }
        >
          <p className="ad-p">
            This pauses {first}’s membership. {first} can’t use the members area, chats or Open Invite until you resume it in Members. {first} is not emailed.
          </p>
          {view.suspend.hasSubscription ? (
            <CheckRow
              checked={stripeBox}
              onChange={setStripeBox}
              disabled={busy === "suspend"}
              label={`Also pause ${first}’s £10 a month payments in Stripe`}
              hint="Nothing is taken until you resume. Untick to leave billing as it is."
            />
          ) : (
            <p className="ad-p">{first} has no subscription in Stripe, so only the club’s record changes.</p>
          )}
        </Dialog>
      )}
    </>
  );
}
