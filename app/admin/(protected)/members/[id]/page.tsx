import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import { Field } from "../../Field";
import { MembershipStatusBadge } from "../../MembershipStatusBadge";

type Member = {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  bio: string | null;
  avatar_url: string | null;
  membership_status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
};

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
      "id, full_name, email, phone, bio, avatar_url, membership_status, stripe_customer_id, stripe_subscription_id, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  const member = data as Member | null;

  if (!member) {
    notFound();
  }

  const memberSince = new Date(member.created_at).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex flex-col gap-8">
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

      <div className="rounded-2xl border border-foreground/10 bg-[#F5F3E7] p-6 sm:p-8">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
          <Field label="Full name" value={member.full_name} />
          <Field label="Email" value={member.email} />
          <Field label="Phone" value={member.phone} />
          <Field label="Member since" value={memberSince} />
          <Field label="Stripe customer" value={member.stripe_customer_id} />
          <Field
            label="Stripe subscription"
            value={member.stripe_subscription_id}
          />
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
    </div>
  );
}
