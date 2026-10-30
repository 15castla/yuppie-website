import { requireAdmin } from "@/app/admin/require-admin";
import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import { AdminBar } from "@/components/admin/admin-bar";

// The console's shell (r2b 12): the black ADMIN band with who is logged in, the yellow bar with the wordmark,
// the nav (with the number of applications waiting) and Account. Each page draws its own <main>, so a loading
// page can mark it aria-busy (B-D6). requireAdmin() enforces aal2 (password plus the authenticator code).
export default async function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  const { count } = await createAdminSupabaseClient()
    .from("applications")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");

  return (
    <>
      <AdminBar email={user.email ?? ""} counts={{ applications: count ?? 0 }} />
      {children}
    </>
  );
}
