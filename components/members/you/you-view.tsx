"use client";

// You: your photo, the greeting, the membership, your details, a short
// Settings list, Help, and the account actions. Opened from your photo, top
// right of every main page; no tab is lit. One DOM serves phone and
// computer (the CSS puts the card beside the lists from 768px).
//
// A view of plain props, so the preview harness draws every state with
// example data. The page (app/members/you/load-you.tsx) fetches the member
// and passes the real server actions in. A button appears only when the
// action behind it exists: `cancelMembership` is passed only for a member
// who can cancel, `canDelete` is false on the live page (nothing deletes an
// account yet), and the membership card carries no button (there is no
// billing page link and no undo for a cancel).

import "./you.css";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { Button, Icon, Main, Rows, SectionTitle, TitleBlock } from "@/components/members/kit";
import { takePhotoChanged } from "@/lib/members/photo/notice";
import { ROUTES } from "@/lib/members/routes";
import type { MembershipCardData, SettingsRow, YouDetails } from "@/lib/members/you/types";
import { CancelDialog, DeleteDialog, LogoutDialog, type CancelCopy, type CancelResult } from "./you-dialogs";
import { MembershipCard } from "./membership-card";
import { DetailRow, HelpGroup, PhotoBlock, SettingsGroup, YouFoot } from "./you-parts";

export type YouDemo = {
  /** Open a dialog on the first draw (the preview only). */
  dialog?: "logout" | "cancel" | "cancel-reason" | "cancel-done" | "delete" | "delete-ready";
  /** Show the "Photo changed" note on the first draw (the preview only). */
  toast?: boolean;
};

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
  /** cancelMembership, passed only when this member can cancel (an active membership with a subscription). Null: no Cancel link. */
  cancel: ((reason?: string) => Promise<CancelResult>) | null;
  cancelCopy: CancelCopy;
  /** Preview only: draw the designed two-step cancel (nothing stores a reason yet). */
  cancelWithReason?: boolean;
  /** Preview only: show Delete my account (nothing deletes an account yet). */
  canDelete?: boolean;
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
  cancel,
  cancelCopy,
  cancelWithReason = false,
  canDelete = false,
  demo,
  sheet,
}: YouViewProps) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogName>(() => initialDialog(demo));
  // This visit's cancel went through. Nothing reads the "cancel at period end"
  // setting back yet (see lib/members/you/types.ts), so until the page is
  // reloaded the card says what was just done.
  const [requested, setRequested] = useState(false);
  const [toast, setToast] = useState(Boolean(demo?.toast));

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

  const card: MembershipCardData = requested
    ? { state: "ending", endsOn: membership.renews ?? cancelCopy.endsOn }
    : membership;
  const canCancel = Boolean(cancel) && !requested && (membership.state === "active" || membership.state === "problem");
  const greeting = firstName ? `Hey, ${firstName}.` : "Hey there.";
  const name = details.fullName?.trim() || firstName;

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
            <MembershipCard data={card} />
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
                    <Button variant="quiet" className="yu-quiet" onClick={() => setDialog("cancel")}>
                      Cancel membership
                    </Button>
                  ) : null}
                  {canDelete ? (
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
      {cancel ? (
        <CancelDialog
          open={dialog === "cancel"}
          onClose={() => setDialog(null)}
          copy={cancelCopy}
          cancel={cancel}
          withReason={cancelWithReason || demo?.dialog === "cancel-reason"}
          initialStep={demo?.dialog === "cancel-reason" ? "reason" : demo?.dialog === "cancel-done" ? "done" : "confirm"}
          initialReason={demo?.dialog === "cancel-reason" ? "Not enough events" : null}
          onCancelled={() => {
            setRequested(true);
            router.refresh();
          }}
        />
      ) : null}
      {canDelete ? (
        <DeleteDialog open={dialog === "delete"} onClose={() => setDialog(null)} initialTyped={demo?.dialog === "delete-ready" ? "delete" : ""} />
      ) : null}

      {sheet}
      {toast ? <Toast>Photo changed</Toast> : null}
    </Main>
  );
}
