"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ButtonHTMLAttributes,
  type FormEvent,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

// Shared feedback for every admin button that runs a server action, so
// each one shows it's working, can't be double-submitted, and confirms
// when it's done, the same way everywhere:
//
// - ActionButton: spinner + "Saving…"-style label while pending (the
//   style the applications page's Approve/Reject buttons already used),
//   then a brief "Saved" with a tick. It gets its pending state from, in
//   order: explicit props (forms that run their own useTransition), an
//   enclosing AdminActionForm, or useFormStatus (a plain <form action>,
//   e.g. Sign out, Approve/Reject).
// - AdminActionForm: for forms whose fields are rendered on the server.
//   Runs the action itself rather than through <form action>, so it gets
//   the action's { success, error } back: errors show (ActionFormError)
//   instead of being dropped, and "Saved" only shows on real success.
// - useSavedFlash: the brief "Saved" state, for forms that already run
//   their own transition.

type ActionResult = { success: boolean; error?: string };

const SAVED_MS = 2000;

export function useSavedFlash() {
  const [saved, setSaved] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const flash = useCallback(() => {
    setSaved(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSaved(false), SAVED_MS);
  }, []);

  return [saved, flash] as const;
}

type ActionFormState = { pending: boolean; saved: boolean; error: string | null };

const ActionFormContext = createContext<ActionFormState | null>(null);

export function AdminActionForm({
  action,
  id,
  className,
  children,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, flash] = useSavedFlash();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    // Includes inputs outside the form tied to it with form="<id>", e.g.
    // EventPreviewCard's focal point fields.
    const formData = new FormData(event.currentTarget);
    setError(null);

    startTransition(async () => {
      try {
        const result = await action(formData);
        if (!result.success) {
          setError(result.error ?? "Something went wrong.");
          return;
        }
        flash();
        router.refresh();
      } catch (err) {
        console.error("Admin action failed:", err);
        setError("Something went wrong. Please try again.");
      }
    });
  }

  return (
    <ActionFormContext.Provider value={{ pending, saved, error }}>
      <form id={id} onSubmit={handleSubmit} className={className}>
        {children}
      </form>
    </ActionFormContext.Provider>
  );
}

export function ActionFormError({ className }: { className?: string }) {
  const state = useContext(ActionFormContext);
  if (!state?.error) return null;
  return (
    <p role="alert" className={className ?? "text-sm font-medium text-red-700"}>
      {state.error}
    </p>
  );
}

export function ActionButton({
  pending: pendingProp,
  saved: savedProp,
  pendingLabel,
  savedLabel = "Saved",
  type = "submit",
  disabled,
  children,
  ...buttonProps
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  pending?: boolean;
  saved?: boolean;
  pendingLabel: string;
  savedLabel?: string;
  children: ReactNode;
}) {
  const formState = useContext(ActionFormContext);
  const { pending: formStatusPending } = useFormStatus();
  const pending = pendingProp ?? formState?.pending ?? formStatusPending;
  const saved = !pending && (savedProp ?? formState?.saved ?? false);

  // All three states are always rendered, stacked in one grid cell with
  // only the current one visible, so the button is always as wide as its
  // widest state and doesn't resize as the label changes. Same technique
  // as BOOK_LABELS (components/members/event-detail-view.tsx) and
  // StepStack (components/StableLayout.tsx). `invisible` (visibility:
  // hidden), not display: none, so the hidden states still take up space;
  // it also keeps them out of the button's accessible name and the
  // aria-live announcement.
  const cell = (active: boolean) => cn("[grid-area:1/1]", !active && "invisible");

  return (
    <button
      type={type}
      disabled={pending || disabled}
      aria-busy={pending || undefined}
      {...buttonProps}
    >
      {/* aria-live (not role="status", which would replace the button's
          accessible name) so screen readers hear "Saving…" / "Saved". */}
      <span aria-live="polite" className="inline-grid whitespace-nowrap">
        <span className={cell(!pending && !saved)}>{children}</span>
        <span className={cell(pending)}>
          <span className="inline-flex items-center justify-center gap-2">
            <span
              aria-hidden
              className={cn(
                "h-3.5 w-3.5 rounded-full border-2 border-current/30 border-t-current",
                pending && "animate-spin",
              )}
            />
            {pendingLabel}
          </span>
        </span>
        <span className={cell(saved)}>
          <span className="inline-flex items-center justify-center gap-1.5">
            <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />
            {savedLabel}
          </span>
        </span>
      </span>
    </button>
  );
}
