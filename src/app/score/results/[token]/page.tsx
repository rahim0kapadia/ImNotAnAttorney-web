/**
 * Shared Score Results Page, /score/results/[token]
 *
 * Public page displaying a shared Masked Researcher's First Read (formerly
 * "Defense Milestone Score"). Fetched server-side from Supabase by token.
 * Renders the score arc + leaked-internal-memo block. No auth required.
 *
 * If token is invalid or expired, shows a "Take the quiz yourself" fallback.
 *
 * Round-2 compliance fixes (2026-04-19):
 *   - Classification strip now says "For defendants only" (not "Cleared for
 *     Defendant Eyes Only") to avoid borrowing privilege-review vocabulary.
 *   - Disclaimer block mirrors the ScoreClient bottom disclaimer in full —
 *     educational-tool framing + "final authority" language — so a shared
 *     link cannot be forwarded without the same legal-information framing.
 *   - Runtime guard on observations array: score_results.observations is
 *     stored as jsonb so a malformed row cannot reach InternalMemo.findings
 *     and throw.
 *   - Metadata titles include "Defense Check" to give the shoppable category
 *     a shareable preview context (Dunford positioning 2026-04-19).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { ScoreResultDisplay } from "./ScoreResultDisplay";
import { getChargeLabel } from "@/lib/score";
import type { Metadata } from "next";

interface ScoreResultRow {
  token: string;
  charge_type: string;
  score_value: number;
  score_band: string;
  observations: string[];
  created_at: string;
  expires_at: string;
}

async function getScoreResult(token: string): Promise<ScoreResultRow | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("score_results")
    .select("token, charge_type, score_value, score_band, observations, created_at, expires_at")
    .eq("token", token)
    .gte("expires_at", new Date().toISOString())
    .single();

  if (error || !data) return null;

  // Runtime guard: observations is stored as jsonb. A bad row could return
  // null / {} / mixed types. Coerce to a string[] so downstream .map() never
  // throws. Empty array triggers the existing fallback copy.
  const safeObservations = Array.isArray((data as { observations?: unknown }).observations)
    ? ((data as { observations: unknown[] }).observations.filter(
        (v): v is string => typeof v === "string",
      ))
    : [];

  return { ...(data as ScoreResultRow), observations: safeObservations };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const result = await getScoreResult(token);
  if (!result) {
    return {
      title: "Memo Expired, ImNotAnAttorney",
      description:
        "This Masked Researcher's First Read has expired. Take the Defense Check yourself, free, 60 seconds, no email required.",
    };
  }
  const sharedTitle = `Defense Check \u2014 Masked Researcher's First Read: ${result.score_band}`;
  return {
    title: `${sharedTitle}, ImNotAnAttorney`,
    description:
      "Someone shared their criminal-defense self-assessment memo. Run your own Defense Check, free, 60 seconds, no email required.",
    openGraph: {
      title: sharedTitle,
      description:
        "Check your criminal-defense readiness, free, 60 seconds, no email required.",
      url: `https://imnotanattorney.com/score/results/${token}`,
    },
    twitter: {
      card: "summary_large_image",
      title: sharedTitle,
      description:
        "Check your criminal-defense readiness, free, 60 seconds, no email required.",
    },
  };
}

export default async function ScoreResultPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await getScoreResult(token);

  if (!result) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-bold text-white">This memo has expired.</h1>
        <p className="mt-4 text-zinc-400">
          Shared memos expire after 90 days. Want your own Masked Researcher&apos;s First Read?
        </p>
        <Link
          href="/score"
          className="mt-6 inline-block rounded-lg bg-amber-500 px-6 py-3 text-sm font-bold text-black hover:bg-amber-400"
        >
          Take the Quiz →
        </Link>
      </main>
    );
  }

  const memoDate = result.created_at
    ? new Date(result.created_at).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const chargeLabel = getChargeLabel(result.charge_type);

  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <div className="text-center">
        <span className="mb-3 inline-block rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5 font-mono text-xs font-semibold uppercase tracking-[0.12em] text-amber-400">
          Shared Memo &middot; For Defendants Only
        </span>
        <h1 className="font-display text-2xl font-bold text-white">
          Masked Researcher&apos;s First Read
        </h1>
      </div>
      <ScoreResultDisplay
        score={result.score_value}
        band={result.score_band}
        observations={result.observations}
        token={result.token}
        memoDate={memoDate}
        chargeLabel={chargeLabel}
      />
      <div className="mt-10 rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 text-center">
        <h2 className="text-lg font-bold text-white">Run your own Defense Check</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Free. 60 seconds. No email required. The researchers stay masked &mdash; so can you.
        </p>
        <Link
          href="/score"
          className="mt-4 inline-block rounded-lg bg-amber-500 px-6 py-3 text-sm font-bold text-black hover:bg-amber-400"
        >
          Take the Quiz →
        </Link>
      </div>
      <p className="mt-8 text-center font-mono text-xs italic text-zinc-400">
        &mdash; Researchers. Defendants, still fighting.
      </p>

      {/* Full disclaimer — mirrors the ScoreClient bottom disclaimer so a
          shared link carries the same educational-tool framing as the
          root /score page. Required for UPL compliance (Legal W1 2026-04-19). */}
      <div className="mt-8 rounded-lg border border-zinc-700 bg-zinc-900 p-4">
        <p className="text-xs text-zinc-400">
          This memo is an educational self-assessment generated from 10
          multiple-choice answers &mdash; not an attorney&apos;s evaluation,
          not a case analysis, not a legal opinion. It does not create an
          attorney-client relationship and does not constitute legal advice.
          Every case is different. Your attorney remains the final authority
          on strategy decisions specific to your situation. ImNotAnAttorney
          provides legal information, not legal advice.
        </p>
      </div>
    </main>
  );
}
