// Preview screens for You, its sub pages (Edit details, Help), the membership-ended
// gate, the photo gate and Change photo. OWNED BY THE YOU BUILDER.
// Ids: you-home, you-edit, help-index, help-faq, help-contact, help-privacy,
// you-ended, photo-gate, photo-change.
//
// EXAMPLE CONTENT: Sam Taylor and every date, price, plan and photo below are
// the mockups' fictional ones. The actions are stand-ins (lib/members/mock/
// you-actions.ts): nothing is read or written.
//
// What `default` means: the approved design, with every flag that adds to You
// switched on (Settings rows, Change photo, the hosted-plans lines in the
// dialogs). The state `launch` is what a member gets in Phase A: no Settings,
// no Change photo, and dialogs without the hosted-plans lines (Open Invite is
// not real yet); the card buttons, the two-step Cancel and Delete are real.

import { PhotoGateView, type GateDemo } from "@/components/members/photo/photo-gate-view";
import { ChangePhotoSheet, type SheetDemo } from "@/components/members/photo/change-photo-sheet";
import { EditDetailsView, type EditDemo } from "@/components/members/you/edit-details";
import { MembershipEndedView } from "@/components/members/you/ended-view";
import { FaqView } from "@/components/members/you/faq-view";
import { ContactView, HelpIndexView, PrivacyView } from "@/components/members/you/help-views";
import { YouView, type YouDemo, type YouViewProps } from "@/components/members/you/you-view";
import { POLICY_SECTIONS, policyIntro, policyLastUpdated } from "@/components/site/privacy-data";
import { noFlags } from "@/lib/members/flags";
import { EXAMPLE_PHOTO_CROP, EXAMPLE_PHOTO_NOFACE, EXAMPLE_PHOTO_WIDE } from "@/lib/members/mock/photo-examples";
import {
  previewCancelPreview,
  previewDeleteAccount,
  previewKeep,
  previewKeepFails,
  previewRemovePhoto,
  previewRequestCancel,
  previewRequestEmailChange,
  previewSignOut,
  previewUpdateProfile,
  previewUpload,
  previewUploadFails,
  previewVerifyEmailChange,
} from "@/lib/members/mock/you-actions";
import { helpFaqGroups } from "@/lib/members/you/help";
import { legalLines } from "@/lib/members/you/format";
import { ROUTES } from "@/lib/members/routes";
import { buildSettingsRows } from "@/lib/members/you/settings";
import type { MembershipCardData, SettingsSummaries } from "@/lib/members/you/types";
import type { PreviewParams, PreviewScreen } from "./types";

// ---------------------------------------------------------------- You

type YouState =
  | "default"
  | "launch"
  | "no-photo"
  | "long-name"
  | "ending"
  | "problem"
  | "paused"
  | "cancelled"
  | "legal-long"
  | "settings-warn"
  | "ending-warn"
  | "host"
  | "problem-none"
  | "dialog-logout"
  | "dialog-cancel"
  | "dialog-cancel-reason"
  | "dialog-cancel-live"
  | "dialog-cancel-done"
  | "keep-working"
  | "keep-error"
  | "billing-error"
  | "dialog-delete"
  | "dialog-delete-ready"
  | "photo-changed";

const YOU_STATES: YouState[] = [
  "default",
  "launch",
  "no-photo",
  "long-name",
  "ending",
  "problem",
  "paused",
  "cancelled",
  "legal-long",
  "settings-warn",
  "ending-warn",
  "host",
  "problem-none",
  "dialog-logout",
  "dialog-cancel",
  "dialog-cancel-reason",
  "dialog-cancel-live",
  "dialog-cancel-done",
  "keep-working",
  "keep-error",
  "billing-error",
  "dialog-delete",
  "dialog-delete-ready",
  "photo-changed",
];

function summariesFor(state: YouState, app: boolean): SettingsSummaries {
  // Amber: something needs the member. Blocked members reads "None".
  if (state === "settings-warn" || state === "ending-warn") {
    return {
      notifications: { summary: "Off. You may miss reminders.", warn: true },
      payments: { lines: ["Get paid: needs more info"], warn: true },
      blocked: 0,
    };
  }
  // A host who has been paid out (the design's "Payments as a host").
  if (state === "host") {
    return { notifications: { summary: app ? "Push, email" : "Email" }, payments: { lines: ["Get paid: ready", "£40 from Tom, paid out Tue 17 Nov"] }, blocked: 1 };
  }
  // The design's default summaries with nothing blocked.
  if (state === "problem-none") {
    return { notifications: { summary: app ? "Push, email" : "Email" }, payments: { lines: ["Get paid: not set up"] }, blocked: 0 };
  }
  // The web has no push, so its row says "Email".
  // The default is the approved design's example: a paid event on the first line of Payments, two blocked members.
  return {
    notifications: { summary: app ? "Push, email" : "Email" },
    payments: { lines: ["Paid £22 for Comedy night", "Get paid: not set up"] },
    blocked: 2,
  };
}

