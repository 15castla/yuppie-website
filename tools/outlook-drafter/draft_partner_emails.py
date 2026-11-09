#!/usr/bin/env python3
"""Club Yuppie Outlook drafter: partner emails into Albert's Outlook Drafts. It never sends.

Albert's decision (9 Nov 2026): the partner-emails skill saves each email to OneDrive as
"Partner emails/<Brand>/Email to <Brand> - ready to send.eml" (To, Subject, HTML body, the PDF overview attached).
This turns each one that has no ".drafted" marker beside it into a draft in albert@clubyuppie.com's Outlook, through
Microsoft Graph (POST /me/messages with the PDF as a fileAttachment), then writes the marker so it is drafted once.

Safety:
  - Delegated permissions only: Mail.ReadWrite, User.Read, offline_access. Never Mail.Send: it is not asked for, a
    token that carries it anyway is refused, and nothing here calls a send endpoint. Albert sends every email himself.
  - Single-tenant public-client app registration ("Club Yuppie Drafts"), no client secret. Sign-in is in the browser
    (authorization code with PKCE, back to this Mac at http://localhost): Club Yuppie's security defaults block the
    device-code sign-in Albert first chose (error 530035, 9 Nov 2026), so that is kept only as "signin --device-code".
  - The sign-in (a refresh token) is kept in the macOS Keychain (service "club-yuppie-drafts"), never in a file, and
    is never printed.
  - It drafts only into the mailbox in the config (albert@clubyuppie.com): signed in as anyone else, it stops.
  - Outlook's own signature is not added to drafts made through Graph, and Graph cannot read it. So "signature" copies
    it once from a draft Albert makes in Outlook (subject "Club Yuppie signature": Outlook puts his signature in by
    itself), logo included, into ~/.config/club-yuppie-drafts/signature.json, and every draft then ends with it.
  - A draft carries a hidden key (the .eml's SHA-256), so a run that is cut short before the marker is written finds
    the draft it made instead of making a second one.

Commands (installed as "draft-partner-emails" by install.sh):
  draft-partner-emails                  draft every new "... - ready to send.eml"
  draft-partner-emails --dry-run        show what would be drafted; no sign-in, nothing changed
  draft-partner-emails --only FILE.eml  just this file (any folder)
  draft-partner-emails --watch          keep looking, every 60 seconds, until Ctrl-C
  draft-partner-emails setup --tenant ID --client ID [--mailbox ADDR] [--root DIR] [--signature FILE.html]
  draft-partner-emails signin           sign in once, in the browser (--device-code: with a code instead)
  draft-partner-emails signout          forget the sign-in (removes it from the Keychain)
  draft-partner-emails signature        copy Albert's Outlook signature (from a draft titled "Club Yuppie signature"),
                                        added to every draft from then on (--remove: stop adding it)
  draft-partner-emails skip BRAND       mark a brand's waiting email as done without drafting it (sent by hand)
  draft-partner-emails test             one dummy draft to the configured mailbox, to check it all works
  draft-partner-emails status           the settings, the folder, how many are waiting, signed in or not

Python 3.9 or later, standard library only (macOS's own python3 works). Documented in the project's
Yuppie_Technical_Reference.md, "Outlook drafter".
"""

from __future__ import annotations

import argparse
import base64
import datetime
import hashlib
import json
import os
import platform
import re
import secrets
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from dataclasses import dataclass, field
from email import policy
from email.message import EmailMessage
from email.parser import BytesParser
from email.utils import getaddresses
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

DEFAULT_MAILBOX = "albert@clubyuppie.com"
SCOPES = ["https://graph.microsoft.com/Mail.ReadWrite", "https://graph.microsoft.com/User.Read", "offline_access"]
# Never these: a token that carries one is refused (the app registration should not have them at all).
FORBIDDEN_SCOPES = {"mail.send", "mail.send.shared", "mail.send.all"}
LOGIN_BASE = os.environ.get("CYD_LOGIN_BASE", "https://login.microsoftonline.com").rstrip("/")
GRAPH_BASE = os.environ.get("CYD_GRAPH_BASE", "https://graph.microsoft.com/v1.0").rstrip("/")
CONFIG_PATH = Path(os.environ.get("CYD_CONFIG", str(Path.home() / ".config" / "club-yuppie-drafts" / "config.json")))
KEYCHAIN_SERVICE = "club-yuppie-drafts"
PENDING_SUFFIX = " - ready to send.eml"
MARKER_SUFFIX = ".drafted"
# A hidden property on each draft: the .eml's SHA-256, so a draft is never made twice for one file.
DRAFT_KEY_PROPERTY = "String {566da39a-e7d3-4358-bb63-1a50b006da7f} Name ClubYuppieDraftKey"
# Graph takes attachments up to 3 MB in the request itself; bigger ones go through an upload session.
INLINE_LIMIT = 3 * 1024 * 1024
UPLOAD_CHUNK = 320 * 1024 * 10  # a multiple of 320 KiB, as upload sessions need
WATCH_SECONDS = 60
# Albert makes a draft in Outlook with this subject (Outlook adds his signature to it by itself); "signature" copies it.
SIGNATURE_SUBJECT = "Club Yuppie signature"
# Browser sign-in: Microsoft sends the browser back to http://localhost:<a free port> on this Mac (the app
# registration has the redirect URI "http://localhost" under "Mobile and desktop applications"; the port can vary).
SIGNIN_WAIT = 300
SIGNED_IN_PAGE = """<!doctype html><meta charset="utf-8"><title>Club Yuppie Drafts</title>
<body style="font-family:-apple-system,Helvetica,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;line-height:1.5">
<h1 style="font-size:1.4rem">{title}</h1><p>{text}</p></body>"""


