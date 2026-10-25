import { DiscountsLoading } from "@/components/members/discounts/loading-views";

// Pale shapes under the page's real title, in a <main aria-busy="true"> (the
// native app's splash waits for a real main that is not busy, and for no
// spinner). Shows while the offers are fetched, inside the shell.
export default function DiscountsRouteLoading() {
  return <DiscountsLoading />;
}
