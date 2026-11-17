"""A stand-in for Microsoft (sign-in and the bits of Graph the drafter uses), with a small mailbox in memory: Sent
Items, the inbox (any folder), drafts, attachments, createReplyAll, PATCH, move and delete. For the tests only: the
unit tests (test_desk_sync.py) and the end-to-end check against a local desk (tests/e2e/phase-b/26-outreach-outlook).

Each message: {"id", "folder" (sentitems | inbox | junkemail | drafts | deleteditems), "isDraft", "subject", "from",
"toRecipients", "ccRecipients", "sentDateTime", "receivedDateTime", "internetMessageId", "conversationId", "webLink",
"bodyText", "bodyHtml", "headers": [{"name","value"}], "class" (the Exchange message class), "key" (the drafter's hidden
property), "attachments": [{"name","contentType","contentBytes","size","isInline"}], "lastModifiedDateTime"}.
"""

from __future__ import annotations

import base64
import itertools
import json
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlencode, urlsplit

KEY_PROP = "String {566da39a-e7d3-4358-bb63-1a50b006da7f} Name ClubYuppieDraftKey"
CLASS_PROP = "String 0x001A"


def jwt(scopes: str) -> str:
    part = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")  # noqa: E731
    return f"{part({'alg': 'none'})}.{part({'scp': scopes})}.sig"


def person(address: str, name: str | None = None) -> dict:
    return {"emailAddress": {"address": address, **({"name": name} if name else {})}}


