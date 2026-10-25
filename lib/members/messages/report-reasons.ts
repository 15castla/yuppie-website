// The reasons a member can give when they report (specs/messages.md 3.6), and
// the words around them. A message report has six reasons, a member report the
// same plus "Photo isn't them or isn't suitable", a photo report three. The
// ids are the backend's (MessageReportReason, MemberReportReason,
// PhotoReportReason in ./types).

import type { MemberReportReason, MessageReportReason, PhotoReportReason } from "./types";

export type ReportWhat = "message" | "member" | "photo";

export type ReasonOption = { id: MemberReportReason | PhotoReportReason; label: string };

const FIRST_FIVE: readonly { id: MessageReportReason; label: string }[] = [
  { id: "rude", label: "Rude or unkind" },
  { id: "harassment", label: "Harassment or unwanted attention" },
  { id: "spam", label: "Spam or selling something" },
  { id: "pay_outside", label: "Pressure to pay outside the app" },
  { id: "threats", label: "Threats or something unsafe" },
];
const OTHER: ReasonOption = { id: "other", label: "Something else" };

export const REASONS: Record<ReportWhat, readonly ReasonOption[]> = {
  message: [...FIRST_FIVE, OTHER],
  member: [...FIRST_FIVE, { id: "photo_not_them_or_unsuitable", label: "Photo isn’t them or isn’t suitable" }, OTHER],
  photo: [
    { id: "not_them", label: "It isn’t them" },
    { id: "not_suitable", label: "It isn’t suitable" },
    OTHER,
  ],
};

/** The sheet's title and the question over the reasons. */
export function reportHeading(what: ReportWhat, name: string): { title: string; question: string } {
  if (what === "message") return { title: "Report this message", question: "Why are you reporting it?" };
  if (what === "member") return { title: `Report ${name}`, question: "Why are you reporting them?" };
  return { title: `Report ${name}’s photo`, question: "What’s wrong with it?" };
}

export const REPORT_FINE_PRINT =
  "We review every report within 24 hours. They aren’t told who reported them. If someone is in danger, call 999.";

/** "Report sent." and what it promises. */
export function reportSentCopy(what: ReportWhat, name: string): { sub: string; lines: string[] } {
  const action =
    what === "message"
      ? `We may remove the message or contact ${name}.`
      : what === "photo"
        ? `We may remove the photo or contact ${name}.`
        : `We may contact ${name}.`;
  return { sub: "We’ll review it within 24 hours.", lines: [`${name} isn’t told who reported them.`, action] };
}

export const REPORT_CONTACT = "hello@clubyuppie.com";
