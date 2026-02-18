"use client";

import Link from "next/link";

export function EmbeddableBadge() {
  return (
    <div className="rounded-lg border border-amber-500/50 bg-zinc-900 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500 text-lg font-bold text-black">
          ?
        </div>
        <div>
          <p className="text-sm font-semibold text-white">
            Questions for your attorney?
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            Free questions guide from ImNotAnAttorney
          </p>
          <Link
            href="/guides/10-questions-your-attorney-hopes-you-never-ask.pdf"
            className="mt-2 inline-block text-xs font-semibold text-amber-400 hover:text-amber-300"
          >
            Download Free Guide →
          </Link>
        </div>
      </div>
    </div>
  );
}

// This component can be embedded on other sites via:
// <script src="https://imnotanattorney.com/embed.js"></script>
// <div data-ina-embed="badge"></div>
