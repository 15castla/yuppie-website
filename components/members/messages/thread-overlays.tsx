"use client";

// Sheets and dialogs over a thread (stub: the real ones arrive with the next group).

import type { Dispatch, SetStateAction } from "react";

import type { Chat, ChatMessage } from "@/lib/members/messages/types";
import type { Overlay } from "./overlay-types";

export function ThreadOverlays(props: {
  overlay: Overlay;
  setOverlay: Dispatch<SetStateAction<Overlay>>;
  chat: Chat;
  youId: string;
  muted: boolean;
  onMute: () => void;
  blockedIds: string[];
  onBlock: (memberId: string) => void;
  messageById: (id: string) => ChatMessage | null;
  onLeave: () => void;
}) {
  void props;
  return null;
}
