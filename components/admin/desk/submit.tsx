"use client";

// A desk form's submit button that shows the click was taken (Albert, 16 Nov 2026: "The import button doesn't do
// anything to show if the click is loading and is fairly delayed"). While the form's action runs, every button in
// that form is disabled (so nothing is sent twice) and the one pressed says what is happening ("Importing…"), as the
// rest of the admin does: aria-busy, no spinner.

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useFormStatus } from "react-dom";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "value" | "children"> & {
  /** What the button says while its form is being sent, such as "Saving…". */
  busy: string;
  value?: string;
  children: ReactNode;
};

export function DeskSubmit({ busy, children, name, value, disabled, ...rest }: Props) {
  const { pending, data } = useFormStatus();
  // a form with two buttons (Done and Drop) marks only the one pressed
  const pressed = pending && (!name || data?.get(name) === value);
  return (
    <button {...rest} type="submit" name={name} value={value} disabled={disabled || pending} aria-busy={pressed || undefined}>
      {pressed ? busy : children}
    </button>
  );
}

/** A line that shows only while its form is being sent, for an action that can take a while. */
export function WhileSending({ children, className }: { children: ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  if (!pending) return null;
  return (
    <p className={className} role="status">
      {children}
    </p>
  );
}
