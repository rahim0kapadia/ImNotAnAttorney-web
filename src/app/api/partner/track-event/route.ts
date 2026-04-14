/**
 * POST /api/partner/track-event -- Lightweight event tracking for client-side components.
 *
 * Only accepts quiz_complete events (server-side events fire via after()).
 * No auth required -- public endpoint identified by promo code.
 * Rate limited: 10 events per IP per minute + 10 per promo code per minute.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";

const ALLOWED_EVENT_TYPES = new Set(["quiz_complete"]);
const ALLOWED_METADATA_KEYS = new Set(["charge_type"]);
const MAX_METADATA_SIZE = 1024; // 1KB

export async function POST(req: NextRequest) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { partner_promo_code, event_type, metadata } = body;

  if (!partner_promo_code || typeof partner_promo_code !== "string") {
    return NextResponse.json({ error: "partner_promo_code required" }, { status: 400 });
  }

  if (!event_type || !ALLOWED_EVENT_TYPES.has(event_type)) {
    return NextResponse.json({ error: "Invalid event_type" }, { status: 400 });
  }

  // Validate metadata: must be plain object, whitelisted keys, max size
  let sanitizedMetadata: Record<string, unknown> = {};
  if (metadata != null) {
    if (typeof metadata !== "object" || Array.isArray(metadata)) {
      return NextResponse.json({ error: "metadata must be an object" }, { status: 400 });
    }
    if (JSON.stringify(metadata).length > MAX_METADATA_SIZE) {
      return NextResponse.json({ error: "metadata too large" }, { status: 400 });
    }
    for (const key of Object.keys(metadata)) {
      if (ALLOWED_METADATA_KEYS.has(key)) {
        sanitizedMetadata[key] = String(metadata[key]).slice(0, 200);
      }
    }
  }

  const supabase = createAdminClient();

  // Rate limit: 10 per IP per minute
  const ip = getClientIp(req);
  const { limited: ipLimited } = await checkRateLimit(
    supabase,
    `partner-event-ip:${ip}`,
    10,
    60
  );
  if (ipLimited) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  // Rate limit: 10 per promo code per minute
  const { limited } = await checkRateLimit(
    supabase,
    `partner-event:${partner_promo_code}`,
    10,
    60
  );
  if (limited) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  // Resolve promo code to partner
  const { data: partner } = await supabase
    .from("partners")
    .select("id, status")
    .eq("promo_code", partner_promo_code.toUpperCase())
    .eq("status", "approved")
    .limit(1)
    .maybeSingle();

  if (!partner) {
    return NextResponse.json({ error: "Invalid partner code" }, { status: 400 });
  }

  // Insert event -- no PII, only whitelisted metadata
  const { error } = await supabase.from("partner_events").insert({
    partner_id: partner.id,
    event_type,
    metadata: sanitizedMetadata,
  });

  if (error) {
    console.error("[TrackEvent] Insert failed:", error.message);
    return NextResponse.json({ error: "Failed to track event" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
