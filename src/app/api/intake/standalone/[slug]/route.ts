/**
 * @file POST /api/intake/standalone/[slug] — Standalone product intake handler.
 *
 * Receives intake data after purchase, validates the intake token (from webhook
 * email), stores sanitized intake data on the order, and fires the generation
 * Edge Function.
 *
 * Security:
 *   - (C5) Auth via standalone_intake_token — NOT email-based lookup
 *   - (C6) All fields validated: enums against allowlists, text sanitized
 *   - (W13) Payload size guard (10KB max)
 *   - (C10/C9) Generation via Supabase Edge Function (no self-referential fetch)
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProduct } from "@/lib/products";
import { isValidChargeType } from "@/lib/charge-types";

// (C6) Allowlists for enum fields — prevents prompt injection
const VALID_EMPLOYER_TYPES = new Set([
  "government-federal",
  "government-state",
  "government-local",
  "private-regulated",
  "private-unregulated",
  "self-employed",
  "unemployed",
]);

const VALID_STATES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  "DC",
]);

/** (C6) Sanitize free-text fields: strip control chars, limit length. */
function sanitizeText(value: unknown, maxLength = 200): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\x00-\x1F\x7F]/g, "")
    .trim()
    .slice(0, maxLength);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product || product.category !== "research") {
    return NextResponse.json({ error: "Invalid product" }, { status: 400 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // (W13) Payload size guard
  if (JSON.stringify(body).length > 10000) {
    return NextResponse.json({ error: "Payload too large" }, { status: 400 });
  }

  const { token, ...intakeData } = body;

  // (C5) Token required — prevents unauthorized intake submission
  if (!token || typeof token !== "string") {
    return NextResponse.json(
      {
        error:
          "Invalid intake link. Check the email you received after purchase.",
      },
      { status: 401 }
    );
  }

  const supabase = createAdminClient();

  // (C5) Find order by intake token — NOT by email
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, email, standalone_intake, standalone_product_slug")
    .eq("standalone_intake_token", token)
    .eq("standalone_product_slug", slug)
    .eq("status", "paid")
    .is("standalone_intake", null)
    .single();

  if (orderError || !order) {
    return NextResponse.json(
      {
        error:
          "Invalid or expired intake link. Contact help@imnotanattorney.com.",
      },
      { status: 404 }
    );
  }

  // (C6, W13) Validate + sanitize each intake field
  const sanitized: Record<string, unknown> = {};
  for (const field of product.intakeFields) {
    const raw = intakeData[field];

    if (raw === undefined || raw === null || raw === "") {
      return NextResponse.json(
        { error: `Missing required field: ${field}` },
        { status: 400 }
      );
    }

    // Validate enum fields against allowlists
    if (field === "state" && !VALID_STATES.has(String(raw))) {
      return NextResponse.json({ error: "Invalid state" }, { status: 400 });
    }
    if (field === "chargeType" && !isValidChargeType(String(raw))) {
      return NextResponse.json(
        { error: "Invalid charge type" },
        { status: 400 }
      );
    }
    if (field === "employerType" && !VALID_EMPLOYER_TYPES.has(String(raw))) {
      return NextResponse.json(
        { error: "Invalid employer type" },
        { status: 400 }
      );
    }

    // Boolean fields
    if (["industryRegulated", "hasClearance", "hasLicense"].includes(field)) {
      sanitized[field] = raw === true || raw === "true";
      continue;
    }

    // Free-text fields: sanitize
    sanitized[field] = sanitizeText(raw);
  }

  // Store sanitized intake data
  const { error: updateError } = await supabase
    .from("orders")
    .update({ standalone_intake: sanitized })
    .eq("id", order.id);

  if (updateError) {
    console.error("[Intake] Failed to store intake:", updateError);
    return NextResponse.json(
      { error: "Failed to save your details. Please try again." },
      { status: 500 }
    );
  }

  // (C9/C10) Fire-and-forget to Supabase Edge Function — no self-referential HTTP
  fetch(`${SUPABASE_URL}/functions/v1/generate-standalone`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ orderId: order.id }),
  }).catch((err) =>
    console.error("[Intake] Edge Function trigger failed:", err)
  );

  return NextResponse.json({
    status: "generating",
    message:
      "Your report is being generated. You'll receive an email within 60 seconds.",
  });
}
