# Outlook drafter

Turns the partner emails that the partner-emails skill saves to OneDrive
(`Partner emails/<Brand>/Email to <Brand> - ready to send.eml`) into drafts in
albert@clubyuppie.com's Outlook, through Microsoft Graph. **It never sends:** Albert
sends every email himself.

It runs on Albert's Mac only. It uses the Mac's own `python3` (3.9 or later) and
needs nothing installed. The sign-in is kept in the macOS Keychain.

- **Install:** `bash tools/outlook-drafter/install.sh`. This adds the
  `draft-partner-emails` command.
- **Use:** `draft-partner-emails --dry-run` first, then `draft-partner-emails`.
  For the full list of commands, see `draft_partner_emails.py` (at the top) or
  `draft-partner-emails --help`.
- **Tests:** `python3 -m unittest discover -s tools/outlook-drafter`. They run
  against a stand-in for Microsoft (`fake_outlook.py`) and a stand-in desk, so no
  real account is used.
- **Full write-up:** Entra setup, safety, troubleshooting. See the project's
  `Yuppie_Technical_Reference.md`, Part 14 "Outlook drafter".

## The Outreach Desk (Phase 2, 16 Nov 2026)

`desk_sync.py` connects the drafter to the desk at clubyuppie.com/admin/desk. Once
linked, it tells the desk what was sent to partners and what came back (replies,
bounces, automatic replies), reading back to 1 Nov the first time. It also turns the
follow-up words saved on the desk into Outlook drafts in the thread, with the first
email's attachment, the evening before they are due. Mail that isn't about a partner
never leaves the Mac. It still never sends.

- `draft-partner-emails desk-link`: makes the desk key (kept in the Keychain as
  `club-yuppie-desk`) and shows only its fingerprint. Paste that into Desk > Settings.
- `draft-partner-emails sync --dry-run`, then `draft-partner-emails sync`.
- `draft-partner-emails schedule on`: syncs every 15 minutes while the Mac is awake
  (a LaunchAgent running a copy in `~/Library/Application Support/club-yuppie-drafts`;
  the log is `~/Library/Logs/club-yuppie-drafts.log`). Run it again after updating
  the tool.
- Write-up: `Yuppie_Technical_Reference.md`, Part 23.
