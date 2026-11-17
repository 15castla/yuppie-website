import { deskConnectApprove, deskConnectDeny } from "@/app/admin/desk-alex-actions";
import { requireOwner } from "@/app/admin/require-owner";
import { DeskShell, type SearchParams } from "@/components/admin/desk/shell";
import { DeskSubmit } from "@/components/admin/desk/submit";
import { serviceDb } from "@/lib/server/db";
import { OAuthError, checkAuthorize, type AuthorizeRequest } from "@/lib/server/outreach/connector";

// Connect Claude to the desk (Outreach Desk, Phase 3, 17 Nov 2026): where /api/desk/oauth/authorize sends Albert
// when he adds the Desk connector in Claude's settings. The owner only, signed in with password and authenticator
// code. Connect sends a one-off code back to Claude (claude.ai or claude.com only); Don't connect sends a refusal.

const FIELDS = ["response_type", "client_id", "redirect_uri", "code_challenge", "code_challenge_method", "state", "scope", "resource"];

export default async function DeskConnectPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireOwner();
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const key of FIELDS) {
    const v = sp[key];
    const s = Array.isArray(v) ? v[0] : v;
    if (s) q.set(key, s);
  }
  let req: AuthorizeRequest | null = null;
  let problem: string | null = null;
  try {
    req = await checkAuthorize(serviceDb(), q);
  } catch (err) {
    problem = err instanceof OAuthError ? err.description : "Something went wrong. Start again from Claude's settings.";
  }
  const hidden = [...q.entries()].map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />);
  return (
    <DeskShell current={null} sp={{}}>
      <section className="dk-panel dk-connect" aria-labelledby="c-h">
        <div className="dk-panel-h">
          <h2 id="c-h">Connect Claude to the desk</h2>
        </div>
        {problem || !req ? (
          <p className="dk-flash err" role="alert">
            {problem}
          </p>
        ) : (
          <div className="dk-connect-body">
            <p>
              <b>{req.client_name || "Claude"}</b> is asking to reach the Outreach desk for Alex, your assistant in your own Claude account. It will come back
              to <b>{new URL(req.redirect_uri).host}</b>.
            </p>
            <div className="dk-connect-cols">
              <div>
                <h3>Alex can</h3>
                <ul>
                  <li>Read every partner, contact, email, reply, note and action point</li>
                  <li>Add notes (from a meeting or a call) and action points</li>
                  <li>Write the words of follow-ups and replies, which become Outlook drafts for you to check and send</li>
                </ul>
              </div>
              <div>
                <h3>Alex can&apos;t</h3>
                <ul>
                  <li>Send anything, or make a draft without your approved guidance</li>
                  <li>Change words you wrote yourself</li>
                  <li>Delete anything, change a stage or an opt-out</li>
                  <li>See anything outside the desk</li>
                </ul>
              </div>
            </div>
            <p className="hint">Disconnect at any time in Desk &gt; Settings. The connection signs in again every hour and ends after 90 days without use.</p>
            <div className="dk-form-foot">
              <form action={deskConnectApprove}>
                {hidden}
                <DeskSubmit className="dk-btn primary" busy="Connecting…">
                  Connect
                </DeskSubmit>
              </form>
              <form action={deskConnectDeny}>
                {hidden}
                <DeskSubmit className="dk-btn" busy="Cancelling…">
                  Don&apos;t connect
                </DeskSubmit>
              </form>
            </div>
          </div>
        )}
      </section>
    </DeskShell>
  );
}
