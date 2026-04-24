/**
 * Playbook Circuit Addendum — printable HTML download endpoint.
 *
 * URL: /api/playbook-addendum/[slug]/[state]/pdf?t=<token>
 *
 * Returns a standalone, self-contained HTML document with print styles so
 * the customer can save it as PDF from their browser's Print dialog. We
 * intentionally ship HTML (not server-side PDF) to stay zero-COGS per the
 * Firestone default-alive lens — no puppeteer install, no chromium, no
 * headless runtime. Users get a clean print-to-PDF artifact without us
 * paying rendering infra.
 *
 * Security:
 *   - token lookup via SHA-256 hash (ARCHITECTURE invariant #5 timing-safe
 *     posture; hashToken is standard across report surfaces)
 *   - refunded orders: 404
 *   - tier mismatch: 404
 *   - force-dynamic + cache-control no-store
 */
import { NextRequest, NextResponse } from "next/server";
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

function normalizeState(raw: string): string | null {
  const up = raw.trim().toUpperCase();
  if (up === "US") return null;
  if (!/^[A-Z]{2}$/.test(up)) return null;
  if (!STATE_TO_CIRCUIT[up]) return null;
  return up;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; state: string }> },
) {
  const { slug, state } = await params;
  const t = req.nextUrl.searchParams.get("t");

  if (!PLAYBOOK_SLUGS.has(slug as TierSlug) || !PLAYBOOK_SLUG_TO_CHARGE[slug]) {
    return new NextResponse("Not Found", { status: 404 });
  }
  if (!t || typeof t !== "string" || t.length < 16) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const supabase = createAdminClient();
  const tokenHash = hashToken(t);

  const { data: order, error } = await supabase
    .from("orders")
    .select("id, tier, status, playbook_addendum_token_hash")
    .eq("playbook_addendum_token_hash", tokenHash)
    .single();

  if (error || !order || order.status === "refunded" || order.tier !== slug) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const stateCode = normalizeState(state);
  const data = await queryPlaybookAddendum({
    playbookSlug: slug,
    state: stateCode,
  });

  const inner = renderPlaybookAddendum(data);

  const printStyles = `
    <style>
      @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .playbook-addendum { max-width: 100% !important; margin: 0 !important; padding: 0.5in !important; }
        .pa-upsell { break-inside: avoid; }
        .pa-table { break-inside: avoid-page; }
        a { color: #111; text-decoration: underline; }
      }
      body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #fff; color: #111; }
      .print-banner { background: #fff8e1; border-bottom: 1px solid #f9a825; padding: 0.75em 1em; font-size: 0.9em; }
      .print-banner button { background: #B45309; color: white; border: 0; border-radius: 4px; padding: 0.35em 0.75em; margin-left: 1em; cursor: pointer; }
      @media print { .print-banner { display: none; } }
    </style>
  `;

  const doc = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Circuit Addendum — ${data.playbookDisplayName}</title>
  <meta name="robots" content="noindex, nofollow" />
  ${printStyles}
</head>
<body>
  <div class="print-banner">
    To save this as a PDF: use your browser's Print dialog and choose "Save as PDF" as the destination.
    <button onclick="window.print()">Print</button>
  </div>
  ${inner}
</body>
</html>`;

  return new NextResponse(doc, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
