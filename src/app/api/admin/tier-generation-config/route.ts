/**
 * Admin endpoint to flip tier_generation_config.mode per tier.
 *
 * GET: list all rows (for admin UI render)
 * POST: { tier_slug, mode, notes? } — update one row
 *
 * Gated by X-Admin-Password (requireAdmin).
 */
import { NextResponse, NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/guards";

export const runtime = "nodejs";

const VALID_MODES = new Set(["api", "mechanical", "hybrid", "session"]);

export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.authorized) return auth.error;
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("tier_generation_config")
    .select("tier_slug, mode, updated_at, updated_by, notes")
    .order("tier_slug");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.authorized) return auth.error;
  const body = await req.json().catch(() => null);
  const tier_slug = body?.tier_slug;
  const mode = body?.mode;
  const notes = body?.notes;
  if (typeof tier_slug !== "string" || tier_slug.length === 0) {
    return NextResponse.json({ error: "missing-tier_slug" }, { status: 400 });
  }
  if (typeof mode !== "string" || !VALID_MODES.has(mode)) {
    return NextResponse.json(
      { error: "invalid-mode", allowed: [...VALID_MODES] },
      { status: 400 },
    );
  }
  const sb = createAdminClient();
  const { error } = await sb
    .from("tier_generation_config")
    .update({
      mode,
      notes: typeof notes === "string" ? notes : null,
      updated_by: "admin-ui",
      updated_at: new Date().toISOString(),
    })
    .eq("tier_slug", tier_slug);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, tier_slug, mode });
}
