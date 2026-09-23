"use client";

import { useEffect, useRef, useState } from "react";
import { CircleUserRound } from "lucide-react";

import { signOut } from "@/app/admin/actions";

// Was an always-visible initials avatar (title={email}, so the address
// only ever showed on a mouse hover — nothing on touch) sitting next to a
// permanent, always-visible "Sign out" link. Replaced with a single
// profile-icon button: clicking it reveals a small menu with the email
// and the sign-out action, closing on an outside click or Escape.
export function AdminUserMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-foreground/70 outline-none transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <CircleUserRound size={26} strokeWidth={1.75} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-2 w-56 rounded-xl border border-foreground/10 bg-background p-2 shadow-[0_10px_24px_-10px_rgba(27,21,18,0.25)]"
        >
          <p className="truncate px-2 py-1.5 text-xs text-foreground/60">{email}</p>
          <div className="my-1 h-px bg-foreground/10" />
          <form action={signOut}>
            <button
              type="submit"
              role="menuitem"
              className="block w-full rounded-lg px-2 py-1.5 text-left text-sm font-medium text-foreground/80 outline-none transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:bg-foreground/5 focus-visible:text-foreground"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
