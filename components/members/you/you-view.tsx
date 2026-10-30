"use client";

// You: your photo, the greeting, the membership, your details, a short
// Settings list, Help, and the account actions. Opened from your photo, top
// right of every main page; no tab is lit. One DOM serves phone and
// computer (the CSS puts the card beside the lists from 768px).
//
// A view of plain props, so the preview harness draws every state with
// example data. The page (app/members/you/load-you.ts) fetches the member and
// the card's real dates and passes the real server actions in: Manage and
// Update card (the billing portal), Keep my membership, the two-step Cancel
// membership, Delete my account and Log out. The actions call revalidatePath,
// so after Keep or Cancel the card redraws from the server with no reload.

import "./you.css";

import { useEffect, useState, useTransition, type ReactNode } from "react";

import { Button, Icon, Main, Rows, SectionTitle, TitleBlock } from "@/components/members/kit";
import { takePhotoChanged } from "@/lib/members/photo/notice";
import { ROUTES } from "@/lib/members/routes";
import { goToSessionEnded, isSessionEnded, type SessionEnded } from "@/components/members/session-ended";
import type { MembershipCardData, SettingsRow, YouDetails } from "@/lib/members/you/types";
import { CancelDialog, DeleteDialog, LogoutDialog, type CancelOutcome, type CancelPreview, type CancelStep } from "./you-dialogs";
import { MembershipCard } from "./membership-card";
import { DetailRow, HelpGroup, PhotoBlock, SettingsGroup, YouFoot } from "./you-parts";

export type YouDemo = {
  /** Open a dialog on the first draw (the preview only). */
  dialog?: "logout" | "cancel" | "cancel-reason" | "cancel-done" | "delete" | "delete-ready";
  /** Step 1's facts for a dialog opened on the first draw. */
  cancelPreview?: CancelPreview;
  /** Show the "Photo changed" note on the first draw (the preview only). */
  toast?: boolean;
  /** Draw the card's button as working (the preview only). */
  keeping?: boolean;
  /** Draw Keep my membership's error under the card (the preview only). */
  keepError?: string;
};

/** getCancelMembershipPreview's answer, as the view needs it. */
export type CancelPreviewResult = { ok: true; until: string | null; bookingsAfterEnd: { title: string; when: string }[] } | { ok: false; error: string };

export type YouViewProps = {
  /** First name, for the greeting. Empty: "Hey there." */
  firstName: string;
  photoUrl: string | null;
  details: YouDetails;
  /** "Sep 2026". */
  memberSince: string | null;
  membership: MembershipCardData;
  /** Only the rows whose area is switched on. */
  settingsRows: SettingsRow[];
  /** Where Change photo goes; null while the photo gate flag is off (the flag that brings the photo flow). */
  changePhotoHref: string | null;
  /** The legal line under the wordmark. */
  legal: string[];
  /** "1.0 (1)" in the app, when the app reports it. */
  appVersion?: string | null;
  /** signOutMember. */
  signOut: () => void | Promise<void>;
  /** Keep my membership (keepMyMembership): undoes a cancel. Used by the ending card's button. */
  keep: (() => Promise<{ ok: true } | { ok: false; error: string } | SessionEnded>) | null;
  /** Cancel membership, step 1's facts (getCancelMembershipPreview). Null: no Cancel link (no subscription to cancel). */
  cancelPreview: (() => Promise<CancelPreviewResult | SessionEnded>) | null;
  /** Cancel membership, step 2 (requestCancelMembership, with the reason). */
  cancelMembership: ((reason: string | null) => Promise<CancelOutcome | SessionEnded>) | null;
  /** Delete my account (deleteMyAccount). */
  deleteAccount: ((confirmation: string) => Promise<{ ok: false; error: string } | SessionEnded | void>) | null;
  /** The billing portal did not open (/members/billing sent the member back with ?billing=unavailable). */
  billingError?: string | null;
  /** Preview only: Open Invite's hosted-plans lines in the dialogs (paid plans are Phase B, so never live). */
  hostedPlans?: boolean;
  demo?: YouDemo;
  /** The Change photo sheet, when this render is /members/you/photo. */
  sheet?: ReactNode;
};

type DialogName = "logout" | "cancel" | "delete" | null;

function Toast({ children }: { children: ReactNode }) {
  return (
    <p className="yu-toast" role="status">
      <Icon name="check" size={18} />
      {children}
    </p>
  );
}

function initialDialog(demo: YouDemo | undefined): DialogName {
  switch (demo?.dialog) {
    case "logout":
      return "logout";
    case "cancel":
    case "cancel-reason":
    case "cancel-done":
      return "cancel";
    case "delete":
    case "delete-ready":
      return "delete";
    default:
      return null;
  }
}

function initialStep(demo: YouDemo | undefined): CancelStep {
  if (demo?.dialog === "cancel-reason") return "reason";
  if (demo?.dialog === "cancel-done") return "done";
  return "confirm";
}

