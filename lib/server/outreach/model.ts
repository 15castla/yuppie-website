// The Outreach Desk's row shapes and the words the screens use for each value (17 Nov 2026). No database code here,
// so screens, actions and tests can share it. The tables: supabase/migrations/20261117090000_outreach_desk.sql.

export const CATEGORIES = {
  restaurant: "Restaurant",
  bar: "Bar",
  cafe: "Cafe",
  activities: "Activities",
  cinema: "Cinema",
  grooming: "Grooming",
  hair_beauty: "Hair and beauty",
  fitness: "Fitness",
  clothing: "Clothing",
  dry_cleaning: "Dry cleaning",
  hotel: "Hotel",
  other: "Other",
} as const;
export type Category = keyof typeof CATEGORIES;

export const ASKS = {
  discount: "A members' discount",
  extend_corporate_offer: "Extend their corporate offer",
  extend_member_offer: "Extend an offer they run",
  featured_partner: "Featured partner",
  meeting: "A meeting",
  events: "Events",
  other: "Other",
} as const;
export type Ask = keyof typeof ASKS;

export const STAGES = {
  not_started: "Not started",
  researching: "Researching",
  ready: "Ready",
  contacted: "Contacted",
  replied: "Replied",
  call_booked: "Call booked",
  in_talks: "In talks",
  agreed: "Agreed",
  live: "Live",
  declined: "Declined",
  no_reply: "No reply",
  paused: "Paused",
} as const;
export type Stage = keyof typeof STAGES;
/** Stages that count as having reached a call (the funnel and the Calls booked KPI). */
export const CALL_OR_LATER: readonly Stage[] = ["call_booked", "in_talks", "agreed", "live"];
/** Stages before anything was sent: logging a first touch moves these to contacted. */
export const BEFORE_CONTACT: readonly Stage[] = ["not_started", "researching", "ready"];

export const EXCLUSIVITY = { none: "None", offered: "Offered", agreed: "Agreed", declined: "Declined" } as const;
export const SIGNERS = { albert: "Albert", kira: "Kira" } as const;

export const MAILBOX_TYPES = { named_person: "Named person", founder: "Founder", group_mailbox: "Group mailbox" } as const;
export type MailboxType = keyof typeof MAILBOX_TYPES;

export const SOURCES = {
  rocketreach: "RocketReach",
  apollo: "Apollo",
  published: "Published",
  albert: "Supplied by Albert",
  guessed: "Guessed",
  their_reply: "Their reply",
  unknown: "Unknown",
} as const;
export type Source = keyof typeof SOURCES;
export const SOURCE_SHORT: Record<Source, string> = {
  rocketreach: "RR",
  apollo: "Apollo",
  published: "pub",
  albert: "Albert",
  guessed: "guess",
  their_reply: "reply",
  unknown: "?",
};

export const CHANNELS = { email: "Email", letter: "Letter", linkedin: "LinkedIn", call: "Call", whatsapp: "WhatsApp", in_person: "In person" } as const;
export type Channel = keyof typeof CHANNELS;
export const CHANNEL_SHORT: Record<Channel, string> = { email: "E", letter: "L", linkedin: "In", call: "C", whatsapp: "W", in_person: "P" };

export const TOUCH_KINDS = { first: "First", follow_up: "Follow-up", resend: "Resend", forward: "Forward", conversation: "Conversation" } as const;
export type TouchKind = keyof typeof TOUCH_KINDS;
/** Kinds that count as outreach sent (not Albert's later messages in a live thread). */
export const OUTREACH_KINDS: readonly TouchKind[] = ["first", "follow_up", "resend", "forward"];

export const OUTCOME_KINDS = { reply: "Reply", auto_reply: "Automatic reply", bounce: "Bounce", delay: "Delay notice", opt_out_request: "Asked to stop" } as const;
export type OutcomeKind = keyof typeof OUTCOME_KINDS;
export const OUTCOME_CHANNELS = { email: "Email", phone: "Phone", letter: "Letter", linkedin: "LinkedIn", whatsapp: "WhatsApp", in_person: "In person" } as const;
export const SENTIMENTS = { positive: "Positive", neutral: "Neutral", negative: "Negative" } as const;
export type Sentiment = keyof typeof SENTIMENTS;

