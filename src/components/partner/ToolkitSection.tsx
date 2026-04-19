"use client";
/**
 * Partner Toolkit, primary block = partner link + Copy. Promo code demoted to
 * collapsed <details> "Internal reference" — bondsman-modes v2 moves bondsmen
 * off code-handoff and onto link-handoff (the code is already baked into /r/{code}).
 */

import { useState } from "react";
import { copyToClipboard } from "@/lib/clipboard";

interface ToolkitSectionProps {
  partner: {
    promo_code: string | null;
  };
  referralUrl: string;
}

export function ToolkitSection({ partner, referralUrl }: ToolkitSectionProps) {
  const [copiedLink, setCopiedLink] = useState(false);

  async function handleCopyLink() {
    const ok = await copyToClipboard(referralUrl);
    if (!ok) return;
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }

  if (!referralUrl) {
    return (
      <section className="bg-zinc-900 rounded-xl border border-zinc-700 p-6">
        <h2 className="text-xl font-bold mb-4">Your Partner Link</h2>
        <p className="text-zinc-400">Your promo code is being set up. Check back shortly.</p>
      </section>
    );
  }

  return (
    <section className="bg-zinc-900 rounded-xl border border-zinc-700 p-6">
      <h2 className="text-xl font-bold mb-4">Your Partner Link</h2>
      <div className="bg-zinc-800 rounded-xl p-4 border border-zinc-700 flex items-center gap-3 mb-3">
        <code className="text-amber-400 text-base flex-1 break-all">{referralUrl}</code>
        <button
          onClick={handleCopyLink}
          aria-label={copiedLink ? "Copied" : "Copy partner link"}
          aria-live="polite"
          className="text-sm px-4 py-2.5 min-h-[44px] rounded-lg bg-amber-500 text-black font-bold hover:bg-amber-400 transition-colors cursor-pointer"
        >
          {copiedLink ? "Copied!" : "Copy"}
        </button>
      </div>
      <p className="text-zinc-400 text-xs">
        Clients use this link. The 10% discount is already built in.
      </p>
      {partner.promo_code && (
        <details className="mt-4">
          <summary className="text-zinc-400 text-xs cursor-pointer">Internal reference</summary>
          <div className="mt-2 text-zinc-400 text-xs">
            Code: <span className="font-mono">{partner.promo_code}</span>. You don&apos;t need to give this to clients. The link carries it.
          </div>
        </details>
      )}
    </section>
  );
}
