import { CardShapes } from "@/components/admin/ui";

// The card's shapes while it loads (the list beside it stays; B-D6: shapes only, no spinner).
export default function Loading() {
  return (
    <div aria-busy="true">
      <span className="ad-sr">Loading</span>
      <CardShapes />
    </div>
  );
}
