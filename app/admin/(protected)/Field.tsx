export function Field({
  label,
  value,
  href,
}: {
  label: string;
  value: string | null;
  href?: string;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-foreground/50">
        {label}
      </dt>
      <dd className="truncate text-sm text-foreground">
        {!value ? (
          <span className="text-foreground/40">—</span>
        ) : href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground"
          >
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
