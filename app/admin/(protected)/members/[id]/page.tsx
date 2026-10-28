import { requireAdmin } from "@/app/admin/require-admin";
import { MemberCard } from "../MemberCard";

export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  // Every admin page and layout checks for itself (aal2): a soft navigation or router refresh can skip the
  // layouts above it (QA2-01).
  await requireAdmin();
  const { id } = await params;
  return <MemberCard memberId={id} />;
}
