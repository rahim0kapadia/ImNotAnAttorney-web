/**
 * @fileoverview Save Calculator Results — email capture + persistence.
 *
 * POST /api/tools/save-results
 *
 * Called after a calculator displays results and the user opts to save them.
 * Creates a shareable URL token and captures email for drip sequences.
 * Same pattern as /api/score/share.
 *
 * The `inputs` and `result` bodies are accepted as-is because they come
 * from the calculator API immediately prior — the client round-trips them
 * here for persistence. If they were used for anything else (scoring,
 * eligibility, etc.) they would need re-validation, but for save-and-link
 * they are treated as opaque blobs stored in jsonb columns.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";
import { normalizeEmail } from "@/lib/site";
import { sendEmail } from "@/lib/email";
import { randomBytes } from "crypto";

interface SaveResultsBody {
  slug?: string;
  inputs?: Record<string, unknown>;
  result?: Record<string, unknown>;
  email?: string;
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const supabase = createAdminClient();

  // Rate limit: 10 save operations per 5 minutes per IP
  const { limited } = await checkRateLimit(
    supabase,
    `save-calc:${ip}`,
    10,
    300,
  );
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429 },
    );
  }

  let body: SaveResultsBody;
  try {
    body = (await req.json()) as SaveResultsBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const { slug, inputs, result, email } = body;
  if (!slug || typeof slug !== "string") {
    return NextResponse.json(
      { error: "slug is required" },
      { status: 400 },
    );
  }
  if (!inputs || typeof inputs !== "object") {
    return NextResponse.json(
      { error: "inputs is required" },
      { status: 400 },
    );
  }
  if (!result || typeof result !== "object") {
    return NextResponse.json(
      { error: "result is required" },
      { status: 400 },
    );
  }

  const token = randomBytes(9).toString("base64url"); // 12-char URL-safe token
  const normalizedEmail =
    typeof email === "string" && email.length > 0
      ? normalizeEmail(email)
      : null;

  const chargeType =
    typeof inputs.chargeType === "string" ? inputs.chargeType : null;
  const state =
    typeof inputs.state === "string" ? inputs.state.toUpperCase() : null;

  // Persist result
  const { error: insertError } = await supabase
    .from("calculator_results")
    .insert({
      slug,
      inputs,
      result,
      token,
      email: normalizedEmail,
      charge_type: chargeType,
      state,
    });

  if (insertError) {
    console.error("[SaveResults] Insert error:", insertError);
    return NextResponse.json(
      { error: "Failed to save results" },
      { status: 500 },
    );
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com";
  const resultsUrl = `${siteUrl}/tools/${slug}/results/${token}`;

  // If email provided, upsert subscriber + send saved-results email
  if (normalizedEmail) {
    // subscribers table has only (email, source) — charge_type is NOT a column.
    // charge_type is denormalized into calculator_results instead.
    const { error: subError } = await supabase.from("subscribers").upsert(
      { email: normalizedEmail, source: `calculator-${slug}` },
      { onConflict: "email" },
    );
    if (subError) {
      console.error("[SaveResults] Subscriber upsert error:", subError);
    }

    // Non-blocking analytics bump for emails captured
    supabase
      .rpc("increment_calculator_email", { p_slug: slug })
      .then(({ error }) => {
        if (error) {
          console.error("[SaveResults] Email analytics error:", error);
        }
      });

    // Send saved-results email with the permanent link
    await sendEmail(
      {
        to: normalizedEmail,
        subject: "Your Calculator Results — Saved",
        html: `
          <p>Your results have been saved. You can access them anytime with the link below.</p>
          <p style="margin: 24px 0;">
            <a href="${resultsUrl}"
               style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              View Your Results
            </a>
          </p>
          <p style="color: #6b7280; font-size: 14px;">
            These results are based on published state rules and are provided as legal INFORMATION — not legal ADVICE.
          </p>
        `,
        unsubscribeEmail: normalizedEmail,
      },
    );
  }

  return NextResponse.json({ token, url: resultsUrl });
}