class DraftError(Exception):
    """Something Albert should read: printed as it is, no stack trace."""


# ---------------------------------------------------------------------------------------------------- settings


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        return {}
    try:
        return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError) as err:
        raise DraftError(f"Couldn't read the settings in {CONFIG_PATH}: {err}") from None


def save_config(cfg: dict) -> None:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2) + "\n", encoding="utf-8")
    os.chmod(CONFIG_PATH, 0o600)


def signature_path() -> Path:
    return CONFIG_PATH.parent / "signature.json"


def mailbox_of(cfg: dict) -> str:
    return (cfg.get("mailbox") or DEFAULT_MAILBOX).strip().lower()


def find_root(cfg: dict) -> Path | None:
    """OneDrive's "Partner emails" folder: the one in the settings, else found in ~/Library/CloudStorage."""
    if cfg.get("root"):
        return Path(cfg["root"]).expanduser()
    cloud = Path.home() / "Library" / "CloudStorage"
    if cloud.is_dir():
        for drive in sorted(cloud.glob("OneDrive*")):
            folder = drive / "Partner emails"
            if folder.is_dir():
                return folder
    legacy = Path.home() / "OneDrive" / "Partner emails"
    return legacy if legacy.is_dir() else None


# ---------------------------------------------------------------------------------------------------- the files


def marker_for(eml: Path) -> Path:
    """"Email to Acme - ready to send.eml" -> "Email to Acme - ready to send.drafted", beside it."""
    return eml.with_name(eml.name[: -len(".eml")] + MARKER_SUFFIX)


def waiting(root: Path) -> list[Path]:
    """Every "<Brand>/... - ready to send.eml" with no marker. Folders starting with "_" or "." are skipped."""
    found = []
    for brand in sorted(p for p in root.iterdir() if p.is_dir() and not p.name.startswith(("_", "."))):
        for eml in sorted(brand.glob("*" + PENDING_SUFFIX)):
            if eml.is_file() and not marker_for(eml).exists():
                found.append(eml)
    return found


@dataclass
class Attachment:
    name: str
    content_type: str
    data: bytes
    content_id: str | None = None


@dataclass
class Draft:
    source: Path
    subject: str
    to: list[tuple[str, str]]
    cc: list[tuple[str, str]]
    body: str
    is_html: bool
    attachments: list[Attachment] = field(default_factory=list)
    key: str = ""
    signed: bool = False


def _addresses(msg: EmailMessage, header: str) -> list[tuple[str, str]]:
    values = [str(h) for h in msg.get_all(header, [])]
    return [(name.strip(), addr.strip()) for name, addr in getaddresses(values) if addr.strip()]


def parse_eml(path: Path, signature_html: str | None = None, signature_images: list[Attachment] | None = None) -> Draft:
    """To, Cc, Subject, the HTML body (plain text if that is all there is) and the attachments."""
    try:
        raw = path.read_bytes()
    except OSError as err:
        raise DraftError(f"Couldn't read {path.name}: {err}") from None
    msg = BytesParser(policy=policy.default).parsebytes(raw)
    to = _addresses(msg, "To")
    cc = _addresses(msg, "Cc")
    subject = str(msg.get("Subject", "")).strip()
    if not to:
        raise DraftError(f"{path.name} has no To address.")
    for _, addr in to + cc:
        if "@" not in addr or " " in addr:
            raise DraftError(f"{path.name} has an address that doesn't look right: {addr!r}")
    if not subject:
        raise DraftError(f"{path.name} has no subject.")
    part = msg.get_body(preferencelist=("html", "plain"))
    if part is None:
        raise DraftError(f"{path.name} has no email text.")
    body = part.get_content()
    is_html = part.get_content_subtype() == "html"
    signed = bool(signature_html and is_html)
    if signed:
        lower = body.lower()
        at = lower.rfind("</body>")
        body = body[:at] + signature_html + body[at:] if at >= 0 else body + signature_html
    attachments = []
    for item in msg.iter_attachments():
        data = item.get_payload(decode=True) or b""
        cid = item.get("Content-ID")
        attachments.append(
            Attachment(
                name=item.get_filename() or "attachment",
                content_type=item.get_content_type(),
                data=data,
                content_id=str(cid).strip("<> ") if cid else None,
            )
        )
    if not any(a.content_type == "application/pdf" or a.name.lower().endswith(".pdf") for a in attachments):
        raise DraftError(f"{path.name} has no PDF attached.")
    if signed:
        attachments += list(signature_images or [])
    return Draft(
        source=path,
        subject=subject,
        to=to,
        cc=cc,
        body=body,
        is_html=is_html,
        attachments=attachments,
        key=hashlib.sha256(raw).hexdigest(),
        signed=signed,
    )


