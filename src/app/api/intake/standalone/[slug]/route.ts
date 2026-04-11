/**
 * @file POST /api/intake/standalone/[slug] — Standalone product intake handler.
 *
 * Receives intake data after purchase, validates the intake token (from webhook
 * email), stores sanitized intake data on the order, and fires the generation
 * Edge Function.
 *
 * Security:
 *   - (C5 + W6) Auth via SHA-256 hash of standalone_intake_token — the plaintext
 *     token lives only in the customer's email; the DB stores only the hash
 *   - (C6) All fields validated: enums against allowlists, text sanitized
 *   - (W6) Rate limited: 5 requests per 60 seconds per IP
 *   - (W13) Payload size guard (10KB max)
 *   - (C10/C9) Generation via Supabase Edge Function (no self-referential fetch)
 */
import { NextRequest, NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProduct } from "@/lib/products";
import { isValidChargeType } from "@/lib/charge-types";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";
import { hashToken } from "@/lib/site";
import { isTier9Slug } from "@/lib/tier9-reports/constants";
import { generateTier9Report } from "@/lib/tier9-reports/generate";

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

// Wave 1 court case port — case stage allowlist for motion-opportunity-scan
const VALID_CASE_STAGES = new Set([
  "pre-arraignment",
  "post-arraignment",
  "post-discovery",
  "pre-trial",
  "trial",
  "post-trial",
]);

// Product stamping — enum allowlists for new product intake fields
const VALID_LICENSE_TYPES = new Set([
  "nursing", "cdl", "teaching", "real-estate", "financial-advisor",
  "attorney", "physician", "pharmacy", "engineering", "accounting",
  "cosmetology", "contractor", "other",
]);

const VALID_CUSTODY_STATUS = new Set([
  "sole", "joint", "visitation-only", "no-order", "pending",
]);

const VALID_IMMIGRATION_STATUS = new Set([
  "citizen", "green-card", "visa", "daca", "tps",
  "pending-petition", "undocumented", "other",
]);

const VALID_YES_NO_DONTKNOW = new Set(["yes", "no", "dont-know"]);

const VALID_CLEARANCE_LEVELS = new Set([
  "confidential", "secret", "top-secret", "ts-sci", "q", "l",
]);

const VALID_SELF_REPORTED = new Set(["yes", "no", "not-yet", "dont-know"]);

const VALID_CONVICTION_METHODS = new Set(["plea", "trial"]);

const VALID_PRIOR_CONVICTIONS = new Set(["none", "misdemeanor", "felony", "multiple"]);

const VALID_OFFENSE_CLASS = new Set(["felony", "misdemeanor"]);

const VALID_CHARGE_INVOLVES = new Set([
  "substances", "fraud", "violence", "sexual", "domestic-violence",
  "child-related", "none",
]);

const VALID_TEST_TYPES = new Set([
  "field-test", "lab-analysis", "urinalysis", "hair", "blood",
]);

const VALID_BREATHALYZER_TYPES = new Set([
  "intoxilyzer", "datamaster", "draeger", "unknown",
]);

const VALID_CONVICTION_OR_DISMISSAL = new Set(["conviction", "dismissal"]);

const VALID_APPEAL_DEADLINE_STATUS = new Set([
  "within-deadline", "approaching", "expired", "dont-know",
]);

const VALID_CASE_OUTCOMES = new Set([
  "convicted-trial", "pled-guilty", "charges-not-dismissed",
]);

const VALID_COMMUNICATION_FREQUENCY = new Set([
  "weekly", "biweekly", "monthly", "rarely", "none",
]);

const VALID_VIOLATION_TYPES = new Set([
  "missed-appointment", "failed-drug-test", "new-arrest",
  "travel-violation", "curfew-violation", "failed-to-pay", "other",
]);

// appealGrounds, issuesIdentified, relationshipToDefendant,
// proximityToContraband, ownershipOfLocation are free-text fields —
// no allowlist needed. Validated via sanitizeText.