const RETREAT = { title: "Sunrise Wellness Retreat", when: "Sun 15 Nov" };
const BILLING = { href: "/dev-preview/you-home" };

const MEMBERSHIPS: Partial<Record<YouState, MembershipCardData>> = {
  ending: { state: "ending", endsOn: "12 Nov", action: { label: "Keep my membership" } },
  problem: { state: "problem", failedOn: "12 Nov", updateBy: "15 Nov", action: { label: "Update card", ...BILLING } },
  "problem-none": { state: "problem", failedOn: "12 Nov", updateBy: "15 Nov", action: { label: "Update card", ...BILLING } },
  "ending-warn": { state: "ending", endsOn: "12 Nov", afterEnd: [RETREAT], action: { label: "Keep my membership" } },
  "keep-working": { state: "ending", endsOn: "12 Nov", afterEnd: [RETREAT], action: { label: "Keep my membership" } },
  "keep-error": { state: "ending", endsOn: "12 Nov", action: { label: "Keep my membership" } },
  paused: { state: "paused" },
  cancelled: { state: "cancelled", endsOn: "12 Nov" },
};

function youProps(params: PreviewParams, state: YouState): YouViewProps {
  const launch = state === "launch";
  const flags = launch ? noFlags() : params.flags;
  const app = params.shell === "app";
  const longName = state === "long-name";
  const firstName = longName ? "Bartholomew-Alexander" : params.member?.firstName || "Sam";
  const demo: YouDemo = {};
  if (state === "dialog-logout") demo.dialog = "logout";
  if (state === "dialog-cancel") demo.dialog = "cancel";
  if (state === "dialog-cancel-reason") demo.dialog = "cancel-reason";
  if (state === "dialog-cancel-live") demo.dialog = "cancel";
  if (state === "dialog-cancel-done") demo.dialog = "cancel-done";
  if (state === "dialog-delete") demo.dialog = "delete";
  if (state === "dialog-delete-ready") demo.dialog = "delete-ready";
  if (state === "photo-changed") demo.toast = true;

  // The hosted-plans lines need Open Invite's paid plans (Phase B): the launch and live states leave them out.
  const hostedPlans = !launch && state !== "dialog-cancel-live";
  if (state === "keep-working") demo.keeping = true;
  if (state === "keep-error") demo.keepError = "Your membership is still set to end. Try again.";
  if (demo.dialog === "cancel" || demo.dialog === "cancel-reason" || demo.dialog === "cancel-done") {
    demo.cancelPreview = { until: "12 Nov", bookings: [RETREAT] };
  }
  return {
    firstName,
    photoUrl: state === "no-photo" ? null : (params.member?.photoUrl ?? null),
    details: longName
      ? { fullName: "Bartholomew-Alexander Montgomery-Featherstonehaugh", email: "bartholomew-alexander.montgomery-featherstonehaugh@example.com", phone: "07912 345678" }
      : { fullName: "Sam Taylor", email: "sam@example.com", phone: "07912 345678" },
    memberSince: "Sep 2026",
    membership: MEMBERSHIPS[state] ?? { state: "active", renews: "12 Nov", action: { label: "Manage", ...BILLING } },
    settingsRows: buildSettingsRows(flags, summariesFor(state, app)),
    changePhotoHref: flags.photoGate ? ROUTES.youPhoto : null,
    legal:
      state === "legal-long"
        ? ["© 2026 Club Yuppie Ltd. Registered in England and Wales, company no. 00000000.", "Registered office: 1 Example Street, Exampletown, EX1 1AA."]
        : legalLines(2026),
    appVersion: app && !launch ? "1.0 (1)" : null,
    signOut: previewSignOut,
    keep: state === "keep-error" ? previewKeepFails : previewKeep,
    cancelPreview: previewCancelPreview,
    cancelMembership: previewRequestCancel,
    deleteAccount: previewDeleteAccount,
    billingError: state === "billing-error" ? "We couldn’t open billing. Try again." : null,
    hostedPlans,
    demo,
  };
}

// ---------------------------------------------------------------- Edit details

type EditState =
  | "default"
  | "errors"
  | "focus"
  | "saving"
  | "saved"
  | "save-error"
  | "email-error"
  | "code"
  | "code-error"
  | "code-second"
  | "updated"
  | "photo-row"
  | "photo-row-error";

