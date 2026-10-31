// The post form filled in with a posted plan, for the host's edit (app/members/open-invite/[id]/edit). Not a
// client module, so the page can call it on the server. Pure: no React, no I/O.

import type { OpenInvite } from "@/lib/members/invite/types";
import type { PostValues } from "./post-view";

/** London's wall-clock date (YYYY-MM-DD) and time (HH:MM) of an instant, as the form's date and time fields hold them. */
export function londonFormParts(iso: string): { date: string; time: string } {
  const at = new Date(iso);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
  return { date, time };
}

export function valuesOf(invite: OpenInvite): Partial<PostValues> {
  return {
    title: invite.title,
    type: invite.type,
    ...londonFormParts(invite.startsAt),
    where: invite.where,
    places: invite.places,
    hostGoing: invite.hostGoing,
    note: invite.note ?? "",
  };
}
