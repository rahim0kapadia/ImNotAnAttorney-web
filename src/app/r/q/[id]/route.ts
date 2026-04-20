/**
 * GET /r/q/[id] — Click-tracking redirect for Quora/Reddit answers.
 *
 * Every link in a posted Quora answer or Reddit comment points here, not
 * directly at /blog/[slug]. This route:
 *   1. Looks up the posted_answers row by id
 *   2. Fires an atomic click_count increment (via after(), non-blocking)
 *   3. 302 redirects to the matched blog (with src + q query params preserved)
 *
 * Separates Reddit/Quora-driven traffic from organic/paid and enables the
 * flywheel success metric "≥70% posts drive ≥1 blog click."
 *
 * Fallbacks:
 *   - Non-numeric id or not found → /arrested?src=rq&err=<reason>
 *   - No matched_blog_slug on the row → /arrested?src=<source>&q=<id>
 */

import { NextRequest, NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const numericId = Number(id);

  if (!Number.isInteger(numericId) || numericId < 1) {
    return NextResponse.redirect(
      new URL("/arrested?src=rq&err=bad-id", SITE_URL),
      302,
    );
  }

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("posted_answers")
    .select("id, source, matched_blog_slug")
    .eq("id", numericId)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.redirect(
      new URL(`/arrested?src=rq&err=not-found&q=${numericId}`, SITE_URL),
      302,
    );
  }

  const { source, matched_blog_slug } = data;

  // Slug comes from DB but has no column-level CHECK. Enforce shape here so a
  // pathological/admin-typo value (e.g. "../../admin") can't traverse out of
  // /blog/. `source` is CHECK-constrained to {quora,reddit}; still URI-encode
  // defensively when interpolating into query params.
  const SAFE_SLUG = /^[a-z0-9][a-z0-9-]{0,199}$/;
  const safeSlug = matched_blog_slug && SAFE_SLUG.test(matched_blog_slug)
    ? matched_blog_slug
    : null;
  const safeSrc = encodeURIComponent(source);
  const target = safeSlug
    ? `/blog/${safeSlug}?src=${safeSrc}&q=${numericId}`
    : `/arrested?src=${safeSrc}&q=${numericId}`;

  after(async () => {
    try {
      await sb.rpc("increment_posted_answer_click", { p_id: numericId });
    } catch {
      // fire-and-forget; redirect already sent
    }
  });

  return NextResponse.redirect(new URL(target, SITE_URL), 302);
}