const EDIT_STATES: EditState[] = [
  "default",
  "errors",
  "focus",
  "saving",
  "saved",
  "save-error",
  "email-error",
  "code",
  "code-error",
  "code-second",
  "updated",
  "photo-row",
  "photo-row-error",
];

const EDIT_DEMOS: Partial<Record<EditState, EditDemo>> = {
  errors: { values: { name: "", phone: "+44770090" }, errors: { name: "Enter your name.", phone: "Enter a mobile number, like 07700 900123." } },
  focus: { focusName: true },
  saving: { status: "saving" },
  saved: { status: "saved" },
  "save-error": { errors: { form: "Your details didn’t save. Try again." } },
  "email-error": {
    values: { email: "sam.taylor@" },
    errors: { email: "That email address doesn’t look right. Check it and try again. Your other changes are saved." },
  },
  code: { step: "code", code: { code: "" } },
  "code-error": { step: "code", code: { code: "482917", error: "That code is wrong or has expired. Send a new code." } },
  "code-second": { step: "code", code: { sentTo: "current" } },
  updated: { step: "updated" },
  "photo-row-error": { photoError: "That file is too big. Choose one under 5 MB." },
};

function editMember() {
  return { full_name: "Sam Taylor", email: "sam@example.com", phone: "+447912345678", employer: null, role_title: null, avatar_url: null };
}

// ---------------------------------------------------------------- the photo gate and Change photo

type GateState =
  | "start"
  | "start-small"
  | "start-type"
  | "start-large"
  | "start-unreadable"
  | "start-drag"
  | "removed"
  | "existing"
  | "camera-ask"
  | "camera-off"
  | "crop"
  | "preview"
  | "saving"
  | "failed"
  | "noface"
  | "saved";

const GATE_STATES: GateState[] = [
  "start",
  "start-small",
  "start-type",
  "start-large",
  "start-unreadable",
  "start-drag",
  "removed",
  "existing",
  "camera-ask",
  "camera-off",
  "crop",
  "preview",
  "saving",
  "failed",
  "noface",
  "saved",
];

// The crop the design draws: the photo a little larger than the circle, nudged up and right.
const DESIGN_CROP = { zoom: 1.555, x: 0.194, y: 0.222 };

const GATE_DEMOS: Record<GateState, GateDemo> = {
  start: { screen: "start" },
  "start-small": { screen: "start", error: "small" },
  "start-type": { screen: "start", error: "type" },
  "start-large": { screen: "start", error: "large" },
  "start-unreadable": { screen: "start", error: "unreadable" },
  "start-drag": { screen: "start", over: true },
  removed: { screen: "start", notice: "removed" },
  existing: { screen: "start", variant: "existing" },
  "camera-ask": { screen: "camera-ask" },
  "camera-off": { screen: "camera-off" },
  crop: { screen: "crop", source: EXAMPLE_PHOTO_WIDE, crop: DESIGN_CROP },
  preview: { screen: "preview", source: EXAMPLE_PHOTO_WIDE, crop: DESIGN_CROP, previewUrl: EXAMPLE_PHOTO_CROP },
  saving: { screen: "saving", source: EXAMPLE_PHOTO_WIDE, crop: DESIGN_CROP, previewUrl: EXAMPLE_PHOTO_CROP },
  failed: { screen: "failed", source: EXAMPLE_PHOTO_WIDE, crop: DESIGN_CROP, previewUrl: EXAMPLE_PHOTO_CROP, error: "upload" },
  noface: { screen: "noface", source: EXAMPLE_PHOTO_WIDE, crop: DESIGN_CROP, previewUrl: EXAMPLE_PHOTO_NOFACE },
  saved: { screen: "saved", source: EXAMPLE_PHOTO_WIDE, crop: DESIGN_CROP, previewUrl: EXAMPLE_PHOTO_CROP, savedUrl: EXAMPLE_PHOTO_CROP },
};

type SheetState = "start" | "error" | "crop" | "saving" | "failed";
const SHEET_STATES: SheetState[] = ["start", "error", "crop", "saving", "failed"];

const SHEET_DEMOS: Record<SheetState, SheetDemo> = {
  start: { step: "start" },
  error: { step: "start", error: "small" },
  crop: { step: "crop", source: EXAMPLE_PHOTO_WIDE, crop: DESIGN_CROP },
  saving: { step: "saving", source: EXAMPLE_PHOTO_WIDE, crop: DESIGN_CROP },
  failed: { step: "failed", source: EXAMPLE_PHOTO_WIDE, crop: DESIGN_CROP, error: "upload" },
};

// ---------------------------------------------------------------- the screens

