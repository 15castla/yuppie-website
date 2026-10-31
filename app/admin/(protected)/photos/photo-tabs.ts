// The Photos page's tabs and row shape, shared by the server pages and the client list (no I/O).

export type PhotoTab = "check" | "done";

export function photoTab(value: string | null | undefined): PhotoTab {
  return value === "done" ? "done" : "check";
}

export function photoTabHref(tab: PhotoTab): string {
  return tab === "done" ? "/admin/photos?tab=done" : "/admin/photos";
}

export type PhotoPill = { label: "Reported" | "New" | "Changed" | "Kept" | "Removed"; kind: "ink" | "plain" | "muted" };

export type PhotoListRow = {
  photoId: string;
  name: string;
  pill: PhotoPill;
  ago: string;
  /** "Reported by Aisha: Photo isn’t them or isn’t suitable", "New photo, face found", "Changed photo, no face found". */
  line: string;
  photoUrl: string | null;
};
