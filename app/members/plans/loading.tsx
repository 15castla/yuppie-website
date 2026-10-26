import { BackRow, Main, RowShape, Rows, Shape, TitleBlock } from "@/components/members/kit";
import "@/components/members/plans/plans.css";
import { ROUTES } from "@/lib/members/routes";

// Your plans while the list loads: the real back row and title, then pale
// shapes where the Upcoming | Past control, the first month and its rows will
// be. A real <main aria-busy="true">, static shapes, no spinner (the iOS
// splash contract: see app/members/loading.tsx).
export default function PlansLoading() {
  return (
    <Main busy className="pl-page">
      <span className="mk-sr">Loading</span>
      <BackRow href={ROUTES.events} label="Events" />
      <TitleBlock title="Your plans." sub="What you’re in for." actions={null} />
      <div className="mk-wrap">
        <div className="mk-cols">
          <div>
            <div className="pl-tools" aria-hidden="true">
              <Shape width="100%" height={56} kind="pill" style={{ maxWidth: 440 }} />
            </div>
            <div className="pl-list" aria-hidden="true">
              <Shape width={132} height={30} style={{ marginBottom: 14 }} />
              <Rows>
                <RowShape lines={[62, 36]} />
                <RowShape lines={[48, 40]} />
                <RowShape lines={[58, 34]} />
              </Rows>
            </div>
          </div>
        </div>
      </div>
    </Main>
  );
}
