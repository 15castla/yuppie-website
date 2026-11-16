"use client";

// The import preview (17 Nov 2026): reads the desk import file in the browser, checks it with the same parser the
// server uses, and shows what will be created before Import is pressed. Nothing leaves the browser until then.

import { useState } from "react";

import { deskImport } from "@/app/admin/desk-actions";
import { parseImport, type ImportFile } from "@/lib/server/outreach/import-format";
import { CATEGORIES, STAGES } from "@/lib/server/outreach/model";

export function ImportForm() {
  const [file, setFile] = useState<ImportFile | null>(null);
  const [problems, setProblems] = useState<string[]>([]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setFile(null);
    setProblems([]);
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const parsed = parseImport(JSON.parse(await f.text()));
      if (parsed.ok) setFile(parsed.data);
      else setProblems(parsed.problems);
    } catch {
      setProblems(["That isn't a JSON file."]);
    }
  }

  return (
    <form action={deskImport} className="dk-form">
      <label className="dk-field wide">
        <span>Import file</span>
        <input type="file" name="file" accept="application/json,.json" required onChange={onPick} />
        <small>The file Claude builds from the outreach log. A partner already in the desk is skipped, so importing twice changes nothing.</small>
      </label>
      {problems.length > 0 && (
        <div className="dk-problems wide" role="alert">
          <strong>This file can&apos;t be imported:</strong>
          <ul>
            {problems.slice(0, 50).map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      {file && (
        <div className="wide dk-scroll">
          <table className="dk-table">
            <thead>
              <tr>
                <th>Partner</th>
                <th>Category</th>
                <th>Stage</th>
                <th className="num">Contacts</th>
                <th className="num">Sent</th>
                <th className="num">Back</th>
                <th className="num">Notes</th>
                <th className="num">Actions</th>
              </tr>
            </thead>
            <tbody>
              {file.targets.map((t) => (
                <tr key={t.key}>
                  <td className="name">{t.name}</td>
                  <td>{CATEGORIES[t.category]}</td>
                  <td>{STAGES[t.stage]}</td>
                  <td className="num">{t.contacts.length}</td>
                  <td className="num">{t.touches.length}</td>
                  <td className="num">{t.outcomes.length}</td>
                  <td className="num">{t.notes_list.length}</td>
                  <td className="num">{t.actions.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="dk-form-foot">
        <button className="dk-btn primary" type="submit" disabled={!file}>
          Import {file ? `${file.targets.length} partners` : ""}
        </button>
      </div>
    </form>
  );
}