def describe(draft: Draft) -> str:
    to = ", ".join(addr for _, addr in draft.to)
    cc = (" (cc " + ", ".join(addr for _, addr in draft.cc) + ")") if draft.cc else ""
    files = ", ".join(f"{a.name} ({len(a.data) // 1024} KB)" for a in draft.attachments if not a.content_id)
    signature = "your signature added" if draft.signed else "none (add your signature in Outlook before sending)"
    return f"To {to}{cc}\n    Subject: {draft.subject}\n    Attached: {files}\n    Signature: {signature}"


# ---------------------------------------------------------------------------------------------------- the sign-in


class KeychainStore:
    """The refresh token in the macOS Keychain. The secret goes to `security` on its standard input, hex-encoded,
    so it never appears in a command line; it is read back with -w into a pipe, never printed."""

    def __init__(self, account: str):
        self.account = account

    def get(self) -> str | None:
        done = subprocess.run(
            ["security", "find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", self.account, "-w"],
            capture_output=True,
            text=True,
        )
        if done.returncode != 0:
            return None
        return done.stdout.strip() or None

    def set(self, secret: str) -> None:
        command = f"add-generic-password -U -s {KEYCHAIN_SERVICE} -a {self.account} -X {secret.encode('utf-8').hex()}\n"
        done = subprocess.run(["security", "-i"], input=command, capture_output=True, text=True)
        if done.returncode != 0 or "error" in (done.stderr or "").lower():
            raise DraftError("Couldn't save the sign-in to the Keychain.")

    def delete(self) -> None:
        subprocess.run(["security", "delete-generic-password", "-s", KEYCHAIN_SERVICE, "-a", self.account], capture_output=True)


class FileStore:
    """For the tests only (CYD_TOKEN_FILE): a file instead of the Keychain."""

    def __init__(self, path: str):
        self.path = Path(path)

    def get(self) -> str | None:
        return self.path.read_text().strip() if self.path.exists() else None

    def set(self, secret: str) -> None:
        self.path.write_text(secret)
        os.chmod(self.path, 0o600)

    def delete(self) -> None:
        if self.path.exists():
            self.path.unlink()


def token_store(cfg: dict):
    if os.environ.get("CYD_TOKEN_FILE"):
        return FileStore(os.environ["CYD_TOKEN_FILE"])
    if platform.system() != "Darwin":
        raise DraftError("The sign-in is kept in the macOS Keychain: run this on the Mac.")
    return KeychainStore(mailbox_of(cfg))


