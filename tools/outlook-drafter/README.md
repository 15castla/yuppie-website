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
  against a stand-in for Microsoft, so no real account is used.
- **Full write-up:** Entra setup, safety, troubleshooting. See the project's
  `Yuppie_Technical_Reference.md`, Part 14 "Outlook drafter".
