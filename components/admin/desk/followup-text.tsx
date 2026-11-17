import { deskRetryDraft, deskSaveFollowupText } from "@/app/admin/desk-actions";
import type { DraftText, Followup } from "@/lib/server/outreach/model";
import { stepWords } from "@/lib/server/outreach/model";
import { Drawer } from "./forms";
import { DeskSubmit } from "./submit";

// The words of the next follow-up, on a partner's page (Phase 2, 16 Nov 2026). The drafter on the Mac makes them into an
// Outlook draft in the thread, with the first email's attachment and Albert's signature, the evening before it is due
// (from 21:00). Nothing is sent: Albert reads it in Drafts in the morning and sends it himself. Alex writes these in
// Phase 3; until then Albert writes them here (or pastes what Claude wrote).

export function FollowupText({ f, text, back, inThread }: { f: Followup; text: DraftText | undefined; back: string; inThread: boolean }) {
  if (f.status === "drafted") {
    return (
      <p className="dk-fu-state">
        <span className="dk-chip drafted">Draft ready</span> The {stepWords(f.step).toLowerCase()} is in Outlook Drafts{f.draft_link ? ". " : "."}
        {f.draft_link && (
          <a href={f.draft_link} target="_blank" rel="noreferrer">
            Open it in Outlook
          </a>
        )}
      </p>
    );
  }
  return (
    <div className="dk-fu-text">
      {f.draft_error && (
        <form action={deskRetryDraft} className="dk-fu-state err">
          <input type="hidden" name="followup" value={f.id} />
          <input type="hidden" name="back" value={back} />
          <span>{f.draft_error}</span>
          <DeskSubmit className="dk-btn sm" busy="Saving…">
            Make the draft again
          </DeskSubmit>
        </form>
      )}
      <Drawer
        id="fu-text"
        title={text ? `The ${stepWords(f.step).toLowerCase()}'s words (written)` : `Write the ${stepWords(f.step).toLowerCase()}`}
        open={!text}
        hint={
          inThread
            ? "Goes into Outlook as a reply in the same thread, with the first email's attachment and your signature, the evening before it's due. Nothing is sent."
            : "There's no email in this thread yet (a letter first), so it goes as a new email with this subject, the evening before it's due. Nothing is sent."
        }
      >
        <form action={deskSaveFollowupText} className="dk-form">
          <input type="hidden" name="followup" value={f.id} />
          <input type="hidden" name="back" value={back} />
          {!inThread && (
            <label className="dk-field wide">
              <span>Subject</span>
              <input type="text" name="subject" maxLength={300} defaultValue={text?.subject ?? ""} placeholder="Club Yuppie and your members" />
            </label>
          )}
          <label className="dk-field wide">
            <span>The email</span>
            <textarea name="body" rows={8} maxLength={20000} defaultValue={text?.body ?? ""} placeholder={"Hi Naomi,\n\nJust following up on my email last week..."} />
          </label>
          <div className="dk-form-foot">
            <DeskSubmit className="dk-btn primary" busy="Saving…">
              Save
            </DeskSubmit>
            {text && <small className="hint">Save it empty to remove it.</small>}
          </div>
        </form>
      </Drawer>
    </div>
  );
}
