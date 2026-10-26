import { requireMember } from "@/app/members/require-member";
import { PostedRoute } from "@/components/members/invite/posted-route";
import { requireFlag } from "@/lib/members/flags";
import { ExampleScope } from "@/components/members/kit";
import { assertMockAllowed } from "@/lib/members/mock/guard";
import { getExampleMe } from "@/lib/members/mock/open-invite";

// "Posted.": the page after posting, with the tab bar back. The plan just
// posted comes from this tab's sessionStorage (demo-posted.ts) until a
// backend can load it by id.
export default async function PostedPage() {
  requireFlag("openInvite");
  assertMockAllowed();
  const [, me] = await Promise.all([requireMember(), getExampleMe()]);
  return (
    <ExampleScope>
      <PostedRoute me={me} />
    </ExampleScope>
  );
}
