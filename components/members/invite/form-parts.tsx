// The small controls of the post form: a label with its counter, a field error,
// and the tick box. Shared by the form and by the cost block. Kit counterparts:
// pages_oi.lab(), ferr() and check_row(). Real inputs with labels; errors are
// announced with role="alert".

import "./invite.css";

import { Icon } from "@/components/members/kit";
import { cn } from "@/lib/utils";

export function Lab({
  htmlFor,
  text,
  count,
  near = false,
  optional = false,
}: {
  htmlFor?: string;
  text: string;
  count?: string;
  near?: boolean;
  optional?: boolean;
}) {
  return (
    <div className="oi-lab">
      <label htmlFor={htmlFor}>
        {text}
        {optional ? (
          <>
            {" "}
            <span className="opt">optional</span>
          </>
        ) : null}
      </label>
      {count ? <span className={cn("cnt", near && "is-near")}>{count}</span> : null}
    </div>
  );
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <div className="oi-fe" id={id} role="alert">
      <Icon name="circle-alert" size={16} />
      <span>{message}</span>
    </div>
  );
}

export function CheckRow({
  id,
  checked,
  onChange,
  label,
  sub,
  disabled,
  error = false,
  describedBy,
}: {
  id?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  sub?: string;
  disabled?: boolean;
  error?: boolean;
  describedBy?: string;
}) {
  return (
    <label className={cn("oi-check", checked && "is-on", error && "is-error")}>
      <input
        id={id}
        type="checkbox"
        className="mk-sr"
        checked={checked}
        disabled={disabled}
        aria-invalid={error || undefined}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="bx" aria-hidden="true">
        {checked ? <Icon name="check" size={18} /> : null}
      </span>
      <span className="tx">
        <b>{label}</b>
        {sub ? <span>{sub}</span> : null}
      </span>
    </label>
  );
}
