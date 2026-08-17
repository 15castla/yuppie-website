import { requireAdmin } from "@/app/admin/require-admin";
import { signOut } from "@/app/admin/actions";
import { AdminNav } from "./AdminNav";

export default async function AdminProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdmin();

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-foreground/10 bg-[#F5F3E7]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <AdminNav />
          <div className="flex items-center gap-4">
            <span className="text-sm text-foreground/60">{user.email}</span>
            <form action={signOut}>
              <button
                type="submit"
                className="text-sm font-medium text-foreground/50 outline-none transition-colors hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline"
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