def http(method: str, url: str, *, form: dict | None = None, body: dict | None = None, data: bytes | None = None,
         headers: dict | None = None, timeout: int = 60) -> tuple[int, dict, bytes]:
    """One request. Returns (status, headers, body); a non-2xx answer is returned, not raised."""
    send = dict(headers or {})
    if form is not None:
        data = urllib.parse.urlencode(form).encode()
        send["Content-Type"] = "application/x-www-form-urlencoded"
    elif body is not None:
        data = json.dumps(body).encode()
        send["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, method=method, headers=send)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, dict(response.headers), response.read()
    except urllib.error.HTTPError as err:
        with err:
            return err.code, dict(err.headers or {}), err.read()
    except urllib.error.URLError as err:
        raise DraftError(f"No connection to {urllib.parse.urlsplit(url).netloc}: {err.reason}") from None


def _json(raw: bytes) -> dict:
    try:
        return json.loads(raw.decode("utf-8") or "{}")
    except ValueError:
        return {}


def _scopes_in(token: str) -> set[str]:
    """The scp claim of an access token (read, not verified: only to refuse one that can send)."""
    try:
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        claims = json.loads(base64.urlsafe_b64decode(payload))
        return {s.lower() for s in str(claims.get("scp", "")).split()}
    except (IndexError, ValueError):
        return set()


def open_browser(url: str) -> bool:
    """Opens the sign-in page in the Mac's default browser (replaced in the tests)."""
    try:
        return webbrowser.open(url)
    except webbrowser.Error:
        return False


class Auth:
    def __init__(self, cfg: dict):
        self.tenant = cfg.get("tenant")
        self.client = cfg.get("client")
        if not self.tenant or not self.client:
            raise DraftError('Not set up yet. Run: draft-partner-emails setup --tenant <Directory (tenant) ID> --client <Application (client) ID>')
        self.store = token_store(cfg)
        self.access: str | None = None

    def _url(self, path: str) -> str:
        return f"{LOGIN_BASE}/{urllib.parse.quote(self.tenant)}/oauth2/v2.0/{path}"

    def _accept(self, answer: dict) -> str:
        granted = {s.lower().rsplit("/", 1)[-1] for s in str(answer.get("scope", "")).split()}
        token = answer.get("access_token")
        if not token:
            raise DraftError("Microsoft didn't return a sign-in.")
        if (granted | {s.rsplit("/", 1)[-1] for s in _scopes_in(token)}) & FORBIDDEN_SCOPES:
            raise DraftError("This sign-in can send email (Mail.Send). Remove Mail.Send from the Club Yuppie Drafts app registration, then run signout and signin again.")
        if answer.get("refresh_token"):
            self.store.set(answer["refresh_token"])
        self.access = token
        return token

    def sign_in(self, mailbox: str, device_code: bool = False) -> str:
        return self._sign_in_with_code() if device_code else self._sign_in_in_browser(mailbox)

    def _sign_in_in_browser(self, mailbox: str) -> str:
        """Authorization code with PKCE: the browser signs in at Microsoft, which sends it back to a one-off listener
        on this Mac (127.0.0.1 only) with a code; the code and the PKCE verifier are swapped for the sign-in."""
        verifier = secrets.token_urlsafe(64)
        challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
        state = secrets.token_urlsafe(24)
        reply: dict = {}

        class Callback(BaseHTTPRequestHandler):
            timeout = 10  # a browser's idle pre-opened connection can't hold the listener up

            def log_message(self, *args):
                pass

            def do_GET(self):  # noqa: N802
                got = {k: v[0] for k, v in urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query).items()}
                if reply or ("code" not in got and "error" not in got):  # a favicon, or after the answer
                    self.send_response(404)
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return
                if got.get("state") != state:
                    reply["error"] = "This sign-in doesn't match the one Terminal started."
                    title, text = "Not signed in", "This doesn't match the sign-in Terminal started. Run draft-partner-emails signin again."
                elif "error" in got:
                    reply["error"] = got.get("error_description") or got["error"]
                    title, text = "Not signed in", "Microsoft didn't finish the sign-in. Go back to Terminal to see why."
                else:
                    reply["code"] = got["code"]
                    title, text = "Signed in", "You can close this tab and go back to Terminal."
                page = SIGNED_IN_PAGE.format(title=title, text=text).encode()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(page)))
                self.end_headers()
                self.wfile.write(page)

        server = ThreadingHTTPServer(("127.0.0.1", 0), Callback)
        server.timeout = 1
        try:
            redirect = f"http://localhost:{server.server_address[1]}"
            url = self._url("authorize") + "?" + urllib.parse.urlencode({
                "client_id": self.client,
                "response_type": "code",
                "redirect_uri": redirect,
                "response_mode": "query",
                "scope": " ".join(SCOPES),
                "state": state,
                "code_challenge": challenge,
                "code_challenge_method": "S256",
                "login_hint": mailbox,
            })
            print(f"Opening your browser to sign in as {mailbox}. If it doesn't open, copy this address into it:\n{url}")
            open_browser(url)
            print("Waiting for the sign-in (5 minutes at most)...")
            deadline = time.time() + SIGNIN_WAIT
            while not reply and time.time() < deadline:
                server.handle_request()
        finally:
            server.server_close()
        if not reply:
            raise DraftError("The sign-in timed out. Run signin again. If the browser showed a Microsoft error such as AADSTS50011, "
                             "add the redirect URI http://localhost under \"Mobile and desktop applications\" in the app registration.")
        if "error" in reply:
            raise DraftError(f"Sign-in didn't finish: {reply['error']}")
        status, _, raw = http(
            "POST",
            self._url("token"),
            form={"grant_type": "authorization_code", "client_id": self.client, "code": reply["code"], "redirect_uri": redirect,
                  "code_verifier": verifier, "scope": " ".join(SCOPES)},
        )
        answer = _json(raw)
        if status != 200:
            why = str(answer.get("error_description") or answer.get("error") or status)
            if "AADSTS7000218" in why:
                why += ' (the redirect URI http://localhost must be under "Mobile and desktop applications", not "Web")'
            raise DraftError(f"Sign-in didn't finish: {why}")
        return self._accept(answer)

    def _sign_in_with_code(self) -> str:
        status, _, raw = http("POST", self._url("devicecode"), form={"client_id": self.client, "scope": " ".join(SCOPES)})
        code = _json(raw)
        if status != 200 or "device_code" not in code:
            raise DraftError(f"Microsoft refused the sign-in request: {code.get('error_description') or code.get('error') or status}")
        print(code.get("message") or f"Open {code['verification_uri']} and enter the code {code['user_code']}")
        print("Sign in as the Club Yuppie mailbox and accept the permissions. Waiting...")
        interval = int(code.get("interval", 5))
        deadline = time.time() + int(code.get("expires_in", 900))
        while time.time() < deadline:
            time.sleep(interval)
            status, _, raw = http(
                "POST",
                self._url("token"),
                form={"grant_type": "urn:ietf:params:oauth:grant-type:device_code", "client_id": self.client, "device_code": code["device_code"]},
            )
            answer = _json(raw)
            if status == 200:
                return self._accept(answer)
            error = answer.get("error")
            if error == "authorization_pending":
                continue
            if error == "slow_down":
                interval += 5
                continue
            raise DraftError(f"Sign-in didn't finish: {answer.get('error_description') or error or status}")
        raise DraftError("The sign-in code expired. Run signin again.")

    def token(self) -> str:
        if self.access:
            return self.access
        refresh = self.store.get()
        if not refresh:
            raise DraftError("Not signed in. Run: draft-partner-emails signin")
        status, _, raw = http(
            "POST",
            self._url("token"),
            form={"grant_type": "refresh_token", "client_id": self.client, "refresh_token": refresh, "scope": " ".join(SCOPES)},
        )
        answer = _json(raw)
        if status != 200:
            raise DraftError(f"The sign-in has run out ({answer.get('error') or status}). Run: draft-partner-emails signin")
        return self._accept(answer)

    def forget(self) -> None:
        self.access = None


# ---------------------------------------------------------------------------------------------------- Graph


