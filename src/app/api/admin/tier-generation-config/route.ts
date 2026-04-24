/**
 * Admin endpoint to flip tier_generation_config.mode per tier.
 *
 * GET: list all rows (for admin UI render)
 * POST: { tier_slug, mode, notes?, actor? } — update one row
 *
 * Gated by X-Admin-Password (requireAdmin). `actor` is written to the
 * `updated_by` column for audit — without it we can't tell who flipped
 * a tier, which matters because this row directly controls whether
 * automated LLM generation runs on paid customer cases.
 *
 * `notes` is length-capped + control-char-stripped as defense-in-depth
 * against stored-XSS surface, even though the admin page currently
 * renders it as plain text (not dangerouslySetInnerHTML).
 */
import { NextResponse, NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/guards";

export const runtime = "nodejs";

// 'hybrid' removed 2026-04-24 — Haiku-per-slot rejected by zero-hallucination mandate.
const VALID_MODES = new Set(["api", "mechanical", "session"]);

const MAX_NOTES_LEN = 2000;
const MAX_ACTOR_LEN = 64;
// Control chars (C0 minus TAB/LF/CR, plus DEL) — rejected so log/UI surfaces
// can't be corrupted by injected escape sequences.
// eslint-disable-next-line no-control-regex
const CONTROL_RX = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;

function sanitizeNotes(v: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (v === undefined || v === null) return { ok: true, value: null };
  if (typeof v !== "string") return { ok: false, error: "notes-must-be-string" };
  if (v.length > MAX_NOTES_LEN) return { ok: false, error: "notes-too-long" };
  if (CONTROL_RX.test(v)) return { ok: false, error: "notes-contains-control-chars" };
  return { ok: true, value: v };
}

function sanitizeActor(v: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (v === undefined || v === null || v === "") return { ok: true, value: "admin-ui" };
  if (typeof v !== "string") return { ok: false, error: "actor-must-be-string" };
  if (v.length > MAX_ACTOR_LEN) return { ok: false, error: "actor-too-long" };
  if (CONTROL_RX.test(v)) return { ok: false, error: "actor-contains-control-chars" };
  return { ok: true, value: v };
}

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

  if (typeof tier_slug !== "string" || tier_slug.length === 0) {
    return NextResponse.json({ error: "missing-tier_slug" }, { status: 400 });
  }
  if (typeof mode !== "string" || !VALID_MODES.has(mode)) {
    return NextResponse.json(
      { error: "invalid-mode", allowed: [...VALID_MODES] },
      { status: 400 },
    );
  }

  const notesResult = sanitizeNotes(body?.notes);
  if (!notesResult.ok) {
    return NextResponse.json({ error: notesResult.error }, { status: 400 });
  }
  const actorResult = sanitizeActor(body?.actor);
  if (!actorResult.ok) {
    return NextResponse.json({ error: actorResult.error }, { status: 400 });
  }

  const sb = createAdminClient();
  const { data: updatedRows, error } = await sb
    .from("tier_generation_config")
    .update({
      mode,
      notes: notesResult.value,
      updated_by: actorResult.value,
      updated_at: new Date().toISOString(),
    })
    .eq("tier_slug", tier_slug)
    .select("tier_slug");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updatedRows || updatedRows.length === 0) {
    return NextResponse.json(
      { error: "tier-not-found", tier_slug },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, tier_slug, mode, actor: actorResult.value });
}
