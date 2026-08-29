import Image from "next/image";

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

function TagIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 11.5V5a2 2 0 0 1 2-2h6.5L21 11.5 12.5 20 3 11.5Z" />
      <circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

// A realistic iPhone chassis: thick rounded bezel, a floating Dynamic-Island
// pill overlaid on the screen (not cut into the top edge), and protruding
// side buttons (silent switch + volume rocker on the left, power button on
// the right) — distinguished from the bezel by a lighter shade, the way a
// real phone's anodized edge catches light differently from its buttons.
export function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative h-full w-full rounded-[2.75rem] bg-[#1B1512] p-[3px] shadow-2xl"
      style={{ aspectRatio: "9 / 19.5" }}
    >
      {/* Silent switch */}
      <div className="absolute -left-[3px] top-[17%] h-6 w-[3px] rounded-l-sm bg-[#2A2420]" />
      {/* Volume up / down */}
      <div className="absolute -left-[3px] top-[27%] h-10 w-[3px] rounded-l-sm bg-[#2A2420]" />
      <div className="absolute -left-[3px] top-[39%] h-10 w-[3px] rounded-l-sm bg-[#2A2420]" />
      {/* Power button */}
      <div className="absolute -right-[3px] top-[24%] h-14 w-[3px] rounded-r-sm bg-[#2A2420]" />

      <div className="relative h-full w-full overflow-hidden rounded-[2.5rem] border border-black/40 bg-[#F5F3E7]">
        <div className="flex h-full w-full flex-col">{children}</div>
        <div className="pointer-events-none absolute left-1/2 top-2 z-10 h-6 w-24 -translate-x-1/2 rounded-full bg-[#1B1512]" />
      </div>
    </div>
  );
}

export function HomeScreenMockup() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-[#FFD904] px-6 text-center">
      <Image
        src="/yuppie_logo_forte_forward.png"
        alt="Yuppie"
        width={1471}
        height={507}
        className="h-auto w-[65%]"
      />
      <p className="text-[10px] font-medium text-[#1B1512]/70">
        Your Social Life, Curated
      </p>
      <div className="mt-2 rounded-full bg-[#1B1512] px-5 py-2 text-[10px] font-bold text-[#FFD904]">
        Apply
      </div>
    </div>
  );
}

export function EventsScreenMockup() {
  return (
    <div className="flex h-full w-full flex-col gap-3 bg-[#F5F3E7] p-4 pt-9">
      <div className="flex items-center gap-2">
        <CalendarIcon className="h-4 w-4 text-[#1B1512]" />
        <p className="text-xs font-bold uppercase tracking-wider text-[#1B1512]">
          Events
        </p>
      </div>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex flex-col gap-2 rounded-xl border border-[#1B1512]/10 bg-white p-2"
        >
          <div className="h-12 w-full rounded-lg bg-[#FFD904]" />
          <div className="h-1.5 w-3/4 rounded-full bg-[#1B1512]/70" />
          <div className="h-1.5 w-1/2 rounded-full bg-[#1B1512]/30" />
        </div>
      ))}
    </div>
  );
}

export function MembershipScreenMockup() {
  return (
    <div className="flex h-full w-full flex-col gap-3 bg-[#F5F3E7] p-4 pt-9">
      <p className="text-xs font-bold uppercase tracking-wider text-[#1B1512]">
        Membership
      </p>

      <div className="flex flex-col gap-2 rounded-xl bg-[#1B1512] p-3">
        <div className="h-1.5 w-1/2 rounded-full bg-[#FFD904]" />
        <div className="h-1.5 w-1/3 rounded-full bg-[#FFD904]/50" />
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-[#1B1512]/10 bg-white p-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#FFD904]">
          <TagIcon className="h-3.5 w-3.5 text-[#1B1512]" />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="h-1.5 w-3/4 rounded-full bg-[#1B1512]/70" />
          <div className="h-1.5 w-1/2 rounded-full bg-[#1B1512]/30" />
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-[#1B1512]/10 bg-white p-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#FFD904]">
          <LockIcon className="h-3.5 w-3.5 text-[#1B1512]" />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="h-1.5 w-2/3 rounded-full bg-[#1B1512]/70" />
          <div className="h-1.5 w-2/5 rounded-full bg-[#1B1512]/30" />
        </div>
      </div>
    </div>
  );
}
