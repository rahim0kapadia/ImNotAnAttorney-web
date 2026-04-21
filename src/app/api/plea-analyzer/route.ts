/**
 * @file POST /api/plea-analyzer, Free Plea Deal Analyzer intake + generation.
 *
 * This is the free acquisition wedge: defendants with active plea offers submit
 * their details (no payment, no credit card) and receive a Claude-generated
 * plea analysis via email.
 *
 * Flow:
 *   1. Validate + sanitize all intake fields + email
 *   2. Rate limit per IP (3 per 60s, tighter than paid, prevents abuse)
 *   3. Create a $0 order with standalone_product_slug="plea-analyzer"
 *   4. Store sanitized intake data on the order (same column as paid flow)
 *   5. Fire the Supabase Edge Function (generate-standalone), reuses the
 *      existing plea-analyzer prompt case
 *   6. Subscribe email to the lead-capture list (for Defense Gap Report drip)
 *   7. Return 200 with generating status
 *
 * Security:
 *   - Rate limited: 3 requests per 60 seconds per IP
 *   - Payload size guard (10KB max)
 *   - All fields sanitized (same sanitizeText as paid intake)
 *   - Enum fields validated against allowlists
 *   - Email basic format validation
 *   - No auth required (public free endpoint)
 *
 * The order gets product_type="free-tool" to distinguish from paid standalone
 * orders and IDD scholarships in analytics queries.
 */
