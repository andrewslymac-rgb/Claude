"use client";

import { useState } from "react";
import Link from "next/link";

type Preview = { rows: { label: string; incoming: number; existing: number }[]; settings: string[]; problems: string[] };

export function ToolImport({ slug, app, label, lists, settings }: { slug: string; app: string; label: string; lists: string[]; settings: string[] }) {
  const [text, setText] = useState("");
  const [json, setJson] = useState<unknown>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const call = async (body: unknown) => {
    const r = await fetch(`/api/w/${slug}/tools/${app}/import`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "Something went wrong.");
    return j;
  };

  const check = async (raw: string) => {
    setError("");
    setDone("");
    setPreview(null);
    setSure(false);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return setError("That isn't valid JSON. Paste the whole export file, from the first { to the last }.");
    }
    setBusy(true);
    try {
      setJson(parsed);
      setPreview(await call({ json: parsed, mode: "preview" }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      const j = await call({ json, mode });
      setDone(`Imported ${(j.rows as Preview["rows"]).map((r) => `${r.incoming} ${r.label}`).join(", ")}.`);
      setPreview(null);
      setText("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const hasExisting = preview && preview.rows.some((r) => r.existing > 0);
  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-4">
        <p className="text-sm text-ink-soft">
          The file is a JSON object with {lists.map((l) => `"${l}"`).join(", ")} and optionally "config" ({settings.join(", ")}). Each is a list of records keyed by id.
        </p>
        <input
          type="file"
          accept=".json,application/json"
          className="block w-full text-sm"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const t = await f.text();
            setText(t);
            check(t);
          }}
        />
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="…or paste the JSON here" rows={6} className="field font-mono text-xs" />
        <button onClick={() => check(text)} disabled={busy || !text.trim()} className="btn btn-secondary">
          {busy && !preview ? "Checking…" : "Check the file"}
        </button>
      </div>

      {error && <div className="rounded-lg border border-danger/40 bg-danger-soft p-3 text-sm text-danger">{error}</div>}
      {done && (
        <div className="card space-y-2 p-4 text-sm">
          <p className="font-semibold">{done}</p>
          <Link href={`/w/${slug}/tools/${app}`} className="text-accent underline">
            Open {label}
          </Link>
        </div>
      )}

      {preview && (
        <div className="card space-y-3 p-4 text-sm">
          <h2 className="text-base font-semibold">What this file would bring in</h2>
          <ul className="space-y-1">
            {preview.rows.map((r) => (
              <li key={r.label}>
                <b className="num">{r.incoming}</b> {r.label} <span className="text-ink-soft">(in Orbit now: {r.existing})</span>
              </li>
            ))}
            <li>Settings: {preview.settings.length ? preview.settings.join(", ") : "none"}</li>
          </ul>
          {preview.problems.length > 0 && (
            <div className="rounded-lg border border-line p-3">
              <p className="font-semibold">Couldn&apos;t read cleanly ({preview.problems.length})</p>
              <ul className="mt-1 max-h-40 list-disc overflow-auto pl-5 text-ink-soft">
                {preview.problems.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="space-y-1">
            <label className="flex items-start gap-2">
              <input type="radio" checked={mode === "merge"} onChange={() => (setMode("merge"), setSure(false))} className="mt-1" />
              <span>
                <b>Add to what&apos;s there.</b> New records are added. A record with the same id is overwritten by the file.
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} className="mt-1" />
              <span>
                <b>Replace all.</b> Everything this tool holds in Orbit is deleted first, then the file is brought in.
              </span>
            </label>
          </div>
          {mode === "replace" && hasExisting && (
            <label className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger-soft p-3 text-danger">
              <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} className="mt-1" />
              <span>Yes, delete this tool&apos;s data that&apos;s in Orbit now. This can&apos;t be undone.</span>
            </label>
          )}
          <button onClick={run} disabled={busy || (mode === "replace" && Boolean(hasExisting) && !sure)} className="btn btn-primary">
            {busy ? "Importing…" : "Import"}
          </button>
        </div>
      )}
    </div>
  );
}
