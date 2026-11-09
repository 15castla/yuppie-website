"""Tests for draft_partner_emails.py, against a stand-in for Microsoft's sign-in and Graph (no real account).

    python3 -m unittest discover -s tools/outlook-drafter -v

Covers: reading the skill's .eml (HTML body, PDF, a curly apostrophe in the subject), which files are waiting, a dry
run that touches nothing, sign-in in the browser (PKCE, the state checked, a refusal) and by device code, drafting (the request Outlook gets), the marker, no second draft for
the same file, the wrong mailbox, a sign-in that could send, a PDF over 3 MB (upload session), a failed upload (the
half draft is taken away), the test draft, a 401 retried once, copying the Outlook signature (logo included) into every draft, any other email from "Emails to draft" (no PDF
needed there, still needed for a partner email), skip, and that nothing ever calls a send endpoint.
"""

from __future__ import annotations

import base64
import contextlib
import hashlib
import io
import json
import os
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from email.message import EmailMessage
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlencode, urlsplit

sys.path.insert(0, str(Path(__file__).parent))
import draft_partner_emails as dp  # noqa: E402

PDF = dp.minimal_pdf("Club Yuppie x Acme Barbers, partner overview")


def jwt(scopes: str) -> str:
    part = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")  # noqa: E731
    return f"{part({'alg': 'none'})}.{part({'scp': scopes})}.sig"


