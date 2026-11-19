import Link from "next/link";

import { requireDesk } from "@/app/admin/require-owner";
import { NewTargetForm } from "@/components/admin/desk/forms";
import { DeskShell, type SearchParams } from "@/components/admin/desk/shell";
import { loadMe } from "@/lib/server/outreach/team";

// New partner (17 Nov 2026): the business, and optionally its first contact. Its Relationship Manager is whoever adds
// it, unless they choose someone else (19 Nov 2026). The desk team only.
export default async function DeskNewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireDesk();
  const [sp, { team, me }] = await Promise.all([searchParams, loadMe(user.id)]);
  return (
    <DeskShell current={null} sp={sp}>
      <div style={{ marginTop: 16 }}>
        <p className="dk-crumb">
          <Link href="/admin/desk/partners">Partners</Link> /
        </p>
        <h2 className="dk-h1">New partner</h2>
        <p className="dk-sub">Only professional, public information, plus what they send us. No phone numbers.</p>
        <div style={{ marginTop: 18 }}>
          <NewTargetForm team={team} me={me.id} />
        </div>
      </div>
    </DeskShell>
  );
}
