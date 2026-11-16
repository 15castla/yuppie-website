"""The real drafter (tools/outlook-drafter) against the local desk and a stand-in Outlook, for
tests/e2e/phase-b/26-outreach-outlook.mjs. Reads a scenario (JSON) from argv[1]:

  {"key": "<the desk key>", "desk": "http://localhost:3241", "messages": [{"folder": ..., ...}], "pending": [...],
   "steps": [{"sync": {"args": [...]}} | {"send_drafts": {"at": ISO}} | {"add": {...message}}]}

and prints one JSON line per step: the exit code, the drafter's words, and the drafts in the stand-in Outlook.
"""

from __future__ import annotations

import contextlib
import io
import json
import os
import sys
import tempfile
from pathlib import Path

TOOL = Path(__file__).resolve().parents[3] / "tools" / "outlook-drafter"
sys.path.insert(0, str(TOOL))
from fake_outlook import FakeOutlook  # noqa: E402

scenario = json.loads(Path(sys.argv[1]).read_text())
ms = FakeOutlook(prefix=scenario.get("prefix", ""))
tmp = tempfile.TemporaryDirectory()
base = Path(tmp.name)
os.environ.update({
    "CYD_CONFIG": str(base / "config.json"),
    "CYD_LOGIN_BASE": f"http://127.0.0.1:{ms.port}",
    "CYD_GRAPH_BASE": f"http://127.0.0.1:{ms.port}/v1.0",
    "CYD_TOKEN_FILE": str(base / "token"),
    "CYD_DESK_KEY_FILE": str(base / "desk-key"),
    "CYD_DESK_BASE": scenario["desk"],
    "HOME": str(base),
})
(base / "token").write_text("refresh-0")
(base / "desk-key").write_text(scenario["key"])
import draft_partner_emails as dp  # noqa: E402
import desk_sync as ds  # noqa: E402

dp.time.sleep = lambda s: None
dp.save_config({"tenant": "t", "client": "c", "mailbox": "albert@clubyuppie.com", "root": str(base / "Partner emails")})
(base / "Partner emails").mkdir()
if scenario.get("pending"):
    ds.save_pending(scenario["pending"])
for m in scenario.get("messages", []):
    ms.add(m.pop("folder"), **m)

for step in scenario["steps"]:
    out = io.StringIO()
    code = None
    if "sync" in step:
        with contextlib.redirect_stdout(out):
            code = dp.main(["sync", *step["sync"].get("args", [])])
    elif "send_drafts" in step:
        for d in [m for m in ms.messages.values() if m["folder"] == "drafts"]:
            ms.send(d["id"], step["send_drafts"]["at"])
    elif "add" in step:
        m = dict(step["add"])
        ms.add(m.pop("folder"), **m)
    drafts = [
        {"id": m["id"], "subject": m["subject"], "to": [p["emailAddress"]["address"] for p in m["toRecipients"]], "cc": [p["emailAddress"]["address"] for p in m["ccRecipients"]],
         "key": m["key"], "body": m["bodyHtml"], "attachments": [a["name"] for a in m["attachments"]], "conversationId": m["conversationId"], "folder": m["folder"]}
        for m in ms.messages.values() if m["folder"] in ("drafts", "deleteditems")
    ]
    sends = [p for p in ms.paths() if p.rstrip("/").split("/")[-1] in ("send", "reply", "replyAll", "forward")]
    print(json.dumps({"step": list(step)[0], "code": code, "out": out.getvalue(), "drafts": drafts, "sendCalls": sends, "pending": len(ds.load_pending())}), flush=True)

ms.close()
tmp.cleanup()
