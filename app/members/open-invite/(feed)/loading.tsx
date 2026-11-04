import { OpenInviteLoading } from "@/components/members/invite/browse-view";

// The real title only, a real <main aria-busy="true">, no spinner (components/members/kit/main.tsx).
export default function Loading() {
  return <OpenInviteLoading />;
}
