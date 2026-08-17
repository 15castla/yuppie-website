import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import {
  approveApplication,
  rejectApplication,
} from "@/app/admin/applications-actions";

type Application = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  employer: string | null;
  role_title: string | null;
  linkedin_url: string | null;
  instagram_username: string | null;
};

function Field({
  label,
  value,
  href,
}: {
  label: string;
  value: string | null;
  href?: string;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-foreground/50">
        {label}
      </dt>
      <dd className="truncate text-sm text-foreground">
        {!value ? (
          <span className="text-foreground/40">—</span>
        ) : href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground"
          >
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

export default async function ApplicationsPage() {
  const adminClient = createAdminSupabaseClient();
  const { data } = await adminClient
    .from("applications")
    .select(
      "id, full_name, email, phone, employer, role_title, linkedin_url, instagram_username",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const pending = (data ?? []) as Application[];

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        Pending Applications
      </h1>

      {pending.length === 0 ? (
        <p className="rounded-2xl border border-foreground/10 bg-[#F5F3E7] p-8 text-center text-foreground/60">
          No pending applications.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {pending.map((application) => (
            <li
              key={application.id}
              className="flex flex-col gap-6 rounded-2xl border border-foreground/10 bg-[#F5F3E7] p-6 sm:flex-row sm:items-start sm:justify-between"
            >
              <dl className="grid flex-1 grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                <Field label="Name" value={application.full_name} />
                <Field label="Email" value={application.email} />
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
      )}
    </div>
  );
}