class Graph:
    def __init__(self, auth: Auth):
        self.auth = auth

    def call(self, method: str, path: str, body: dict | None = None) -> dict:
        url = path if path.startswith("http") else GRAPH_BASE + path
        for attempt in range(4):
            status, headers, raw = http(method, url, body=body, headers={"Authorization": f"Bearer {self.auth.token()}"})
            if status == 401 and attempt == 0:
                self.auth.forget()
                continue
            if status in (429, 503, 504) and attempt < 3:
                time.sleep(min(30, int(headers.get("Retry-After", "5") or 5)))
                continue
            if 200 <= status < 300:
                return _json(raw)
            err = _json(raw).get("error", {})
            raise DraftError(f"Outlook said no ({status} {err.get('code', '')}): {err.get('message', '')}".strip())
        raise DraftError("Outlook didn't answer. Try again in a minute.")

    def mailbox(self) -> str:
        me = self.call("GET", "/me?$select=mail,userPrincipalName")
        return (me.get("mail") or me.get("userPrincipalName") or "").lower()

    def existing(self, key: str) -> dict | None:
        """A draft (or the sent email) this tool already made for this exact .eml, in any folder."""
        rule = f"singleValueExtendedProperties/Any(ep: ep/id eq '{DRAFT_KEY_PROPERTY}' and ep/value eq '{key}')"
        query = "$filter=" + urllib.parse.quote(rule, safe="") + "&$select=id,subject,webLink,isDraft&$top=1"
        try:
            found = self.call("GET", f"/me/messages?{query}").get("value", [])
        except DraftError as err:
            # The check is a backstop (the marker is the main guard): if Outlook won't answer it, say so and go on.
            print(f"    (Couldn't check for an earlier draft of this file: {err})")
            return None
        return found[0] if found else None

    def signature_draft(self) -> tuple[str, list[dict]]:
        """The newest draft titled SIGNATURE_SUBJECT: its HTML and its attachments."""
        rule = urllib.parse.quote(f"subject eq '{SIGNATURE_SUBJECT}'", safe="")
        found = self.call("GET", f"/me/mailFolders/drafts/messages?$filter={rule}&$select=id,subject,lastModifiedDateTime&$top=20").get("value", [])
        if not found:
            raise DraftError(
                f'There\'s no draft called "{SIGNATURE_SUBJECT}" in Outlook Drafts. In Outlook, start a new email (your signature '
                f'appears by itself), type {SIGNATURE_SUBJECT} as the subject, close it so it is saved in Drafts, then run this again.'
            )
        newest = max(found, key=lambda m: m.get("lastModifiedDateTime") or "")
        mid = urllib.parse.quote(newest["id"], safe="")
        body = self.call("GET", f"/me/messages/{mid}?$select=body").get("body", {})
        if str(body.get("contentType", "")).lower() != "html":
            raise DraftError(f'The "{SIGNATURE_SUBJECT}" draft is plain text. Make it in Outlook as a normal (HTML) email.')
        attachments = self.call("GET", f"/me/messages/{mid}/attachments").get("value", [])
        return body.get("content", ""), attachments

    @staticmethod
    def _file(a: Attachment) -> dict:
        item = {
            "@odata.type": "#microsoft.graph.fileAttachment",
            "name": a.name,
            "contentType": a.content_type,
            "contentBytes": base64.b64encode(a.data).decode("ascii"),
        }
        if a.content_id:
            item.update({"isInline": True, "contentId": a.content_id})
        return item

    def _attach(self, message_id: str, a: Attachment) -> None:
        if len(a.data) < INLINE_LIMIT:
            self.call("POST", f"/me/messages/{message_id}/attachments", self._file(a))
            return
        item = {"attachmentType": "file", "name": a.name, "size": len(a.data), "contentType": a.content_type}
        if a.content_id:
            item.update({"isInline": True, "contentId": a.content_id})
        session = self.call("POST", f"/me/messages/{message_id}/attachments/createUploadSession", {"AttachmentItem": item})
        upload = session.get("uploadUrl")
        if not upload:
            raise DraftError(f"Outlook didn't take {a.name}.")
        total = len(a.data)
        for start in range(0, total, UPLOAD_CHUNK):
            chunk = a.data[start : start + UPLOAD_CHUNK]
            end = start + len(chunk) - 1
            # The upload address carries its own permission: no Authorization header (Graph refuses one).
            status, _, _ = http("PUT", upload, data=chunk, headers={"Content-Type": "application/octet-stream", "Content-Range": f"bytes {start}-{end}/{total}"})
            if status not in (200, 201):
                raise DraftError(f"Uploading {a.name} stopped ({status}).")

    def create_draft(self, draft: Draft) -> dict:
        def people(pairs):
            return [{"emailAddress": {"address": addr, **({"name": name} if name else {})}} for name, addr in pairs]

        message = {
            "subject": draft.subject,
            "body": {"contentType": "HTML" if draft.is_html else "Text", "content": draft.body},
            "toRecipients": people(draft.to),
            "singleValueExtendedProperties": [{"id": DRAFT_KEY_PROPERTY, "value": draft.key}],
        }
        if draft.cc:
            message["ccRecipients"] = people(draft.cc)
        small = sum(len(a.data) for a in draft.attachments) <= INLINE_LIMIT
        if small:
            message["attachments"] = [self._file(a) for a in draft.attachments]
        made = self.call("POST", "/me/messages", message)
        if not made.get("id"):
            raise DraftError("Outlook didn't make the draft.")
        if not small:
            try:
                for a in draft.attachments:
                    self._attach(made["id"], a)
            except DraftError:
                # Never leave a draft without its PDF: take it away, so the next run makes it whole.
                try:
                    self.call("DELETE", f"/me/messages/{made['id']}")
                except DraftError:
                    pass
                raise
        return made


