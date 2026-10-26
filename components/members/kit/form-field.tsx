// Kit counterpart: .field and .input. A label (14px/700), a 50px input with a
// 1.5px ink border and cream fill, 16px text so iOS never zooms on focus, and
// one 13px help or error line. Errors say what happened, then what to do, and
// are announced (aria-live polite). The input and its message are linked with
// aria-describedby.

import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type FieldChrome = {
  label: ReactNode;
  help?: ReactNode;
  error?: ReactNode;
  className?: string;
};

function describedBy(id: string, help: ReactNode, error: ReactNode) {
  return [error ? `${id}-error` : null, help ? `${id}-help` : null].filter(Boolean).join(" ") || undefined;
}

export function FormField({
  label,
  help,
  error,
  className,
  ...input
}: FieldChrome & Omit<InputHTMLAttributes<HTMLInputElement>, "className">) {
  const autoId = useId();
  const id = input.id ?? autoId;
  return (
    <div className={cn("mk-field", className)}>
      <label htmlFor={id}>{label}</label>
      <input
        {...input}
        id={id}
        className={cn("mk-input", Boolean(error) && "mk-invalid")}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, help, error)}
      />
      {help ? (
        <p className="mk-help" id={`${id}-help`}>
          {help}
        </p>
      ) : null}
      <p className="mk-error-text" id={`${id}-error`} aria-live="polite">
        {error}
      </p>
    </div>
  );
}

export function FormTextarea({
  label,
  help,
  error,
  className,
  ...input
}: FieldChrome & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className">) {
  const autoId = useId();
  const id = input.id ?? autoId;
  return (
    <div className={cn("mk-field", className)}>
      <label htmlFor={id}>{label}</label>
      <textarea
        {...input}
        id={id}
        className={cn("mk-input", Boolean(error) && "mk-invalid")}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, help, error)}
      />
      {help ? (
        <p className="mk-help" id={`${id}-help`}>
          {help}
        </p>
      ) : null}
      <p className="mk-error-text" id={`${id}-error`} aria-live="polite">
        {error}
      </p>
    </div>
  );
}
