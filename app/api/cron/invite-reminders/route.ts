import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import { sendReminderEmail } from "@/app/admin/send-reminder-email";
import { sendReminderSms } from "@/app/admin/send-reminder-sms";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type DueReminder = {
  email: string;
  invite_code: string;
  applications: {
    full_name: string | null;
    phone: string | null;
  };
};

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (
    !cronSecret ||
    request.headers.get("authorization") !== `Bearer ${cronSecret}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createAdminSupabaseClient();
  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data, error } = await adminClient
    .from("invited_emails")
    .select("email, invite_code, applications!inner(full_name, phone)")
    .eq("used", false)
    .is("reminder_sent_at", null)
    .lte("invited_at", sevenDaysAgo);

  if (error) {
    console.error("invite-reminders: failed to query invited_emails:", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  const dueReminders = (data ?? []) as unknown as DueReminder[];

  let processed = 0;

  for (const reminder of dueReminders) {
    try {
      await sendReminderEmail({
        to: reminder.email,
        fullName: reminder.applications.full_name,
        inviteCode: reminder.invite_code,
      });
    } catch (err) {
      console.error(
        `invite-reminders: sendReminderEmail failed for ${reminder.email}:`,
        err,
      );
    }

    if (reminder.applications.phone) {
      try {
        await sendReminderSms({
          to: reminder.applications.phone,
          inviteCode: reminder.invite_code,
        });
      } catch (err) {
        console.error(
          `invite-reminders: sendReminderSms failed for ${reminder.email}:`,
          err,
        );
      }
    }

    const { error: updateError } = await adminClient
      .from("invited_emails")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("email", reminder.email);

    if (updateError) {
      console.error(
        `invite-reminders: failed to set reminder_sent_at for ${reminder.email}:`,
        updateError,
      );
    } else {
      processed++;
    }
  }

  return NextResponse.json({ due: dueReminders.length, processed });
}
