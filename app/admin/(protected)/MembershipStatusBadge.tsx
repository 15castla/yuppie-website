const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  paused: "bg-amber-100 text-amber-800",
  cancelled: "bg-red-100 text-red-800",
};

export function MembershipStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
        STATUS_STYLES[status] ?? "bg-foreground/10 text-foreground/60"
      }`}
    >
      {status}
    </span>
  );
}
