"use client";

// A waiting application's actions (r2b 16). Approve asks first and shows the email and the text word for word;
// then "Approving…" with both buttons switched off until it finishes. Decline asks first, with a switch to
// send the kind decline email, on by default (B-D3, B-D9); the saved card is released either way (C-D8).
// A payment problem shows as a plain banner with the one safe thing to do; Stripe's own words sit behind Details.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { adminApproveApplication, declineApplication } from "@/app/admin/applications-actions";
import { Banner, BusyButton, SaveFailed } from "@/components/admin/bits";
import { Dialog, MailFrame, SwitchRow } from "@/components/admin/dialog";
import { stripeSubscriptionUrl } from "@/components/admin/format";
import { Icon } from "@/components/admin/icons";
import type { PaymentProblem } from "./applications-data";

type Rendered = { subject: string; preheader: string; html: string };
export type ApplicationPreviews = { approval: Rendered; text: string | null; decline: Rendered };

export function ApplicationActions({
  applicationId,
  name,
  first,
  email,
  hasPhone,
  problem,
  rawError,
  subscriptionId,
  previews,
}: {
  applicationId: string;
  name: string;
  first: string;
  email: string;
  hasPhone: boolean;
  problem: PaymentProblem | null;
  rawError: string | null;
  subscriptionId: string | null;
  previews: ApplicationPreviews;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"approve" | "decline" | null>(null);
  const [sendEmail, setSendEmail] = useState(true);
  const [readMail, setReadMail] = useState(false);
  const [approving, startApprove] = useTransition();
  const [declining, startDecline] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function open(which: "approve" | "decline") {
    setError(null);
    setReadMail(false);
    if (which === "decline") setSendEmail(true);
    setDialog(which);
  }

  function approve() {
    setDialog(null);
    startApprove(async () => {
      const result = await adminApproveApplication(applicationId).catch(() => ({ ok: false as const, error: "" }));
      if (result.ok) {
        router.replace(`/admin/applications/${applicationId}?done=approved`, { scroll: false });
      }
      router.refresh();
    });
  }

  function decline() {
    startDecline(async () => {
      const result = await declineApplication(applicationId, { sendEmail }).catch(() => ({ ok: false as const, error: "" }));
      setDialog(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.replace(`/admin/applications/${applicationId}?done=declined`, { scroll: false });
      router.refresh();
    });
  }

  const busy = approving || declining;
  const approveLabel = problem === "card" ? "Try again" : problem === "account" ? "Finish the account" : "Approve";
  const declineOff = problem === "account" || problem === "unsaved";

  let banner = null;
  if (problem === "card") {
    banner = (
      <Banner title="The card was declined." raw={rawError}>
        Nothing was charged and no account was made. Email {first} to ask for another card, or try again.
      </Banner>
    );
  } else if (problem === "nocard") {
    banner = (
      <Banner title="There’s no saved card." raw={rawError}>
        Nothing was charged and no account was made. Email {first} to apply again with a card, or decline.
      </Banner>
    );
  } else if (problem === "account") {
    banner = (
      <Banner title="The payment went through, but the account isn’t finished." raw={rawError}>
        {first} has been charged £10 a month already. Finish the account: it will not charge again.
      </Banner>
    );
  } else if (problem === "unsaved") {
    banner = (
      <Banner title="Charged, but we couldn’t save it." raw={rawError}>
        Don’t approve {first} again yet. Check Stripe and the members list first.
      </Banner>
    );
  }

  return (
    <section className="ad-sec" aria-label="Review">
      {banner}
      {error !== null && <SaveFailed title="The application wasn’t declined." raw={error || null} />}
      <div className="ad-acts" style={banner ? undefined : { marginTop: 0 }}>
        {problem === "unsaved" ? (
          <>
            <button type="button" className="ad-btn sm" disabled>
              Approve
            </button>
            <button type="button" className="ad-btn sm secondary" disabled>
              Decline
            </button>
          </>
        ) : (
          <>
            <BusyButton type="button" className="sm" busy={approving} busyLabel="Approving…" disabled={busy || problem === "nocard"} onClick={() => open("approve")}>
              {approveLabel}
            </BusyButton>
            <button type="button" className="ad-btn sm secondary" disabled={busy || declineOff} onClick={() => open("decline")}>
              Decline
            </button>
          </>
        )}
        {(problem === "card" || problem === "nocard") && <EmailLink first={first} email={email} />}
        {problem === "unsaved" && (
          <a className="ad-btn sm secondary" href={subscriptionId ? stripeSubscriptionUrl(subscriptionId) : "https://dashboard.stripe.com/subscriptions"} target="_blank" rel="noopener noreferrer">
            Open in Stripe
            <Icon name="external" size={16} />
          </a>
        )}
      </div>
      {approving ? (
        <p className="ad-hint" role="status">
          Taking the payment and making the account. This takes a few seconds. Keep this page open.
        </p>
      ) : problem === "account" ? (
        <p className="ad-hint">Decline is switched off because {first} has paid.</p>
      ) : !problem ? (
        <p className="ad-hint">
          Approving takes the first payment (£10 a month) from the card {first} gave, makes the account and sends the welcome email
          {hasPhone ? " and text." : ". There is no phone number, so no text."} You’ll be asked to confirm.
        </p>
      ) : null}

      <Dialog
        open={dialog === "approve"}
        title={`Approve ${name}?`}
        onClose={() => setDialog(null)}
        testId="dialog-approve"
        actions={
          <>
            <button type="button" className="ad-btn" onClick={approve} data-autofocus>
              {problem === "account" ? "Finish the account" : `Approve ${first}`}
            </button>
            <button type="button" className="ad-btn secondary" onClick={() => setDialog(null)}>
              Not yet
            </button>
          </>
        }
      >
        <p className="ad-p">
          {problem === "account"
            ? `${first} has paid already. This makes the account and sends the welcome email. It won’t charge again.`
            : `This takes the first payment (£10 a month) from the card ${first} gave and makes the account. It can’t be undone here.`}
        </p>
        <div className="prev" data-testid="preview-email">
          <b>The email {first} gets</b>
          <p className="subj">{previews.approval.subject}</p>
          <span>{previews.approval.preheader}</span>
        </div>
        <div className="prev" data-testid="preview-text">
          <b>The text {first} gets</b>
          <span>{previews.text ?? `No text: there’s no phone number for ${first}.`}</span>
        </div>
        <button type="button" className="ad-link" aria-expanded={readMail} onClick={() => setReadMail((v) => !v)}>
          {readMail ? "Hide the email" : "Read the email"}
        </button>
        {readMail && <MailFrame html={previews.approval.html} title={`The email ${first} gets`} />}
      </Dialog>

      <Dialog
        open={dialog === "decline"}
        title={`Decline ${name}?`}
        onClose={() => setDialog(null)}
        busy={declining}
        testId="dialog-decline"
        actions={
          <>
            <BusyButton type="button" className="danger solid" busy={declining} busyLabel="Declining…" onClick={decline}>
              Decline application
            </BusyButton>
            <button type="button" className="ad-btn secondary" disabled={declining} onClick={() => setDialog(null)}>
              Keep {first} waiting
            </button>
          </>
        }
      >
        <p className="ad-p">Nothing is charged. {first}’s application moves to Declined.</p>
        <SwitchRow
          on={sendEmail}
          onChange={setSendEmail}
          disabled={declining}
          label={`Send ${first} a decline email`}
          hint={sendEmail ? `Subject: ${previews.decline.subject}. It says thanks for applying and that it’s a no this time.` : `${first} won’t hear from us. Nothing is sent.`}
          extra={
            sendEmail ? (
              <button type="button" className="ad-link" aria-expanded={readMail} onClick={() => setReadMail((v) => !v)}>
                {readMail ? "Hide the email" : "Read the email"}
              </button>
            ) : null
          }
        />
        {sendEmail && readMail && <MailFrame html={previews.decline.html} title={`The email ${first} gets`} />}
      </Dialog>
    </section>
  );
}

function EmailLink({ first, email }: { first: string; email: string }) {
  return (
    <a className="ad-btn sm secondary" href={`mailto:${email}?subject=${encodeURIComponent("Your Club Yuppie application")}`}>
      Email {first}
      <Icon name="mail" size={16} />
    </a>
  );
}
