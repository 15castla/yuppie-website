import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import {
  approveApplication,
  rejectApplication,
} from "@/app/admin/applications-actions";
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
  payment_error: string | null;
};

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function ApplicationsPage() {
  const adminClient = createAdminSupabaseClient();

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        Applications
      </h1>

      <PendingReview adminClient={adminClient} />
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
      "id, full_name, email, created_at, phone, employer, role_title, linkedin_url, instagram_username, payment_error",
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
          <div className="flex-1">
            {application.payment_error && (
              <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                {application.payment_error}
              </p>
            )}
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
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
          </div>

          <div className="flex shrink-0 gap-3 sm:flex-col">
            <form action={approveApplication} className="flex-1">
              <input type="hidden" name="id" value={application.id} />
              <button
                type="submit"
                className="w-full rounded-full bg-foreground px-6 py-2.5 text-sm font-bold text-background transition-all duration-200 ease-out hover:scale-[1.03] hover:bg-[#2A2420] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
              >
                {application.payment_error ? "Retry payment & approve" : "Approve"}
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
