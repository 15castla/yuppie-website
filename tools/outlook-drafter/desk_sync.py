"""Club Yuppie Outlook drafter: the Outreach Desk sync (Phase 2, 16 Nov 2026). It never sends.

Albert's decisions (15 and 16 Nov 2026; the plan: docs/plans/outreach-desk.md, sections 0, 3 and 4): the drafter on
this Mac keeps all mail access (no new Microsoft permission, no Entra change) and tells the desk at clubyuppie.com
what happened with partners: the emails Albert sent them, their replies, bounces and automatic replies. It reads back
to 1 Nov the first time, then checks every 15 minutes while the Mac is awake. It turns the follow-up words saved on the
desk into Outlook drafts in the thread, with the first email's attachment and Albert's signature, the evening before
they are due. After a reply, an unedited follow-up draft goes to Deleted Items. Albert sends everything himself.

Safety:
  - Never sends: only GET, createReplyAll (it makes a draft), POST /me/messages (a draft), PATCH on its own drafts,
    attachments on its own drafts, and moving its own unedited stale drafts to Deleted Items. A test fails if a send
    path appears in this file.
  - Mail that isn't about a partner the desk knows never leaves the Mac: it is read, matched here, and dropped.
  - The desk key is made here, kept in the Keychain (service "club-yuppie-desk"), and never printed or written to a
    file; only its fingerprint (SHA-256) is shown, for Albert to paste into Desk > Settings.
  - The drafter never has the database's keys: it reaches the desk only through /api/desk/drafter/<action>, which can't
    delete anything, change an opt-out, or read anything outside the desk.
"""

from __future__ import annotations

import base64
import datetime
import hashlib
import html
import json
import os
import platform
import re
import secrets
import subprocess
import sys
import time
import urllib.parse
from pathlib import Path

import draft_partner_emails as dp