class FakeMicrosoft:
    """Login (browser with PKCE, device code, refresh) and Graph (/me, messages, attachments, upload sessions), recording
    each call. browser() stands in for the Mac's browser: it reads the sign-in address and comes back to the tool's
    listener as Microsoft would ("approve"), with someone else's state ("wrong-state"), or refused ("deny")."""

    def __init__(self):
        self.calls: list[dict] = []
        self.mailbox = "albert@clubyuppie.com"
        self.scope = "https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/User.Read"
        self.token_scp = "Mail.ReadWrite User.Read"
        self.pending_polls = 1
        self.existing: dict | None = None
        self.fail_upload = False
        self.unauthorized_once = False
        self.messages: dict[str, dict] = {}
        self.browser_mode = "approve"
        self.drafts_folder: list[dict] = []  # drafts Albert made in Outlook: {"id", "subject", "lastModifiedDateTime", "body", "attachments"}
        self.authorize: dict = {}
        self.browser_pages: list[str] = []
        fake = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def _reply(self, status, body=None, headers=None):
                data = b"" if body is None else json.dumps(body).encode()
                self.send_response(status)
                for k, v in (headers or {}).items():
                    self.send_header(k, v)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def _handle(self):
                length = int(self.headers.get("Content-Length") or 0)
                raw = self.rfile.read(length) if length else b""
                url = urlsplit(self.path)
                call = {"method": self.command, "path": url.path, "query": unquote(url.query), "headers": dict(self.headers), "raw": raw}
                fake.calls.append(call)
                p = url.path
                if p.endswith("/oauth2/v2.0/devicecode"):
                    form = parse_qs(raw.decode())
                    call["form"] = form
                    return self._reply(200, {"device_code": "dev-123", "user_code": "ABCD-EFGH", "verification_uri": "https://microsoft.com/devicelogin",
                                             "expires_in": 900, "interval": 1, "message": "To sign in, use a web browser to open the page https://microsoft.com/devicelogin and enter the code ABCD-EFGH to authenticate."})
                if p.endswith("/oauth2/v2.0/token"):
                    form = {k: v[0] for k, v in parse_qs(raw.decode()).items()}
                    call["form"] = form
                    if form.get("grant_type", "").endswith("device_code") and fake.pending_polls > 0:
                        fake.pending_polls -= 1
                        return self._reply(400, {"error": "authorization_pending"})
                    if form.get("grant_type") == "authorization_code":
                        verifier = form.get("code_verifier", "").encode()
                        matches = base64.urlsafe_b64encode(hashlib.sha256(verifier).digest()).decode().rstrip("=") == fake.authorize.get("code_challenge")
                        if form.get("code") != "auth-code-1" or not matches or form.get("redirect_uri") != fake.authorize.get("redirect_uri"):
                            return self._reply(400, {"error": "invalid_grant", "error_description": "AADSTS70000: bad code"})
                    return self._reply(200, {"access_token": jwt(fake.token_scp), "refresh_token": "refresh-" + str(len(fake.calls)), "scope": fake.scope, "expires_in": 3600})
                if not p.startswith("/upload/") and fake.unauthorized_once:
                    fake.unauthorized_once = False
                    return self._reply(401, {"error": {"code": "InvalidAuthenticationToken", "message": "expired"}})
                if p == "/v1.0/me":
                    return self._reply(200, {"mail": fake.mailbox, "userPrincipalName": fake.mailbox})
                if p == "/v1.0/me/mailFolders/drafts/messages" and self.command == "GET":
                    want = unquote(url.query).split("subject eq '")[1].split("'")[0]
                    hits = [{k: d[k] for k in ("id", "subject", "lastModifiedDateTime")} for d in fake.drafts_folder if d["subject"].lower() == want.lower()]
                    return self._reply(200, {"value": hits})
                if p.startswith("/v1.0/me/messages/") and self.command == "GET":
                    mine = {d["id"]: d for d in fake.drafts_folder}.get(p.split("/")[4])
                    if not mine:
                        return self._reply(404, {"error": {"code": "ErrorItemNotFound", "message": "no"}})
                    if p.endswith("/attachments"):
                        return self._reply(200, {"value": mine["attachments"]})
                    return self._reply(200, {"id": mine["id"], "body": mine["body"]})
                if p == "/v1.0/me/messages" and self.command == "GET":
                    return self._reply(200, {"value": [fake.existing] if fake.existing else []})
                if p == "/v1.0/me/messages" and self.command == "POST":
                    body = json.loads(raw)
                    mid = f"m{len(fake.messages) + 1}"
                    fake.messages[mid] = body
                    return self._reply(201, {"id": mid, "webLink": f"https://outlook.office365.com/owa/?ItemID={mid}", "isDraft": True})
                if p.startswith("/v1.0/me/messages/") and p.endswith("/attachments/createUploadSession"):
                    return self._reply(201, {"uploadUrl": f"http://127.0.0.1:{fake.port}/upload/{p.split('/')[4]}"})
                if p.startswith("/v1.0/me/messages/") and p.endswith("/attachments"):
                    return self._reply(201, {"id": "a1"})
                if p.startswith("/v1.0/me/messages/") and self.command == "DELETE":
                    fake.messages.pop(p.split("/")[4], None)
                    return self._reply(204)
                if p.startswith("/upload/"):
                    if fake.fail_upload:
                        return self._reply(500, {"error": {"code": "boom"}})
                    total = int(self.headers["Content-Range"].split("/")[1])
                    end = int(self.headers["Content-Range"].split("-")[1].split("/")[0])
                    return self._reply(201 if end + 1 == total else 200, {"nextExpectedRanges": [f"{end + 1}-"]})
                return self._reply(404, {"error": {"code": "NotFound", "message": p}})

            do_GET = do_POST = do_PUT = do_DELETE = _handle

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.port = self.server.server_address[1]
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def browser(self, url: str) -> bool:
        parts = urlsplit(url)
        self.authorize = {"path": parts.path, **{k: v[0] for k, v in parse_qs(parts.query).items()}}
        back = self.authorize["redirect_uri"]
        if self.browser_mode == "deny":
            answer = {"error": "access_denied", "error_description": "AADSTS65004: User declined to consent.", "state": self.authorize["state"]}
        else:
            answer = {"code": "auth-code-1", "state": self.authorize["state"] if self.browser_mode == "approve" else "someone-else"}
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

        def visit():
            with contextlib.suppress(urllib.error.HTTPError):  # the favicon gets a 404
                opener.open(back + "/favicon.ico", timeout=10).close()
            with opener.open(back + "/?" + urlencode(answer), timeout=10) as page:
                self.browser_pages.append(page.read().decode())

        self.visit = threading.Thread(target=visit, daemon=True)
        self.visit.start()
        return True

    def pages(self) -> list[str]:
        """What the browser showed, once it has finished."""
        self.visit.join(10)
        return self.browser_pages

    def close(self):
        self.server.shutdown()
        self.server.server_close()

    def paths(self, method=None):
        return [c["path"] for c in self.calls if method is None or c["method"] == method]


