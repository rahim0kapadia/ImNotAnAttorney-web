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
 * Presentation only, no business logic or data fetching lives here.
 * Findings content is produced upstream by /api/score and passed in unchanged.
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
}

export function InternalMemo({
  fileRef,
  date,
  subject,
  findings,
  preparedBy = "R-7",
  ariaLabel,
}: InternalMemoProps) {
  return (
    <section
      aria-label={ariaLabel ?? "Internal memo from the Masked Researchers"}
      className="rounded-lg border border-amber-500/30 bg-zinc-950/80 p-5 sm:p-6"
    >
      {/* Classification strip */}
      <div className="flex items-center gap-2 border-b border-amber-500/25 pb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-400">
        <span
          className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500"
          aria-hidden="true"
        />
        Cleared for defendant eyes only
      </div>

      {/* Header block */}
      <dl className="mt-4 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 font-mono text-xs text-zinc-300">
        <dt className="text-zinc-500">PREPARED BY:</dt>
        <dd className="text-zinc-200">{preparedBy}</dd>
        <dt className="text-zinc-500">FILE-REF:</dt>
        <dd className="break-all text-amber-400">{fileRef}</dd>
        <dt className="text-zinc-500">DATE:</dt>
        <dd className="text-zinc-200">{date}</dd>
        <dt className="text-zinc-500">SUBJECT:</dt>
        <dd className="text-zinc-200">{subject}</dd>
      </dl>

      {/* Findings */}
      <div className="mt-5 border-t border-zinc-800 pt-4">
        <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
          Findings
        </h3>
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
        <p className="font-mono text-[11px] italic text-zinc-400">
          &mdash; Researchers. Defendants, still fighting.
        </p>
      </div>
    </section>
  );
}
