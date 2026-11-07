import { AccessLoading } from "@/components/members/discounts/loading-views";

// The page's real title only, in a <main aria-busy="true"> (the loading rule:
// components/members/kit/main.tsx).
export default function AccessRouteLoading() {
  return <AccessLoading />;
}