import { NextRequest, NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidChargeType } from "@/lib/charge-types";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";
import { hashToken } from "@/lib/site";
import {
  queryBucket,
  extractPleaTrialSplit,
  computeTrialTaxMonths,
} from "@/lib/ussc-similar-cases";
import { mapIntakeToBucket } from "@/lib/ussc-mappings";
import { randomBytes } from "crypto";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Sanitize free-text fields: strip control chars, triple-quotes, limit length. */
function sanitizeText(value: unknown, maxLength = 200): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\x00-\x1F\x7F]/g, "")
    .replace(/"{3,}/g, '"')
    .replace(/'{3,}/g, "'")
    .replace(/`{3,}/g, "`")
    .trim()
    .slice(0, maxLength);
}

/** Basic email format check, not RFC 5322 strict, just catches obvious junk. */
function isValidEmail(email: unknown): email is string {
  if (typeof email !== "string") return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

const VALID_STATES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  "DC",
]);

export async function POST(req: NextRequest) {
  // Rate limit per IP: 3 free analyses per 60s (tighter than paid)
  const ip = getClientIp(req);
  const supabase = createAdminClient();
  const { limited } = await checkRateLimit(
    supabase,
    `plea-analyzer-free:${ip}`,
    3,
    60
  );
  if (limited) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Payload size guard
  if (JSON.stringify(body).length > 10000) {
    return NextResponse.json({ error: "Payload too large" }, { status: 400 });
  }

  const { email, state, chargeType, pleaOfferDetails, originalCharges, offeredCharges, sentencingExposure } = body;

  // Optional federal-matching fields — the client (PleaAnalyzerClient.tsx)
  // sends friendly intake values (priorConvictions, citizenship, ageBucket);
  // route through mapIntakeToBucket to translate to USSC matview codes.
  const intakePriorConvictions = typeof body.priorConvictions === "string" ? body.priorConvictions : null;
  const intakeCitizenship = typeof body.citizenship === "string" ? body.citizenship : null;
  const intakeAgeBucket = typeof body.ageBucket === "string" ? body.ageBucket : null;

  // Validate email
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }

  // Per-email rate limit: 2 free analyses per 24 hours (prevents IP rotation abuse)
  const normalizedEmailForLimit = String(email).toLowerCase().trim();
  const { limited: emailLimited } = await checkRateLimit(
    supabase,
    `plea-analyzer-email:${normalizedEmailForLimit}`,
    2,
    86400
  );
  if (emailLimited) {
    return NextResponse.json(
      { error: "A plea analysis was already generated for this email. Check your inbox." },
      { status: 429 }
    );
  }

  // Validate enum fields
  if (!state || !VALID_STATES.has(String(state))) {
    return NextResponse.json({ error: "Invalid state" }, { status: 400 });
  }
  if (!chargeType || !isValidChargeType(String(chargeType))) {
    return NextResponse.json({ error: "Invalid charge type" }, { status: 400 });
  }

  // Validate required text fields
  if (!pleaOfferDetails || typeof pleaOfferDetails !== "string" || pleaOfferDetails.trim().length < 10) {
    return NextResponse.json(
      { error: "Plea offer details are required (at least 10 characters)" },
      { status: 400 }
    );
  }
  if (!originalCharges || typeof originalCharges !== "string" || originalCharges.trim().length < 3) {
    return NextResponse.json(
      { error: "Original charges are required" },
      { status: 400 }
    );
  }
  if (!offeredCharges || typeof offeredCharges !== "string" || offeredCharges.trim().length < 3) {
    return NextResponse.json(
      { error: "Offered charges are required" },
      { status: 400 }
    );
  }

  // Sanitize all fields
  const sanitized = {
    state: String(state),
    chargeType: String(chargeType),
    pleaOfferDetails: sanitizeText(pleaOfferDetails, 800),
    originalCharges: sanitizeText(originalCharges, 400),
    offeredCharges: sanitizeText(offeredCharges, 400),
    sentencingExposure: sanitizeText(sentencingExposure || "", 400),
  };

  // Query JUSTFAIR sentencing context for plea grounding (non-blocking failure)
  let sentencingContext = "";
  try {
    const [sentRows, obRows] = await Promise.all([
      supabase
        .from("sentencing_distributions")
        .select("median_months, p25, p75, sample_size")
        .eq("charge_slug", sanitized.chargeType)
        .limit(5),
      supabase
        .from("outcome_benchmarks")
        .select("plea_rate, trial_rate")
        .eq("offense_type", "all offenses")
        .eq("jurisdiction_level", "national")
        .limit(1),
    ]);
    const s = sentRows.data?.[0];
    const ob = obRows.data?.[0];
    const parts: string[] = [];
    if (s) parts.push(`District median for ${sanitized.chargeType}: ${(s.median_months as number)?.toFixed(1) ?? "N/A"} months (P25: ${(s.p25 as number)?.toFixed(1) ?? "N/A"}, P75: ${(s.p75 as number)?.toFixed(1) ?? "N/A"}, N=${s.sample_size ?? 0})`);
    if (ob) parts.push(`National plea rate: ${ob.plea_rate ? ((ob.plea_rate as number) * 100).toFixed(1) + "%" : "94%"} (BJS)`);
    if (parts.length > 0) sentencingContext = parts.join(". ") + ". Source: JUSTFAIR + BJS. Federal courts, state courts may differ.";
  } catch {
    // Non-fatal, plea analyzer works without sentencing context
  }

  // Augment with federal plea-vs-trial from the USSC matview when the intake
  // maps to a valid federal bucket (offguide + xcrhissr both resolvable).
  // State cases / unsupported charges skip silently.
  const bucket = mapIntakeToBucket({
    chargeType: sanitized.chargeType,
    priorConvictions: intakePriorConvictions,
    citizenship: intakeCitizenship,
    ageBucket: intakeAgeBucket,
  });
  if (bucket.has_minimum_signal && bucket.offguide && bucket.xcrhissr) {
    try {
      const mv = await queryBucket(supabase, {
        district: bucket.district,
        offguide: bucket.offguide,
        xcrhissr: bucket.xcrhissr,
        citizen: bucket.citizen,
        age_bucket: bucket.age_bucket,
      });
      const { plea, trial } = extractPleaTrialSplit(mv.rows);
      const trialTax = computeTrialTaxMonths(plea, trial);
      if (plea && trial && trialTax !== null) {
        const depthLabel = mv.match_depth === "exact" ? "exact match" : `widened (${mv.match_depth})`;
        const pleaMed = plea.median_senttot == null ? "N/A" : Number(plea.median_senttot).toFixed(1);
        const trialMed = trial.median_senttot == null ? "N/A" : Number(trial.median_senttot).toFixed(1);
        const addendum = `Federal plea median for this offense + criminal history: ${pleaMed} months (N=${plea.n_cases}). Federal trial median: ${trialMed} months (N=${trial.n_cases}). Observed trial-vs-plea gap: ${trialTax.toFixed(1)} months (${depthLabel}). Source: USSC Individual Offender Datafiles FY14-FY24.`;
        sentencingContext = sentencingContext
          ? `${sentencingContext} ${addendum}`
          : addendum;
      }
    } catch (err) {
      console.error("[PleaAnalyzer] Matview augmentation failed:", err);
    }
  }

  // Generate intake token for report delivery (same pattern as paid flow)
  const intakeToken = randomBytes(24).toString("base64url");
  const intakeTokenHash = hashToken(intakeToken);

  // Create $0 order
  const normalizedEmail = String(email).toLowerCase().trim();
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      email: normalizedEmail,
      tier: "standalone",
      amount: 0,
      status: "paid",
      product_type: "free-tool",
      standalone_product_slug: "plea-analyzer",
      standalone_intake_token_hash: intakeTokenHash,
      standalone_intake: { ...sanitized, sentencingContext },
      paid_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (orderError || !order) {
    console.error("[PleaAnalyzer] Order insert failed:", orderError);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }

  // Fire-and-forget: Edge Function for report generation
  fetch(`${SUPABASE_URL}/functions/v1/generate-standalone`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ orderId: order.id }),
  }).catch((err) =>
    console.error("[PleaAnalyzer] Edge Function trigger failed:", err)
  );

  // Subscribe email (non-blocking, after response)
  after(async () => {
    try {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com";
      await fetch(`${siteUrl}/api/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          source: "plea-analyzer-free",
          chargeType: sanitized.chargeType,
        }),
      });
    } catch (err) {
      console.error("[PleaAnalyzer] Subscribe failed:", err);
    }
  });

  return NextResponse.json({
    status: "generating",
    message: "Your plea analysis is being generated. Check your email within 60 seconds.",
  });
}