export const NOTE_KINDS = { meeting: "Meeting", call: "Call", note: "Note", whatsapp: "WhatsApp" } as const;
export const ACTION_KINDS = { task: "To do", call: "Call", meeting: "Meeting", reply_due: "Reply due" } as const;

export type Target = {
  id: string;
  name: string;
  group_name: string | null;
  category: Category;
  domains: string[];
  website: string | null;
  postal_address: string | null;
  ask: Ask;
  ask_detail: string | null;
  ask_line: string | null;
  exclusivity: keyof typeof EXCLUSIVITY;
  exclusivity_category: string | null;
  signed_by: keyof typeof SIGNERS;
  stage: Stage;
  stage_at: string;
  next_call_at: string | null;
  next_action: string | null;
  next_action_on: string | null;
  hook: string | null;
  avoid: string | null;
  notes: string | null;
  do_not_follow_up: boolean;
  opted_out: boolean;
  opted_out_at: string | null;
  opted_out_note: string | null;
  created_at: string;
  updated_at: string;
};

export type Contact = {
  id: string;
  target_id: string;
  name: string | null;
  role: string | null;
  mailbox_type: MailboxType;
  email: string | null;
  email_source: Source;
  source_note: string | null;
  email_status: "unknown" | "valid" | "bounced";
  linkedin_url: string | null;
  is_primary: boolean;
  opted_out: boolean;
  opted_out_at: string | null;
  opted_out_note: string | null;
  created_at: string;
};

export type Recipient = {
  id: string;
  touch_id: string;
  contact_id: string | null;
  address: string | null;
  role: "to" | "cc";
  delivery: "unknown" | "delivered" | "bounced";
  bounced_at: string | null;
  bounce_code: string | null;
};

export type Touch = {
  id: string;
  target_id: string;
  sequence_id: string;
  channel: Channel;
  kind: TouchKind;
  step: number | null;
  status: "planned" | "queued" | "drafted" | "sent" | "posted" | "failed" | "cancelled" | "unconfirmed";
  subject: string | null;
  version: string | null;
  attachment: string | null;
  file_ref: string | null;
  body_text: string | null;
  sent_at: string | null;
  letter_posted_on: string | null;
  letter_class: string | null;
  web_link: string | null;
  counts_in_stats: boolean;
  signed_by: string | null;
  created_by: string;
  note: string | null;
  created_at: string;
  recipients: Recipient[];
  // Phase 2, the Outlook connection
  internet_message_id?: string | null;
  conversation_id?: string | null;
  attachments?: FileNote[];
  guess_kind?: TouchKind | null;
  candidate_targets?: string[];
};

/** What Outlook says was attached: a name and a size, never the file. */
export type FileNote = { name: string; size: number | null; inline?: boolean };

export type Outcome = {
  id: string;
  target_id: string;
  sequence_id: string | null;
  touch_id: string | null;
  contact_id: string | null;
  kind: OutcomeKind;
  channel: keyof typeof OUTCOME_CHANNELS;
  sentiment: Sentiment | null;
  received_at: string;
  from_address: string | null;
  from_name: string | null;
  subject: string | null;
  body_text: string | null;
  summary: string | null;
  bounced_address: string | null;
  bounce_code: string | null;
  web_link: string | null;
  confirmed: boolean;
  is_first_reply: boolean;
  reply_seconds: number | null;
  created_at: string;
  // Phase 2
  match_method?: string;
  conversation_id?: string | null;
  internet_message_id?: string | null;
  attachments?: FileNote[];
  hint?: "possible_opt_out" | "invite" | null;
  candidate_targets?: string[];
};

export type Followup = {
  id: string;
  target_id: string;
  sequence_id: string;
  step: 1 | 2;
  channel: "email" | "letter";
  due_on: string;
  snoozed_until: string | null;
  status: "scheduled" | "drafted" | "done" | "skipped" | "paused" | "cancelled";
  reason: string | null;
  touch_id: string | null;
  stale_draft: boolean;
  // Phase 2: the Outlook draft the drafter made, and why the last try failed
  draft_id?: string | null;
  draft_link?: string | null;
  draft_made_at?: string | null;
  draft_error?: string | null;
};

