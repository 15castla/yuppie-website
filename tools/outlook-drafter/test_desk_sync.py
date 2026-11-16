"""Tests for desk_sync.py (the Outreach Desk sync, Phase 2), against a stand-in Microsoft (fake_outlook.py) and a
stand-in desk (no real account, no real desk).

    python3 -m unittest discover -s tools/outlook-drafter -v

Covers: desk-link (the key kept, only its fingerprint shown), a sync that reports an email to a partner and drops
everyone else's mail, a reply in the thread, a bounce (the address and code read from the report), an out-of-office,
a delivery receipt ignored, a reply found by its headers, a possible opt-out and a calendar invitation flagged, messages
the desk already has skipped, a partner email drafted from OneDrive reported with its partner when it is sent, the
follow-up draft (in the thread, our recipients, our words above the quote, the signature, the first email's
attachment, the hidden key, never sent), a failure deleting the half-made draft, a stale draft moved to Deleted Items
(or left when edited), a deleted draft, the check before drafting an opted-out partner, a dry run that changes
nothing, the 15-minute schedule's LaunchAgent, and that no send path appears in the code.
"""

from __future__ import annotations

import base64
import contextlib
import hashlib
import io
import json
import os
import re
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import desk_sync as ds  # noqa: E402
import draft_partner_emails as dp  # noqa: E402
from fake_outlook import FakeOutlook, person  # noqa: E402

PDF = dp.minimal_pdf("Club Yuppie x Rosa's Thai")


class FakeDesk:
    """The desk's drafter door: records every call, answers plan from `self.plan`, check from `self.opted_out`."""

    def __init__(self):
        self.calls: list[dict] = []
        self.plan: dict = {"since": "2026-11-01T00:00:00Z", "targets": [], "addresses": [], "conversations": [], "sentMessageIds": [], "recentRecipients": [],
                           "knownMessageIds": [], "pendingMessageIds": [], "drafted": [], "staleDrafts": [], "followups": []}
        self.opted_out: set = set()
        self.key_hash: str | None = None
        fake = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def _handle(self):
                raw = self.rfile.read(int(self.headers.get("Content-Length") or 0))
                body = json.loads(raw) if raw else None
                auth = self.headers.get("Authorization", "")
                fake.calls.append({"method": self.command, "path": self.path, "body": body, "auth": auth})
                given = auth[len("Bearer "):] if auth.startswith("Bearer ") else ""
                if not fake.key_hash or hashlib.sha256(given.encode()).hexdigest() != fake.key_hash:
                    return self._reply(401, {"error": "not linked"})
                action = self.path.rsplit("/", 1)[-1]
                if action == "plan":
                    return self._reply(200, fake.plan)
                if action == "check":
                    return self._reply(200, {"results": {a: {"status": "opted_out" if a in fake.opted_out else "fine"} for a in body["addresses"]}})
                if action == "report":
                    return self._reply(200, {"runId": body.get("runId") or "run-1", "results": [{"i": i, "result": "ok"} for i, _ in enumerate(body["items"])]})
                return self._reply(404, {"error": "no"})

            def _reply(self, status, body):
                data = json.dumps(body).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            do_GET = do_POST = _handle

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.port = self.server.server_address[1]
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def reports(self) -> list[dict]:
        return [c["body"] for c in self.calls if c["path"].endswith("/report")]

    def items(self) -> list[dict]:
        return [i for r in self.reports() for i in r["items"]]

    def close(self):
        self.server.shutdown()
        self.server.server_close()


class SyncTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        base = Path(self.tmp.name)
        self.root = base / "Partner emails"
        self.root.mkdir()
        self.ms = FakeOutlook()
        self.desk = FakeDesk()
        self.saved = (dp.LOGIN_BASE, dp.GRAPH_BASE, dp.CONFIG_PATH, dp.time.sleep, ds.time.sleep)
        dp.LOGIN_BASE = f"http://127.0.0.1:{self.ms.port}"
        dp.GRAPH_BASE = f"http://127.0.0.1:{self.ms.port}/v1.0"
        dp.CONFIG_PATH = base / "config.json"
        dp.time.sleep = lambda s: None
        ds.time.sleep = lambda s: None
        os.environ["CYD_TOKEN_FILE"] = str(base / "token")
        os.environ["CYD_DESK_KEY_FILE"] = str(base / "desk-key")
        os.environ["CYD_DESK_BASE"] = f"http://127.0.0.1:{self.desk.port}"
        os.environ["CYD_SCHEDULE_DRY"] = "1"
        Path(os.environ["CYD_TOKEN_FILE"]).write_text("refresh-0")
        dp.save_config({"tenant": "tenant-1", "client": "client-1", "mailbox": "albert@clubyuppie.com", "root": str(self.root)})
        self.home = base / "home"
        self.home.mkdir()
        self.old_home = os.environ.get("HOME")
        os.environ["HOME"] = str(self.home)

    def tearDown(self):
        dp.LOGIN_BASE, dp.GRAPH_BASE, dp.CONFIG_PATH, dp.time.sleep, ds.time.sleep = self.saved
        for k in ("CYD_TOKEN_FILE", "CYD_DESK_KEY_FILE", "CYD_DESK_BASE", "CYD_SCHEDULE_DRY"):
            os.environ.pop(k, None)
        if self.old_home is not None:
            os.environ["HOME"] = self.old_home
        self.ms.close()
        self.desk.close()
        self.tmp.cleanup()

    def main(self, *args) -> tuple[int, str]:
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = dp.main(list(args))
        return code, out.getvalue()

    def link(self) -> str:
        code, out = self.main("desk-link")
        self.assertEqual(code, 0, out)
        key = Path(os.environ["CYD_DESK_KEY_FILE"]).read_text()
        self.desk.key_hash = hashlib.sha256(key.encode()).hexdigest()
        return out

    def known_partner(self):
        self.desk.plan.update({
            "targets": [{"id": "t-rosa", "name": "Rosa's Thai", "domains": ["rosasthai.com"], "optedOut": False},
                        {"id": "t-nobu", "name": "Nobu", "domains": ["nobuhotels.com"], "optedOut": False}],
            "addresses": [{"address": "naomi@rosasthai.com", "targetId": "t-rosa", "optedOut": False}],
        })

    # ---------------------------------------------------------------- linking
    def test_desk_link_keeps_the_key_and_shows_only_its_fingerprint(self):
        out = self.link()
        key = Path(os.environ["CYD_DESK_KEY_FILE"]).read_text()
        self.assertGreaterEqual(len(key), 40)
        self.assertNotIn(key, out)
        self.assertIn(hashlib.sha256(key.encode()).hexdigest(), out)
        self.assertEqual(oct(Path(os.environ["CYD_DESK_KEY_FILE"]).stat().st_mode & 0o777), "0o600")
        code, out = self.main("status")
        self.assertIn("Desk: linked", out)
        self.assertNotIn(key, out)
        code, out = self.main("desk-unlink")
        self.assertFalse(Path(os.environ["CYD_DESK_KEY_FILE"]).exists())

    def test_not_linked_or_unlinked_on_the_desk(self):
        code, out = self.main("sync")
        self.assertEqual(code, 1)
        self.assertIn("isn't linked", out)
        self.link()
        self.desk.key_hash = "0" * 64  # unlinked on the desk
        code, out = self.main("sync")
        self.assertEqual(code, 1)
        self.assertIn("isn't linked any more", out)

    # ---------------------------------------------------------------- what Albert sent
    def test_an_email_to_a_partner_is_reported_and_everyone_elses_mail_stays_here(self):
        self.link()
        self.known_partner()
        self.ms.add("sentitems", subject="Club Yuppie and Rosa's Thai", toRecipients=[person("naomi@rosasthai.com", "Naomi")], sentDateTime="2026-11-12T09:40:00Z",
                    bodyText="Dear Naomi, the whole email", attachments=[{"name": "Overview.pdf", "contentType": "application/pdf", "contentBytes": base64.b64encode(PDF).decode(), "size": len(PDF)}])
        self.ms.add("sentitems", subject="Dinner on Friday?", toRecipients=[person("mum@gmail.com")], sentDateTime="2026-11-12T10:00:00Z", bodyText="Private words")
        self.ms.add("inbox", subject="Your order", **{"from": person("orders@shop.example")}, sentDateTime="2026-11-12T11:00:00Z", bodyText="Receipt words")
        code, out = self.main("sync")
        self.assertEqual(code, 0, out)
        items = self.desk.items()
        self.assertEqual([i["type"] for i in items], ["sent"])
        sent = items[0]
        self.assertEqual((sent["to"], sent["subject"], sent["sentAt"]), ([{"address": "naomi@rosasthai.com", "name": "Naomi"}], "Club Yuppie and Rosa's Thai", "2026-11-12T09:40:00Z"))
        self.assertEqual(sent["bodyText"], "Dear Naomi, the whole email")
        self.assertEqual(sent["attachments"], [{"name": "Overview.pdf", "size": len(PDF)}])
        blob = json.dumps(self.desk.calls)
        for private in ("mum@gmail.com", "Private words", "orders@shop.example", "Receipt words"):
            self.assertNotIn(private, blob)
        final = self.desk.reports()[-1]
        self.assertTrue(final["final"])
        self.assertEqual(final["counts"]["sent"], 1)
        self.assertNotIn("contentBytes", blob)
        self.assertFalse(any(re.search(r"/(send|reply|replyAll|forward)$", p) for p in self.ms.paths()))

    def test_messages_the_desk_has_are_skipped_and_a_dry_run_changes_nothing(self):
        self.link()
        self.known_partner()
        m = self.ms.add("sentitems", subject="Hello", toRecipients=[person("naomi@rosasthai.com")], sentDateTime="2026-11-12T09:40:00Z")
        self.desk.plan["knownMessageIds"] = [m["internetMessageId"]]
        code, out = self.main("sync")
        self.assertEqual(self.desk.items(), [])
        self.desk.plan["knownMessageIds"] = []
        self.desk.calls.clear()
        code, out = self.main("sync", "--dry-run")
        self.assertEqual(code, 0, out)
        self.assertIn("Would tell the desk: you emailed naomi@rosasthai.com", out)
        self.assertEqual(self.desk.reports(), [])

    # ---------------------------------------------------------------- what came back
    def test_replies_bounces_and_out_of_offices(self):
        self.link()
        self.known_partner()
        ours = self.ms.add("sentitems", subject="Club Yuppie", toRecipients=[person("naomi@rosasthai.com"), person("old@rosasthai.com")], sentDateTime="2026-11-12T09:40:00Z", conversationId="conv-rosa")
        self.desk.plan["conversations"] = [{"conversationId": "conv-rosa", "targetId": "t-rosa", "sequenceId": "s1"}]
        self.desk.plan["sentMessageIds"] = [{"internetMessageId": ours["internetMessageId"], "targetId": "t-rosa", "sequenceId": "s1"}]
        self.desk.plan["recentRecipients"] = [{"address": "old@rosasthai.com", "targetId": "t-rosa", "sequenceId": "s1"}]
        self.desk.plan["knownMessageIds"] = [ours["internetMessageId"]]
        self.ms.add("inbox", subject="RE: Club Yuppie", **{"from": person("naomi@rosasthai.com", "Naomi Davies")}, receivedDateTime="2026-11-13T08:00:00Z", conversationId="conv-rosa",
                    bodyText="Love to talk. Not interested in a discount though?")
        self.ms.add("inbox", subject="Undeliverable: Club Yuppie", **{"from": person("postmaster@clubyuppie.onmicrosoft.com", "Microsoft Outlook")}, receivedDateTime="2026-11-12T09:41:00Z",
                    conversationId="conv-rosa", **{"class": "REPORT.IPM.Note.NDR"}, bodyText="Your message to old@rosasthai.com couldn't be delivered. Remote server returned '550 5.1.1 RESOLVER.ADR.RecipNotFound'")
        self.ms.add("inbox", subject="Automatic reply: Club Yuppie", **{"from": person("naomi@rosasthai.com")}, receivedDateTime="2026-11-12T09:42:00Z", conversationId="conv-rosa",
                    **{"class": "IPM.Note.Rules.OofTemplate.Microsoft"}, bodyText="I'm away until Monday")
        self.ms.add("inbox", subject="Read: Club Yuppie", **{"from": person("naomi@rosasthai.com")}, receivedDateTime="2026-11-12T09:43:00Z", conversationId="conv-rosa", **{"class": "REPORT.IPM.Note.IPNRN"})
        # a reply in a new thread, found by its headers
        self.ms.add("inbox", subject="RE: Club Yuppie", **{"from": person("jason@rosasthai.com")}, receivedDateTime="2026-11-14T08:00:00Z", conversationId="conv-other",
                    headers=[{"name": "In-Reply-To", "value": ours["internetMessageId"]}], bodyText="Jason here", **{"class": "IPM.Schedule.Meeting.Request"})
        # someone else's bounce: not ours
        self.ms.add("inbox", subject="Undeliverable: Lunch", **{"from": person("postmaster@clubyuppie.onmicrosoft.com", "Microsoft Outlook")}, receivedDateTime="2026-11-12T12:00:00Z",
                    **{"class": "REPORT.IPM.Note.NDR"}, bodyText="Your message to friend@gmail.com couldn't be delivered. 5.1.1")
        code, out = self.main("sync")
        self.assertEqual(code, 0, out)
        got = {(i["kind"], i["from"]["address"]): i for i in self.desk.items() if i["type"] == "incoming"}
        self.assertEqual(sorted(got), sorted([("reply", "naomi@rosasthai.com"), ("bounce", "postmaster@clubyuppie.onmicrosoft.com"), ("auto_reply", "naomi@rosasthai.com"), ("reply", "jason@rosasthai.com")]))
        reply = got[("reply", "naomi@rosasthai.com")]
        self.assertEqual((reply["bodyText"], reply["hint"]), ("Love to talk. Not interested in a discount though?", "possible_opt_out"))
        bounce = got[("bounce", "postmaster@clubyuppie.onmicrosoft.com")]
        self.assertEqual((bounce["bouncedAddress"], bounce["bounceCode"], bounce["bodyText"]), ("old@rosasthai.com", "5.1.1", None))
        self.assertIsNone(got[("auto_reply", "naomi@rosasthai.com")]["bodyText"])
        jason = got[("reply", "jason@rosasthai.com")]
        self.assertEqual((jason["answers"], jason["hint"]), ([ours["internetMessageId"]], "invite"))
        self.assertNotIn("friend@gmail.com", json.dumps(self.desk.calls))

    # ---------------------------------------------------------------- a partner email from OneDrive
    def test_a_partner_email_drafted_from_onedrive_is_reported_with_its_partner_once_sent(self):
        self.link()
        folder = self.root / "Bravo Gyms"
        folder.mkdir()
        msg = dp.EmailMessage()
        msg["To"] = "Sam Lee <sam@bravogyms.example>"
        msg["Subject"] = "Club Yuppie partnership"
        msg.set_content("Dear Sam")
        msg.add_alternative("<html><body><p>Dear Sam</p></body></html>", subtype="html")
        msg.add_attachment(PDF, maintype="application", subtype="pdf", filename="Overview.pdf")
        eml = folder / f"Email to Bravo Gyms{dp.PENDING_SUFFIX}"
        eml.write_bytes(bytes(msg))
        (folder / "Email to Bravo Gyms - ready to send.desk.json").write_text(json.dumps({"v": 1, "target": {"name": "Bravo Gyms", "category": "fitness", "domains": ["bravogyms.example"]},
                                                                                               "to": [{"name": "Sam Lee", "email": "sam@bravogyms.example", "source": "rocketreach"}]}))
        code, out = self.main()
        self.assertEqual(code, 0, out)
        self.assertIn("Drafted: Bravo Gyms", out)
        check = [c for c in self.desk.calls if c["path"].endswith("/check")]
        self.assertEqual(check[0]["body"]["addresses"], ["sam@bravogyms.example"])
        self.assertEqual(self.desk.items(), [])  # drafted, not sent: the desk hears nothing yet
        draft = [m for m in self.ms.messages.values() if m["folder"] == "drafts"][0]
        self.ms.send(draft["id"], "2026-11-17T08:05:00Z")
        code, out = self.main("sync")
        self.assertEqual(code, 0, out)
        sent = [i for i in self.desk.items() if i["type"] == "sent"]
        self.assertEqual(len(sent), 1)
        self.assertEqual(sent[0]["partner"]["name"], "Bravo Gyms")
        self.assertEqual(sent[0]["partner"]["category"], "fitness")
        self.assertEqual(sent[0]["key"], hashlib.sha256(eml.read_bytes()).hexdigest())
        self.assertEqual(ds.load_pending(), [])  # the desk has it now

    def test_an_opted_out_partner_is_not_drafted(self):
        self.link()
        folder = self.root / "Stop Co"
        folder.mkdir()
        msg = dp.EmailMessage()
        msg["To"] = "boss@stop.example"
        msg["Subject"] = "Club Yuppie"
        msg.set_content("Hi")
        msg.add_attachment(PDF, maintype="application", subtype="pdf", filename="Overview.pdf")
        eml = folder / f"Email to Stop Co{dp.PENDING_SUFFIX}"
        eml.write_bytes(bytes(msg))
        self.desk.opted_out = {"boss@stop.example"}
        code, out = self.main("--no-sync")
        self.assertEqual(code, 1)
        self.assertIn("asked us to stop", out)
        self.assertFalse(any(m["folder"] == "drafts" for m in self.ms.messages.values()))
        self.assertFalse(dp.marker_for(eml).exists())

    # ---------------------------------------------------------------- follow-up drafts
    def followup_plan(self, ours):
        return {"followupId": "11111111-2222-3333-4444-555555555555", "targetId": "t-rosa", "partner": "Rosa's Thai", "step": 1, "due": "2026-11-18",
                "to": [{"address": "naomi@rosasthai.com", "name": "Naomi"}, {"address": "albert@clubyuppie.com", "name": None}], "cc": [{"address": "jason@rosasthai.com", "name": None}],
                "replyTo": {"internetMessageId": ours["internetMessageId"], "conversationId": ours["conversationId"]}, "subject": None,
                "body": "Hi Naomi,\n\nJust following up on my email last week.\nAny thoughts?\n\nAlbert", "attachmentsFrom": ours["internetMessageId"]}

    def test_the_follow_up_is_drafted_in_the_thread_with_the_attachment_and_never_sent(self):
        self.link()
        self.known_partner()
        dp.signature_path().parent.mkdir(parents=True, exist_ok=True)
        dp.signature_path().write_text(json.dumps({"html": "<div id=\"Signature\">Albert Castle</div>", "images": []}))
        ours = self.ms.add("sentitems", subject="Club Yuppie and Rosa's Thai", toRecipients=[person("naomi@rosasthai.com")], ccRecipients=[person("jason@rosasthai.com")], sentDateTime="2026-11-12T09:40:00Z",
                           bodyHtml="<html><body><p>The first email</p></body></html>",
                           attachments=[{"name": "Overview.pdf", "contentType": "application/pdf", "contentBytes": base64.b64encode(PDF).decode(), "size": len(PDF)},
                                        {"name": "logo.png", "contentType": "image/png", "contentBytes": "AA==", "size": 1, "isInline": True}])
        self.desk.plan["knownMessageIds"] = [ours["internetMessageId"]]
        self.desk.plan["followups"] = [self.followup_plan(ours)]
        code, out = self.main("sync")
        self.assertEqual(code, 0, out)
        self.assertIn("Drafted the follow-up to Rosa's Thai", out)
        drafts = [m for m in self.ms.messages.values() if m["folder"] == "drafts"]
        self.assertEqual(len(drafts), 1)
        d = drafts[0]
        self.assertEqual(d["subject"], "RE: Club Yuppie and Rosa's Thai")
        self.assertEqual(d["conversationId"], ours["conversationId"])
        self.assertEqual([p["emailAddress"]["address"] for p in d["toRecipients"]], ["naomi@rosasthai.com"])  # never to Albert himself
        self.assertEqual([p["emailAddress"]["address"] for p in d["ccRecipients"]], ["jason@rosasthai.com"])
        body = d["bodyHtml"]
        self.assertLess(body.index("Just following up"), body.index("The first email"))
        self.assertIn("Just following up on my email last week.<br>Any thoughts?", body)
        self.assertLess(body.index("Albert Castle"), body.index("The first email"))
        self.assertEqual(d["key"], "followup:11111111-2222-3333-4444-555555555555")
        self.assertEqual([(a["name"], base64.b64decode(a["contentBytes"])) for a in d["attachments"]], [("Overview.pdf", PDF)])
        made = [i for i in self.desk.items() if i["type"] == "followup_draft"][0]
        self.assertEqual(made["draftId"], d["id"])
        self.assertFalse(any(re.search(r"/(send|reply|replyAll|forward)$", p) for p in self.ms.paths()))
        # a second run finds it by its key: no second draft
        self.desk.plan["followups"] = [self.followup_plan(ours)]
        self.main("sync")
        self.assertEqual(len([m for m in self.ms.messages.values() if m["folder"] == "drafts"]), 1)
        # Albert sends it: reported with its key, even when Outlook drops the hidden key on sending
        self.ms.keep_key_on_send = False
        self.desk.plan["followups"] = []
        self.desk.plan["drafted"] = [{"followupId": "11111111-2222-3333-4444-555555555555", "draftId": d["id"], "key": "followup:11111111-2222-3333-4444-555555555555",
                                      "conversationId": ours["conversationId"], "madeAt": "2026-11-17T21:30:00Z"}]
        self.desk.calls.clear()
        self.ms.send(d["id"], "2026-11-18T08:10:00Z")
        code, out = self.main("sync")
        sent = [i for i in self.desk.items() if i["type"] == "sent"]
        self.assertEqual([s["key"] for s in sent], ["followup:11111111-2222-3333-4444-555555555555"])
        self.assertFalse([i for i in self.desk.items() if i["type"] == "draft_gone"])

    def test_a_failed_follow_up_takes_the_half_draft_away(self):
        self.link()
        self.known_partner()
        ours = self.ms.add("sentitems", subject="Club Yuppie", toRecipients=[person("naomi@rosasthai.com")], sentDateTime="2026-11-12T09:40:00Z")
        self.desk.plan["knownMessageIds"] = [ours["internetMessageId"]]
        self.desk.plan["followups"] = [self.followup_plan(ours)]
        self.ms.fail_patch = True
        code, out = self.main("sync")
        self.assertEqual(code, 1)
        self.assertFalse([m for m in self.ms.messages.values() if m["folder"] == "drafts"])
        failed = [i for i in self.desk.items() if i["type"] == "followup_failed"]
        self.assertEqual(len(failed), 1)
        self.assertIn("Outlook said no", failed[0]["error"])
        self.assertFalse(self.desk.reports()[-1]["ok"])

    def test_stale_drafts_go_to_deleted_items_unless_edited_and_deleted_drafts_are_noticed(self):
        self.link()
        untouched = self.ms.add("drafts", subject="RE: a", lastModifiedDateTime="2026-11-17T21:30:00Z")
        edited = self.ms.add("drafts", subject="RE: b", lastModifiedDateTime="2026-11-18T07:55:00Z")
        self.desk.plan["staleDrafts"] = [{"followupId": "f-1", "draftId": untouched["id"], "madeAt": "2026-11-17T21:30:00Z"},
                                         {"followupId": "f-2", "draftId": edited["id"], "madeAt": "2026-11-17T21:30:00Z"},
                                         {"followupId": "f-3", "draftId": "gone-1", "madeAt": "2026-11-17T21:30:00Z"}]
        self.desk.plan["drafted"] = [{"followupId": "f-4", "draftId": "gone-2", "key": "followup:f-4", "conversationId": None, "madeAt": "2026-11-17T21:30:00Z"}]
        code, out = self.main("sync")
        self.assertEqual(code, 0, out)
        self.assertEqual(self.ms.messages[untouched["id"]]["folder"], "deleteditems")
        self.assertEqual(self.ms.messages[edited["id"]]["folder"], "drafts")
        got = {(i["type"], i["followupId"], i.get("outcome")) for i in self.desk.items()}
        self.assertEqual(got, {("stale_draft", "f-1", "moved"), ("stale_draft", "f-2", "edited"), ("stale_draft", "f-3", "gone"), ("draft_gone", "f-4", None)})
        self.assertNotIn("DELETE", [c["method"] for c in self.ms.calls])  # moved, not deleted: it can be got back

    # ---------------------------------------------------------------- the schedule, and the code
    def test_schedule_writes_a_launch_agent_running_a_copy_outside_desktop(self):
        code, out = self.main("schedule", "on")
        self.assertEqual(code, 0, out)
        plist = ds.plist_path().read_text()
        self.assertIn("<string>sync</string>", plist)
        self.assertIn("<integer>900</integer>", plist)
        self.assertIn(str(self.home / "Library" / "Application Support" / "club-yuppie-drafts" / "bin" / "draft_partner_emails.py"), plist)
        self.assertTrue((ds.agent_dir() / "bin" / "desk_sync.py").exists())
        code, out = self.main("schedule", "off")
        self.assertFalse(ds.plist_path().exists())

    def test_no_send_path_and_no_send_permission_in_the_code(self):
        for name in ("desk_sync.py", "draft_partner_emails.py"):
            src = (Path(__file__).parent / name).read_text()
            # Graph's sending endpoints are .../send, .../reply, .../replyAll and .../forward (createReplyAll only drafts)
            self.assertIsNone(re.search(r"/(send|reply|replyAll|forward)\b", src), name)
            self.assertNotIn('"Mail.Send"', src.replace("FORBIDDEN_SCOPES", ""))

    def test_a_signal_on_the_lock_keeps_two_syncs_apart(self):
        self.link()
        ds.lock_path().parent.mkdir(parents=True, exist_ok=True)
        ds.lock_path().write_text(str(os.getppid()))  # a process that is alive
        code, out = self.main("sync")
        self.assertEqual(code, 1)
        self.assertIn("Another sync is running", out)
        ds.lock_path().write_text("999999")  # gone
        code, out = self.main("sync")
        self.assertEqual(code, 0, out)


if __name__ == "__main__":
    unittest.main()
