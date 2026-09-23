import { createAdminSupabaseClient } from "@/app/admin/admin-client";

// Shared by every image-upload path in the app (admin event photos, admin
// partner logos, member self-service profile photos): one bucket
// ("member-media", created in the migration alongside partner_perks),
// split into folders per use. Always goes through the service-role client:
// there's no storage RLS write policy for any of these paths, by design
// (see the migration's comment). Every upload is server-side, gated by
// requireAdmin()/requireMember() in the caller, not by storage policy.
const BUCKET = "member-media";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function uploadMemberMedia(
  folder: "events" | "perks" | "avatars",
  filenameBase: string,
  file: File,
): Promise<{ url: string; error?: undefined } | { url?: undefined; error: string }> {
  if (!file || file.size === 0) {
    return { error: "Please choose an image to upload." };
  }

  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return { error: "Please upload a JPG, PNG, WebP or GIF image." };
  }

  if (file.size > MAX_BYTES) {
    return { error: "Image must be smaller than 5MB." };
  }

  // Timestamped filename (not just filenameBase.ext) so the public URL
  // changes on every upload. An unversioned/upsert path would keep
  // serving a browser-cached copy of the old image after a replace.
  const path = `${folder}/${filenameBase}-${Date.now()}.${ext}`;

  const adminClient = createAdminSupabaseClient();
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await adminClient.storage.from(BUCKET).upload(path, buffer, {
    contentType: file.type,
  });

  if (error) {
    console.error(`uploadMemberMedia failed for ${path}:`, error);
    return { error: "Something went wrong uploading the image." };
  }

  const { data } = adminClient.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl };
}
