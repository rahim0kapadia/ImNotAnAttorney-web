"use client";
/**
 * WorkflowToggle, bondsman-modes v2 self-serve mode switcher.
 *
 * Partners pick check-in mode vs referral-only mode. PATCH /api/partner/settings
 * with { check_in_enabled: boolean } — the server stamps `flip_at` only when the
 * value actually changes, so FlipBanner shows only after a real flip.
 */
import { useState } from "react";

interface Props {
  initialCheckInEnabled: boolean;
  promoCode: string;
  siteUrl: string;
  onSaved: () => void;
}

export function WorkflowToggle({ initialCheckInEnabled, promoCode, siteUrl, onSaved }: Props) {
  const [checkInEnabled, setCheckInEnabled] = useState(initialCheckInEnabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (checkInEnabled === initialCheckInEnabled) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/partner/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ check_in_enabled: checkInEnabled }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Save failed");
      }
      onSaved();
    } catch (e) {
      // Revert the optimistic radio selection so UI reflects the persisted
      // mode. Keep the error message visible so the partner sees why.
      setCheckInEnabled(initialCheckInEnabled);
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const checkInUrl = `${siteUrl}/checkin/${promoCode}`;
  const courtDateUrl = `${siteUrl}/court-date/${promoCode}`;
  const dirty = checkInEnabled !== initialCheckInEnabled;
  const buttonLabel = saving
    ? "Saving..."
    : dirty
      ? checkInEnabled
        ? "Switch to Check-In Mode"
        : "Switch to Referral Mode"
      : "No changes to save";

  return (
    <section className="bg-zinc-900 rounded-xl border border-zinc-700 p-6">
      <h2 className="text-xl font-bold mb-1">Client workflow</h2>

      <fieldset
        className="space-y-3 mt-4"
        aria-describedby={error ? "workflow-error" : undefined}
        aria-invalid={!!error}
      >
        <legend className="text-sm text-zinc-300 font-medium mb-2">
          How do you want your link to work?
        </legend>

        <label
          className={`flex items-start gap-3 cursor-pointer rounded-lg border p-3 min-h-[44px] transition-colors ${
            checkInEnabled ? "border-amber-500 bg-amber-500/5" : "border-zinc-700 hover:border-zinc-600"
          }`}
        >
          <input
            type="radio"
            name="workflowMode"
            checked={checkInEnabled}
            onChange={() => setCheckInEnabled(true)}
            className="mt-1 h-5 w-5 border-zinc-700 bg-zinc-800 text-amber-500 focus:ring-amber-500"
          />
          <span>
            <strong className="text-white block">Check-in mode</strong>
            <span className="text-sm text-zinc-400 block mt-1">
              <em>Best if you already track clients between bond and court.</em> Your clients get daily check-in prompts plus court date reminders. You see who&apos;s checking in, who&apos;s not, and missed-check-in alerts land in your inbox.
            </span>
          </span>
        </label>

        <label
          className={`flex items-start gap-3 cursor-pointer rounded-lg border p-3 min-h-[44px] transition-colors ${
            !checkInEnabled ? "border-amber-500 bg-amber-500/5" : "border-zinc-700 hover:border-zinc-600"
          }`}
        >
          <input
            type="radio"
            name="workflowMode"
            checked={!checkInEnabled}
            onChange={() => setCheckInEnabled(false)}
            className="mt-1 h-5 w-5 border-zinc-700 bg-zinc-800 text-amber-500 focus:ring-amber-500"
          />
          <span>
            <strong className="text-white block">Referral-only.</strong>
            <span className="text-sm text-zinc-400 block mt-1">
              <em>Best if you bond-and-forward.</em> Your surety doesn&apos;t let you run check-ins, or you&apos;ve decided not to. Your clients get court date reminders and hearing prep. You stay out of the check-in workflow entirely.
            </span>
          </span>
        </label>
      </fieldset>

      <div className="mt-4 text-xs text-zinc-400 space-y-2">
        <p>You can switch modes later. When you do, your partner link changes:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Check-in mode: your clients see <span className="text-amber-400">Court Check-In</span> previews at <span className="text-amber-400 break-all">{checkInUrl}</span></li>
          <li>Referral mode: your clients see <span className="text-amber-400">Court Prep</span> previews at <span className="text-amber-400 break-all">{courtDateUrl}</span></li>
        </ul>
        <p>
          The old link keeps working for any QR codes or flyers you already printed, but it&apos;ll show the new mode&apos;s preview. Best practice: reprint your bail-packet insert within a week.
        </p>
      </div>

      {error && (
        <p id="workflow-error" role="alert" className="text-red-400 text-sm mt-3">
          {error}
        </p>
      )}

      <button
        onClick={handleSave}
        disabled={saving || !dirty}
        className="mt-4 px-5 py-2.5 min-h-[44px] bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
      >
        {buttonLabel}
      </button>
    </section>
  );
}
