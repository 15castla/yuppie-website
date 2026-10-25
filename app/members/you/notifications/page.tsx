import { NotificationSettingsView } from "@/components/members/notifications/notification-settings-view";
import { requireFlag } from "@/lib/members/flags";
import { assertMockAllowed } from "@/lib/members/mock/guard";
import { getNotificationPreferences } from "@/lib/members/mock/messages";
import { detectShellMode } from "@/lib/members/shell-mode";
import { requireMember } from "../../require-member";

// Notification settings. Switched off (flag `notifications`) and running on the
// example-data adapter until the backend exists.
export default async function NotificationSettingsPage() {
  requireFlag("notifications");
  assertMockAllowed();
  await requireMember();
  const mode = await detectShellMode();
  const preferences = await getNotificationPreferences(mode);
  return <NotificationSettingsView preferences={preferences} />;
}
