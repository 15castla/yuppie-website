import { CardLoading } from "@/components/admin/ui";

// The card's shapes while it loads (the list beside it stays; B-D6: shapes only, after about 300 ms, no
// spinner; the page's main is aria-busy meanwhile, QA2-09).
export default function Loading() {
  return <CardLoading />;
}
