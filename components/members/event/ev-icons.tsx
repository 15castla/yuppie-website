// Two icons the kit lacks, drawn exactly as the design adds them (pages_r2a.py ICONS.update, lucide, stroke 2).
// Kept here rather than in the shared kit/icons.tsx so this area changes nothing it does not own.

export function EvIcon({ name, size = 22 }: { name: "calendar-plus" | "calendar-x"; size?: number }) {
  return (
    <svg className="mk-ico" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      {name === "calendar-plus" ? (
        <>
          <path d="M21 13V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8" />
          <path d="M3 10h18" />
          <path d="M16 19h6" />
          <path d="M19 16v6" />
        </>
      ) : (
        <>
          <path d="M21 13V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7.5" />
          <path d="M3 10h18" />
          <path d="m17 17 4 4" />
          <path d="m21 17-4 4" />
        </>
      )}
    </svg>
  );
}