function pick<T extends string>(state: string, states: readonly T[]): T {
  return (states as readonly string[]).includes(state) ? (state as T) : states[0];
}

// The tab bar and desktop nav show every tab, as the approved design does (other areas' flags only decide their tabs).
const SHELL_FLAGS = ["openInvite", "concierge"] as const;

export const youScreens: PreviewScreen[] = [
  {
    id: "you-home",
    title: "You",
    states: YOU_STATES,
    tab: null,
    youCurrent: true,
    defaultFlags: [...SHELL_FLAGS, "photoGate", "notifications", "paidPlans", "messages"],
    render: (params) => <YouView {...youProps(params, pick(params.state, YOU_STATES))} />,
  },
  {
    id: "you-edit",
    title: "You: Edit details",
    states: EDIT_STATES,
    tab: null,
    youCurrent: true,
    defaultFlags: SHELL_FLAGS,
    render: (params) => {
      const state = pick(params.state, EDIT_STATES);
      return (
        <EditDetailsView
          member={editMember()}
          actions={{
            updateProfile: previewUpdateProfile,
            updateAvatar: previewUpload,
            removeAvatar: previewRemovePhoto,
            requestEmailChange: previewRequestEmailChange,
            verifyEmailChange: previewVerifyEmailChange,
          }}
          showPhotoUpload={state === "photo-row" || state === "photo-row-error"}
          demo={EDIT_DEMOS[state] ?? {}}
        />
      );
    },
  },
  {
    id: "help-index",
    title: "You: Help",
    states: ["default"],
    tab: null,
    youCurrent: true,
    defaultFlags: SHELL_FLAGS,
    render: () => <HelpIndexView />,
  },
  {
    id: "help-faq",
    title: "You: Help, FAQs",
    states: ["default", "second-open", "photo-open", "all-closed", "launch"],
    tab: null,
    youCurrent: true,
    defaultFlags: SHELL_FLAGS,
    render: ({ state }) => {
      const all = helpFaqGroups({ photoGate: true, openInvite: true });
      if (state === "launch") return <FaqView groups={helpFaqGroups(noFlags())} />;
      if (state === "second-open") return <FaqView groups={all} initialOpen={all[1].items[1].id} />;
      if (state === "photo-open") return <FaqView groups={all} initialOpen="photo" />;
      if (state === "all-closed") return <FaqView groups={all} initialOpen={null} />;
      return <FaqView groups={all} />;
    },
  },
  {
    id: "help-contact",
    title: "You: Help, Contact us",
    states: ["default"],
    tab: null,
    youCurrent: true,
    defaultFlags: SHELL_FLAGS,
    render: () => <ContactView />,
  },
  {
    id: "help-privacy",
    title: "You: Help, Privacy policy",
    states: ["default"],
    tab: null,
    youCurrent: true,
    defaultFlags: SHELL_FLAGS,
    render: () => <PrivacyView intro={policyIntro()} lastUpdated={policyLastUpdated()} sections={POLICY_SECTIONS} />,
  },
  {
    id: "you-ended",
    title: "Membership ended (gate, drawn only)",
    states: ["default"],
    chrome: "bare",
    dock: "own",
    render: ({ shell }) => (
      <MembershipEndedView mode={shell} endedOn="12 Nov" legal={legalLines(2026)} appVersion="1.0 (1)" signOut={previewSignOut} />
    ),
  },
  {
    id: "photo-gate",
    title: "Photo gate",
    states: GATE_STATES,
    chrome: "bare",
    dock: "own",
    defaultFlags: ["photoGate"],
    render: ({ state, shell }) => {
      const gate = pick(state, GATE_STATES);
      return (
        <PhotoGateView
          mode={shell}
          firstName="Sam"
          hasPhoto={false}
          continueHref="/dev-preview/shell-demo"
          upload={gate === "failed" ? previewUploadFails : previewUpload}
          signOut={previewSignOut}
          demo={GATE_DEMOS[gate]}
        />
      );
    },
  },
  {
    id: "photo-change",
    title: "Change photo (sheet over You)",
    states: SHEET_STATES,
    tab: null,
    youCurrent: true,
    defaultFlags: [...SHELL_FLAGS, "photoGate", "notifications", "paidPlans", "messages"],
    render: (params) => {
      const sheet = pick(params.state, SHEET_STATES);
      return (
        <YouView
          {...youProps(params, "default")}
          sheet={
            <ChangePhotoSheet
              key="change-photo"
              mode={params.shell}
              firstName="Sam"
              upload={sheet === "failed" ? previewUploadFails : previewUpload}
              demo={SHEET_DEMOS[sheet]}
            />
          }
        />
      );
    },
  },
];
