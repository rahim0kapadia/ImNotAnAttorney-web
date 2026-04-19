"use client";

import { AnimatedScoreArc } from "@/components/motion/AnimatedScoreArc";
import { InternalMemo } from "@/components/InternalMemo";

interface ScoreResultDisplayProps {
  score: number;
  band: string;
  observations: string[];
  /** Share token — used to derive the memo FILE-REF so the same share link
   *  always shows the same reference id. */
  token: string;
  /** ISO date (YYYY-MM-DD) the score was recorded. Falls back to today
   *  upstream if the row lacks created_at. */
  memoDate: string;
  /** Human-readable charge label from getChargeLabel(). */
  chargeLabel: string;
}

const bandColors: Record<string, string> = {
  Critical: "text-red-400",
  Concerning: "text-orange-400",
  Average: "text-yellow-400",
  Adequate: "text-green-400",
  Excellent: "text-emerald-400",
};

/** Derive a short, human-readable FILE-REF from the share token. */
function fileRefFromToken(token: string): string {
  const slug = token.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase();
  return `ABN-${slug || "SHARED"}`;
}

export function ScoreResultDisplay({
  score,
  band,
  observations,
  token,
  memoDate,
  chargeLabel,
}: ScoreResultDisplayProps) {
  const textClass = bandColors[band] || "text-amber-400";
  const fileRef = fileRefFromToken(token);

  return (
    <div className="mt-8 space-y-6">
      <div className="text-center">
        <div className="mx-auto">
          <AnimatedScoreArc score={score} />
        </div>
        <p className={`mt-4 text-lg font-bold ${textClass}`}>{band}</p>
        <p className="mt-2 text-sm text-zinc-400">
          Someone shared their Masked Researcher&apos;s First Read with you. Here&apos;s what the researchers flagged &mdash; self-assessed from ten answers, not a case analysis.
        </p>
      </div>

      <InternalMemo
        fileRef={fileRef}
        date={memoDate}
        subject={`${chargeLabel} \u00b7 ${band} (self-assessed)`}
        findings={observations}
        headingLevel="h2"
        ariaLabel={`Shared Masked Researcher's First Read for a ${chargeLabel} case, ${band} band`}
      />
    </div>
  );
}
