"use client";

import { FadeInUp } from "@/components/motion/FadeInUp";

/**
 * InternalMemo, leaked-internal-memo visual presentation used by the
 * "Masked Researcher's First Read" (née Defense Milestone Score).
 *
 * Purpose: render scoring findings as a document a defendant would forward to
 * another defendant, not a marketing report card. Monospace body on zinc-dark
 * paper, amber accent, compact redacted-file header, "FINDINGS" block with
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
 * Information hierarchy (Laja + Suby audits 2026-04-19):
 *   - SUBJECT (charge + band) renders first in the header grid so the
 *     highest-signal content sits above the cognitive fold.
 *   - Mobile shows a single compact line (SUBJECT + DATE + FILE-REF inline)
 *     collapsing the 4-row grid so crisis-buyer gets to findings faster.
 *     Full 4-row grid renders at sm: breakpoint and up.
 *
 * UPL decisions (Legal Compliance audit 2026-04-19):
 *   - Classification strip uses "For defendants only" not "Cleared for
 *     defendant eyes only" to avoid borrowing privilege-review vocabulary.
 *
 * Permission-asset hooks (Chaperon audit 2026-04-19):
 *   - Optional `clusterNote` prop renders a single italic in-body reference
 *     to other files in the cluster so the signature lands as confirmation
 *     of an existing tribe, not an orphan tagline.
 *   - Optional `teaser` prop renders a "CONT." line after findings so the
 *     downstream email-capture block reads as the "secure channel" for
 *     additional findings rather than a cold interrupt.
 */
type HeadingLevel = "h2" | "h3";

interface InternalMemoProps {
  /** Case-file-style reference id shown in the header (e.g. "ABN-AB12CD"). */
  fileRef: string;
  /** ISO date (YYYY-MM-DD) shown in the header. Preformatted by caller so
   *  shared pages can use the original created_at instead of "today". */
  date: string;
  /** Short subject line for the memo. Callers append " (self-assessed)" so
   *  no consumer reads the SUBJECT + band as an attorney's case evaluation. */
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
  headingLevel?: HeadingLevel;
  /** Optional in-body cluster reference (e.g. "File #X in the [charge]
   *  cluster — 64% of peers show same motion gap"). Renders as italic
   *  text between findings and signature. */
  clusterNote?: string;
  /** Optional cliffhanger line rendered AFTER findings ("ADDITIONAL FINDINGS
   *  PENDING — delivered by secure channel."). Primes the downstream email
   *  capture to read as the secure channel rather than a cold ask. */
  teaser?: string;
}

export function InternalMemo({
  fileRef,
  date,
  subject,
  findings,
  preparedBy = "R-7",
  ariaLabel,
  headingLevel = "h3",
  clusterNote,
  teaser,
}: InternalMemoProps) {
  const FindingsHeading: HeadingLevel = headingLevel;

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
        For defendants only
      </div>

      {/* Header — mobile collapses to compact two-row line; sm:+ shows full grid
          with SUBJECT + DATE first for highest-signal content above the fold. */}
      <div className="mt-4">
        {/* Mobile-only compact header */}
        <div className="block font-mono text-xs text-zinc-300 sm:hidden">
          <p className="text-zinc-100">
            <span className="text-zinc-400">SUBJECT: </span>
            {subject}
          </p>
          <p className="mt-1 text-zinc-400">
            {date} &middot; <span className="text-amber-400 break-all">{fileRef}</span> &middot; {preparedBy}
          </p>
        </div>
        {/* sm:+ full grid */}
        <dl className="hidden grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 font-mono text-xs text-zinc-300 sm:grid">
          <dt className="text-zinc-400">SUBJECT:</dt>
          <dd className="text-zinc-100">{subject}</dd>
          <dt className="text-zinc-400">DATE:</dt>
          <dd className="text-zinc-200">{date}</dd>
          <dt className="text-zinc-400">PREPARED BY:</dt>
          <dd className="text-zinc-200">{preparedBy}</dd>
          <dt className="text-zinc-400">FILE-REF:</dt>
          <dd className="break-all text-amber-400">{fileRef}</dd>
        </dl>
      </div>

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
        {clusterNote && (
          <p className="mt-4 font-mono text-xs italic leading-relaxed text-zinc-400">
            {clusterNote}
          </p>
        )}
        {teaser && (
          <p className="mt-4 border-l-2 border-amber-500/40 pl-3 font-mono text-xs uppercase tracking-[0.12em] text-amber-400">
            {teaser}
          </p>
        )}
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
