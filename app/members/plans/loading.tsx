import { BackLink, BackRow, Main, TitleBlock } from "@/components/members/kit";
import "@/components/members/plans/plans.css";
import { ROUTES } from "@/lib/members/routes";

// Your plans while the list loads: the real back row and title, nothing else
// (the loading rule: components/members/kit/main.tsx). A real
// <main aria-busy="true">, no spinner (the iOS splash contract: see
// app/members/loading.tsx).
export default function PlansLoading() {
  return (
    <Main busy className="pl-page">
      <span className="mk-sr">Loading</span>
      <BackRow href={ROUTES.events} label="Events" />
      {/* The computer's crumb above the title, as the page draws it, so the title does not move when it arrives. */}
      <div className="mk-wrap pl-crumb">
        <div>
          <BackLink href={ROUTES.events} label="Events" />
        </div>
      </div>
      <TitleBlock title="Your plans." sub="What you’re in for." actions={null} />
    </Main>
  );
}
