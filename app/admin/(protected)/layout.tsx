import Image from "next/image";
import Link from "next/link";

import { requireAdmin } from "@/app/admin/require-admin";
import { signOut } from "@/app/admin/actions";
import { AdminNav } from "./AdminNav";

// Short initials for the header avatar — no separators in the local part
// ("albertjcastle") just takes the first two letters; a dotted/underscored
// one ("albert.castle") takes the first letter of each of the first two
// segments instead, so it reads more like a real set of initials.
function initialsFromEmail(email: string) {
  const local = email.split("@")[0] ?? email;
  const segments = local.split(/[._-]+/).filter(Boolean);
  const first = segments[0]?.[0] ?? local[0] ?? "?";
  const second = segments.length > 1 ? segments[1][0] : (local[1] ?? "");
  return `${first}${second}`.toUpperCase();
}

export default async function AdminProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdmin();

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/* Same brand yellow as the rest of the page, not a separate cream
          bar — a full-width block of the paler cream read as a flat grey
          box against the yellow everywhere else. The nav pill below carries
          the cream instead, echoing the same yellow-page/cream-pill
          pairing used by the member bottom tab bar (members-nav.tsx). The
          hairline shadow (rather than a border) gives it just enough
          separation from scrolled content without reintroducing a box. */}
      <header className="sticky top-0 z-30 bg-background shadow-[0_1px_0_rgba(27,21,18,0.08)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-3.5">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link href="/admin" className="shrink-0">
              <Image
                src="/yuppie_logo_forte_forward.png"
                alt="Yuppie"
                width={1942}
                height={641}
                priority
                className="h-6 w-auto sm:h-7"
              />
            </Link>
            <AdminNav />
          </div>
          <div className="flex items-center gap-3">
            {/* Initials avatar instead of spelling out the email inline —
                tidier next to the nav, with the full address still just a
                hover away. */}
            <div
              title={user.email}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background"
            >
              {initialsFromEmail(user.email ?? "?")}
            </div>
            <form action={signOut}>
              <button
                type="submit"
                className="text-sm font-medium text-foreground/60 outline-none transition-colors hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-12">{children}</div>
    </div>
  );
}
