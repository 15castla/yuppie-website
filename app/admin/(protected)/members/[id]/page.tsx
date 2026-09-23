import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import { Field } from "../../Field";
import { MembershipStatusBadge } from "../../MembershipStatusBadge";
import { DeleteMemberButton } from "./DeleteMemberButton";

type Member = {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  employer: string | null;
  role_title: string | null;
  bio: string | null;
  avatar_url: string | null;
  membership_status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
};

// The application that became this member, if one exists, matched by
// email since members and applications aren't linked by a foreign key
// (approve_application_and_create_member() only copies a handful of
// fields across; see supabase/migrations/20260906211410_...). Shown as a
// secondary card so admins can still see everything that was captured at
// application time (LinkedIn/Instagram in particular have no home on the
// members table at all).
type SourceApplication = {
  created_at: string;
  employer: string | null;
  role_title: string | null;
  linkedin_url: string | null;
  instagram_username: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
};

function formatFullDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const adminClient = createAdminSupabaseClient();
  const { data } = await adminClient
    .from("members")
    .select(
      "id, full_name, email, phone, employer, role_title, bio, avatar_url, membership_status, stripe_customer_id, stripe_subscription_id, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  const member = data as Member | null;

  if (!member) {
    notFound();
  }

  // Most recent application with this email. Covers the (rare) case of a
  // rejected-then-reapplied history, where an older application could
  // otherwise be picked up instead of the one that actually got approved.
  const { data: applicationData } = await adminClient
    .from("applications")
    .select("created_at, employer, role_title, linkedin_url, instagram_username, reviewed_at, reviewed_by")
    .eq("email", member.email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const application = applicationData as SourceApplication | null;

  const memberSince = formatFullDate(member.created_at);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/members"
        className="text-sm font-medium text-foreground/50 outline-none transition-colors hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline"
      >
        ← Back to Members
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {member.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={member.avatar_url}
              alt={member.full_name ?? member.email}
              className="h-14 w-14 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-foreground/10 text-lg font-semibold text-foreground/50">
              {(member.full_name ?? member.email).charAt(0).toUpperCase()}
            </div>
          )}
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {member.full_name || member.email}
          </h1>
        </div>
        <MembershipStatusBadge status={member.membership_status} />
      </div>

      <div className="rounded-2xl border border-foreground/10 bg-cream p-6 sm:p-8">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
          <Field label="Full name" value={member.full_name} />
          <Field label="Email" value={member.email} />
          <Field label="Phone" value={member.phone} />
          <Field label="Employer" value={member.employer} />
          <Field label="Role" value={member.role_title} />
          <Field label="Member since" value={memberSince} />
          <Field label="Stripe customer" value={member.stripe_customer_id} />
          <Field label="Stripe subscription" value={member.stripe_subscription_id} />
          <Field label="Member ID" value={member.id} />
        </dl>

        {member.bio && (
          <div className="mt-6 border-t border-foreground/10 pt-6">
            <dt className="text-xs font-semibold uppercase tracking-wider text-foreground/50">
              Bio
            </dt>
            <dd className="mt-2 text-sm text-foreground">{member.bio}</dd>
          </div>
        )}
      </div>

      {application && (
        <div className="rounded-2xl border border-foreground/10 bg-cream p-6 sm:p-8">
          <h2 className="text-base font-semibold text-foreground">From their application</h2>
          <p className="mt-1 text-xs text-foreground/50">
            Captured when they applied, so employer/role here may be out of
            date if they&apos;ve since updated their profile; the card above
            always reflects what&apos;s current.
          </p>
          <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
            <Field label="Submitted" value={formatFullDate(application.created_at)} />
            <Field
              label="Reviewed"
              value={application.reviewed_at ? formatFullDate(application.reviewed_at) : null}
            />
            <Field label="Employer at the time" value={application.employer} />
            <Field label="Role at the time" value={application.role_title} />
            <Field
              label="LinkedIn"
              value={application.linkedin_url}
              href={application.linkedin_url ?? undefined}
            />
            <Field
              label="Instagram"
              value={application.instagram_username}
              href={
                application.instagram_username
                  ? `https://instagram.com/${application.instagram_username.replace(/^@/, "")}`
                  : undefined
              }
            />
            <Field label="Reviewed by" value={application.reviewed_by} />
          </dl>
        </div>
      )}

      <div className="rounded-2xl border border-red-700/20 bg-cream p-6 sm:p-8">
        <h2 className="text-base font-semibold text-foreground">Danger zone</h2>
        <p className="mt-1 text-xs text-foreground/50">
          Permanently deletes this member&apos;s account.{" "}
          {member.stripe_subscription_id
            ? "Their Stripe subscription will be cancelled immediately as part of this."
            : "They have no Stripe subscription on file to cancel."}{" "}
          This cannot be undone.
        </p>
        <div className="mt-4">
          <DeleteMemberButton
            memberId={member.id}
            memberName={member.full_name || member.email}
            hasStripeSubscription={Boolean(member.stripe_subscription_id)}
          />
        </div>
      </div>
    </div>
  );
}
