/**
 * @file /api/admin/reply, Send a reply to an inbound email
 *
 * GET: Returns the configured FROM allowlist for the reply composer.
 * POST: Sends a reply via Resend with proper threading headers (In-Reply-To,
 *       References) so the reply appears in the same thread.
 *
 * Auth: ADMIN_PASSWORD via X-Admin-Password header.
 *
 * Multi-sender support (2026-04-28):
 * - `ADMIN_REPLY_FROM_EMAILS` env var = CSV of verified addresses, optionally
 *   `Display Name <addr@domain>`. Empty / unset → falls back to RESEND_FROM_EMAIL.
 * - Server validates `from` against the allowlist (exact email match) — never
 *   trusts arbitrary input. Open-relay defense.
 * - Default FROM = the original `to_email` of the inbound being replied to,
 *   when present in the allowlist (Front shared-inbox convention,
 *   help.front.com/en/articles/2247). Else first allowlisted address.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/guards";

const RESEND_API = "https://api.resend.com";

interface Sender {
  email: string;
  name: string | null;
}

/** Parse `ADMIN_REPLY_FROM_EMAILS` CSV. Each entry: `addr@x.com` or `Display Name <addr@x.com>`. */
function parseSenders(): Sender[] {
  const raw = (process.env.ADMIN_REPLY_FROM_EMAILS || "").trim();
  const fallback = process.env.RESEND_FROM_EMAIL || "help@imnotanattorney.com";
  const list: Sender[] = [];
  const entries = raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
  for (const entry of entries) {
    const m = entry.match(/^(?:"?([^"<]*?)"?\s*)?<?([^<>\s]+@[^<>\s]+)>?$/);
    if (!m) continue;
    const name = (m[1] || "").trim() || null;
    const email = m[2].toLowerCase();
    if (!list.some((s) => s.email === email)) list.push({ email, name });
  }
  if (list.length === 0) {
    list.push({ email: fallback.toLowerCase(), name: "ImNotAnAttorney" });
  }
  return list;
}

export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.authorized) return auth.error;
  const senders = parseSenders();
  return NextResponse.json({ senders, default: senders[0]?.email });
}

export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.authorized) return auth.error;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { to, subject, text, message_id, from, mode, cc } = body;
  const composeMode: "reply" | "forward" | "compose" =
    mode === "forward" ? "forward" : mode === "compose" ? "compose" : "reply";

  if (!to || !text) {
    return NextResponse.json(
      { error: "to and text are required" },
      { status: 400 }
    );
  }

  // CC sanitation — array of email strings, max 10.
  const ccList: string[] = Array.isArray(cc)
    ? cc
        .filter((s) => typeof s === "string")
        .map((s) => s.trim().toLowerCase())
        .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
        .slice(0, 10)
    : [];

  // Recipient allowlist policy by mode:
  //   reply   — to MUST exist in inbound_emails.from_email or cases.email
  //   compose — to MUST exist in same allowlist (NOT cold outreach — that is
  //             hard-banned from primary domains per
  //             never-cold-email-from-primary-domain.md)
  //   forward — admin password is the trust gate; recipient unrestricted
  // CC list always allowlist-checked when present.
  if (composeMode === "reply" || composeMode === "compose") {
    const supabase = createAdminClient();
    const allRecipients = [to, ...ccList];
    for (const addr of allRecipients) {
      const { data: knownInbound } = await supabase
        .from("inbound_emails")
        .select("from_email")
        .eq("from_email", addr)
        .limit(1)
        .maybeSingle();

      if (!knownInbound) {
        const { data: knownCase } = await supabase
          .from("cases")
          .select("email")
          .eq("email", addr)
          .limit(1)
          .maybeSingle();

        if (!knownCase) {
          return NextResponse.json(
            {
              error: `Recipient ${addr} not in known-contacts allowlist (inbound senders + customer cases). Cold outreach from primary domain is policy-banned — use a separate warmed domain.`,
            },
            { status: 400 }
          );
        }
      }
    }
  }

  // Validate FROM against allowlist (open-relay defense).
  const senders = parseSenders();
  const requestedFrom =
    typeof from === "string" && from.trim() ? from.trim().toLowerCase() : null;
  const sender =
    (requestedFrom && senders.find((s) => s.email === requestedFrom)) ||
    senders[0];
  if (requestedFrom && !senders.find((s) => s.email === requestedFrom)) {
    return NextResponse.json(
      { error: "from address not in allowlist" },
      { status: 400 }
    );
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    return NextResponse.json(
      { error: "RESEND_API_KEY not set" },
      { status: 500 }
    );
  }

  const fromHeader = sender.name
    ? `${sender.name} <${sender.email}>`
    : sender.email;

  const defaultSubject =
    composeMode === "forward"
      ? "Fwd: (no subject)"
      : composeMode === "compose"
        ? "(no subject)"
        : "Re: (no subject)";
  const payload: Record<string, unknown> = {
    from: fromHeader,
    to: [to],
    subject: subject || defaultSubject,
    text,
    reply_to: sender.email,
  };
  if (ccList.length > 0) payload.cc = ccList;
  // Threading headers preserve thread identity for replies. Forwards + composes
  // start a new conversation, so threading headers are intentionally omitted.
  if (composeMode === "reply" && message_id) {
    payload.headers = {
      "In-Reply-To": message_id,
      References: message_id,
    };
  }

  try {
    const res = await fetch(`${RESEND_API}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.error("[Admin Reply] Resend error:", errData);
      return NextResponse.json(
        { error: "Failed to send email" },
        { status: 502 }
      );
    }

    const result = await res.json();
    console.warn(
      `[Admin Reply] Sent ${composeMode} id=${result.id} from=${sender.email}`
    );
    return NextResponse.json({ ok: true, id: result.id, from: sender.email });
  } catch (err) {
    console.error("[Admin Reply] Send error:", err);
    return NextResponse.json({ error: "Send failed" }, { status: 500 });
  }
}