DESK_BASE = os.environ.get("CYD_DESK_BASE", "https://clubyuppie.com").rstrip("/")
DESK_SERVICE = "club-yuppie-desk"
BACKFILL_FROM = "2026-11-01"
MESSAGE_CLASS = "String 0x001A"
FREE_MAIL = {
    "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "hotmail.co.uk", "live.com", "live.co.uk", "icloud.com", "me.com", "mac.com",
    "yahoo.com", "yahoo.co.uk", "aol.com", "btinternet.com", "proton.me", "protonmail.com", "msn.com", "sky.com", "virginmedia.com",
}
OPT_OUT_WORDS = re.compile(r"\b(unsubscribe|remove me|take me off|not interested|no longer interested|do not (contact|email)|don'?t (contact|email)|stop (emailing|contacting))\b", re.I)
AUTO_SUBJECT = re.compile(r"^\s*(automatic reply|auto:|auto-?reply|autoreply|out of (the )?office|ooo\b|abwesenheit|r[ée]ponse automatique)", re.I)
BOUNCE_SUBJECT = re.compile(r"^\s*(undeliverable|undelivered mail|delivery status notification \(failure\)|mail delivery failed|returned mail|delivery has failed|failure notice|message not delivered)", re.I)
DELAY_SUBJECT = re.compile(r"^\s*(delivery delayed|delay(ed)?\b|delivery status notification \(delay\))", re.I)
STATUS_CODE = re.compile(r"\b([45]\.\d{1,3}\.\d{1,3})\b")
EMAIL_IN_TEXT = re.compile(r"[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
BATCH_ITEMS = 40
BATCH_BYTES = 180 * 1024
MAX_BODY = 40_000
SCHEDULE_LABEL = "com.clubyuppie.drafts.sync"
SCHEDULE_SECONDS = 15 * 60


def pending_path() -> Path:
    """Partner emails drafted from OneDrive, waiting to be found in Sent Items (so the desk adds the business then)."""
    return dp.CONFIG_PATH.parent / "desk-pending.json"


def lock_path() -> Path:
    return dp.CONFIG_PATH.parent / "sync.lock"


def desk_base(cfg: dict) -> str:
    return (os.environ.get("CYD_DESK_BASE") or cfg.get("desk_url") or DESK_BASE).rstrip("/")


# ---------------------------------------------------------------------------------------------------- the desk key


def key_store(cfg: dict):
    if os.environ.get("CYD_DESK_KEY_FILE"):
        return dp.FileStore(os.environ["CYD_DESK_KEY_FILE"])
    if platform.system() != "Darwin":
        raise dp.DraftError("The desk key is kept in the macOS Keychain: run this on the Mac.")
    return dp.KeychainStore(dp.mailbox_of(cfg), service=DESK_SERVICE)


def fingerprint(key: str) -> str:
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def linked(cfg: dict) -> bool:
    try:
        return bool(key_store(cfg).get())
    except dp.DraftError:
        return False


class Desk:
    """The desk's drafter door: /api/desk/drafter/<action>, with the key from the Keychain."""

    def __init__(self, cfg: dict):
        self.base = desk_base(cfg)
        self.key = key_store(cfg).get()
        if not self.key:
            raise dp.DraftError("The desk isn't linked. Run: draft-partner-emails desk-link")

    def call(self, method: str, action: str, body: dict | None = None) -> dict:
        url = f"{self.base}/api/desk/drafter/{action}"
        for attempt in range(3):
            status, headers, raw = dp.http(method, url, body=body, headers={"Authorization": f"Bearer {self.key}", "Accept": "application/json"}, timeout=90)
            if status == 401:
                raise dp.DraftError("The desk says this Mac isn't linked any more (it was unlinked, or the key changed). Run: draft-partner-emails desk-link")
            if status in (429, 502, 503, 504) and attempt < 2:
                time.sleep(20 if status == 429 else 5)
                continue
            if 200 <= status < 300:
                return dp._json(raw)
            raise dp.DraftError(f"The desk said no ({status}): {dp._json(raw).get('error', '')}".strip())
        raise dp.DraftError("The desk didn't answer. The next sync tries again.")


# ---------------------------------------------------------------------------------------------------- reading mail


def _q(value: str) -> str:
    return value.replace("'", "''")


def _people(items) -> list[dict]:
    out = []
    for r in items or []:
        e = (r.get("emailAddress") or {})
        addr = str(e.get("address") or "").strip().lower()
        if "@" in addr:
            out.append({"address": addr, "name": (e.get("name") or "").strip() or None})
    return out


def _domain(address: str) -> str:
    return address.rsplit("@", 1)[-1].lower() if "@" in address else ""


def _ext(message: dict, prop: str) -> str | None:
    for p in message.get("singleValueExtendedProperties") or []:
        if str(p.get("id", "")).lower() == prop.lower():
            return p.get("value")
    return None


def pages(graph: dp.Graph, path: str, limit: int = 5000) -> list[dict]:
    """Every page of a Graph list, up to `limit` items."""
    out: list[dict] = []
    url: str | None = path
    while url and len(out) < limit:
        answer = graph.call("GET", url)
        out.extend(answer.get("value", []))
        url = answer.get("@odata.nextLink")
    return out


def details(graph: dp.Graph, message_id: str, has_attachments: bool) -> tuple[str, dict, list[dict]]:
    """A matched message's text, its headers and its attachments' names and sizes (never their content)."""
    mid = urllib.parse.quote(message_id, safe="")
    full = graph.call("GET", f"/me/messages/{mid}?$select=body,internetMessageHeaders", headers={"Prefer": 'outlook.body-content-type="text"'})
    text = str((full.get("body") or {}).get("content") or "")[:MAX_BODY]
    headers: dict = {}
    for h in full.get("internetMessageHeaders") or []:
        headers.setdefault(str(h.get("name", "")).lower(), []).append(str(h.get("value", "")))
    files = []
    if has_attachments:
        for a in graph.call("GET", f"/me/messages/{mid}/attachments?$select=name,size,isInline,contentType").get("value", []):
            files.append({"name": a.get("name") or "attachment", "size": a.get("size"), **({"inline": True} if a.get("isInline") else {})})
    return text, headers, files


def _header_ids(headers: dict) -> list[str]:
    ids = []
    for name in ("in-reply-to", "references"):
        for v in headers.get(name, []):
            ids += re.findall(r"<[^<>\s]+>", v)
    return list(dict.fromkeys(ids))


def classify(message: dict, headers: dict, text: str, mailbox: str) -> tuple[str | None, dict]:
    """reply, auto_reply, bounce, delay, or None for a receipt (plan 3.5). Plus the bounce's address and code, or a hint."""
    cls = str(_ext(message, MESSAGE_CLASS) or "")
    subject = str(message.get("subject") or "")
    sender = (_people([message.get("from")]) or [{"address": "", "name": ""}])[0]
    report = " ".join(headers.get("content-type", [])).lower()
    if cls.upper().startswith("REPORT.IPM.NOTE.DR") or cls.upper().startswith("REPORT.IPM.NOTE.IPN"):
        return None, {}
    is_postmaster = sender["address"].startswith(("postmaster@", "mailer-daemon@")) or (sender.get("name") or "").lower() == "microsoft outlook"
    if cls.upper().startswith("REPORT.IPM.NOTE.NDR") or ("report-type=delivery-status" in report and "action: failed" in text.lower()) or (is_postmaster and BOUNCE_SUBJECT.search(subject)) or BOUNCE_SUBJECT.search(subject):
        if DELAY_SUBJECT.search(subject) or "action: delayed" in text.lower():
            return "delay", {}
        found = [a.lower() for a in EMAIL_IN_TEXT.findall(text) if a.lower() != mailbox and not a.lower().startswith(("postmaster@", "mailer-daemon@"))]
        code = STATUS_CODE.search(text)
        return "bounce", {"addresses": list(dict.fromkeys(found)), "bounceCode": code.group(1) if code else None}
    if DELAY_SUBJECT.search(subject):
        return "delay", {}
    auto = [v.lower() for v in headers.get("auto-submitted", [])]
    if (
        cls == "IPM.Note.Rules.OofTemplate.Microsoft"
        or any(v and v != "no" for v in auto)
        or headers.get("x-autoreply")
        or headers.get("x-autorespond")
        or any("auto_reply" in v.lower() for v in headers.get("precedence", []))
        or AUTO_SUBJECT.search(subject)
    ):
        return "auto_reply", {}
    hint = None
    if cls.startswith("IPM.Schedule.Meeting.Request"):
        hint = "invite"
    elif OPT_OUT_WORDS.search(text[:4000]):
        hint = "possible_opt_out"
    return "reply", ({"hint": hint} if hint else {})


class Index:
    """What the desk knows (from plan), for matching here: nothing else leaves the Mac."""

    def __init__(self, plan: dict, mailbox: str):
        self.mailbox = mailbox
        self.addresses: dict[str, set] = {}
        for a in plan.get("addresses", []):
            self.addresses.setdefault(a["address"].lower(), set()).add(a["targetId"])
        self.domains: dict[str, set] = {}
        for t in plan.get("targets", []):
            for d in t.get("domains") or []:
                if d not in FREE_MAIL:
                    self.domains.setdefault(d.lower(), set()).add(t["id"])
        self.conversations = {c["conversationId"]: c for c in plan.get("conversations", [])}
        self.sent_ids = {s["internetMessageId"] for s in plan.get("sentMessageIds", [])}
        self.recent = {r["address"].lower() for r in plan.get("recentRecipients", [])}
        self.known = set(plan.get("knownMessageIds", [])) | set(plan.get("pendingMessageIds", []))
        self.names = {t["id"]: t["name"] for t in plan.get("targets", [])}

    def partners_of(self, addresses: list[str]) -> set:
        hits: set = set()
        for a in addresses:
            hits |= self.addresses.get(a, set())
            d = _domain(a)
            if d not in FREE_MAIL:
                hits |= self.domains.get(d, set())
        return hits


# ---------------------------------------------------------------------------------------------------- follow-up drafts


def text_to_html(text: str) -> str:
    """Albert's words as HTML paragraphs, the way Outlook writes them."""
    paras = [p for p in re.split(r"\n\s*\n", text.strip()) if p.strip()]
    return "".join(f'<p style="margin:0 0 12px 0">{html.escape(p.strip()).replace(chr(10), "<br>")}</p>' for p in paras)


def put_on_top(draft_html: str, ours: str) -> str:
    """Our words above the quoted thread Outlook put in the reply."""
    m = re.search(r"<body\b[^>]*>", draft_html, re.I)
    if not m:
        return ours + draft_html
    return draft_html[: m.end()] + f'<div id="ClubYuppieFollowUp">{ours}</div>' + draft_html[m.end():]


def find_by_key(graph: dp.Graph, key: str) -> dict | None:
    rule = f"singleValueExtendedProperties/Any(ep: ep/id eq '{dp.DRAFT_KEY_PROPERTY}' and ep/value eq '{_q(key)}')"
    query = "$filter=" + urllib.parse.quote(rule, safe="") + "&$select=id,webLink,isDraft,lastModifiedDateTime,conversationId&$top=5"
    found = graph.call("GET", f"/me/messages?{query}").get("value", [])
    drafts = [m for m in found if m.get("isDraft")]
    return (drafts or found or [None])[0]


def find_by_imid(graph: dp.Graph, imid: str) -> dict | None:
    rule = urllib.parse.quote(f"internetMessageId eq '{_q(imid)}'", safe="")
    found = graph.call("GET", f"/me/messages?$filter={rule}&$select=id,conversationId,subject,hasAttachments&$top=1").get("value", [])
    return found[0] if found else None


def make_followup(graph: dp.Graph, cfg: dict, f: dict, mailbox: str) -> dict:
    """One follow-up draft (plan 4.3): createReplyAll on our newest email in the thread, then our recipients, our words
    above the quote with the signature, the hidden key and the first email's attachment. A new email when there's no
    thread (a letter first). Half-made drafts are deleted. Never sent."""
    key = f"followup:{f['followupId']}"
    existing = find_by_key(graph, key)
    if existing and existing.get("isDraft"):
        return existing
    if existing:
        return {}  # already sent: the Sent Items scan reports it
    to = [p for p in f.get("to", []) if p["address"].lower() != mailbox]
    cc = [p for p in f.get("cc", []) if p["address"].lower() != mailbox and p["address"] not in {x["address"] for x in to}]
    if not to:
        raise dp.DraftError("No address left to send it to (every one bounced or opted out).")

    def people(list_):
        return [{"emailAddress": {"address": p["address"], **({"name": p["name"]} if p.get("name") else {})}} for p in list_]

    signature, images = dp.signature_of(cfg)
    ours = text_to_html(f["body"]) + (signature or "")
    made_id = None
    try:
        if f.get("replyTo") and f["replyTo"].get("internetMessageId"):
            original = find_by_imid(graph, f["replyTo"]["internetMessageId"])
            if not original:
                raise dp.DraftError("The email to reply to isn't in Outlook any more.")
            oid = urllib.parse.quote(original["id"], safe="")
            draft = graph.call("POST", f"/me/messages/{oid}/createReplyAll", {})
            made_id = draft.get("id")
            if not made_id:
                raise dp.DraftError("Outlook didn't make the reply.")
            mid = urllib.parse.quote(made_id, safe="")
            current = graph.call("GET", f"/me/messages/{mid}?$select=body")
            body_html = str((current.get("body") or {}).get("content") or "")
            graph.call("PATCH", f"/me/messages/{mid}", {
                "toRecipients": people(to),
                "ccRecipients": people(cc),
                "body": {"contentType": "HTML", "content": put_on_top(body_html, ours)},
                "singleValueExtendedProperties": [{"id": dp.DRAFT_KEY_PROPERTY, "value": key}],
            })
        else:
            draft = graph.call("POST", "/me/messages", {
                "subject": f.get("subject") or "Club Yuppie",
                "body": {"contentType": "HTML", "content": f"<html><body>{ours}</body></html>"},
                "toRecipients": people(to),
                "ccRecipients": people(cc),
                "singleValueExtendedProperties": [{"id": dp.DRAFT_KEY_PROPERTY, "value": key}],
            })
            made_id = draft.get("id")
            if not made_id:
                raise dp.DraftError("Outlook didn't make the draft.")
            mid = urllib.parse.quote(made_id, safe="")
        for image in images:
            graph._attach(mid, image)
        # the same attachment as the first email (Albert, 16 Nov: "all follow ups should probs have the attachment")
        if f.get("attachmentsFrom"):
            first = find_by_imid(graph, f["attachmentsFrom"])
            if first and first.get("hasAttachments"):
                fid = urllib.parse.quote(first["id"], safe="")
                for a in graph.call("GET", f"/me/messages/{fid}/attachments").get("value", []):
                    if a.get("isInline") or a.get("@odata.type") != "#microsoft.graph.fileAttachment" or not a.get("contentBytes"):
                        continue
                    graph._attach(mid, dp.Attachment(name=a.get("name") or "attachment", content_type=a.get("contentType") or "application/octet-stream", data=base64.b64decode(a["contentBytes"])))
        check = graph.call("GET", f"/me/messages/{mid}?$select=toRecipients,ccRecipients,webLink,lastModifiedDateTime,isDraft")
        got = sorted(p["address"] for p in _people(check.get("toRecipients"))) + ["|"] + sorted(p["address"] for p in _people(check.get("ccRecipients")))
        want = sorted(p["address"] for p in to) + ["|"] + sorted(p["address"] for p in cc)
        if got != want or not check.get("isDraft", True):
            raise dp.DraftError("Outlook didn't keep the recipients the desk asked for.")
        return {"id": made_id, "webLink": check.get("webLink"), "lastModifiedDateTime": check.get("lastModifiedDateTime")}
    except dp.DraftError:
        if made_id:
            try:
                graph.call("DELETE", f"/me/messages/{urllib.parse.quote(made_id, safe='')}")
            except dp.DraftError:
                pass
        raise


def make_reply(graph: dp.Graph, cfg: dict, r: dict, mailbox: str) -> dict:
    """One reply draft from Alex's words (Phase 3): createReplyAll on the partner's message, so Outlook puts in the
    sender and everyone else on it (minus Albert, and minus anyone who opted out), then our words above the quote with
    the signature, and the hidden key. Half-made drafts are deleted. Never sent."""
    key = r["key"]
    existing = find_by_key(graph, key)
    if existing and existing.get("isDraft"):
        return existing
    if existing:
        return {}  # already sent: the Sent Items scan reports it
    original = find_by_imid(graph, (r.get("replyTo") or {}).get("internetMessageId") or "")
    if not original:
        raise dp.DraftError("Their email isn't in Outlook any more.")
    blocked = {a.lower() for a in r.get("optedOut", [])} | {mailbox}
    signature, images = dp.signature_of(cfg)
    ours = text_to_html(r["body"]) + (signature or "")
    made_id = None
    try:
        draft = graph.call("POST", f"/me/messages/{urllib.parse.quote(original['id'], safe='')}/createReplyAll", {})
        made_id = draft.get("id")
        if not made_id:
            raise dp.DraftError("Outlook didn't make the reply.")
        mid = urllib.parse.quote(made_id, safe="")
        current = graph.call("GET", f"/me/messages/{mid}?$select=body,toRecipients,ccRecipients")
        to = [p for p in _people(current.get("toRecipients")) if p["address"] not in blocked]
        seen = {p["address"] for p in to}
        cc = [p for p in _people(current.get("ccRecipients")) if p["address"] not in blocked and p["address"] not in seen]
        if not to:
            raise dp.DraftError("No address left to reply to (they opted out).")

        def people(list_):
            return [{"emailAddress": {"address": p["address"], **({"name": p["name"]} if p.get("name") else {})}} for p in list_]

        body_html = str((current.get("body") or {}).get("content") or "")
        graph.call("PATCH", f"/me/messages/{mid}", {
            "toRecipients": people(to),
            "ccRecipients": people(cc),
            "body": {"contentType": "HTML", "content": put_on_top(body_html, ours)},
            "singleValueExtendedProperties": [{"id": dp.DRAFT_KEY_PROPERTY, "value": key}],
        })
        for image in images:
            graph._attach(mid, image)
        check = graph.call("GET", f"/me/messages/{mid}?$select=toRecipients,ccRecipients,webLink,lastModifiedDateTime,isDraft")
        got = sorted(p["address"] for p in _people(check.get("toRecipients"))) + ["|"] + sorted(p["address"] for p in _people(check.get("ccRecipients")))
        want = sorted(p["address"] for p in to) + ["|"] + sorted(p["address"] for p in cc)
        if got != want or not check.get("isDraft", True):
            raise dp.DraftError("Outlook didn't keep the recipients.")
        return {"id": made_id, "webLink": check.get("webLink"), "lastModifiedDateTime": check.get("lastModifiedDateTime")}
    except dp.DraftError:
        if made_id:
            try:
                graph.call("DELETE", f"/me/messages/{urllib.parse.quote(made_id, safe='')}")
            except dp.DraftError:
                pass
        raise


# ---------------------------------------------------------------------------------------------------- pending partner emails


def load_pending() -> list[dict]:
    try:
        return json.loads(pending_path().read_text(encoding="utf-8")).get("pending", [])
    except (OSError, ValueError):
        return []


def save_pending(items: list[dict]) -> None:
    path = pending_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"pending": items}, indent=2) + "\n", encoding="utf-8")
    os.chmod(path, 0o600)


