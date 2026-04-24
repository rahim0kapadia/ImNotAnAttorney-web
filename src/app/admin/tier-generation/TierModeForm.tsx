"use client";
/**
 * Client component: mode dropdown + notes field + Save button.
 *
 * POSTs to /api/admin/tier-generation-config with X-Admin-Password.
 * Password pulled from localStorage (set by login flow elsewhere in
 * /admin/*) — same pattern as existing admin forms.
 */
import { useState } from "react";

type Props = {
  tierSlug: string;
  currentMode: string;
  currentNotes: string;
};

const MODES = ["api", "mechanical", "hybrid", "session"] as const;

export default function TierModeForm({ tierSlug, currentMode, currentNotes }: Props) {
  const [mode, setMode] = useState(currentMode);
  const [notes, setNotes] = useState(currentNotes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const pw =
        typeof window !== "undefined"
          ? window.localStorage.getItem("admin_password") ?? ""
          : "";
      const r = await fetch("/api/admin/tier-generation-config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Password": pw,
        },
        body: JSON.stringify({ tier_slug: tierSlug, mode, notes }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({ error: `http-${r.status}` }));
        throw new Error(typeof j.error === "string" ? j.error : `http-${r.status}`);
      }
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const dirty = mode !== currentMode || notes !== currentNotes;

  return (
    <div className="flex items-start gap-2">
      <select
        value={mode}
        onChange={(e) => setMode(e.target.value)}
        className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1"
        disabled={saving}
      >
        {MODES.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="notes"
        className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs w-48"
        disabled={saving}
      />
      <button
        onClick={save}
        disabled={!dirty || saving}
        className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 disabled:text-neutral-500 rounded text-sm"
      >
        {saving ? "Saving..." : "Save"}
      </button>
      {saved && <span className="text-green-400 text-xs self-center">saved</span>}
      {error && <span className="text-red-400 text-xs self-center">{error}</span>}
    </div>
  );
}
