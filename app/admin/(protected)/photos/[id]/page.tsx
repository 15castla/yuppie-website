import { requireAdmin } from "@/app/admin/require-admin";
import { PhotoCard } from "../PhotoCard";

export default async function PhotoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string }> }) {
  // Every admin page and layout checks for itself (aal2): a soft navigation or router refresh can skip the
  // layouts above it (QA2-01).
  await requireAdmin();
  const [{ id }, { done }] = await Promise.all([params, searchParams]);
  return <PhotoCard photoId={id} done={done ?? null} />;
}
