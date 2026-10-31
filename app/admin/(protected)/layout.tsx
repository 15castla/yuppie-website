import { requireAdmin } from "@/app/admin/require-admin";
import { queueCounts } from "@/app/admin/queue-counts";
import { AdminBar } from "@/components/admin/admin-bar";

// The console's shell (r2b 12): the black ADMIN band with who is logged in, the yellow bar with the wordmark,
// the nav (with the number waiting beside Applications, Reports and Photos) and Account. Each page draws its own
// <main>, so a loading page can mark it aria-busy (B-D6). requireAdmin() enforces aal2 (password plus the
// authenticator code).
export default async function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  const counts = await queueCounts();

  return (
    <>
      <AdminBar email={user.email ?? ""} counts={{ applications: counts.applications, reports: counts.reports, photos: counts.photos }} />
      {children}
    </>
  );
}
