import { requireAdmin } from "@/app/admin/require-admin";
import { ApplicationCard } from "../ApplicationCard";

export default async function ApplicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  // Every admin page and layout checks for itself (aal2): a soft navigation or router refresh can skip the
  // layouts above it (QA2-01).
  await requireAdmin();
  const { id } = await params;
  const { done } = await searchParams;
  return <ApplicationCard applicationId={id} done={done ?? null} />;
}
