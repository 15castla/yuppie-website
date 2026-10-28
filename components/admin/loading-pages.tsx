// Loading pages (B-D6, r2b 20): the real title and lead, pale shapes where the data goes, <main aria-busy>,
// no spinner. Shown by each route's loading.tsx (Next's Suspense boundary).

import { AdminMain, CardShapes, ListShapes, PageHead, Shape } from "./ui";

export function DashboardLoading() {
  return (
    <AdminMain busy>
      <PageHead title="Dashboard" />
      <div style={{ marginTop: 28 }}>
        <div className="ad-card" aria-hidden="true">
          <div className="ad-cardhead">
            <Shape style={{ width: 210, height: 32 }} />
            <Shape style={{ width: 70, height: 14 }} />
          </div>
          {[0, 1, 2].map((i) => (
            <div className="ad-need" key={i}>
              <span>
                <Shape style={{ width: 40, height: 44 }} />
              </span>
              <div className="tx">
                <Shape style={{ width: "55%", height: 17 }} />
                <Shape style={{ width: "38%", height: 14, marginTop: 8 }} />
              </div>
              <div className="act">
                <Shape className="rnd" style={{ width: 190, maxWidth: "100%", height: 44 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="ad-sec2" aria-hidden="true">
        <Shape style={{ width: 140, height: 24 }} />
      </div>
      <div className="ad-sec2" aria-hidden="true">
        <Shape style={{ width: 110, height: 24 }} />
        <div style={{ marginTop: 14 }}>
          <Shape style={{ height: 96 }} />
        </div>
      </div>
    </AdminMain>
  );
}

/** A list | card page while it loads: on a phone only the list's shapes show. */
export function SplitLoading({
  title,
  lead,
  tabs,
  lead_shape = "cir",
  withAvatar = true,
}: {
  title: string;
  lead: string;
  tabs?: string[];
  lead_shape?: "cir" | "date" | "tile";
  withAvatar?: boolean;
}) {
  return (
    <AdminMain busy>
      <PageHead title={title} lead={lead} />
      {tabs && (
        <div className="ad-tabs" aria-hidden="true">
          {tabs.map((t, i) => (
            <span
              key={t}
              style={{
                flex: "1 1 0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 44,
                borderRadius: 999,
                font: "700 15px/1.2 var(--font-body)",
                background: i === 0 ? "var(--ink)" : undefined,
                color: i === 0 ? "var(--yellow)" : undefined,
              }}
            >
              {t}
            </span>
          ))}
        </div>
      )}
      <div className="ad-grid" data-open="false">
        <div className="ad-list-col">
          <ListShapes rows={6} lead={lead_shape} />
        </div>
        <div className="ad-card-col">
          <CardShapes avatar={withAvatar} />
        </div>
      </div>
    </AdminMain>
  );
}
