/**
 * Telegram notification for session-mode handoff.
 *
 * Called by the CD dispatcher after flipping a case to
 * status='awaiting-session-generation'. Fires a Telegram message with
 * the exact CLI command + paste-destination URL so Rahim can take over
 * the generation by hand. Persists notify state on the case row.
 *
 * Plan: docs/plans/2026-04-24-per-tier-generation-mode-rebuild.md
 */
import { NextResponse, NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCron } from "@/lib/auth/guards";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = requireCron(req);
  if (!auth.authorized) return auth.error;
  const url = new URL(req.url);
  const caseId = url.searchParams.get("caseId");
  if (!caseId)
    return NextResponse.json({ error: "missing-caseId" }, { status: 400 });

  const sb = createAdminClient();
  const { data } = await sb
    .from("cases")
    .select("id, tier, status, session_generation_payload")
    .eq("id", caseId)
    .maybeSingle();
  if (!data)
    return NextResponse.json({ error: "case-not-found" }, { status: 404 });

  const msg = `Session-gen pending: ${data.tier} order ${data.id}. Run:\n  node C:\\Users\\email\\projects\\ImNotAnAttorney-web\\scripts\\generate-session-handoff.mjs ${data.id}\nPaste output into Claude Code. POST final HTML to /api/admin/session-report/${data.id} with X-Admin-Password header.`;
  const token = process.env.TELEGRAM_ATLAS_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  let notified = false;
  let failureReason: string | null = null;
  if (token && chat) {
    try {
      const r = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chat, text: msg }),
        },
      );
      if (r.ok) notified = true;
      else failureReason = `telegram-${r.status}`;
    } catch (err) {
      failureReason = `telegram-exception: ${err instanceof Error ? err.message : String(err)}`;
    }
  } else {
    failureReason = "telegram-env-missing";
  }
  const existing =
    (data.session_generation_payload as Record<string, unknown>) ?? {};
  const patch = {
    session_generation_payload: {
      ...existing,
      notified_at: notified ? new Date().toISOString() : null,
      notify_failure_reason: failureReason,
    },
  };
  const { error: patchError } = await sb.from("cases").update(patch).eq("id", caseId);
  if (patchError)
    // eslint-disable-next-line no-console
    console.error("[notify-handoff] failed to persist notify state:", patchError.message);
  return NextResponse.json({ notified, caseId, failureReason });
}
