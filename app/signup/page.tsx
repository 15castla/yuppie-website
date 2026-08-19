import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import { Button } from "@/components/Button";
import { confirmInvite } from "./actions";

function StatusPage({
  heading,
  message,
}: {
  heading: string;
  message: string;
}) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 bg-background px-6 py-24 text-center text-foreground">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        {heading}
      </h1>
      <p className="max-w-md text-base text-foreground/70">{message}</p>
    </main>
  );
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;

  if (!code) {
    return (
      <StatusPage
        heading="Invite link issue"
        message="This invite link is missing a code."
      />
    );
  }

  const adminClient = createAdminSupabaseClient();
  const { data: invite } = await adminClient
    .from("invited_emails")
    .select("email, used, expires_at")
    .eq("invite_code", code)
    .maybeSingle();

  if (!invite) {
    return (
      <StatusPage
        heading="Invite link issue"
        message="This invite link isn't valid."
      />
    );
  }

  if (invite.used) {
    return (
      <StatusPage
        heading="Welcome to Yuppie!"
        message={`Your invite for ${invite.email} is confirmed. Account setup is coming soon — we'll be in touch.`}
      />
    );
  }

  if (new Date(invite.expires_at) < new Date()) {
    return (
      <StatusPage
        heading="Invite link issue"
        message="This invite link has expired. Get in touch and we'll send you a new one."
      />
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-background px-6 py-16 text-foreground">
      <div className="w-full max-w-sm rounded-3xl border border-foreground/10 bg-[#F5F3E7] p-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Welcome to Yuppie!
        </h1>
        <p className="mt-2 text-sm text-foreground/60">
          Confirm your invite for {invite.email} to get started.
        </p>

        <form action={confirmInvite} className="mt-8">
          <input type="hidden" name="code" value={code} />
          <Button type="submit" className="w-full">
            Confirm invite
          </Button>
        </form>
      </div>
    </main>
  );
}
