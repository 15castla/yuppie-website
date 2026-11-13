"use client";

// Nominated by: the member's name opens a small window with their profile, so the application stays on screen
// (Albert, 13 Nov 2026: "select the member that nominated and review their profile in a smaller window that
// pops up so they never have to leave the new application"). The profile itself is drawn on the server
// (NominatorSummary) and handed in as children; the full member page opens in a new tab.

import { useState, type ReactNode } from "react";

import { Dialog } from "@/components/admin/dialog";
import { Icon } from "@/components/admin/icons";

export function NominatorPeek({ name, memberId, children }: { name: string; memberId: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="ad-peek-link" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {name}
      </button>
      <Dialog
        open={open}
        title={name}
        onClose={() => setOpen(false)}
        testId="dialog-nominator"
        actions={
          <>
            <button type="button" className="ad-btn" data-autofocus onClick={() => setOpen(false)}>
              Back to the application
            </button>
            <a className="ad-btn secondary" href={`/admin/members/${memberId}`} target="_blank" rel="noopener noreferrer">
              Open their full profile
              <Icon name="external" size={16} />
            </a>
          </>
        }
      >
        {children}
      </Dialog>
    </>
  );
}
