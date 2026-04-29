/**
 * @file /api/admin/recipients, search known contacts for compose autocomplete
 *
 * Returns up to 20 emails matching ?q= across:
 *   - inbound_emails.from_email (people who have written us)
 *   - cases.email (paying customers)
 *
 * Auth: ADMIN_PASSWORD via X-Admin-Password header.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/guards";

export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.authorized) return auth.error;

  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 2) {
    return NextResponse.json({ recipients: [] });
  }
  const pattern = `%${q.replace(/[%_]/g, "\\$&")}%`;
  const supabase = createAdminClient();

  const [inboundRes, casesRes] = await Promise.all([
    supabase
      .from("inbound_emails")
      .select("from_email, from_name")
      .ilike("from_email", pattern)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("cases")
      .select("email, first_name, last_name")
      .ilike("email", pattern)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const map = new Map<string, { email: string; name: string | null; source: "inbound" | "case" }>();
  for (const r of inboundRes.data || []) {
    if (!r.from_email) continue;
    const e = r.from_email.toLowerCase();
    if (!map.has(e)) map.set(e, { email: e, name: r.from_name || null, source: "inbound" });
  }
  for (const r of casesRes.data || []) {
    if (!r.email) continue;
    const e = r.email.toLowerCase();
    const n = [r.first_name, r.last_name].filter(Boolean).join(" ") || null;
    if (!map.has(e)) map.set(e, { email: e, name: n, source: "case" });
  }

  return NextResponse.json({
    recipients: Array.from(map.values()).slice(0, 20),
  });
}
