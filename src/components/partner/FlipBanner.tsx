"use client";
/**
 * FlipBanner, 14-day post-flip notice that partner link URL has changed.
 *
 * Shows after a mode flip (partners.flip_at set server-side by settings PATCH).
 * Auto-hides after 14 days or when dismissed via localStorage. Dismissal is keyed
 * on the specific flip_at timestamp so a subsequent flip surfaces the banner again.
 */
import { useEffect, useState } from "react";

interface Props {
  partnerUrl: string;
  checkInEnabled: boolean;
  flipAt: string | null;
}

export function FlipBanner({ partnerUrl, checkInEnabled, flipAt }: Props) {
  // Lazy-init from localStorage so SSR and first client render agree — prevents
  // a brief flash of the banner for partners who already dismissed the same flip.
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined" || !flipAt) return false;
    try {
      return !!localStorage.getItem(`inaa.flipDismissed.${flipAt}`);
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!flipAt) return;
    try {
      if (localStorage.getItem(`inaa.flipDismissed.${flipAt}`)) setDismissed(true);
    } catch {}
  }, [flipAt]);

  if (!flipAt || dismissed) return null;
  // Clamp to 0 so clock skew (flip_at in the future vs client clock) doesn't
  // let the banner linger past the 14-day window.
  const ageDays = Math.max(0, (Date.now() - new Date(flipAt).getTime()) / (1000 * 60 * 60 * 24));
  if (ageDays > 14) return null;

  function dismiss() {
    try {
      localStorage.setItem(`inaa.flipDismissed.${flipAt}`, "1");
    } catch {}
    setDismissed(true);
  }

  const modeLabel = checkInEnabled ? "Check-in mode" : "Referral mode";

  return (
    <div role="status" aria-live="polite" className="bg-amber-500/10 border border-amber-500/50 rounded-xl px-5 py-4">
      <p className="text-amber-300 font-semibold text-base">
        You switched to {modeLabel}. Your link now points to the new mode.
      </p>
      <p className="text-zinc-300 text-sm mt-1">
        New link: <span className="text-amber-400 font-mono text-xs break-all">{partnerUrl}</span>
      </p>
      <p className="text-zinc-300 text-sm mt-1">
        Existing QR codes and printed inserts still work. They&apos;ll show the new mode&apos;s preview.{" "}
        <a href="/partner/card" className="underline hover:text-white">Reprint your bail-packet insert</a>{" "}
        and{" "}
        <a href="/partner/checklist" className="underline hover:text-white">your compliance checklist</a>{" "}
        with the new URL within a week.
      </p>
      <button
        onClick={dismiss}
        aria-label="Dismiss URL-change banner"
        className="text-amber-400 text-xs mt-2 underline hover:text-amber-300 cursor-pointer min-h-[44px] px-2"
      >
        Dismiss
      </button>
    </div>
  );
}