def make_eml(path: Path, to="Acme Partnerships <partners@acme.example>", subject="Club Yuppie partnership, Acme’s Corporate Club for our members", pdf=PDF):
    msg = EmailMessage()
    msg["To"] = to
    msg["Subject"] = subject
    msg["X-Unsent"] = "1"
    msg.set_content("Dear Acme Barbers team,\n\nKind regards,")
    msg.add_alternative("<html><body><p>Dear Acme Barbers team,</p><p>Kind regards,</p></body></html>", subtype="html", cte="quoted-printable")
    if pdf is not None:
        msg.add_attachment(pdf, maintype="application", subtype="pdf", filename="Club Yuppie x Acme Barbers - partner overview.pdf")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(bytes(msg))
    return path


class DrafterTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        base = Path(self.tmp.name)
        self.root = base / "Partner emails"
        self.root.mkdir()
        self.fake = FakeMicrosoft()
        self.saved = (dp.LOGIN_BASE, dp.GRAPH_BASE, dp.CONFIG_PATH, dp.time.sleep, dp.open_browser)
        dp.open_browser = self.fake.browser
        dp.LOGIN_BASE = f"http://127.0.0.1:{self.fake.port}"
        dp.GRAPH_BASE = f"http://127.0.0.1:{self.fake.port}/v1.0"
        dp.CONFIG_PATH = base / "config.json"
        dp.time.sleep = lambda s: None
        os.environ["CYD_TOKEN_FILE"] = str(base / "token")
        dp.save_config({"tenant": "tenant-1", "client": "client-1", "mailbox": "albert@clubyuppie.com", "root": str(self.root)})

    def tearDown(self):
        dp.LOGIN_BASE, dp.GRAPH_BASE, dp.CONFIG_PATH, dp.time.sleep, dp.open_browser = self.saved
        os.environ.pop("CYD_TOKEN_FILE", None)
        self.fake.close()
        self.tmp.cleanup()

    def main(self, *args) -> tuple[int, str]:
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = dp.main(list(args))
        return code, out.getvalue()

    def sign_in(self):
        code, out = self.main("signin")
        self.assertEqual(code, 0, out)
        return out

    def eml(self, brand="Acme Barbers", **kw):
        return make_eml(self.root / brand / f"Email to {brand}{dp.PENDING_SUFFIX}", **kw)

    # ---------------------------------------------------------------- reading
    def test_parse_the_skills_eml(self):
        path = self.eml()
        draft = dp.parse_eml(path)
        self.assertEqual(draft.subject, "Club Yuppie partnership, Acme’s Corporate Club for our members")
        self.assertEqual(draft.to, [("Acme Partnerships", "partners@acme.example")])
        self.assertTrue(draft.is_html)
        self.assertIn("<p>Dear Acme Barbers team,</p>", draft.body)
        self.assertEqual([(a.name, a.content_type, a.data) for a in draft.attachments], [("Club Yuppie x Acme Barbers - partner overview.pdf", "application/pdf", PDF)])
        self.assertEqual(draft.key, hashlib.sha256(path.read_bytes()).hexdigest())

    def test_refuses_no_to_and_no_pdf(self):
        with self.assertRaisesRegex(dp.DraftError, "no To"):
            dp.parse_eml(self.eml("No To", to=""))
        with self.assertRaisesRegex(dp.DraftError, "no PDF"):
            dp.parse_eml(self.eml("No Pdf", pdf=None))

    def test_signature_goes_before_the_end_of_the_body(self):
        draft = dp.parse_eml(self.eml(), signature_html="<p>Albert Castle</p>")
        self.assertIn("<p>Kind regards,</p><p>Albert Castle</p></body>", draft.body)

    def test_which_files_are_waiting(self):
        a = self.eml("Acme Barbers")
        b = self.eml("Bravo Gyms")
        dp.marker_for(b).write_text("{}")
        self.eml("_to_delete")
        (self.root / "Charlie Spa").mkdir()
        (self.root / "Charlie Spa" / "Email to Charlie Spa.txt").write_text("x")
        self.assertEqual(dp.waiting(self.root), [a])
        self.assertEqual(dp.marker_for(a).name, "Email to Acme Barbers - ready to send.drafted")

    def test_dry_run_touches_nothing(self):
        path = self.eml()
        code, out = self.main("--dry-run")
        self.assertEqual(code, 0, out)
        self.assertIn("Would draft Acme Barbers", out)
        self.assertIn("To partners@acme.example", out)
        self.assertEqual(self.fake.calls, [])
        self.assertFalse(dp.marker_for(path).exists())

    # ---------------------------------------------------------------- signing in and drafting
    def test_sign_in_in_the_browser(self):
        out = self.sign_in()
        self.assertIn("Signed in as albert@clubyuppie.com", out)
        asked = self.fake.authorize
        self.assertEqual(asked["path"], "/tenant-1/oauth2/v2.0/authorize")
        self.assertEqual((asked["client_id"], asked["response_type"], asked["code_challenge_method"], asked["login_hint"]), ("client-1", "code", "S256", "albert@clubyuppie.com"))
        self.assertRegex(asked["redirect_uri"], r"^http://localhost:\d+$")
        self.assertEqual(sorted(asked["scope"].split()), sorted(dp.SCOPES))
        self.assertFalse(any("send" in s.lower() for s in asked["scope"].split()))
        self.assertNotIn("code_verifier", asked)
        swap = [c["form"] for c in self.fake.calls if c["path"].endswith("/token")][0]
        self.assertEqual((swap["grant_type"], swap["code"], swap["redirect_uri"]), ("authorization_code", "auth-code-1", asked["redirect_uri"]))
        self.assertNotIn("client_secret", swap)
        self.assertNotIn(swap["code_verifier"], out)
        self.assertIn("Signed in", self.fake.pages()[0])
        self.assertTrue(Path(os.environ["CYD_TOKEN_FILE"]).read_text().startswith("refresh-"))

    def test_browser_sign_in_with_the_wrong_state_keeps_nothing(self):
        self.fake.browser_mode = "wrong-state"
        code, out = self.main("signin")
        self.assertEqual(code, 1)
        self.assertIn("doesn't match", out)
        self.assertIn("Not signed in", self.fake.pages()[0])
        self.assertFalse(any(c["path"].endswith("/token") for c in self.fake.calls))
        self.assertFalse(Path(os.environ["CYD_TOKEN_FILE"]).exists())

    def test_browser_sign_in_refused(self):
        self.fake.browser_mode = "deny"
        code, out = self.main("signin")
        self.assertEqual(code, 1)
        self.assertIn("AADSTS65004", out)
        self.assertIn("Not signed in", self.fake.pages()[0])
        self.assertFalse(Path(os.environ["CYD_TOKEN_FILE"]).exists())

    def test_sign_in_by_device_code(self):
        code, out = self.main("signin", "--device-code")
        self.assertEqual(code, 0, out)
        self.assertIn("ABCD-EFGH", out)
        self.assertIn("Signed in as albert@clubyuppie.com", out)
        asked = self.fake.calls[0]["form"]["scope"][0].split()
        self.assertEqual(sorted(asked), sorted(dp.SCOPES))
        self.assertFalse(any("send" in s.lower() for s in asked))
        self.assertTrue(Path(os.environ["CYD_TOKEN_FILE"]).read_text().startswith("refresh-"))
        self.assertTrue(self.fake.calls[0]["path"].startswith("/tenant-1/"))

    def test_drafts_a_waiting_email_and_marks_it(self):
        path = self.eml()
        self.sign_in()
        self.fake.calls.clear()
        code, out = self.main()
        self.assertEqual(code, 0, out)
        self.assertIn("Drafted: Acme Barbers", out)
        self.assertEqual(len(self.fake.messages), 1)
        sent = self.fake.messages["m1"]
        self.assertEqual(sent["subject"], "Club Yuppie partnership, Acme’s Corporate Club for our members")
        self.assertEqual(sent["toRecipients"], [{"emailAddress": {"address": "partners@acme.example", "name": "Acme Partnerships"}}])
        self.assertEqual(sent["body"]["contentType"], "HTML")
        att = sent["attachments"][0]
        self.assertEqual((att["@odata.type"], att["name"], att["contentType"]), ("#microsoft.graph.fileAttachment", "Club Yuppie x Acme Barbers - partner overview.pdf", "application/pdf"))
        self.assertEqual(base64.b64decode(att["contentBytes"]), PDF)
        self.assertEqual(sent["singleValueExtendedProperties"], [{"id": dp.DRAFT_KEY_PROPERTY, "value": hashlib.sha256(path.read_bytes()).hexdigest()}])
        marker = json.loads(dp.marker_for(path).read_text())
        self.assertEqual((marker["draftId"], marker["mailbox"], marker["alreadyThere"]), ("m1", "albert@clubyuppie.com", False))
        self.assertFalse(any("send" in c["path"].lower() for c in self.fake.calls))
        # again: nothing waiting
        self.fake.calls.clear()
        code, out = self.main()
        self.assertIn("Nothing new to draft", out)
        self.assertEqual(self.fake.calls, [])

    def test_no_second_draft_for_the_same_file(self):
        path = self.eml()
        self.sign_in()
        self.fake.existing = {"id": "old1", "webLink": "https://outlook/old1", "subject": "x", "isDraft": True}
        code, out = self.main()
        self.assertEqual(code, 0, out)
        self.assertIn("Already in Outlook", out)
        self.assertEqual(self.fake.messages, {})
        self.assertTrue(json.loads(dp.marker_for(path).read_text())["alreadyThere"])
        lookup = [c for c in self.fake.calls if c["method"] == "GET" and c["path"] == "/v1.0/me/messages"][0]["query"]
        self.assertIn(f"ep/id eq '{dp.DRAFT_KEY_PROPERTY}'", lookup)

    def test_wrong_mailbox_drafts_nothing(self):
        path = self.eml()
        self.sign_in()
        self.fake.mailbox = "someone@else.example"
        code, out = self.main()
        self.assertEqual(code, 1)
        self.assertIn("not albert@clubyuppie.com", out)
        self.assertEqual(self.fake.messages, {})
        self.assertFalse(dp.marker_for(path).exists())

    def test_signin_as_wrong_mailbox_keeps_nothing(self):
        self.fake.mailbox = "someone@else.example"
        code, out = self.main("signin")
        self.assertEqual(code, 1)
        self.assertFalse(Path(os.environ["CYD_TOKEN_FILE"]).exists())

    def test_a_sign_in_that_can_send_is_refused(self):
        path = self.eml()
        self.sign_in()
        self.fake.token_scp = "Mail.ReadWrite Mail.Send User.Read"
        code, out = self.main()
        self.assertEqual(code, 1)
        self.assertIn("Mail.Send", out)
        self.assertEqual(self.fake.messages, {})
        self.assertFalse(dp.marker_for(path).exists())

    def test_big_pdf_goes_up_in_pieces_without_the_sign_in(self):
        big = PDF + b"0" * (4 * 1024 * 1024)
        path = self.eml(pdf=big)
        self.sign_in()
        code, out = self.main()
        self.assertEqual(code, 0, out)
        self.assertNotIn("attachments", self.fake.messages["m1"])
        puts = [c for c in self.fake.calls if c["method"] == "PUT"]
        self.assertEqual(len(puts), 2)
        self.assertEqual(b"".join(c["raw"] for c in puts), big)
        self.assertTrue(all("Authorization" not in c["headers"] for c in puts))
        self.assertTrue(dp.marker_for(path).exists())

    def test_failed_upload_takes_the_half_draft_away(self):
        path = self.eml(pdf=PDF + b"0" * (4 * 1024 * 1024))
        self.sign_in()
        self.fake.fail_upload = True
        code, out = self.main()
        self.assertEqual(code, 1)
        self.assertIn("Not drafted", out)
        self.assertEqual(self.fake.messages, {})
        self.assertIn("DELETE", [c["method"] for c in self.fake.calls])
        self.assertFalse(dp.marker_for(path).exists())

    def test_a_401_is_retried_once(self):
        self.eml()
        self.sign_in()
        self.fake.unauthorized_once = True
        code, out = self.main()
        self.assertEqual(code, 0, out)
        self.assertEqual(len(self.fake.messages), 1)

    def test_the_test_draft_goes_to_the_mailbox_itself(self):
        self.sign_in()
        code, out = self.main("test")
        self.assertEqual(code, 0, out)
        sent = self.fake.messages["m1"]
        self.assertEqual(sent["toRecipients"][0]["emailAddress"]["address"], "albert@clubyuppie.com")
        self.assertIn("(delete me)", sent["subject"])
        self.assertTrue(base64.b64decode(sent["attachments"][0]["contentBytes"]).startswith(b"%PDF-1.4"))
        self.assertEqual(dp.waiting(self.root), [])

    # ---------------------------------------------------------------- the signature
    LOGO = b"\x89PNG\r\n\x1a\nlogo"

    def outlook_signature_draft(self, html, attachments=None, when="2026-11-09T23:00:00Z", mid="sig2"):
        self.fake.drafts_folder.append({"id": mid, "subject": dp.SIGNATURE_SUBJECT, "lastModifiedDateTime": when,
                                        "body": {"contentType": "html", "content": html}, "attachments": attachments or []})

    def test_signature_copied_from_outlook_goes_into_every_draft(self):
        self.outlook_signature_draft(
            "<html><head><style>p{margin:0}</style></head><body><div><br></div>"
            '<div id="Signature"><div><p>Albert Castle<br>Founder, Club Yuppie Ltd.</p><img src="cid:image001.png@01DB"></div></div>'
            "</body></html>",
            [{"name": "image001.png", "contentType": "image/png", "isInline": True, "contentId": "image001.png@01DB", "contentBytes": base64.b64encode(self.LOGO).decode()},
             {"name": "other.png", "contentType": "image/png", "isInline": True, "contentId": "other@x", "contentBytes": "AA=="}],
        )
        self.outlook_signature_draft("<html><body><p>an older one</p></body></html>", when="2026-01-01T00:00:00Z", mid="sig1")
        self.sign_in()
        code, out = self.main("signature")
        self.assertEqual(code, 0, out)
        self.assertIn("Albert Castle / Founder, Club Yuppie Ltd.", out)
        self.assertIn("(1 image)", out)
        saved = json.loads(dp.signature_path().read_text())
        self.assertEqual(saved["html"], '<div id="Signature"><div><p>Albert Castle<br>Founder, Club Yuppie Ltd.</p><img src="cid:image001.png@01DB"></div></div>')
        self.assertEqual([i["contentId"] for i in saved["images"]], ["image001.png@01DB"])
        self.assertEqual(oct(dp.signature_path().stat().st_mode & 0o777), "0o600")
        # a dry run says so, and the draft carries it
        path = self.eml()
        code, out = self.main("--dry-run")
        self.assertIn("Signature: your signature added", out)
        self.assertNotIn("image001.png", out)
        code, out = self.main()
        self.assertEqual(code, 0, out)
        sent = self.fake.messages["m1"]
        self.assertIn('<p>Kind regards,</p><div id="Signature">', sent["body"]["content"])
        logo = [a for a in sent["attachments"] if a.get("isInline")]
        self.assertEqual([(a["contentId"], base64.b64decode(a["contentBytes"])) for a in logo], [("image001.png@01DB", self.LOGO)])
        self.assertTrue(dp.marker_for(path).exists())
        self.assertFalse(any("send" in c["path"].lower() for c in self.fake.calls))
        # and it can be taken off again
        code, out = self.main("signature", "--remove")
        self.assertEqual(code, 0, out)
        self.assertFalse(dp.signature_path().exists())

    def test_signature_without_outlooks_wrapper_drops_the_blank_lines_above_it(self):
        html = "<html><body><div><br></div><p>&nbsp;</p><div style='x'> <br/> </div><p>Albert Castle</p><p>Founder</p></body></html>"
        self.assertEqual(dp.signature_part(html), "<p>Albert Castle</p><p>Founder</p>")

    def test_no_signature_draft_says_how_to_make_one(self):
        self.sign_in()
        code, out = self.main("signature")
        self.assertEqual(code, 1)
        self.assertIn(f'no draft called "{dp.SIGNATURE_SUBJECT}"', out)
        self.assertFalse(dp.signature_path().exists())

    def test_no_signature_means_the_dry_run_says_add_it(self):
        self.eml()
        code, out = self.main("--dry-run")
        self.assertIn("Signature: none (add your signature in Outlook before sending)", out)

    # ---------------------------------------------------------------- any email, from "Emails to draft"
    def test_any_email_goes_in_without_an_attachment(self):
        emails = self.root.parent / dp.EMAILS_FOLDER
        loose = make_eml(emails / f"Email to Sam Smith{dp.PENDING_SUFFIX}", to="Sam Smith <sam@example.com>", subject="Coffee next week", pdf=None)
        nested = make_eml(emails / "Kira" / f"Intro to Kira{dp.PENDING_SUFFIX}", to="kira@example.com", subject="An introduction", pdf=None)
        make_eml(emails / "_to_delete" / f"Old one{dp.PENDING_SUFFIX}", pdf=None)
        no_pdf_partner = self.eml("Acme Barbers", pdf=None)
        with_pdf_partner = self.eml("Bravo Gyms")
        self.assertEqual(dp.all_waiting(dp.load_config()), [no_pdf_partner, with_pdf_partner, loose, nested])
        code, out = self.main("--dry-run")
        self.assertIn(f"Would draft {dp.EMAILS_FOLDER} / Email to Sam Smith{dp.PENDING_SUFFIX}", out)
        self.assertIn("Attached: nothing", out)
        self.sign_in()
        code, out = self.main()
        self.assertEqual(code, 1, out)  # the partner email without its PDF is held back
        self.assertIn("has no PDF attached (a partner email needs its overview)", out)
        self.assertFalse(dp.marker_for(no_pdf_partner).exists())
        subjects = sorted(m["subject"] for m in self.fake.messages.values())
        self.assertEqual(subjects, ["An introduction", "Club Yuppie partnership, Acme’s Corporate Club for our members", "Coffee next week"])
        coffee = [m for m in self.fake.messages.values() if m["subject"] == "Coffee next week"][0]
        self.assertNotIn("attachments", coffee)
        self.assertEqual(coffee["toRecipients"], [{"emailAddress": {"address": "sam@example.com", "name": "Sam Smith"}}])
        for path in (loose, nested, with_pdf_partner):
            self.assertTrue(dp.marker_for(path).exists())
        self.assertEqual(dp.all_waiting(dp.load_config()), [no_pdf_partner])

    def test_emails_folder_on_its_own_and_in_status(self):
        cfg = dp.load_config()
        emails = self.root.parent / dp.EMAILS_FOLDER
        dp.save_config({**cfg, "root": str(self.root.parent / "nowhere")})
        with self.assertRaisesRegex(dp.DraftError, "Couldn't find"):
            dp.all_waiting(dp.load_config())
        dp.save_config({**cfg, "root": str(self.root.parent / "nowhere"), "emails_root": str(emails)})
        emails.mkdir()
        path = make_eml(emails / f"Email to Sam{dp.PENDING_SUFFIX}", pdf=None)
        self.assertEqual(dp.all_waiting(dp.load_config()), [path])
        code, out = self.main("status")
        self.assertIn(f"{dp.EMAILS_FOLDER}: {emails} (1 waiting)", out)

    # ---------------------------------------------------------------- skip
    def test_skip_any_email_by_words_in_its_name(self):
        emails = self.root.parent / dp.EMAILS_FOLDER
        sam = make_eml(emails / f"Email to Sam Smith{dp.PENDING_SUFFIX}", pdf=None)
        other = make_eml(emails / f"Email to Jo{dp.PENDING_SUFFIX}", pdf=None)
        code, out = self.main("skip", "sam smith")
        self.assertEqual(code, 0, out)
        self.assertTrue(dp.marker_for(sam).exists())
        self.assertFalse(dp.marker_for(other).exists())
        code, out = self.main("skip", "nobody")
        self.assertIn("Waiting: Email to Jo.", out)

    def test_skip_marks_a_brand_done_without_drafting(self):
        a = self.eml("Headmasters")
        b = self.eml("Bravo Gyms")
        code, out = self.main("skip", "headmasters")
        self.assertEqual(code, 0, out)
        self.assertTrue(json.loads(dp.marker_for(a).read_text())["skipped"])
        self.assertEqual(dp.waiting(self.root), [b])
        self.assertEqual(self.fake.calls, [])
        code, out = self.main("skip", "Nobody")
        self.assertEqual(code, 1)
        self.assertIn("Nothing waiting for Nobody. Waiting: Bravo Gyms.", out)

    def test_not_set_up_or_not_signed_in(self):
        self.eml()
        code, out = self.main()
        self.assertEqual(code, 1)
        self.assertIn("Not signed in", out)
        dp.save_config({})
        code, out = self.main("--root", str(self.root))
        self.assertIn("Not set up yet", out)


if __name__ == "__main__":
    unittest.main()
