// What a thread can have open on top of it. One at a time: the sheets (chat
// info, who to report, the report, the report sent), the two dialogs (block,
// leave), the long-press menu, and the "tap the message you want to report"
// mode. The thread view owns the state; the sheets and dialogs draw it.

export type ReportKind = "message" | "member" | "photo";

export type Overlay =
  | { kind: "none" }
  | { kind: "info" }
  /** The long-press menu on a bubble. */
  | { kind: "menu"; messageId: string }
  /** Picking a message to report: the ink banner is up and others' bubbles can be tapped. */
  | { kind: "select"; pickedId?: string | null }
  /** A plan chat has several people: pick who (report a member, report a photo, block). Not in the design: see thread-overlays. */
  | { kind: "pick"; purpose: ReportKind | "block" }
  | { kind: "report"; what: ReportKind; memberId: string; messageId?: string; reason: string | null }
  | { kind: "sent"; what: ReportKind; memberId: string }
  | { kind: "block"; memberId: string; afterReport?: boolean }
  | { kind: "leave" };

/** Preview only: the state a screen starts in when it is a transient one (typing, a failed send, the keyboard up). */
export type ThreadPreview = {
  draft?: string;
  /** Focus the input (draws the focused border and caret). */
  focus?: boolean;
  /** The iOS keyboard placeholder's height in px: folds the pin, drops the home-indicator padding, draws the grey block. */
  keyboard?: number;
  outgoing?: { clientId: string; text: string; state: "sending" | "failed" }[];
  overlay?: Overlay;
  muted?: boolean;
  blockedIds?: string[];
};
