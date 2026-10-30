"use client";

// "Delete my account" as a quiet red link that opens the Delete dialog (type "delete"). You draws its own;
// this one is for the membership-ended gate, where an ended member can still delete the account.

import { useState } from "react";

import { Button } from "@/components/members/kit";
import { DeleteDialog } from "./you-dialogs";
import type { SessionEnded } from "@/components/members/session-ended";

export function DeleteAccountLink({ deleteAccount }: { deleteAccount?: (confirmation: string) => Promise<{ ok: false; error: string } | SessionEnded | void> }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="quiet" danger className="yu-quiet" onClick={() => setOpen(true)}>
        Delete my account
      </Button>
      <DeleteDialog open={open} onClose={() => setOpen(false)} deleteAccount={deleteAccount} />
    </>
  );
}
