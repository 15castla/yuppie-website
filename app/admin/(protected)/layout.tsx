import Image from "next/image";
import Link from "next/link";

import { requireAdmin } from "@/app/admin/require-admin";
import { AdminNav } from "./AdminNav";
import { AdminUserMenu } from "./AdminUserMenu";

export default async function AdminProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdmin();

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/* Same brand yellow as the rest of the page, not a separate cream
          bar: a full-width block of the paler cream read as a flat grey
          box against the yellow everywhere else. The nav pill below carries
          the cream instead, echoing the same yellow-page/cream-pill
          pairing used by the member bottom tab bar (members-nav.tsx). The
          hairline shadow (rather than a border) gives it just enough
          separation from scrolled content without reintroducing a box. */}
      <header className="sticky top-0 z-30 bg-background shadow-[0_1px_0_rgba(27,21,18,0.08)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-3.5">
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
          <AdminNav trailing={<AdminUserMenu email={user.email ?? "?"} />} />
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-12">{children}</div>
    </div>
  );
}
