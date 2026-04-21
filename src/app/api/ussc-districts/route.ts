/**
 * @fileoverview GET /api/ussc-districts — state → federal district lookup.
 *
 * Input:  ?state=XX  (2-letter state code, required, case-insensitive)
 * Output: { districts: [{ district_code, short_name, district_name, circuit }] }
 *         Sorted by short_name. Empty array when the state has no match.
 *
 * Powers the cascading-select in the Similar Cases Analyzer intake — when a
 * defendant picks their state, the form loads the 1-4 federal districts in
 * that state so the matview query can bucket on district instead of widening
 * to national averages.
 *
 * Static data (94 rows, one-time codebook load) — cached 1 hour on CDN.
 * Rate-limited cheaply (60/min per IP) so the cascading select doesn't
 * produce a nonsensical DoS vector from spammed state-change clicks.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";

// 50 states + DC + territories that appear in ussc_districts.state_code.
// The codebook's non-state rows (DC, PR, VI, Guam, NMI) pass through because
// DB has them — the allowlist just screens obvious junk / injection attempts
// without encoding a redundant copy of the full valid set.
const STATE_CODE_RE = /^[A-Z]{2}$/;

export async function GET(req: NextRequest) {
  const supabase = createAdminClient();
  const ip = getClientIp(req);
  const { limited } = await checkRateLimit(supabase, `ussc-districts:${ip}`, 60, 60);
  if (limited) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const rawState = req.nextUrl.searchParams.get("state");
  if (typeof rawState !== "string") {
    return NextResponse.json({ error: "state query param required" }, { status: 400 });
  }
  const stateCode = rawState.trim().toUpperCase();
  if (!STATE_CODE_RE.test(stateCode)) {
    return NextResponse.json(
      { error: "state must be a 2-letter code" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("ussc_districts")
    .select("district_code, short_name, district_name, circuit")
    .eq("state_code", stateCode)
    .order("short_name", { ascending: true });

  if (error) {
    console.error("[ussc-districts] query error:", error);
    return NextResponse.json({ districts: [] }, { status: 200 });
  }

  return NextResponse.json(
    { districts: data ?? [] },
    {
      headers: {
        // Codebook is static — safe to cache aggressively.
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
      },
    },
  );
}
