import Link from "next/link";
import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import {
  approveApplication,
  rejectApplication,
} from "@/app/admin/applications-actions";
import { APPLICATION_TAB_LABELS } from "@/app/admin/application-tab-labels";
import { Field } from "../Field";

type Application = {
  id: string;
  full_name: string;
  email: string;
  created_at: string;
  phone: string | null;
  employer: string | null;
  role_title: string | null;
  linkedin_url: string | null;
  instagram_username: string | null;
};

type AwaitingConfirmation = {
  invited_at: string;
  expires_at: string;
  applications: {
    full_name: string;
    email: string;
    reviewed_at: string | null;
  };
};

const tabClasses = (active: boolean) =>
  active
    ? "rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background outline-none transition-colors focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    : "rounded-full px-4 py-2 text-sm font-semibold text-foreground/50 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function getNow() {
  return Date.now();
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const activeTab = tab === "awaiting" ? "awaiting" : "pending";

  const adminClient = createAdminSupabaseClient();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Applications
        </h1>

        <div className="mt-6 flex gap-2">
          <Link
            href="/admin/applications?tab=pending"
            className={tabClasses(activeTab === "pending")}
          >
            {APPLICATION_TAB_LABELS.pending}
          </Link>
          <Link
            href="/admin/applications?tab=awaiting"
            className={tabClasses(activeTab === "awaiting")}
          >
            {APPLICATION_TAB_LABELS.awaiting}
          </Link>
        </div>
      </div>

      {activeTab === "pending" ? (
        <PendingReview adminClient={adminClient} />
      ) : (
        <AwaitingConfirmationList adminClient={adminClient} />
      )}
    </div>
  );
}

async function PendingReview({
  adminClient,
}: {
  adminClient: ReturnType<typeof createAdminSupabaseClient>;
}) {
  const { data } = await adminClient
    .from("applications")
    .select(
      "id, full_name, email, created_at, phone, employer, role_title, linkedin_url, instagram_username",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const pending = (data ?? []) as Application[];

  if (pending.length === 0) {
    return (
      <p className="rounded-2xl border border-foreground/10 bg-[#F5F3E7] p-8 text-center text-foreground/60">
        No pending applications.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {pending.map((application) => (
        <li
          key={application.id}
          className="flex flex-col gap-6 rounded-2xl border border-foreground/10 bg-[#F5F3E7] p-6 sm:flex-row sm:items-start sm:justify-between"
        >
          <dl className="grid flex-1 grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            <Field label="Name" value={application.full_name} />
            <Field label="Email" value={application.email} />
            <Field
              label="Submitted"
              value={formatShortDate(application.created_at)}
            />
            <Field label="Phone" value={application.phone} />
            <Field label="Employer" value={application.employer} />
            <Field label="Role" value={application.role_title} />
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
          </dl>

          <div className="flex shrink-0 gap-3 sm:flex-col">
            <form action={approveApplication} className="flex-1">
              <input type="hidden" name="id" value={application.id} />
              <button
                type="submit"
                className="w-full rounded-full bg-foreground px-6 py-2.5 text-sm font-bold text-background transition-colors hover:bg-[#2A2420]"
              >
                Approve
              </button>
            </form>
            <form action={rejectApplication} className="flex-1">
              <input type="hidden" name="id" value={application.id} />
              <button
                type="submit"
                className="w-full rounded-full border-2 border-foreground/30 px-6 py-2.5 text-sm font-bold text-foreground transition-colors hover:border-foreground hover:bg-foreground/5"
              >
                Reject
              </button>
            </form>
          </div>
        </li>
      ))}
    </ul>
  );
}

async function AwaitingConfirmationList({
  adminClient,
}: {
  adminClient: ReturnType<typeof createAdminSupabaseClient>;
}) {
  const { data } = await adminClient
    .from("invited_emails")
    .select(
      "invited_at, expires_at, applications!inner(full_name, email, reviewed_at)",
    )
    .eq("used", false)
    .eq("applications.status", "approved")
    .order("expires_at", { ascending: true });

  const awaiting = (data ?? []) as unknown as AwaitingConfirmation[];

  if (awaiting.length === 0) {
    return (
      <p className="rounded-2xl border border-foreground/10 bg-[#F5F3E7] p-8 text-center text-foreground/60">
        No approved applications are awaiting confirmation.
      </p>
    );
  }

  const now = getNow();

  return (
    <ul className="flex flex-col gap-4">
      {awaiting.map((invite) => {
        const isExpired = new Date(invite.expires_at).getTime() < now;

        return (
          <li
            key={`${invite.applications.email}-${invite.invited_at}`}
            className="rounded-2xl border border-foreground/10 bg-[#F5F3E7] p-6"
          >
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-5">
              <Field label="Name" value={invite.applications.full_name} />
              <Field label="Email" value={invite.applications.email} />
              <Field
                label="Approved"
                value={
                  invite.applications.reviewed_at
                    ? formatShortDate(invite.applications.reviewed_at)
                    : null
                }
              />
              <Field label="Invited" value={formatDate(invite.invited_at)} />
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-foreground/50">
                  Expires
                </dt>
                <dd
                  className={
                    isExpired
                      ? "text-sm font-semibold text-red-700"
                      : "text-sm text-foreground"
                  }
                >
                  {formatDate(invite.expires_at)}
                  {isExpired && " — expired"}
                </dd>
              </div>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
