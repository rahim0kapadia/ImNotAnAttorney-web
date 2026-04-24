/**
 * Playbook Circuit Addendum — public page, gated by order token.
 *
 * URL: /playbook-addendum/[slug]/[state]?t=<token>
 *
 * The addendum is only visible with a valid `playbook_addendum_token` from
 * the order record. No token → 404. Refunded order → 404.
 *
 * Purely a read-only derivation from already-live data (motion_outcome_rates,
 * charge_type_top_authorities, authority_quotes_criminal, citation_velocity_
 * criminal, citation_authority_criminal, motion_outcome_rates_by_circuit).
 * No case-specific data touches the page — circuit derives from the state
 * segment, NOT from a case lookup.
 *
 * SEO: robots noindex/nofollow (token-gated, never crawlable).
 * A11y: approved methodology disclaimer; every rate includes N inline;
 * every citation links to CourtListener.
 */
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken } from "@/lib/site";
import { PLAYBOOK_SLUGS, type TierSlug } from "@/lib/tiers";
import {
  queryPlaybookAddendum,
  PLAYBOOK_SLUG_TO_CHARGE,
  STATE_TO_CIRCUIT,
} from "@/lib/playbook-addendum/generate";
import { renderPlaybookAddendum } from "@/lib/playbook-addendum/render";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props {
  params: Promise<{ slug: string; state: string }>;
  searchParams: Promise<{ t?: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Playbook Circuit Addendum | ImNotAnAttorney",
    robots: { index: false, follow: false },
  };
}

function normalizeState(raw: string): string | null {
  const up = raw.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(up) && up !== "US") return null;
  if (up === "US") return null;
  if (!STATE_TO_CIRCUIT[up]) return null;
  return up;
}

export default async function PlaybookAddendumPage({
  params,
  searchParams,
}: Props) {
  const { slug, state } = await params;
  const { t } = await searchParams;

  if (!PLAYBOOK_SLUGS.has(slug as TierSlug)) notFound();
  if (!PLAYBOOK_SLUG_TO_CHARGE[slug]) notFound();
  if (!t || typeof t !== "string" || t.length < 16) notFound();

  const supabase = createAdminClient();
  const tokenHash = hashToken(t);

  const { data: order, error } = await supabase
    .from("orders")
    .select("id, tier, status, playbook_addendum_token_hash")
    .eq("playbook_addendum_token_hash", tokenHash)
    .single();

  if (error || !order) notFound();
  if (order.status === "refunded") notFound();
  if (order.tier !== slug) notFound();

  const stateCode = normalizeState(state);

  const data = await queryPlaybookAddendum({
    playbookSlug: slug,
    state: stateCode,
  });

  const html = renderPlaybookAddendum(data);

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <div
        // Rendered HTML is fully controlled by render.ts (htmlEscape on every
        // user/DB-derived value) — not user-supplied content. Safe to inject.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