# ---------------------------------------------------------------------------------------------------- a run


def write_marker(draft: Draft, made: dict, mailbox: str, found: bool) -> None:
    note = {
        "draftedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "mailbox": mailbox,
        "draftId": made.get("id"),
        "openInOutlook": made.get("webLink"),
        "subject": draft.subject,
        "to": [addr for _, addr in draft.to],
        "emlSha256": draft.key,
        "alreadyThere": found,
    }
    marker_for(draft.source).write_text(json.dumps(note, indent=2) + "\n", encoding="utf-8")


def signature_of(cfg: dict) -> tuple[str | None, list[Attachment]]:
    """The signature added to each draft: an HTML file named in setup --signature, else the copy "signature" made."""
    path = cfg.get("signature")
    if path:
        try:
            return Path(path).expanduser().read_text(encoding="utf-8"), []
        except OSError as err:
            raise DraftError(f"Couldn't read the signature file {path}: {err}") from None
    store = signature_path()
    if not store.exists():
        return None, []
    try:
        saved = json.loads(store.read_text(encoding="utf-8"))
        images = [Attachment(name=i["name"], content_type=i["contentType"], data=base64.b64decode(i["contentBytes"]), content_id=i["contentId"]) for i in saved.get("images", [])]
        return saved["html"], images
    except (OSError, ValueError, KeyError) as err:
        raise DraftError(f"Couldn't read the copied signature ({err}). Run: draft-partner-emails signature") from None


_BLANK_START = re.compile(r"^(?:\s+|<br\s*/?>|&nbsp;|<(div|p)\b[^>]*>(?:\s|&nbsp;|<br\s*/?>)*</\1>)", re.I)


def signature_part(html: str) -> str:
    """The signature in an Outlook draft's HTML: the <div id="Signature"> Outlook wraps it in, else the whole body
    without the blank lines Outlook leaves above it for typing."""
    start = re.search(r"<div\b[^>]*\bid\s*=\s*([\"']?)Signature\1(?=[\s/>])[^>]*>", html, re.I)
    if start:
        depth = 0
        for tag in re.finditer(r"<(/?)div\b[^>]*>", html[start.start():], re.I):
            depth += -1 if tag.group(1) else 1
            if depth == 0:
                return html[start.start(): start.start() + tag.end()]
        return html[start.start():]
    body = re.search(r"<body\b[^>]*>(.*)</body>", html, re.I | re.S)
    part = body.group(1) if body else html
    while True:
        blank = _BLANK_START.match(part)
        if not blank or not blank.group(0):
            return part.strip()
        part = part[blank.end():]


def text_of(html: str) -> str:
    """The words in some HTML, for a short preview."""
    text = re.sub(r"<(style|script)\b.*?</\1>", " ", html, flags=re.I | re.S)
    text = re.sub(r"<br\s*/?>|</(p|div|tr|li)>", " / ", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text).replace("&nbsp;", " ").replace("&amp;", "&")
    return re.sub(r"(\s*/\s*)+", " / ", re.sub(r"\s+", " ", text)).strip(" /")


def run(cfg: dict, files: list[Path], dry_run: bool) -> int:
    """Drafts each file in turn. Returns how many failed."""
    signature, signature_images = signature_of(cfg)
    mailbox = mailbox_of(cfg)
    graph: Graph | None = None
    if not dry_run:
        # Signed in, and as the right mailbox, before anything is touched.
        try:
            graph = Graph(Auth(cfg))
            signed_in = graph.mailbox()
        except DraftError as err:
            print(f"Nothing drafted.\n    {err}")
            return len(files)
        if signed_in != mailbox:
            print(f"Nothing drafted.\n    Signed in as {signed_in or 'someone else'}, not {mailbox}. Run signout, then signin as {mailbox}.")
            return len(files)
    failed = 0
    for path in files:
        label = f"{path.parent.name} / {path.name}"
        try:
            draft = parse_eml(path, signature, signature_images)
        except DraftError as err:
            print(f"Skipped {label}\n    {err}")
            failed += 1
            continue
        if dry_run:
            print(f"Would draft {label}\n    {describe(draft)}")
            continue
        assert graph is not None
        try:
            found = graph.existing(draft.key)
            made = found or graph.create_draft(draft)
            write_marker(draft, made, mailbox, bool(found))
            word = "Already in Outlook" if found else "Drafted"
            print(f"{word}: {label}\n    {describe(draft)}\n    Open it: {made.get('webLink', 'Outlook > Drafts')}")
        except DraftError as err:
            print(f"Not drafted: {label}\n    {err}")
            failed += 1
    return failed


def minimal_pdf(text: str) -> bytes:
    """A one-page PDF with one line of text, for the test draft."""
    safe = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    stream = f"BT /F1 18 Tf 72 760 Td ({safe}) Tj ET".encode("latin-1", "replace")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{number} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    out += b"".join(f"{offset:010d} 00000 n \n".encode() for offset in offsets)
    out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(out)


