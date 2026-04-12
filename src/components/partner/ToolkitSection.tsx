"use client";
/**
 * Partner Toolkit — promo code, referral URL, QR code, preview link.
 * Extracted from the dashboard page for maintainability.
 */

import { useState } from "react";
import { QRCode } from "@/components/QRCode";
import { copyToClipboard } from "@/lib/clipboard";

interface ToolkitSectionProps {
  partner: {
    promo_code: string | null;
  };
  referralUrl: string;
}

export function ToolkitSection({ partner, referralUrl }: ToolkitSectionProps) {
  const [codeCopied, setCodeCopied] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);

  async function handleCopy(text: string, type: "code" | "url") {
    const ok = await copyToClipboard(text);
    if (!ok) return;
    if (type === "code") {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } else {
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    }
  }

  return (
    <section className="bg-zinc-900 rounded-xl border border-zinc-700 p-6">
      <h2 className="text-xl font-bold mb-4">Your Toolkit</h2>
      {referralUrl ? (
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <p className="text-sm text-zinc-400 mb-1">Your Promo Code</p>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-mono font-bold text-amber-400">
                {partner.promo_code}
              </span>
              <button
                onClick={() => handleCopy(partner.promo_code || "", "code")}
                className="text-xs px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 cursor-pointer"
                aria-label="Copy promo code"
                aria-live="polite"
              >
                {codeCopied ? "Copied!" : "Copy"}
              </button>
            </div>

            <p className="text-sm text-zinc-400 mt-4 mb-1">Your Referral URL</p>
            <div className="flex items-center gap-2">
              <code className="text-sm text-amber-300 bg-zinc-800 px-3 py-1.5 rounded-lg break-all">
                {referralUrl}
              </code>
              <button
                onClick={() => handleCopy(referralUrl, "url")}
                className="text-xs px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 shrink-0 cursor-pointer"
                aria-label="Copy referral URL"
                aria-live="polite"
              >
                {urlCopied ? "Copied!" : "Copy"}
              </button>
            </div>

            <a
              href={referralUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-4 text-sm text-amber-400 hover:text-amber-300"
            >
              Preview what your clients see<span className="sr-only"> (opens in new tab)</span> &rarr;
            </a>
          </div>

          <div className="flex justify-center">
            <QRCode url={referralUrl} size={160} />
          </div>
        </div>
      ) : (
        <p className="text-zinc-400">Your promo code is being set up. Check back shortly.</p>
      )}
    </section>
  );
}