class FakeOutlook:
    def __init__(self, mailbox: str = "albert@clubyuppie.com", prefix: str = ""):
        self.mailbox = mailbox
        self.prefix = prefix  # in every id, so two runs against one desk don't share message ids
        self.messages: dict[str, dict] = {}
        self.calls: list[dict] = []
        self.counter = itertools.count(1)
        self.keep_key_on_send = True
        self.clock = "2026-11-17T21:30:00Z"
        self.fail_patch = False
        fake = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def _reply(self, status, body=None):
                data = b"" if body is None else json.dumps(body).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def _handle(self):
                length = int(self.headers.get("Content-Length") or 0)
                raw = self.rfile.read(length) if length else b""
                url = urlsplit(self.path)
                q = {k: v[0] for k, v in parse_qs(url.query, keep_blank_values=True).items()}
                call = {"method": self.command, "path": url.path, "query": unquote(url.query), "headers": dict(self.headers), "raw": raw}
                fake.calls.append(call)
                try:
                    status, body = fake.route(self.command, url.path, q, raw, dict(self.headers))
                except Exception as err:  # noqa: BLE001 - a test double: say what broke
                    status, body = 500, {"error": {"code": "FakeBroke", "message": repr(err)}}
                self._reply(status, body)

            do_GET = do_POST = do_PUT = do_PATCH = do_DELETE = _handle

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.port = self.server.server_address[1]
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    # ------------------------------------------------------------------ the mailbox
    def add(self, folder: str, **m) -> dict:
        mid = m.pop("id", None) or f"{self.prefix}msg{next(self.counter)}"
        msg = {
            "id": mid,
            "folder": folder,
            "isDraft": folder == "drafts",
            "subject": "",
            "from": person(self.mailbox) if folder in ("sentitems", "drafts") else person("someone@example.com"),
            "toRecipients": [],
            "ccRecipients": [],
            "sentDateTime": None,
            "receivedDateTime": None,
            "internetMessageId": f"<{mid}@fake.outlook>",
            "conversationId": f"conv-{mid}",
            "webLink": f"https://outlook.office365.com/owa/?ItemID={mid}",
            "bodyText": "",
            "bodyHtml": None,
            "headers": [],
            "class": "IPM.Note",
            "key": None,
            "attachments": [],
            "lastModifiedDateTime": self.clock,
        }
        msg.update(m)
        if msg["receivedDateTime"] is None:
            msg["receivedDateTime"] = msg["sentDateTime"] or self.clock
        self.messages[mid] = msg
        return msg

    def send(self, draft_id: str, at: str) -> dict:
        """Albert presses Send on a draft: it becomes a sent message (a new id, as Outlook does)."""
        d = self.messages.pop(draft_id)
        new_id = f"{self.prefix}sent{next(self.counter)}"
        d.update({"id": new_id, "folder": "sentitems", "isDraft": False, "sentDateTime": at, "receivedDateTime": at, "internetMessageId": f"<{new_id}@fake.outlook>",
                  "webLink": f"https://outlook.office365.com/owa/?ItemID={new_id}"})
        if not self.keep_key_on_send:
            d["key"] = None
        self.messages[new_id] = d
        return d

    def close(self):
        self.server.shutdown()
        self.server.server_close()

    def paths(self, method=None):
        return [c["path"] for c in self.calls if method is None or c["method"] == method]

    # ------------------------------------------------------------------ Graph
    def view(self, m: dict, select: str | None, expand: str | None, text: bool = False) -> dict:
        out = {k: v for k, v in m.items() if k not in ("folder", "bodyText", "bodyHtml", "headers", "class", "key", "attachments")}
        out["hasAttachments"] = any(not a.get("isInline") for a in m["attachments"])
        out["body"] = {"contentType": "text", "content": m["bodyText"]} if text else {"contentType": "html", "content": m["bodyHtml"] or f"<html><body><p>{m['bodyText']}</p></body></html>"}
        out["internetMessageHeaders"] = m["headers"] or None
        props = []
        if expand and "ClubYuppieDraftKey" in expand and m["key"]:
            props.append({"id": KEY_PROP, "value": m["key"]})
        if expand and "0x001A" in expand:
            props.append({"id": CLASS_PROP, "value": m["class"]})
        if props:
            out["singleValueExtendedProperties"] = props
        if select:
            keep = set(select.split(",")) | {"id"}
            if props:
                keep.add("singleValueExtendedProperties")
            out = {k: v for k, v in out.items() if k in keep}
        return out

    def match(self, m: dict, flt: str) -> bool:
        if not flt:
            return True
        ok = True
        if (g := re.search(r"sentDateTime ge (\S+)", flt)):
            ok &= bool(m["sentDateTime"]) and m["sentDateTime"] >= g.group(1)
        if (g := re.search(r"receivedDateTime ge (\S+)", flt)):
            ok &= bool(m["receivedDateTime"]) and m["receivedDateTime"] >= g.group(1)
        if "isDraft eq false" in flt:
            ok &= not m["isDraft"]
        if (g := re.search(r"ep/value eq '([^']*)'", flt)):
            ok &= m["key"] == g.group(1)
        if (g := re.search(r"internetMessageId eq '((?:[^']|'')*)'", flt)):
            ok &= m["internetMessageId"] == g.group(1).replace("''", "'")
        if (g := re.search(r"subject eq '([^']*)'", flt)):
            ok &= m["subject"].lower() == g.group(1).lower()
        return ok

    def route(self, method: str, path: str, q: dict, raw: bytes, headers: dict):
        if path.endswith("/oauth2/v2.0/token"):
            return 200, {"access_token": jwt("Mail.ReadWrite User.Read"), "refresh_token": "refresh-x", "scope": "https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/User.Read", "expires_in": 3600}
        if path == "/v1.0/me":
            return 200, {"mail": self.mailbox, "userPrincipalName": self.mailbox}
        text = "text" in (headers.get("Prefer") or headers.get("prefer") or "")
        flt, select, expand, top = q.get("$filter", ""), q.get("$select"), q.get("$expand"), int(q.get("$top") or 10)
        skip = int(q.get("$skip") or 0)
        lists = {"/v1.0/me/mailFolders/sentitems/messages": lambda m: m["folder"] == "sentitems", "/v1.0/me/messages": lambda m: m["folder"] != "deleteditems" or True}
        if method == "GET" and path in lists:
            found = [m for m in self.messages.values() if lists[path](m) and self.match(m, flt)]
            page = found[skip: skip + top]
            body = {"value": [self.view(m, select, expand) for m in page]}
            if skip + top < len(found):
                rest = {**q, "$skip": str(skip + top)}
                body["@odata.nextLink"] = f"http://127.0.0.1:{self.port}{path}?" + urlencode(rest)
            return 200, body
        if method == "POST" and path == "/v1.0/me/messages":
            b = json.loads(raw)
            key = next((p["value"] for p in b.get("singleValueExtendedProperties", []) if p["id"] == KEY_PROP), None)
            m = self.add("drafts", subject=b.get("subject", ""), toRecipients=b.get("toRecipients", []), ccRecipients=b.get("ccRecipients", []),
                         bodyHtml=(b.get("body") or {}).get("content"), key=key,
                         attachments=[{"name": a["name"], "contentType": a.get("contentType"), "contentBytes": a.get("contentBytes"), "size": len(base64.b64decode(a.get("contentBytes") or "")), "isInline": a.get("isInline", False)} for a in b.get("attachments", [])])
            return 201, {"id": m["id"], "webLink": m["webLink"], "isDraft": True}
        parts = path.split("/")
        if len(parts) >= 5 and parts[1:4] == ["v1.0", "me", "messages"]:
            mid = unquote(parts[4])
            m = self.messages.get(mid)
            if m is None:
                return 404, {"error": {"code": "ErrorItemNotFound", "message": "The specified object was not found in the store."}}
            rest = parts[5:]
            if not rest:
                if method == "GET":
                    return 200, self.view(m, select, expand, text=text)
                if method == "PATCH":
                    if self.fail_patch:
                        return 400, {"error": {"code": "ErrorInvalidRecipients", "message": "no"}}
                    b = json.loads(raw)
                    for k in ("toRecipients", "ccRecipients", "subject"):
                        if k in b:
                            m[k] = b[k]
                    if "body" in b:
                        m["bodyHtml"] = b["body"]["content"]
                    for p in b.get("singleValueExtendedProperties", []):
                        if p["id"] == KEY_PROP:
                            m["key"] = p["value"]
                    m["lastModifiedDateTime"] = self.clock
                    return 200, self.view(m, None, None)
                if method == "DELETE":
                    self.messages.pop(mid)
                    return 204, None
            if rest == ["attachments"] and method == "GET":
                items = []
                for a in m["attachments"]:
                    item = {"@odata.type": "#microsoft.graph.fileAttachment", "name": a["name"], "contentType": a.get("contentType"), "size": a.get("size"), "isInline": a.get("isInline", False)}
                    if not select:
                        item["contentBytes"] = a.get("contentBytes")
                    items.append(item)
                return 200, {"value": items}
            if rest == ["attachments"] and method == "POST":
                b = json.loads(raw)
                m["attachments"].append({"name": b["name"], "contentType": b.get("contentType"), "contentBytes": b.get("contentBytes"), "size": len(base64.b64decode(b.get("contentBytes") or "")), "isInline": b.get("isInline", False)})
                return 201, {"id": f"att{len(m['attachments'])}"}
            if rest == ["createReplyAll"] and method == "POST":
                quote = f"<html><body><div id=\"divRplyFwdMsg\"><b>From:</b> {self.mailbox}<br><b>Subject:</b> {m['subject']}</div><div>{m['bodyHtml'] or m['bodyText']}</div></body></html>"
                if m["folder"] in ("sentitems", "drafts"):
                    to, cc = list(m["toRecipients"]), list(m["ccRecipients"])
                else:
                    # replying to someone else's email: Outlook puts the sender first, then the others, never the mailbox itself
                    def addr(p):
                        return p["emailAddress"]["address"].lower()
                    to = [m["from"]] + [p for p in m["toRecipients"] if addr(p) != self.mailbox and addr(p) != addr(m["from"])]
                    cc = [p for p in m["ccRecipients"] if addr(p) != self.mailbox]
                d = self.add("drafts", subject="RE: " + m["subject"], toRecipients=to, ccRecipients=cc, bodyHtml=quote, conversationId=m["conversationId"])
                return 201, {"id": d["id"], "webLink": d["webLink"], "isDraft": True}
            if rest == ["move"] and method == "POST":
                m["folder"] = json.loads(raw)["destinationId"]
                return 201, self.view(m, None, None)
        return 404, {"error": {"code": "NotFound", "message": path}}
