import Link from "next/link";

import { requireAdmin } from "@/app/admin/require-admin";
import { AdminMain, PageHead } from "@/components/admin/ui";

// Where an admin lands on a page that isn't theirs, such as the owner's Outreach Desk (Albert, 15 Nov 2026: "a page
// that says something along the lines of 'you do not have the appropriate access'").
export default async function NoAccessPage() {
  await requireAdmin();
  return (
    <AdminMain>
      <PageHead title="You don't have access to this page." lead="If you think you should, ask Albert." />
      <p style={{ marginTop: 24 }}>
        <Link className="ad-link" href="/admin">
          Back to the dashboard
        </Link>
      </p>
    </AdminMain>
  );
}
