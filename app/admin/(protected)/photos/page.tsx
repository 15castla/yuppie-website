import { requireAdmin } from "@/app/admin/require-admin";
import { photoTab } from "./photo-tabs";
import { PhotoCard } from "./PhotoCard";
import { photoQueues } from "./photos-data";

// /admin/photos: the first photo in the tab shows beside the list (below it on a phone, B-D22 A).
export default async function PhotosIndexPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  // Every admin page and layout checks for itself (aal2): a soft navigation or router refresh can skip the
  // layouts above it (QA2-01).
  await requireAdmin();
  const tab = photoTab((await searchParams).tab);
  const q = await photoQueues();
  const first = (tab === "done" ? q.done : q.check)[0];
  if (!first) return null;
  return <PhotoCard photoId={first.photoId} />;
}