export function YouView({
  firstName,
  photoUrl,
  details,
  memberSince,
  membership,
  settingsRows,
  changePhotoHref,
  legal,
  appVersion,
  signOut,
  keep,
  cancelPreview,
  cancelMembership,
  deleteAccount,
  billingError = null,
  hostedPlans = false,
  demo,
  sheet,
}: YouViewProps) {
  const [dialog, setDialog] = useState<DialogName>(() => initialDialog(demo));
  const [preview, setPreview] = useState<CancelPreview>(() => demo?.cancelPreview ?? { until: membership.renews ?? null, bookings: [] });
  const [toast, setToast] = useState(Boolean(demo?.toast));
  const [isOpening, startOpening] = useTransition();
  const [isKeeping, startKeeping] = useTransition();
  const [keepError, setKeepError] = useState<string | null>(demo?.keepError ?? null);

  // "Photo changed", handed over by the Change photo sheet. Read after the
  // first paint, because the server cannot see sessionStorage.
  useEffect(() => {
    if (!takePhotoChanged()) return;
    // The note is storage, which only the browser can read: setting state here is the point of the effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToast(true);
  }, []);
  useEffect(() => {
    if (!toast || demo?.toast) return;
    const timer = window.setTimeout(() => setToast(false), 3500);
    return () => window.clearTimeout(timer);
  }, [toast, demo?.toast]);

  // No Cancel link while a cancel is pending (you.md: the link goes), nor for a membership with nothing to cancel.
  const canCancel = Boolean(cancelPreview && cancelMembership) && (membership.state === "active" || membership.state === "problem");
  const greeting = firstName ? `Hey, ${firstName}.` : "Hey there.";
  const name = details.fullName?.trim() || firstName;

  // Step 1 needs the end date and the bookings after it, fresh from the server, so the link fetches them
  // and then opens the sheet. If that fails the sheet still opens, on the card's renewal date.
  function openCancel() {
    if (!cancelPreview || isOpening) return;
    startOpening(async () => {
      const result = await cancelPreview().catch(() => null);
      // The session ended while You was open: Log in with "Your session ended." (B-D1).
      if (isSessionEnded(result)) return goToSessionEnded();
      setPreview(
        result && result.ok
          ? { until: result.until ?? membership.renews ?? null, bookings: result.bookingsAfterEnd.map(({ title, when }) => ({ title, when })) }
          : { until: membership.renews ?? null, bookings: [] },
      );
      setDialog("cancel");
    });
  }

  function handleKeep() {
    if (!keep || isKeeping) return;
    setKeepError(null);
    startKeeping(async () => {
      const result = await keep().catch(() => ({ ok: false as const, error: "Your membership is still set to end. Try again." }));
      if (isSessionEnded(result)) return goToSessionEnded();
      if (!result.ok) setKeepError(result.error);
    });
  }

  const cardError = keepError ?? (membership.state === "active" || membership.state === "problem" ? billingError : null);

  return (
    <Main pad={false} className="yu-main">
      <div className="yu-title">
        <TitleBlock title={greeting} sub={memberSince ? `Member since ${memberSince}.` : undefined} />
      </div>

      <div className="mk-wrap">
        <div className="yu-cols">
          <div className="yu-photo-slot">
            <PhotoBlock photoUrl={photoUrl} name={name} changeHref={changePhotoHref} />
          </div>
          <div className="yu-card-slot" data-needs-device-check="true">
            <MembershipCard data={membership} onAction={handleKeep} pending={isKeeping || Boolean(demo?.keeping)} error={cardError} />
          </div>
          <div className="yu-main-col">
            <section className="mk-section yu-first">
              <SectionTitle title="Your details" linkLabel="Edit" linkHref={ROUTES.profileEdit} />
              <Rows>
                <DetailRow label="Name" value={details.fullName} />
                <DetailRow label="Email" value={details.email} />
                <DetailRow label="Phone" value={details.phone} />
              </Rows>
            </section>
            <SettingsGroup rows={settingsRows} />
            <HelpGroup />
            <section className="mk-section">
              <div className="yu-acct">
                <Button variant="outline" icon={<Icon name="log-out" size={20} />} onClick={() => setDialog("logout")}>
                  Log out
                </Button>
                <div className="yu-quiet-row">
                  {canCancel ? (
                    <Button variant="quiet" className="yu-quiet" pending={isOpening} onClick={openCancel}>
                      Cancel membership
                    </Button>
                  ) : null}
                  {deleteAccount ? (
                    <Button variant="quiet" danger className="yu-quiet" onClick={() => setDialog("delete")}>
                      Delete my account
                    </Button>
                  ) : null}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      <YouFoot legal={legal} appVersion={appVersion} />

      <LogoutDialog open={dialog === "logout"} onClose={() => setDialog(null)} email={details.email} signOut={signOut} />
      {cancelMembership ? (
        <CancelDialog
          open={dialog === "cancel"}
          onClose={() => setDialog(null)}
          preview={preview}
          hostedPlans={hostedPlans}
          cancel={cancelMembership}
          initialStep={initialStep(demo)}
          initialReason={demo?.dialog === "cancel-reason" ? "Not enough events" : null}
        />
      ) : null}
      {deleteAccount ? (
        <DeleteDialog
          open={dialog === "delete"}
          onClose={() => setDialog(null)}
          deleteAccount={deleteAccount}
          hostedPlans={hostedPlans}
          initialTyped={demo?.dialog === "delete-ready" ? "delete" : ""}
        />
      ) : null}

      {sheet}
      {toast ? <Toast>Photo changed</Toast> : null}
    </Main>
  );
}
