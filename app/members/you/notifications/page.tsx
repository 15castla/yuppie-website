import { NotificationSettingsView } from "@/components/members/notifications/notification-settings-view";
import { requireFlag } from "@/lib/members/flags";
import { detectShellMode } from "@/lib/members/shell-mode";
import { getNotificationPreferences } from "@/lib/server/notification-prefs";
import { requireMember } from "../../require-member";

// You > Notifications, real switches (lib/server/notification-prefs.ts; saving is ./actions.ts). Push is stored
// and never sent in stage 2: pushPermission reads "unavailable" (the view's "App only" row) until
// MEMBERS_PUSH_LIVE=on; hiding the Push row entirely is the screen's (getNotificationSettings().pushChannel).
export default async function NotificationSettingsPage() {
  requireFlag("notifications");
  const member = await requireMember();
  const mode = await detectShellMode();
  const preferences = await getNotificationPreferences(member, mode);
  return <NotificationSettingsView preferences={preferences} />;
}
