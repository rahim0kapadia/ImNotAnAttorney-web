/**
 * ScoreDistrictTeaser.tsx
 *
 * Server-rendered teaser block on /score/results/[token].
 * Shows district-level aggregate patterns to drive conversion to Case Decoder ($197).
 *
 * UPL GUARD: All copy uses "Patterns observed in [district]" framing.
 * No directives ("you should"), no predictions ("your case will"),
 * no recommendations ("we recommend"), no attorney deferral ("ask your attorney to").
 * Copy surfaces statistical patterns from public court data only.
 *
 * Renders null (no DOM output) when all four data fields are null —
 * avoids a hollow section on the page for first-time deploys before
 * the matview has sufficient data.
 */

import Link from "next/link";
import type { DistrictTeaserResult } from "@/lib/score/district-teaser";

interface ScoreDistrictTeaserProps {
  data: DistrictTeaserResult;
  chargeLabel: string;
}

export function ScoreDistrictTeaser({ data, chargeLabel }: ScoreDistrictTeaserProps) {
  const { districtName, totalCases, topJudge, terminationRate } = data;

  // If we have no usable signals at all, render nothing rather than a skeleton
  const hasAnyData = districtName !== null || topJudge !== null;
  if (!hasAnyData) return null;

  const districtLabel = districtName ?? "your federal district";

  return (
    <div className="mt-8 rounded-xl border border-zinc-700 bg-zinc-900/60 p-6">
      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <span className="inline-block rounded-full border border-zinc-600 bg-zinc-800 px-3 py-1 font-mono text-xs font-semibold uppercase tracking-widest text-zinc-400">
          District Intel
        </span>
      </div>

      <h2 className="font-display text-base font-bold text-white">
        Patterns observed in {districtLabel}
      </h2>
      <p className="mt-1 font-mono text-xs text-zinc-500">
        Aggregated from federal court docket records &middot; educational patterns only
      </p>

      {/* Signal rows */}
      <ul className="mt-5 space-y-3">
        {/* Case volume */}
        {totalCases !== null && districtName !== null && (
          <li className="flex items-start gap-3">
            <span className="mt-0.5 text-amber-400" aria-hidden="true">▸</span>
            <span className="text-sm text-zinc-300">
              <span className="font-semibold text-white">
                {totalCases.toLocaleString()} {chargeLabel} cases
              </span>{" "}
              observed in {districtName} in the federal sentencing dataset
            </span>
          </li>
        )}

        {/* Top judge */}
        {topJudge !== null && (
          <li className="flex items-start gap-3">
            <span className="mt-0.5 text-amber-400" aria-hidden="true">▸</span>
            <span className="text-sm text-zinc-300">
              Top judge by criminal caseload in this district:{" "}
              <span className="font-semibold text-white">{topJudge}</span>
            </span>
          </li>
        )}

        {/* Termination rate */}
        {terminationRate !== null && (
          <li className="flex items-start gap-3">
            <span className="mt-0.5 text-amber-400" aria-hidden="true">▸</span>
            <span className="text-sm text-zinc-300">
              <span className="font-semibold text-white">{terminationRate}%</span> of dockets
              in this district reached termination — the pattern that shapes plea windows
            </span>
          </li>
        )}
      </ul>

      {/* Separator */}
      <div className="my-5 border-t border-zinc-800" />

      {/* Teaser hook + CTA */}
      <p className="text-sm text-zinc-400">
        The Case Decoder pulls judge-specific sentencing patterns, prosecutor
        pairings, and charge-level motion outcomes for your exact court —
        not district-level aggregates.
      </p>
      <Link
        href="/products/case-decoder"
        className="mt-4 inline-block rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-bold text-black hover:bg-amber-400"
      >
        See full Case Decoder report &rarr; $197
      </Link>

      {/* Micro-disclaimer */}
      <p className="mt-4 font-mono text-[10px] text-zinc-600">
        Patterns sourced from public federal court records. Educational information
        only — not legal advice, not case analysis.
      </p>
    </div>
  );
}
