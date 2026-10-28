"use client";

// "Delete my account" on the paused gate: the quiet red link, opening the You area's own Delete dialog
// (components/members/you/you-dialogs.tsx DeleteDialog, owned and wired by the You and system builder to
// deleteMyAccount, which works from the gate: requireMember({ allowGated: true })). One dialog for the whole
// members area, so the gate never says anything different from You.

import { useState } from "react";

import { Button } from "@/components/members/kit";
import { DeleteDialog } from "@/components/members/you/you-dialogs";

export function GateDeleteAccount() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="quiet" danger className="yu-quiet" onClick={() => setOpen(true)}>
        Delete my account
      </Button>
      <DeleteDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
