"use client";

import { FadeInUp } from "@/components/motion/FadeInUp";

/**
 * InternalMemo, leaked-internal-memo visual presentation used by the
 * "Masked Researcher's First Read" (née Defense Milestone Score).
 *
 * Purpose: render scoring findings as a document a defendant would forward to
 * another defendant, not a marketing report card. Monospace body on zinc-dark
 * paper, amber accent, three-row redacted-file header, "FINDINGS" block with
 * triangular bullets, and a researcher signature closer.
 *
 * Presentation only, no business logic or data fetching lives here. Findings
 * content is produced upstream by /api/score and passed in unchanged.
 *
 * A11y decisions (audit 2026-04-19):
 *   - dt labels use zinc-400 (7.76:1 on zinc-950) to clear WCAG AA 4.5:1.
 *   - Classification strip + FINDINGS label + signature use text-xs (12px)
 *     instead of 10-11px for low-vision readability.
 *   - Heading level is configurable via `headingLevel` so parent pages
 *     don't skip from h1 to h3.
 *
 * Information hierarchy (audit 2026-04-19):
 *   - SUBJECT (charge + band) renders first in the header grid so the
 *     highest-signal content sits above the cognitive fold. Procedural
 *     metadata (PREPARED BY, FILE-REF, DATE) follows.
 */
interface InternalMemoProps {
  /** Case-file-style reference id shown in the header (e.g. "ABN-AB12CD"). */
  fileRef: string;
  /** ISO date (YYYY-MM-DD) shown in the header. Preformatted by caller so
   *  shared pages can use the original created_at instead of "today". */
  date: string;
  /** Short subject line for the memo, typically "<charge label> - <band>". */
  subject: string;
  /** Bullet findings from the scoring engine. Rendered verbatim. */
  findings: string[];
  /** Researcher codename. Defaults to "R-7" (anonymity positioning). */
  preparedBy?: string;
  /** Optional accessible label when embedded in a larger region. */
  ariaLabel?: string;
  /** Heading level for the FINDINGS label. Default h3 when nested under an
   *  h2 (main score page); pass "h2" when memo is the primary heading
   *  level inside a page whose only preceding heading is h1. */
  headingLevel?: "h2" | "h3";
}

export function InternalMemo({
  fileRef,
  date,
  subject,
  findings,
  preparedBy = "R-7",
  ariaLabel,
  headingLevel = "h3",
}: InternalMemoProps) {
  const FindingsHeading = headingLevel;

  return (
    <section
      aria-label={ariaLabel ?? "Internal memo from the Masked Researchers"}
      className="rounded-lg border border-amber-500/30 bg-zinc-950/80 p-5 sm:p-6"
    >
      {/* Classification strip */}
      <div className="flex items-center gap-2 border-b border-amber-500/25 pb-3 font-mono text-xs font-semibold uppercase tracking-[0.12em] text-amber-400">
        <span
          className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500"
          aria-hidden="true"
        />
        Cleared for defendant eyes only
      </div>

      {/* Header block, SUBJECT first so highest-signal content sits on top */}
      <dl className="mt-4 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 font-mono text-xs text-zinc-300">
        <dt className="text-zinc-400">SUBJECT:</dt>
        <dd className="text-zinc-100">{subject}</dd>
        <dt className="text-zinc-400">DATE:</dt>
        <dd className="text-zinc-200">{date}</dd>
        <dt className="text-zinc-400">PREPARED BY:</dt>
        <dd className="text-zinc-200">{preparedBy}</dd>
        <dt className="text-zinc-400">FILE-REF:</dt>
        <dd className="break-all text-amber-400">{fileRef}</dd>
      </dl>

      {/* Findings */}
      <div className="mt-5 border-t border-zinc-800 pt-4">
        <FindingsHeading className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-zinc-300">
          Findings
        </FindingsHeading>
        <ul className="mt-3 space-y-3">
          {findings.map((item, i) => (
            <FadeInUp key={i} delay={i * 0.08}>
              <li className="flex gap-3 font-mono text-sm leading-relaxed text-zinc-200">
                <span
                  className="shrink-0 select-none text-amber-400"
                  aria-hidden="true"
                >
                  &#9656;
                </span>
                <span>{item}</span>
              </li>
            </FadeInUp>
          ))}
        </ul>
      </div>

      {/* Signature */}
      <div className="mt-6 border-t border-amber-500/20 pt-3">
        <p className="font-mono text-xs italic text-zinc-300">
          &mdash; Researchers. Defendants, still fighting.
        </p>
      </div>
    </section>
  );
}
