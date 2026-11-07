import { DiscountsLoading } from "@/components/members/discounts/loading-views";

// The page's real title only, in a <main aria-busy="true"> (the loading rule:
// components/members/kit/main.tsx; the native app's splash waits for a real
// main that is not busy, and for no spinner). Shows while the offers are
// fetched, inside the shell.
export default function DiscountsRouteLoading() {
  return <DiscountsLoading />;
}
