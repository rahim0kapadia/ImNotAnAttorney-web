/**
 * Shared Score Results Page, /score/results/[token]
 *
 * Public page displaying a shared Masked Researcher's First Read (formerly
 * "Defense Milestone Score"). Fetched server-side from Supabase by token.
 * Renders the score arc + leaked-internal-memo block. No auth required.
 *
 * If token is invalid or expired, shows a "Take the quiz yourself" fallback.
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

  // view_count tracking deferred, column exists, can be populated via
  // a lightweight API endpoint or cron later. Skipping here to avoid
  // non-atomic read-then-write race condition.

  return data as ScoreResultRow;
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
        "This Masked Researcher's First Read has expired. Take the quiz yourself, free, 60 seconds, no email required.",
    };
  }
  return {
    title: `Masked Researcher's First Read: ${result.score_band}, ImNotAnAttorney`,
    description:
      "Someone shared their criminal defense readiness memo. Check yours, free, 60 seconds, no email required.",
    openGraph: {
      title: `Masked Researcher's First Read: ${result.score_band}`,
      description:
        "Check your criminal defense readiness, free, 60 seconds, no email required.",
      url: `https://imnotanattorney.com/score/results/${token}`,
    },
    twitter: {
      card: "summary_large_image",
      title: `Masked Researcher's First Read: ${result.score_band}`,
      description:
        "Check your criminal defense readiness, free, 60 seconds, no email required.",
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
        <span className="mb-3 inline-block rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-400">
          Shared Memo &middot; Cleared for Defendant Eyes Only
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
        <h2 className="text-lg font-bold text-white">Get YOUR First Read</h2>
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
      <p className="mt-8 text-center font-mono text-[11px] italic text-zinc-400">
        &mdash; Researchers. Defendants, still fighting.
      </p>
      <p className="mt-4 text-center text-xs text-zinc-400">
        This tool does not create an attorney-client relationship. ImNotAnAttorney provides legal information, not legal advice.
      </p>
    </main>
  );
}