// Fields that may be optional (not strictly required) on a per-product basis.
// Validation still sanitizes them when present, but does not 400 on absence.
const OPTIONAL_FIELDS_BY_SLUG: Record<string, Set<string>> = {
  "judge-profile": new Set(["caseNumber"]),
  "motion-opportunity-scan": new Set(["judgeName"]),
  "breathalyzer-challenge": new Set(["medicalConditions", "timeBetweenStopAndTest"]),
  "fst-review": new Set(["weather", "footwear"]),
  "plea-consequences": new Set(["occupation", "immigrationStatus"]),
  "bail-hearing-prep": new Set(["flightRiskFactors", "currentBailAmount"]),
  "sentencing-prep": new Set(["sentencingRange"]),
  "self-surrender-prep": new Set(["surrenderDate", "surrenderLocation"]),
  "license-risk": new Set(["licensingBoard"]),
  "sentence-reduction": new Set(["sentencingDate"]),
  "appeal-viability": new Set(["trialIssues"]),
  "immigration-impact": new Set(["yearsInUS"]),
  "security-clearance": new Set(["agency", "lastInvestigation"]),
  // Court case port — Wave 2+3 SKUs (ship dark)
  "trial-prep-package": new Set(["trialDate", "caseTheme"]),
  "case-law-intelligence": new Set(["motionFocus"]),
  "expert-witness-challenge": new Set(["expertField"]),
  "discovery-demand-letter": new Set(["arrestDate", "discoveryReceivedSoFar"]),
  // Bundles — product-specific fields are optional since users may not have all data
  "first-72-hours": new Set(["flightRiskFactors", "currentBailAmount"]),
  "defense-preparation": new Set([
    "medicalConditions", "timeBetweenStopAndTest", "weather", "footwear",
    "bacReading", "breathalyzerType", "choiceOfTest",
    "testsAdministered", "surfaceConditions", "physicalConditions", "officerDemonstrated",
    "testType", "substanceIdentified", "confirmatoryTest", "resultsDocs",
    "reportDetails",
  ]),
  "pre-plea-package": new Set([
    "occupation", "immigrationStatus", "sentencingRange",
    "hasSecurityClearance", "hasChildren", "convictionMethod",
    "mitigatingFactors",
  ]),
};

// Long-form text fields get a higher length cap than the default 200 chars.
const LONG_TEXT_FIELDS = new Set([
  "knownFacts", "trialIssues", "pleaOfferTerms", "mitigatingFactors",
  "surfaceConditions", "physicalConditions", "medicalConditions",
  "issuesIdentified", "basisForReduction", "appealGrounds",
  "communityTies", "flightRiskFactors", "reportDetails",
  "probationConditions", "probationOfficerIssue", "discoveryContents",
  "locationDescription",
  // Court case port — Wave 2+3 SKUs
  "discoveryReceivedSoFar",
]);

