import { requireAdmin } from "@/app/admin/require-admin";
import Link from "next/link";

import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import { EmptyCard } from "@/components/admin/empty-card";
import { dateParts, dayDate, namesList, time24, waitedWords } from "@/components/admin/format";
import { AdminMain, DateCol, PageHead, Pill } from "@/components/admin/ui";
import { Icon } from "@/components/admin/icons";

// Dashboard (r2b 14): what needs you today. Applications waiting and payment problems (the applications whose
// card failed or whose account is half made) are the queues Phase A has; Reports, Photos and Payments are
// Phase B (B-D22) and join this card then. Under it, the next three events and the old counts as links.

type PendingRow = { id: string; full_name: string | null; email: string; created_at: string; payment_error: string | null };
type EventRow = { id: string; title: string; start_time: string; location: string | null; capacity: number | null };

export default async function AdminDashboardPage() {
  // Every admin page and layout checks for itself (aal2): a soft navigation or router refresh can skip the
  // layouts above it (QA2-01).
  await requireAdmin();
  const db = createAdminSupabaseClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString();

  const [pending, events, members, cancelled, lapsedCancel, lapsedGrace, allApps, weekApps] = await Promise.all([
    db.from("applications").select("id, full_name, email, created_at, payment_error").eq("status", "pending").order("created_at", { ascending: true }),
    db.from("events").select("id, title, start_time, location, capacity").is("cancelled_at", null).gte("start_time", nowIso).order("start_time", { ascending: true }).limit(3),
    db.from("members").select("*", { count: "exact", head: true }).is("deleted_at", null),
    db.from("members").select("*", { count: "exact", head: true }).eq("membership_status", "cancelled").is("deleted_at", null),
    db.from("members").select("*", { count: "exact", head: true }).eq("membership_status", "active").lt("cancel_at", nowIso),
    db.from("members").select("*", { count: "exact", head: true }).eq("membership_status", "active").is("cancel_at", null).not("payment_failed_at", "is", null).lt("grace_until", nowIso),
    db.from("applications").select("*", { count: "exact", head: true }),
    db.from("applications").select("*", { count: "exact", head: true }).gte("created_at", weekAgo),
  ]);

  const failed = [pending, events, members, cancelled, allApps].some((r) => r.error);
  if (failed) {
    return (
      <AdminMain>
        <PageHead title="Dashboard" />
        <div style={{ marginTop: 24 }}>
          <div className="ad-banner" role="alert">
            <Icon name="circle-alert" size={20} />
            <div>
              <b>We couldn’t load the numbers.</b>
              <p>Refresh the page to try again.</p>
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <a className="ad-btn sm secondary" href="/admin">
              Refresh
            </a>
          </div>
        </div>
      </AdminMain>
    );
  }

  const waiting = (pending.data ?? []) as PendingRow[];
  const problems = waiting.filter((a) => a.payment_error);
  const upcoming = (events.data ?? []) as EventRow[];
  const bookedCounts = await Promise.all(
    upcoming.map(async (e) => {
      const { count } = await db.from("bookings").select("*", { count: "exact", head: true }).eq("event_id", e.id).eq("status", "confirmed");
      return count ?? 0;
    }),
  );
  const nameOf = (a: PendingRow) => a.full_name?.trim() || a.email;
  const today = dayDate(now);

  type Need = { key: string; num: number; head: string; sub: string; label: string; href: string; oldest: string };
  const needs: Need[] = [];
  if (waiting.length) {
    needs.push({
      key: "applications",
      num: waiting.length,
      head: "Applications waiting",
      sub: `Oldest: ${nameOf(waiting[0])}, ${waitedWords(waiting[0].created_at, now)}`,
      label: "Review applications",
      href: `/admin/applications/${waiting[0].id}`,
      oldest: waiting[0].created_at,
    });
  }
  if (problems.length) {
    needs.push({
      key: "payments",
      num: problems.length,
      head: "Payment problems",
      sub: namesList(problems.map(nameOf)),
      label: "See them",
      href: `/admin/applications/${problems[0].id}`,
      oldest: problems[0].created_at,
    });
  }
  const oldestKey = needs.reduce<Need | null>((best, n) => (!best || n.oldest < best.oldest ? n : best), null)?.key;

  const lapsed = (cancelled.count ?? 0) + (lapsedCancel.count ?? 0) + (lapsedGrace.count ?? 0);
  const glance: [string, number, string][] = [
    ["Members", members.count ?? 0, "/admin/members"],
    ["Cancelled or lapsed", lapsed, "/admin/members?status=cancelled"],
    ["Waiting for review", waiting.length, "/admin/applications"],
    ["Applications, all time", allApps.count ?? 0, "/admin/applications?tab=all"],
    ["Applications this week", weekApps.count ?? 0, "/admin/applications"],
  ];

  return (
    <AdminMain>
      <PageHead title="Dashboard" />
      <div style={{ marginTop: 28 }}>
        {needs.length === 0 ? (
          <EmptyCard
            a="All"
            b="clear."
            when={today}
            line="Nothing needs you today."
            sub="New applications and payment problems show up here."
            art="coupes"
          />
        ) : (
          <div className="ad-card">
            <div className="ad-cardhead">
              <h2 className="ad-h2lg">
                Needs you <span className="ad-serif">today</span>
              </h2>
              <span className="when">{today}</span>
            </div>
            {needs.map((n) => (
              <div className="ad-need" key={n.key}>
                <span className="num">{n.num}</span>
                <div className="tx">
                  <b>{n.head}</b>
                  <span>{n.sub}</span>
                </div>
                <div className="act">
                  <Link className={`ad-btn sm${n.key === oldestKey ? "" : " secondary"}`} href={n.href}>
                    {n.label}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <section className="ad-sec2" aria-labelledby="coming-up">
        <div className="ad-sh">
          <h2 id="coming-up">Coming up</h2>
          <span className="c">Next three events</span>
        </div>
        {upcoming.length === 0 ? (
          <p className="ad-hint" style={{ marginTop: 0 }}>
            No events are on the calendar. <Link className="ad-link" href="/admin/events/new">Add an event</Link>
          </p>
        ) : (
          <div className="ad-rows">
            {upcoming.map((e, i) => {
              const { weekday, day } = dateParts(e.start_time);
              const booked = bookedCounts[i];
              const full = e.capacity !== null && e.capacity > 0 && booked >= e.capacity;
              return (
                <Link className="ad-erow" key={e.id} href={`/admin/events/${e.id}`}>
                  <DateCol weekday={weekday} day={day} />
                  <span className="body">
                    <span className="title">{e.title}</span>
                    <span className="meta">
                      {time24(e.start_time)}
                      {e.location ? ` · ${e.location}` : ""}
                    </span>
                  </span>
                  <span className="end">
                    {full ? <Pill>Full</Pill> : e.capacity ? `${booked} of ${e.capacity} booked` : `${booked} booked`}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="ad-sec2" aria-labelledby="at-a-glance">
        <div className="ad-sh">
          <h2 id="at-a-glance">At a glance</h2>
        </div>
        <div className="ad-glance">
          {glance.map(([label, value, href]) => (
            <Link className="ad-g" key={label} href={href}>
              <span className="lb">{label}</span>
              <span className="v">{value}</span>
            </Link>
          ))}
        </div>
      </section>
    </AdminMain>
  );
}
