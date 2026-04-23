/**
 * @file POST /api/admin/llm-feedback/[id] — operator feedback on LLM generations.
 *
 * Closes tier-ladder Worry-to-Pristine deferred finding S11 (operator-feedback
 * capture loop). Feeds Hamel Husain's Stage-2 Critique Shadowing pattern —
 * operator rates output so future regressions can be caught before customers see them.
 *
 * Auth: ADMIN_PASSWORD via X-Admin-Password header.
 *
 * Body: {
 *   operator_accepted: boolean,
 *   operator_edited_output?: string,  // final version operator shipped
 *   operator_critique?: string,       // free-text notes on what needed changing
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_EDIT_LEN = 20_000;
const MAX_CRITIQUE_LEN = 4_000;

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, context: RouteContext) {
  const auth = requireAdmin(req);
  if (!auth.authorized) return auth.error;

  const { id } = await context.params;
  if (!id || !UUID_RX.test(id)) {
    return NextResponse.json({ error: "Valid generation id (UUID) required" }, { status: 400 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { operator_accepted, operator_edited_output, operator_critique } = body || {};
  if (typeof operator_accepted !== "boolean") {
    return NextResponse.json({ error: "operator_accepted must be boolean" }, { status: 400 });
  }
  if (operator_edited_output != null && typeof operator_edited_output !== "string") {
    return NextResponse.json({ error: "operator_edited_output must be string" }, { status: 400 });
  }
  if (operator_critique != null && typeof operator_critique !== "string") {
    return NextResponse.json({ error: "operator_critique must be string" }, { status: 400 });
  }
  const edited = operator_edited_output
    ? String(operator_edited_output).slice(0, MAX_EDIT_LEN)
    : null;
  const critique = operator_critique
    ? String(operator_critique).slice(0, MAX_CRITIQUE_LEN)
    : null;

  const supabase = createAdminClient();
  const status = operator_accepted ? "accepted" : "rejected";
  const { data, error } = await supabase
    .from("llm_generations")
    .update({
      operator_accepted,
      operator_edited_output: edited,
      operator_critique: critique,
      operator_rated_at: new Date().toISOString(),
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id");

  if (error) {
    console.error(`[llm-feedback] update failed for ${id}:`, error.message);
    return NextResponse.json({ error: "update-failed" }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Generation not found" }, { status: 404 });
  }

  const res = NextResponse.json({ success: true, id, status });
  res.headers.set("Cache-Control", "no-store, private");
  return res;
}