def remember_drafted(draft: "dp.Draft", made: dict, cfg: dict) -> None:
    """A partner email just drafted: remember it, so the sync tells the desk when it has actually been sent."""
    if not dp.needs_pdf(draft.source, cfg):
        return
    partner: dict = {"name": draft.source.parent.name}
    side = draft.source.with_name(draft.source.name[: -len(".eml")] + ".desk.json")
    if side.exists():
        try:
            meta = json.loads(side.read_text(encoding="utf-8"))
            t = meta.get("target") or {}
            partner = {
                "name": t.get("name") or partner["name"],
                "category": t.get("category"),
                "ask": t.get("ask"),
                "askLine": t.get("askLine"),
                "domains": t.get("domains") or [],
                "contacts": (meta.get("to") or []) + (meta.get("cc") or []),
            }
        except (OSError, ValueError):
            pass
    items = [p for p in load_pending() if p.get("key") != draft.key]
    items.append({"key": draft.key, "draftId": made.get("id"), "subject": draft.subject, "partner": partner,
                  "draftedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")})
    save_pending(items)


# ---------------------------------------------------------------------------------------------------- a sync


def _iso_since(value: str) -> str:
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return value + "T00:00:00Z"
    return value


def sync(cfg: dict, graph: dp.Graph, desk: Desk, dry_run: bool = False, since: str | None = None, quiet: bool = False) -> int:
    """One sync. Returns 0, or 1 when something went wrong (reported to the desk and printed)."""
    say = (lambda *a: None) if quiet else print
    started = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    mailbox = dp.mailbox_of(cfg)
    plan = desk.call("GET", "plan")
    idx = Index(plan, mailbox)
    since_iso = _iso_since(since) if since else plan.get("since") or BACKFILL_FROM + "T00:00:00Z"
    pending = {p["key"]: p for p in load_pending()}
    items: list[dict] = []
    counts = {"read": 0, "sent": 0, "replies": 0, "bounces": 0, "auto_replies": 0, "drafts": 0, "failed": 0}
    problems: list[str] = []

    # 1. what Albert sent (plan 3.4, steps 4 and 5)
    sel = "id,sentDateTime,internetMessageId,conversationId,toRecipients,ccRecipients,subject,webLink,hasAttachments"
    exp = "&$expand=" + urllib.parse.quote(f"singleValueExtendedProperties($filter=id eq '{dp.DRAFT_KEY_PROPERTY}')", safe="()=$'")
    flt = urllib.parse.quote(f"sentDateTime ge {since_iso}", safe="")
    sent_list = pages(graph, f"/me/mailFolders/sentitems/messages?$filter={flt}&$select={sel}&$top=50{exp}")
    counts["read"] += len(sent_list)
    sent_in_conversation: dict[str, list[dict]] = {}
    for m in sent_list:
        sent_in_conversation.setdefault(m.get("conversationId") or "", []).append(m)
    drafted_by_conv = {d.get("conversationId"): d for d in plan.get("drafted", []) if d.get("conversationId")}
    replies_by_conv = {d.get("conversationId"): d for d in plan.get("draftedReplies", []) if d.get("conversationId")}
    for m in sorted(sent_list, key=lambda x: x.get("sentDateTime") or ""):
        imid = m.get("internetMessageId")
        if not imid or imid in idx.known:
            continue
        key = _ext(m, dp.DRAFT_KEY_PROPERTY) or ""
        to, cc = _people(m.get("toRecipients")), _people(m.get("ccRecipients"))
        addrs = [p["address"] for p in to + cc if p["address"] != mailbox]
        # a follow-up draft we made, if the hidden key didn't survive sending: the next email in its thread after it
        if not key.startswith(("followup:", "reply:")) and m.get("conversationId") in drafted_by_conv:
            d = drafted_by_conv[m["conversationId"]]
            if (m.get("sentDateTime") or "") >= (d.get("madeAt") or ""):
                key = d["key"]
        # the same for a reply draft made from Alex's words
        if not key.startswith(("followup:", "reply:")) and m.get("conversationId") in replies_by_conv:
            d = replies_by_conv[m["conversationId"]]
            if (m.get("sentDateTime") or "") >= (d.get("madeAt") or ""):
                key = d["key"]
        relevant = key.startswith(("followup:", "reply:")) or key in pending or m.get("conversationId") in idx.conversations or bool(idx.partners_of(addrs))
        if not relevant:
            continue
        text, headers, files = details(graph, m["id"], bool(m.get("hasAttachments")))
        item = {
            "type": "sent", "internetMessageId": imid, "messageId": m["id"], "conversationId": m.get("conversationId"), "sentAt": m.get("sentDateTime"),
            "subject": m.get("subject"), "to": to, "cc": cc, "bodyText": text, "attachments": files, "webLink": m.get("webLink"), "key": key,
            "references": _header_ids(headers),
        }
        if key in pending:
            item["partner"] = pending[key].get("partner")
        items.append(item)

    # 2. what came in, from every folder, Junk included (step 6); Albert's own messages are skipped
    in_since = (datetime.datetime.fromisoformat(since_iso.replace("Z", "+00:00")) - datetime.timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
    sel = "id,receivedDateTime,from,sender,toRecipients,ccRecipients,subject,conversationId,internetMessageId,webLink,hasAttachments"
    exp = "&$expand=" + urllib.parse.quote(f"singleValueExtendedProperties($filter=id eq '{MESSAGE_CLASS}')", safe="()=$'")
    flt = urllib.parse.quote(f"receivedDateTime ge {in_since} and isDraft eq false", safe="")
    incoming = pages(graph, f"/me/messages?$filter={flt}&$select={sel}&$top=50{exp}", limit=20000)
    counts["read"] += len(incoming)
    for m in sorted(incoming, key=lambda x: x.get("receivedDateTime") or ""):
        imid = m.get("internetMessageId")
        sender = (_people([m.get("from")]) or [{"address": "", "name": None}])[0]
        if not imid or imid in idx.known or sender["address"] == mailbox:
            continue
        subject = str(m.get("subject") or "")
        cls = str(_ext(m, MESSAGE_CLASS) or "")
        maybe_bounce = cls.upper().startswith("REPORT.IPM.NOTE.NDR") or bool(BOUNCE_SUBJECT.search(subject)) or sender["address"].startswith(("postmaster@", "mailer-daemon@"))
        by_conv = m.get("conversationId") in idx.conversations
        by_sender = bool(idx.addresses.get(sender["address"]))
        by_domain = bool(idx.partners_of([sender["address"]]))
        threadish = subject.lower().startswith(("re:", "aw:", "sv:", "fw:", "fwd:"))
        if not (by_conv or by_sender or by_domain or maybe_bounce or threadish):
            continue
        text, headers, files = details(graph, m["id"], bool(m.get("hasAttachments")))
        answers = [i for i in _header_ids(headers) if i in idx.sent_ids]
        kind, extra = classify(m, headers, text, mailbox)
        if kind is None:
            continue
        bounced = None
        if kind == "bounce":
            hits = [a for a in extra.get("addresses", []) if a in idx.recent or a in idx.addresses]
            bounced = hits[0] if hits else None
            if not (bounced or by_conv or answers):
                continue  # a bounce of some other email: not ours to tell the desk about
        elif not (by_conv or by_sender or by_domain or answers):
            continue
        items.append({
            "type": "incoming", "kind": kind, "internetMessageId": imid, "messageId": m["id"], "conversationId": m.get("conversationId"),
            "receivedAt": m.get("receivedDateTime"), "from": sender, "subject": subject, "bodyText": text if kind == "reply" else None,
            "attachments": files if kind == "reply" else [], "webLink": m.get("webLink"), "answers": answers, "bouncedAddress": bounced,
            "bounceCode": extra.get("bounceCode"), "hint": extra.get("hint"),
        })

    # 3. follow-up drafts made earlier: still there, sent (found above), or deleted?
    sent_keys = {i.get("key") for i in items if i["type"] == "sent"}
    for d in plan.get("drafted", []):
        if d["key"] in sent_keys:
            continue
        try:
            graph.call("GET", f"/me/messages/{urllib.parse.quote(d['draftId'], safe='')}?$select=isDraft")
        except dp.GraphError as err:
            if err.status == 404 and not find_by_key(graph, d["key"]):
                items.append({"type": "draft_gone", "followupId": d["followupId"]})

    # 3b. reply drafts made earlier from Alex's words: still there, sent, or deleted?
    for d in plan.get("draftedReplies", []):
        if d["key"] in sent_keys:
            continue
        try:
            graph.call("GET", f"/me/messages/{urllib.parse.quote(d['draftId'], safe='')}?$select=isDraft")
        except dp.GraphError as err:
            if err.status == 404 and not find_by_key(graph, d["key"]):
                items.append({"type": "reply_draft_gone", "textId": d["textId"]})

    # 4. stale drafts (a reply came after the draft was made): to Deleted Items if Albert hasn't touched them (plan 4.5)
    for d in plan.get("staleDrafts", []):
        mid = urllib.parse.quote(d["draftId"], safe="")
        try:
            msg = graph.call("GET", f"/me/messages/{mid}?$select=isDraft,lastModifiedDateTime")
        except dp.GraphError as err:
            if err.status == 404:
                items.append({"type": "stale_draft", "followupId": d["followupId"], "outcome": "gone"})
            continue
        if not msg.get("isDraft"):
            items.append({"type": "stale_draft", "followupId": d["followupId"], "outcome": "gone"})
            continue
        untouched = (msg.get("lastModifiedDateTime") or "") <= (d.get("madeAt") or "")
        if untouched and not dry_run:
            graph.call("POST", f"/me/messages/{mid}/move", {"destinationId": "deleteditems"})
        items.append({"type": "stale_draft", "followupId": d["followupId"], "outcome": "moved" if untouched else "edited"})

    # 5. the follow-ups due (from 21:00 the night before), as drafts in the thread (plan 4.3)
    for f in plan.get("followups", []):
        if dry_run:
            say(f"Would draft the follow-up to {idx.names.get(f['targetId'], f.get('partner'))} (due {f['due']}).")
            continue
        try:
            made = make_followup(graph, cfg, f, mailbox)
            if made:
                items.append({"type": "followup_draft", "followupId": f["followupId"], "draftId": made["id"], "webLink": made.get("webLink"), "madeAt": made.get("lastModifiedDateTime")})
                counts["drafts"] += 1
                say(f"Drafted the follow-up to {f.get('partner')} (due {f['due']}): in Outlook Drafts. Not sent.")
        except dp.DraftError as err:
            counts["failed"] += 1
            problems.append(str(err))
            items.append({"type": "followup_failed", "followupId": f["followupId"], "error": str(err)[:280]})
            say(f"Couldn't draft the follow-up to {f.get('partner')}: {err}")

    # 5b. replies Alex wrote, as drafts replying to the partner's message, at once (Phase 3)
    for r in plan.get("replies", []):
        if dry_run:
            say(f"Would draft the reply to {idx.names.get(r['targetId'], r.get('partner'))}.")
            continue
        try:
            made = make_reply(graph, cfg, r, mailbox)
            if made:
                items.append({"type": "reply_draft", "textId": r["textId"], "draftId": made["id"], "webLink": made.get("webLink"), "madeAt": made.get("lastModifiedDateTime")})
                counts["drafts"] += 1
                say(f"Drafted the reply to {r.get('partner')}: in Outlook Drafts. Not sent.")
        except dp.DraftError as err:
            counts["failed"] += 1
            problems.append(str(err))
            items.append({"type": "reply_failed", "textId": r["textId"], "error": str(err)[:280]})
            say(f"Couldn't draft the reply to {r.get('partner')}: {err}")

    for i in items:
        if i["type"] == "sent":
            counts["sent"] += 1
        elif i["type"] == "incoming":
            counts[{"reply": "replies", "bounce": "bounces", "auto_reply": "auto_replies"}.get(i["kind"], "replies")] += 1

    if dry_run:
        for i in items:
            if i["type"] == "sent":
                say(f"Would tell the desk: you emailed {', '.join(p['address'] for p in i['to'])} on {i['sentAt'][:16].replace('T', ' ')} ({i['subject']!r}).")
            elif i["type"] == "incoming":
                say(f"Would tell the desk: a {i['kind'].replace('_', ' ')} from {i['from']['address']} on {i['receivedAt'][:16].replace('T', ' ')}.")
        say(f"Dry run: read {counts['read']} messages since {since_iso[:10]}; {len(items)} for the desk. Nothing was changed.")
        return 0

    # 6. tell the desk, a batch at a time (each item is safe to send again)
    run_id = None
    pairs: list[tuple[dict, dict]] = []
    batch: list[dict] = []

    def flush(final: bool):
        nonlocal run_id, batch
        payload = {"runId": run_id, "startedAt": started, "mailbox": mailbox, "items": batch}
        if final:
            payload.update({"final": True, "ok": not problems, "counts": counts, "message": "; ".join(problems)[:280] or None})
        answer = desk.call("POST", "report", payload)
        run_id = answer.get("runId") or run_id
        for r in answer.get("results", []):
            if isinstance(r.get("i"), int) and 0 <= r["i"] < len(batch):
                pairs.append((batch[r["i"]], r))
        batch = []

    size = 0
    for i in items:
        blob = len(json.dumps(i))
        if batch and (len(batch) >= BATCH_ITEMS or size + blob > BATCH_BYTES):
            flush(False)
            size = 0
        batch.append(i)
        size += blob
    flush(True)

    results = [r for _, r in pairs]
    tally: dict[str, int] = {}
    for r in results:
        tally[r.get("result", "?")] = tally.get(r.get("result", "?"), 0) + 1
    # partner emails the desk now has: forget them here
    done_keys = {it.get("key") for it, r in pairs if it.get("type") == "sent" and r.get("result") not in ("error", "bad")}
    if pending and done_keys & set(pending):
        save_pending([p for k, p in pending.items() if k not in done_keys])
    errors = [r.get("error") for r in results if r.get("result") == "error"]
    words = {"sent": "emails logged", "new_partner": "new partners", "followup_sent": "follow-ups sent", "matched": "matched to what the desk had",
             "reply": "replies", "bounce": "bounces", "auto_reply": "automatic replies", "delay": "delay notices", "drafted": "follow-up drafts made",
             "review": "to check", "known": "already on the desk", "unknown": "not a partner's", "noted": "drafts tidied", "stale": "drafts gone stale",
             "reply_drafted": "reply drafts made", "reply_sent": "replies sent"}
    say(
        f"Synced with the desk: read {counts['read']} messages since {since_iso[:10]}; "
        + (", ".join(f"{v} {words.get(k, k.replace('_', ' '))}" for k, v in sorted(tally.items()) if k not in ("error", "bad")) or "nothing new")
        + "."
    )
    if tally.get("review"):
        say(f"{tally['review']} to check on the desk's Today page.")
    for e in errors[:5]:
        say(f"    The desk couldn't take one: {e}")
    return 1 if (problems or errors) else 0


# ---------------------------------------------------------------------------------------------------- commands


def cmd_desk_link(args) -> int:
    cfg = dp.load_config()
    if args.url:
        cfg["desk_url"] = args.url.rstrip("/")
        dp.save_config(cfg)
    store = key_store(cfg)
    key = secrets.token_urlsafe(32)
    store.set(key)
    print("A new desk key is in the Keychain (club-yuppie-desk). It isn't shown and never leaves this Mac except to the desk.")
    print(f"Its fingerprint: {fingerprint(key)}")
    print(f"Paste the fingerprint into {desk_base(cfg)}/admin/desk/settings (Outlook > Fingerprint), then run: draft-partner-emails sync --dry-run")
    print("Link it again every six months.")
    return 0


def cmd_desk_unlink(_args) -> int:
    cfg = dp.load_config()
    key_store(cfg).delete()
    print("The desk key is gone from the Keychain: this Mac can't reach the desk now. Unlink it on the desk too (Desk > Settings).")
    return 0


class Lock:
    """One sync at a time (the 15-minute schedule and a run in Terminal could meet)."""

    def __enter__(self):
        path = lock_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        try:
            pid = int(path.read_text().strip() or 0)
        except (OSError, ValueError):
            pid = 0
        if pid and pid != os.getpid():
            try:
                os.kill(pid, 0)
                raise dp.DraftError("Another sync is running. It finishes by itself.")
            except ProcessLookupError:
                pass
            except PermissionError:
                raise dp.DraftError("Another sync is running. It finishes by itself.") from None
        path.write_text(str(os.getpid()))
        return self

    def __exit__(self, *exc):
        try:
            lock_path().unlink()
        except OSError:
            pass
        return False


def run_sync(cfg: dict, dry_run=False, since=None, quiet=False, graph: dp.Graph | None = None) -> int:
    if not linked(cfg):
        raise dp.DraftError("The desk isn't linked. Run: draft-partner-emails desk-link")
    with Lock():
        graph = graph or dp.Graph(dp.Auth(cfg))
        signed_in = graph.mailbox()
        if signed_in != dp.mailbox_of(cfg):
            raise dp.DraftError(f"Signed in as {signed_in or 'someone else'}, not {dp.mailbox_of(cfg)}. Nothing synced.")
        return sync(cfg, graph, Desk(cfg), dry_run=dry_run, since=since, quiet=quiet)


def cmd_sync(args) -> int:
    cfg = dp.load_config()
    try:
        return run_sync(cfg, dry_run=args.dry_run, since=args.since, quiet=args.quiet)
    except dp.DraftError as err:
        # the schedule's log keeps the time; Terminal shows the words
        print(f"{datetime.datetime.now().strftime('%d %b %H:%M')} Not synced: {err}" if args.quiet else f"Not synced: {err}")
        return 1


def check_before_drafting(cfg: dict, draft: "dp.Draft") -> str | None:
    """Before a partner email is drafted (plan 3.4, step 1): None to go ahead, or why not."""
    if not linked(cfg):
        return None
    try:
        answer = Desk(cfg).call("POST", "check", {"addresses": [a for _, a in draft.to + draft.cc]})
    except dp.DraftError as err:
        return f"held back: the desk couldn't be asked whether they opted out ({err}). It drafts at the next run."
    out = [a for a, r in (answer.get("results") or {}).items() if r.get("status") == "opted_out"]
    if out:
        return f"not drafted: {', '.join(out)} asked us to stop (opted out on the desk)."
    return None


# --------------------------------------------------------------------------- the 15-minute schedule (a LaunchAgent)


def agent_dir() -> Path:
    return Path.home() / "Library" / "Application Support" / "club-yuppie-drafts"


def plist_path() -> Path:
    return Path.home() / "Library" / "LaunchAgents" / f"{SCHEDULE_LABEL}.plist"


def cmd_schedule(args) -> int:
    if platform.system() != "Darwin" and not os.environ.get("CYD_SCHEDULE_DRY"):
        raise dp.DraftError("The schedule is a macOS LaunchAgent: run this on the Mac.")
    uid = os.getuid()
    plist = plist_path()
    if args.what == "off":
        if not os.environ.get("CYD_SCHEDULE_DRY"):
            subprocess.run(["launchctl", "bootout", f"gui/{uid}/{SCHEDULE_LABEL}"], capture_output=True)
        if plist.exists():
            plist.unlink()
        print("The 15-minute sync is off. draft-partner-emails still syncs when you run it.")
        return 0
    if args.what == "status":
        print("The 15-minute sync is " + ("on" if plist.exists() else "off") + ".")
        return 0
    # a copy of the tool outside Desktop and OneDrive, which macOS keeps background jobs out of
    here = Path(__file__).resolve().parent
    bin_dir = agent_dir() / "bin"
    bin_dir.mkdir(parents=True, exist_ok=True)
    for name in ("draft_partner_emails.py", "desk_sync.py"):
        (bin_dir / name).write_bytes((here / name).read_bytes())
    logs = Path.home() / "Library" / "Logs" / "club-yuppie-drafts.log"
    logs.parent.mkdir(parents=True, exist_ok=True)
    python = sys.executable or "/usr/bin/python3"
    plist.parent.mkdir(parents=True, exist_ok=True)
    plist.write_text(f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>{SCHEDULE_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>{html.escape(python)}</string>
    <string>{html.escape(str(bin_dir / 'draft_partner_emails.py'))}</string>
    <string>sync</string>
    <string>--quiet</string>
  </array>
  <key>StartInterval</key><integer>{SCHEDULE_SECONDS}</integer>
  <key>RunAtLoad</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>{html.escape(str(logs))}</string>
  <key>StandardErrorPath</key><string>{html.escape(str(logs))}</string>
</dict>
</plist>
""", encoding="utf-8")
    if not os.environ.get("CYD_SCHEDULE_DRY"):
        subprocess.run(["launchctl", "bootout", f"gui/{uid}/{SCHEDULE_LABEL}"], capture_output=True)
        done = subprocess.run(["launchctl", "bootstrap", f"gui/{uid}", str(plist)], capture_output=True, text=True)
        if done.returncode != 0:
            raise dp.DraftError(f"macOS didn't start the schedule: {done.stderr.strip() or done.returncode}")
    print(f"The sync runs every 15 minutes while the Mac is awake (and now). Its log: {logs}")
    print("After updating the tool (a new version on main), run schedule on again so the schedule uses it.")
    return 0
