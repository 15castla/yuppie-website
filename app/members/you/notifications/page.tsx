import { NotificationSettingsView } from "@/components/members/notifications/notification-settings-view";
import { openInviteOn, requireFlag } from "@/lib/members/flags";
import { ROUTES } from "@/lib/members/routes";
import { detectShellMode } from "@/lib/members/shell-mode";
import { pushLive } from "@/lib/server/config";
import { getNotificationPreferences } from "@/lib/server/notification-prefs";
import { requireMember } from "../../require-member";
import { setNotificationChannel, setNotificationTopic } from "./actions";

// You > Notifications, real switches (lib/server/notification-prefs.ts; saving is ./actions.ts, each switch at once).
// Push is not in stage 2: the Push row is not drawn until MEMBERS_PUSH_LIVE=on (pushLive()). The number step is
// not designed, so "Add a number" and "Change number" open Edit details, where the phone number is edited. In the
// app while Open Invite is hidden there (openInviteOn), its two switches are not drawn either (QR-04).
export default async function NotificationSettingsPage() {
  requireFlag("notifications");
  const member = await requireMember();
  const mode = await detectShellMode();
  const preferences = await getNotificationPreferences(member, mode);
  return (
    <NotificationSettingsView
      preferences={preferences}
      pushChannel={pushLive()}
      openInvite={openInviteOn(mode)}
      saveTopic={setNotificationTopic}
      saveChannel={setNotificationChannel}
      numberHref={ROUTES.profileEdit}
    />
  );
}
