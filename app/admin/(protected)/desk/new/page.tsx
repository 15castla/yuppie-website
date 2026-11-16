import Link from "next/link";

import { requireOwner } from "@/app/admin/require-owner";
import { NewTargetForm } from "@/components/admin/desk/forms";
import { DeskShell, type SearchParams } from "@/components/admin/desk/shell";

// New partner (17 Nov 2026): the business, and optionally its first contact. Owner only.
export default async function DeskNewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireOwner();
  const sp = await searchParams;
  return (
    <DeskShell current={null} sp={sp}>
      <div style={{ marginTop: 16 }}>
        <p className="dk-crumb">
          <Link href="/admin/desk/partners">Partners</Link> /
        </p>
        <h2 className="dk-h1">New partner</h2>
        <p className="dk-sub">Only professional, public information, plus what they send us. No phone numbers.</p>
        <div style={{ marginTop: 18 }}>
          <NewTargetForm />
        </div>
      </div>
    </DeskShell>
  );
}