def make_test_eml(folder: Path, mailbox: str) -> Path:
    """A dummy "ready to send" email to the mailbox itself, with a small PDF, in a folder of its own."""
    stamp = datetime.datetime.now().strftime("%d %b %Y %H:%M")
    msg = EmailMessage()
    msg["To"] = mailbox
    msg["Subject"] = f"Club Yuppie drafts test, {stamp} (delete me)"
    msg["X-Unsent"] = "1"
    msg.set_content("A test draft from draft-partner-emails. Nothing was sent. Delete it.")
    msg.add_alternative(
        "<html><body><p>A test draft from <b>draft-partner-emails</b>. Nothing was sent.</p>"
        "<p>If the PDF is attached and this is in Drafts, it works. Delete it.</p></body></html>",
        subtype="html",
    )
    msg.add_attachment(minimal_pdf(f"Club Yuppie drafts test, {stamp}"), maintype="application", subtype="pdf", filename="Club Yuppie drafts test.pdf")
    path = folder / ("Email to Club Yuppie" + PENDING_SUFFIX)
    path.write_bytes(bytes(msg))
    return path


# ---------------------------------------------------------------------------------------------------- commands


def cmd_setup(args) -> int:
    cfg = load_config()
    for key in ("tenant", "client", "mailbox", "root", "signature"):
        value = getattr(args, key)
        if value:
            cfg[key] = value.strip()
    cfg.setdefault("mailbox", DEFAULT_MAILBOX)
    if not cfg.get("tenant") or not cfg.get("client"):
        raise DraftError("Both --tenant and --client are needed the first time.")
    save_config(cfg)
    root = find_root(cfg)
    print(f"Saved the settings in {CONFIG_PATH}.")
    where = str(root) if root else 'not found: run setup again with --root "<path to Partner emails>"'
    print(f"    Mailbox: {mailbox_of(cfg)}\n    Folder: {where}")
    print("Next: draft-partner-emails signin")
    return 0


def cmd_signin(args) -> int:
    cfg = load_config()
    auth = Auth(cfg)
    auth.sign_in(mailbox_of(cfg), device_code=args.device_code)
    signed_in = Graph(auth).mailbox()
    if signed_in != mailbox_of(cfg):
        auth.store.delete()
        raise DraftError(f"That was {signed_in or 'another account'}, not {mailbox_of(cfg)}. Nothing kept. Run signin again with {mailbox_of(cfg)}.")
    print(f"Signed in as {signed_in}. The sign-in is kept in the Keychain (club-yuppie-drafts).")
    print("Next: draft-partner-emails test")
    return 0


def cmd_signature(args) -> int:
    cfg = load_config()
    store = signature_path()
    if args.remove:
        store.unlink(missing_ok=True)
        print("Drafts won't get a signature now. Add it in Outlook before sending, or run signature again.")
        return 0
    graph = Graph(Auth(cfg))
    if graph.mailbox() != mailbox_of(cfg):
        raise DraftError(f"Signed in as someone else, not {mailbox_of(cfg)}. Run signout, then signin.")
    html, attachments = graph.signature_draft()
    part = signature_part(html)
    lowered = part.lower()
    images = [
        a for a in attachments
        if a.get("isInline") and a.get("contentId") and a.get("contentBytes") and f"cid:{a['contentId']}".lower() in lowered
    ]
    if not text_of(part) and not images and "<img" not in lowered:
        raise DraftError(f'The "{SIGNATURE_SUBJECT}" draft has no signature in it. Check Outlook adds your signature to new emails, then make it again.')
    saved = {
        "copiedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "from": f'Outlook draft "{SIGNATURE_SUBJECT}"',
        "html": part,
        "images": [{"name": a.get("name") or "image", "contentType": a.get("contentType") or "image/png", "contentId": a["contentId"], "contentBytes": a["contentBytes"]} for a in images],
    }
    store.parent.mkdir(parents=True, exist_ok=True)
    store.write_text(json.dumps(saved, indent=2) + "\n", encoding="utf-8")
    os.chmod(store, 0o600)
    if cfg.pop("signature", None):
        save_config(cfg)  # the copy from Outlook replaces an HTML file named in setup
    preview = text_of(part)
    print(f"Copied your Outlook signature ({len(images)} image{'s' if len(images) != 1 else ''}): {preview[:160] + ('...' if len(preview) > 160 else '')}")
    print(f'Every draft gets it from now on. You can delete the "{SIGNATURE_SUBJECT}" draft. If you change your signature in Outlook, make that draft again and run this again.')
    return 0


def cmd_skip(args) -> int:
    cfg = load_config()
    given = Path(args.what).expanduser()
    if given.is_file():
        files = [given]
    else:
        root = find_root(cfg)
        if not root or not root.is_dir():
            raise DraftError('Couldn\'t find OneDrive\'s "Partner emails" folder. Run setup with --root "<path>".')
        files = [f for f in waiting(root) if f.parent.name.casefold() == args.what.strip().casefold()]
        if not files:
            names = sorted({f.parent.name for f in waiting(root)})
            raise DraftError(f"Nothing waiting for {args.what}." + (f" Waiting: {', '.join(names)}." if names else ""))
    for path in files:
        note = {"skippedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"), "skipped": True,
                "reason": "marked as done without drafting (drafted or sent by hand)"}
        marker_for(path).write_text(json.dumps(note, indent=2) + "\n", encoding="utf-8")
        print(f"Marked as done, not drafted: {path.parent.name} / {path.name}")
    return 0