/** (C6) Sanitize free-text fields: strip control chars, triple-quotes, limit length. */
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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product || (product.category !== "research" && product.category !== "bundle")) {
    return NextResponse.json({ error: "Invalid product" }, { status: 400 });
  }

  // (W6 security polish) Rate limit per IP: 5 intake submissions per 60s.
  // Prevents token enumeration attacks and spam of the generation pipeline.
  // Matches the intake endpoint in /api/subscribe for consistency.
  const ip = getClientIp(req);
  const { limited } = await checkRateLimit(
    createAdminClient(),
    `intake-standalone:${ip}`,
    5,
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

  // (C5 + W6) Find order by intake token HASH — never plaintext. The plaintext
  // token travels only via the customer's email; the DB stores only its SHA-256
  // hash. This matches the standalone_report_token_hash pattern.
  const tokenHash = hashToken(token);
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, email, standalone_intake, standalone_product_slug")
    .eq("standalone_intake_token_hash", tokenHash)
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
  const optionalFields = OPTIONAL_FIELDS_BY_SLUG[slug] || new Set<string>();
  for (const field of product.intakeFields) {
    const raw = intakeData[field];
    const isOptional = optionalFields.has(field);

    if (raw === undefined || raw === null || raw === "") {
      if (isOptional) {
        sanitized[field] = "";
        continue;
      }
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
    if (field === "caseStage" && !VALID_CASE_STAGES.has(String(raw))) {
      return NextResponse.json(
        { error: "Invalid case stage" },
        { status: 400 }
      );
    }
    if (field === "licenseType" && !VALID_LICENSE_TYPES.has(String(raw))) {
      return NextResponse.json({ error: "Invalid license type" }, { status: 400 });
    }
    if (field === "custodyStatus" && !VALID_CUSTODY_STATUS.has(String(raw))) {
      return NextResponse.json({ error: "Invalid custody status" }, { status: 400 });
    }
    if (field === "immigrationStatus" && !VALID_IMMIGRATION_STATUS.has(String(raw))) {
      return NextResponse.json({ error: "Invalid immigration status" }, { status: 400 });
    }
    // otherParentAwareness is now a boolean field (line 323) — no string validation needed
    if (field === "clearanceLevel" && !VALID_CLEARANCE_LEVELS.has(String(raw))) {
      return NextResponse.json({ error: "Invalid clearance level" }, { status: 400 });
    }
    if (field === "selfReported" && !VALID_SELF_REPORTED.has(String(raw))) {
      return NextResponse.json({ error: "Invalid value" }, { status: 400 });
    }
    if (field === "convictionMethod" && !VALID_CONVICTION_METHODS.has(String(raw))) {
      return NextResponse.json({ error: "Invalid conviction method" }, { status: 400 });
    }
    if (field === "priorConvictions" && !VALID_PRIOR_CONVICTIONS.has(String(raw))) {
      return NextResponse.json({ error: "Invalid value" }, { status: 400 });
    }
    if (field === "convictionOrDismissal" && !VALID_CONVICTION_OR_DISMISSAL.has(String(raw))) {
      return NextResponse.json({ error: "Invalid value" }, { status: 400 });
    }
    if (field === "appealDeadlineStatus" && !VALID_APPEAL_DEADLINE_STATUS.has(String(raw))) {
      return NextResponse.json({ error: "Invalid value" }, { status: 400 });
    }
    if (field === "caseOutcome" && !VALID_CASE_OUTCOMES.has(String(raw))) {
      return NextResponse.json({ error: "Invalid value" }, { status: 400 });
    }
    if (field === "communicationFrequency" && !VALID_COMMUNICATION_FREQUENCY.has(String(raw))) {
      return NextResponse.json({ error: "Invalid value" }, { status: 400 });
    }
    if (field === "violationType" && !VALID_VIOLATION_TYPES.has(String(raw))) {
      return NextResponse.json({ error: "Invalid value" }, { status: 400 });
    }
    if (field === "discoveryReceived" && !VALID_YES_NO_DONTKNOW.has(String(raw))) {
      return NextResponse.json({ error: "Invalid value" }, { status: 400 });
    }
    if (field === "offenseClass" && !VALID_OFFENSE_CLASS.has(String(raw))) {
      return NextResponse.json({ error: "Invalid offense class" }, { status: 400 });
    }
    if (field === "chargeInvolves" && !VALID_CHARGE_INVOLVES.has(String(raw))) {
      return NextResponse.json({ error: "Invalid value" }, { status: 400 });
    }
    if (field === "testType" && !VALID_TEST_TYPES.has(String(raw))) {
      return NextResponse.json({ error: "Invalid test type" }, { status: 400 });
    }
    if (field === "breathalyzerType" && !VALID_BREATHALYZER_TYPES.has(String(raw))) {
      return NextResponse.json({ error: "Invalid breathalyzer type" }, { status: 400 });
    }

    // Boolean fields
    if ([
      "industryRegulated", "hasClearance", "hasLicense",
      "hasSecurityClearance", "hasChildren", "priorDiscipline",
      "pendingFamilyCase", "priorImmigrationViolations", "pendingPetition",
      "confirmatoryTest", "resultsDocs", "officerDemonstrated",
      "choiceOfTest", "sentenceCompleted", "probationCompleted",
      "boardNotified", "hasAttorney", "defendantInCustody",
      "defendantHasAttorney", "otherParentAwareness",
    ].includes(field)) {
      sanitized[field] = raw === true || raw === "true";
      continue;
    }

    // Long-form text fields get a higher cap (knownFacts up to 800 chars)
    if (LONG_TEXT_FIELDS.has(field)) {
      sanitized[field] = sanitizeText(raw, 800);
      continue;
    }

    // Free-text fields: sanitize with default 200-char cap
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

  // Tier 9 data-driven products: generate inline (DB queries only, <5s).
  // No Edge Function needed — queries pre-computed tables and renders HTML.
  if (isTier9Slug(slug)) {
    after(async () => {
      try {
        await generateTier9Report(order.id);
      } catch (err) {
        console.error("[Intake] Tier 9 generation failed:", err);
      }
    });

    return NextResponse.json({
      status: "generating",
      message:
        "Your report is being generated. You'll receive an email within 60 seconds.",
    });
  }

  // (C9/C10) Fire-and-forget to Supabase Edge Function — non-Tier-9 products
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