/** The words of a follow-up that the drafter turns into an Outlook draft (Phase 2; Alex writes them in Phase 3). */
export type DraftText = {
  id: string;
  target_id: string;
  followup_id: string | null;
  /** a reply's words (Phase 3): the partner's reply it answers */
  outcome_id?: string | null;
  draft_link?: string | null;
  draft_error?: string | null;
  kind: "follow_up" | "january" | "reply";
  subject: string | null;
  body: string;
  status: "written" | "drafted" | "discarded";
  written_by: "albert" | "assistant";
  updated_at: string;
};

export type Note = {
  id: string;
  target_id: string;
  kind: keyof typeof NOTE_KINDS;
  happened_at: string;
  title: string | null;
  body: string;
  source: string;
  created_at: string;
};

export type Action = {
  id: string;
  target_id: string;
  kind: keyof typeof ACTION_KINDS;
  title: string;
  due_on: string | null;
  starts_at: string | null;
  status: "open" | "done" | "cancelled";
  source: string;
  created_at: string;
  done_at: string | null;
};

export type StageChange = { id: string; target_id: string; from_stage: string | null; to_stage: string; at: string; by: string; note: string | null };

/** Words for a follow-up's step: the one follow-up, then the January email. */
export function stepWords(step: number | null | undefined): string {
  return step === 2 ? "January email" : step === 1 ? "Follow-up" : "First";
}

/** A rate written with its counts: "29% (2 of 7)", or "- (0)" with nothing to count. */
export function rateWords(n: number, of: number): string {
  if (of === 0) return "-";
  return `${Math.round((n / of) * 100)}% (${n} of ${of})`;
}

export function isKey<T extends object>(map: T, value: unknown): value is keyof T {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(map, value);
}

/** What the desk says after an action (?done=<code>). */
export const DONE_WORDS: Record<string, string> = {
  created: "Partner added.",
  saved: "Saved.",
  stage: "Stage saved.",
  flags: "Saved.",
  deleted: "Partner deleted, with everything about them.",
  contact: "Contact saved.",
  contact_deleted: "Contact deleted. Their emails stay, without their name or address.",
  touch: "Logged.",
  outcome: "Logged.",
  note: "Note saved.",
  note_deleted: "Note deleted.",
  action: "Action point saved.",
  action_done: "Done.",
  followup: "Follow-up saved.",
  imported: "Imported. Your partners are on the Blotter and in Partners.",
  import_nothing_new: "Nothing new: every partner in that file is already in the desk.",
  linked: "Outlook linked. The drafter syncs at its next run.",
  unlinked: "Outlook unlinked. The drafter can't reach the desk now.",
  text: "Saved. The draft is made in Outlook the evening before it's due.",
  text_removed: "Follow-up text removed.",
  retry: "The draft will be made again at the next sync.",
  confirmed: "Confirmed.",
  ignored: "Ignored. It won't come back.",
  disconnected: "Disconnected. Claude can't reach the desk now.",
  guidance_saved: "Saved as a draft. Alex won't write these until you approve it.",
  guidance_approved: "Approved. Alex can write these now.",
  guidance_stopped: "Stopped. Alex won't write these until you approve it again.",
  reply_removed: "Reply removed. No draft will be made.",
};

/** What the desk says when an action is refused (?error=<code>). */
export const ERROR_WORDS: Record<string, string> = {
  missing: "Something needed is missing. Check the form and try again.",
  not_found: "That couldn't be found. It may have been deleted.",
  bad_email: "That email address doesn't look right.",
  bad_date: "That date doesn't look right.",
  duplicate: "That address is already a contact for this partner.",
  opted_out: "They've opted out, so nothing more can be sent to them.",
  no_sequence: "Log the first email or letter before a follow-up.",
  no_recipient: "Choose who it went to.",
  confirm: "Tick the box to confirm.",
  bad_file: "That file couldn't be read. It should be the desk import file.",
  failed: "That didn't save. Try again.",
  bad_fingerprint: "That isn't a fingerprint. Copy the 64 letters and numbers draft-partner-emails desk-link shows.",
  not_open: "That follow-up isn't waiting any more.",
  drafted_already: "The draft is already in Outlook. Edit it there.",
  connect_failed: "That connection request wasn't right or has expired. Start again from Claude's settings.",
};