def cmd_signout(_args) -> int:
    cfg = load_config()
    token_store(cfg).delete()
    print("Signed out: the sign-in is gone from the Keychain.")
    return 0


def cmd_status(_args) -> int:
    cfg = load_config()
    root = find_root(cfg)
    print(f"Settings: {CONFIG_PATH if CONFIG_PATH.exists() else 'none yet (run setup)'}")
    print(f"Mailbox: {mailbox_of(cfg)}")
    print(f"Folder: {root if root else 'not found'}")
    if root and root.is_dir():
        print(f"Waiting to be drafted: {len(waiting(root))}")
    if cfg.get("signature"):
        print(f"Signature: from {cfg['signature']}")
    elif signature_path().exists():
        print("Signature: copied from Outlook (run signature again after changing it in Outlook)")
    else:
        print("Signature: none (run signature to copy yours from Outlook)")
    try:
        print("Signed in: " + ("yes" if token_store(cfg).get() else "no (run signin)"))
    except DraftError as err:
        print(f"Signed in: {err}")
    return 0


def cmd_test(args) -> int:
    cfg = load_config()
    with tempfile.TemporaryDirectory(prefix="club-yuppie-drafts-") as folder:
        path = make_test_eml(Path(folder), mailbox_of(cfg))
        print(f"A test email to {mailbox_of(cfg)} (this mailbox, nobody else).")
        failed = run(cfg, [path], dry_run=args.dry_run)
    if not failed and not args.dry_run:
        print("Check Outlook > Drafts: the test should be there with its PDF. Then delete it.")
    return 1 if failed else 0


def cmd_run(args) -> int:
    cfg = load_config()
    if args.root:
        cfg = {**cfg, "root": args.root}
    if args.only:
        files = [Path(args.only).expanduser()]
        if not files[0].is_file():
            raise DraftError(f"No such file: {files[0]}")
    else:
        root = find_root(cfg)
        if not root or not root.is_dir():
            raise DraftError('Couldn\'t find OneDrive\'s "Partner emails" folder. Run setup with --root "<path>".')
        files = waiting(root)
    if not files:
        print("Nothing new to draft.")
        return 0
    failed = run(cfg, files, dry_run=args.dry_run)
    print(("Dry run: nothing was changed. " if args.dry_run else "") + f"{len(files) - failed} of {len(files)} " + ("ready." if args.dry_run else "done."))
    return 1 if failed else 0


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    commands = {"setup", "signin", "signout", "signature", "skip", "status", "test"}
    parser = argparse.ArgumentParser(prog="draft-partner-emails", description="Partner emails into Outlook Drafts. Never sends.")
    if argv and argv[0] in commands:
        sub = parser.add_subparsers(dest="command")
        setup = sub.add_parser("setup")
        setup.add_argument("--tenant", help="Directory (tenant) ID of the Club Yuppie Drafts app registration")
        setup.add_argument("--client", help="Application (client) ID of the Club Yuppie Drafts app registration")
        setup.add_argument("--mailbox", help=f"the mailbox drafts go into (default {DEFAULT_MAILBOX})")
        setup.add_argument("--root", help='the OneDrive "Partner emails" folder, if it is not found by itself')
        setup.add_argument("--signature", help="an HTML file added at the end of each email (Outlook's own signature is not added to drafts made this way)")
        signin = sub.add_parser("signin")
        signin.add_argument("--device-code", action="store_true", help="sign in with a code at microsoft.com/devicelogin instead (blocked where security defaults are on)")
        sub.add_parser("signout")
        signature = sub.add_parser("signature", help=f'copy your Outlook signature from a draft titled "{SIGNATURE_SUBJECT}"')
        signature.add_argument("--remove", action="store_true", help="stop adding a signature")
        skip = sub.add_parser("skip", help="mark a brand's waiting email as done without drafting it")
        skip.add_argument("what", metavar="BRAND", help='the brand folder name (e.g. Headmasters) or the .eml file')
        sub.add_parser("status")
        test = sub.add_parser("test")
        test.add_argument("--dry-run", action="store_true")
        args = parser.parse_args(argv)
        handler = {"setup": cmd_setup, "signin": cmd_signin, "signout": cmd_signout, "signature": cmd_signature, "skip": cmd_skip,
                   "status": cmd_status, "test": cmd_test}[args.command]
    else:
        parser.add_argument("--dry-run", action="store_true", help="show what would be drafted; nothing is changed")
        parser.add_argument("--only", metavar="FILE", help="just this .eml")
        parser.add_argument("--root", metavar="DIR", help='the "Partner emails" folder for this run')
        parser.add_argument("--watch", nargs="?", const=WATCH_SECONDS, type=int, metavar="SECONDS", help=f"keep looking every {WATCH_SECONDS} seconds until Ctrl-C")
        args = parser.parse_args(argv)
        handler = cmd_run
        if args.watch:
            print(f"Watching for new partner emails every {args.watch} seconds. Ctrl-C stops it.")
            try:
                while True:
                    try:
                        cmd_run(args)
                    except DraftError as err:
                        print(err)
                    time.sleep(args.watch)
            except KeyboardInterrupt:
                print("\nStopped.")
                return 0
    try:
        return handler(args)
    except DraftError as err:
        print(err)
        return 1
    except KeyboardInterrupt:
        print("\nStopped.")
        return 130


if __name__ == "__main__":
    sys.exit(main())
