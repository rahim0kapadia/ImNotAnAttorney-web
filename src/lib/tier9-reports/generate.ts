/**
 * Tier 9 report generation orchestrator.
 * Flow: fetch order → query DB → render HTML → store → email.
 * No Claude API call, pure data-driven from pre-computed tables.
 */

import { randomBytes, createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, sendEmailWithOperatorAlert, escapeHtml } from "@/lib/email";
import { SITE_URL } from "@/lib/site";
import { getProduct } from "@/lib/products";
import {
  queryJudgeReportCard,
  queryOfficerBackground,
  querySimilarCases,
  type JudgeReportCardIntake,
  type OfficerBackgroundIntake,
  type SimilarCasesIntake,
} from "./query";
import {
  queryDefenseIntelligence,
  queryJustfairJudge,
  queryArrestSurvivalKit,
} from "@/lib/defense-intelligence/query";
import { getParentheticalsForClusterId } from "@/lib/parentheticals/lookup";
import type { Parenthetical } from "@/lib/parentheticals/lookup";
import {
  renderJudgeReportCard,
  renderOfficerBackground,
  renderSimilarCases,
  renderArrestSurvivalKit,
  renderFederalSentencingDistribution,
  reshapeMatviewRow,
  type UsscDistribution,
} from "./render";
import {
  queryCourthouseIntelligence,
  renderCourthouseIntelligence,
} from "./courthouse-intelligence";
import {
  querySentencingFingerprint,
  renderSentencingFingerprintSection,
} from "./sentencing-fingerprint";
import {
  queryPrecedentWatchlist,
  renderPrecedentWatchlist,
  buildVelocitySnapshot,
} from "./precedent-watchlist";
import {
  queryMotionSuccessReport,
  renderMotionSuccessReport,
} from "./motion-success-report";
import { mapIntakeToBucket } from "@/lib/ussc-mappings";
import {
  queryBucket,
  queryDistrictDisplay,
  extractPleaTrialSplit,
  computeTrialTaxMonths,
} from "@/lib/ussc-similar-cases";
import { queryDistribution, histogram } from "@/lib/fsd-distribution";
import { chargeTypeToFsdOffguide, priorsToChCategory } from "@/lib/fsd-offguide";
import {
  queryFederalJuryBrief,
  renderFederalJuryInstructionBrief,
  isFederalCharge,
} from "./federal-jury-instruction-brief";
import {
  queryChargeAuthorityPack,
  renderChargeAuthorityPack,
} from "./charge-authority-pack";

const OPERATOR_EMAIL =
  process.env.OPERATOR_EMAIL || "rahim0kapadia@gmail.com";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Validate intake shape at runtime before passing to query functions.
 * Prevents undefined fields from leaking into ILIKE queries.
 */
function validateIntakeFields(
  intake: Record<string, unknown>,
  requiredFields: string[]
): boolean {
  return requiredFields.every(
    (f) => typeof intake[f] === "string" && intake[f] !== ""
  );
}

/**
 * Generate a Tier 9 data-driven report for a given order.
 * Idempotent, skips if report already exists (unless force=true).
 *
 * @param orderId - UUID of the order to generate for.
 * @param force - If true, regenerate even if a report already exists.
 */
export async function generateTier9Report(
  orderId: string,
  force = false
): Promise<void> {
  const supabase = createAdminClient();

  // 1. Fetch order with idempotency check
  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select(
      "id, email, standalone_product_slug, standalone_intake, standalone_report_token_hash, status"
    )
    .eq("id", orderId)
    .single();

  if (fetchError || !order) {
    console.error("[Tier9] Order not found:", orderId, fetchError);
    return;
  }

  // Idempotency: skip if report already generated (unless force)
  if (order.standalone_report_token_hash && !force) {
    console.log("[Tier9] Report already exists for order:", orderId);
    return;
  }

  // Skip refunded orders
  if (order.status === "refunded") {
    console.log("[Tier9] Order refunded, skipping:", orderId);
    return;
  }

  const slug = order.standalone_product_slug;
  const intake = order.standalone_intake as Record<string, unknown> | null;

  if (!slug || !intake || typeof intake !== "object") {
    console.error("[Tier9] Missing slug or invalid intake for order:", orderId);
    await notifyOperatorFailure(orderId, slug, "Missing slug or invalid intake data");
    return;
  }

  const product = getProduct(slug);
  const productName = product?.name || slug;

  try {
    // 2. Query Tier 9 tables
    let html: string;

    switch (slug) {
      case "judge-report-card": {
        if (!validateIntakeFields(intake, ["judgeName", "state", "chargeType"])) {
          await notifyOperatorFailure(orderId, slug, "Invalid intake: missing judgeName, state, or chargeType");
          return;
        }
        const data = await queryJudgeReportCard({
          judgeName: intake.judgeName as string,
          state: intake.state as string,
          chargeType: intake.chargeType as string,
        });
        if (data.isEmpty) {
          await notifyInsufficientData(order.email, productName, orderId, intake);
          return;
        }
        const [intelligence, justfairData, fingerprint] = await Promise.all([
          queryDefenseIntelligence(
            intake.chargeType as string,
            intake.state as string,
            "judge-report-card"
          ),
          queryJustfairJudge(intake.judgeName as string),
          querySentencingFingerprint({
            judgeName: intake.judgeName as string,
            chargeType: intake.chargeType as string,
          }),
        ]);
        data.justfair = justfairData;
        // TICKET-12: pre-fetch parentheticals for the top-5 relevant
        // opinions so the JRC renderer can stay sync. Per-cluster lookup
        // is bounded (3 parentheticals × 5 opinions = 15 rows max). Errors
        // collapse to an empty map — JRC degrades gracefully.
        const parentheticalsByCluster = new Map<string, Parenthetical[]>();
        if (!intelligence.isEmpty && intelligence.relevantOpinions.length > 0) {
          const clusters = intelligence.relevantOpinions
            .slice(0, 5)
            .map((op) => op.cluster_id)
            .filter((c): c is string => typeof c === "string" && c.length > 0);
          const results = await Promise.all(
            clusters.map((cid) =>
              getParentheticalsForClusterId(cid, 3).then((p) => [cid, p] as const)
            )
          );
          for (const [cid, parens] of results) {
            if (parens.length > 0) parentheticalsByCluster.set(cid, parens);
          }
        }
        html = renderJudgeReportCard(
          data,
          intelligence.isEmpty ? undefined : intelligence,
          parentheticalsByCluster
        );
        // Append the v3-safe Sentencing Fingerprint section (4 signals, apex
        // guardrails).  Non-fatal if empty — renders a limitations block.
        if (!fingerprint.isEmpty || fingerprint.limitations.length) {
          html += renderSentencingFingerprintSection(fingerprint, {
            judgeName: intake.judgeName as string,
            chargeType: intake.chargeType as string,
          });
        }
        break;
      }

      case "officer-background-check": {
        if (!validateIntakeFields(intake, ["officerName", "state"])) {
          await notifyOperatorFailure(orderId, slug, "Invalid intake: missing officerName or state");
          return;
        }
        const data = await queryOfficerBackground({
          officerName: intake.officerName as string,
          state: intake.state as string,
          agency: typeof intake.agency === "string" ? intake.agency : null,
          badgeNumber:
            typeof intake.badgeNumber === "string" ? intake.badgeNumber : null,
        });
        if (data.isEmpty) {
          await notifyInsufficientData(order.email, productName, orderId, intake);
          return;
        }
        html = renderOfficerBackground(data, { state: intake.state as string });
        break;
      }

      case "similar-cases-analyzer": {
        if (!validateIntakeFields(intake, ["chargeType", "state"])) {
          await notifyOperatorFailure(orderId, slug, "Invalid intake: missing chargeType or state");
          return;
        }
        const typedIntake = {
          chargeType: intake.chargeType as string,
          state: intake.state as string,
          priorConvictions: typeof intake.priorConvictions === "string" ? intake.priorConvictions : null,
          citizenship: typeof intake.citizenship === "string" ? intake.citizenship : null,
          ageBucket: typeof intake.ageBucket === "string" ? intake.ageBucket : null,
          district: typeof intake.district === "string" && intake.district.length > 0 ? intake.district : null,
        };
        const data = await querySimilarCases(typedIntake);
        if (data.isEmpty) {
          await notifyInsufficientData(order.email, productName, orderId, intake);
          return;
        }
        const similarIntelligence = await queryDefenseIntelligence(
          typedIntake.chargeType,
          typedIntake.state,
          "similar-cases-analyzer"
        );

        // Optional USSC matview distribution (federal only). When the intake
        // supplied enough signal (offguide + xcrhissr map cleanly), query the
        // matview and pass to the renderer. On any failure, fall back to the
        // existing CourtListener-backed report — don't block delivery.
        let ussc: UsscDistribution | null = null;
        try {
          const bucket = mapIntakeToBucket({
            chargeType: typedIntake.chargeType,
            priorConvictions: typedIntake.priorConvictions,
            citizenship: typedIntake.citizenship,
            ageBucket: typedIntake.ageBucket,
            district: typedIntake.district,
          });

          if (bucket.has_minimum_signal && bucket.offguide && bucket.xcrhissr) {
            const sb = createAdminClient();
            const [response, districtDisplay] = await Promise.all([
              queryBucket(sb, {
                district: bucket.district,
                offguide: bucket.offguide,
                xcrhissr: bucket.xcrhissr,
                citizen: bucket.citizen,
                age_bucket: bucket.age_bucket,
              }),
              queryDistrictDisplay(sb, bucket.district),
            ]);
            const { plea, trial } = extractPleaTrialSplit(response.rows);
            ussc = {
              match_depth: response.match_depth,
              widening_note: response.widening_note,
              total_cases: response.total_cases,
              sample_size_caveat: response.sample_size_caveat,
              outcomes: {
                plea: reshapeMatviewRow(plea),
                trial: reshapeMatviewRow(trial),
              },
              trial_tax_months: computeTrialTaxMonths(plea, trial),
              district_display: districtDisplay,
            };
          }
        } catch (err) {
          console.error("[SimilarCases] USSC matview augmentation failed:", err);
        }

        html = renderSimilarCases(data, typedIntake, similarIntelligence.isEmpty ? undefined : similarIntelligence, ussc);
        break;
      }

      case "district-court-intelligence": {
        // Upgraded 2026-04-23: Courthouse Intelligence Pack $147.
        // Slug retained for URL compatibility; see courthouse-intelligence.ts
        // for M5 scope (aggregate-only; judge-specific signals stay in
        // Judge Question Brief $197).
        if (!validateIntakeFields(intake, ["state"])) {
          await notifyOperatorFailure(orderId, slug, "Invalid intake: missing state");
          return;
        }
        const courthouseRaw =
          typeof intake.courthouse === "string" && intake.courthouse.length > 0
            ? intake.courthouse
            : null;
        const data = await queryCourthouseIntelligence({
          state: intake.state as string,
          courthouse: courthouseRaw,
        });
        if (data.isEmpty) {
          await notifyInsufficientData(order.email, productName, orderId, intake);
          return;
        }
        html = renderCourthouseIntelligence(data);
        break;
      }

      case "federal-sentencing-distribution": {
        if (!validateIntakeFields(intake, ["chargeType"])) {
          await notifyOperatorFailure(orderId, slug, "Invalid intake: missing chargeType");
          return;
        }
        const chargeType = intake.chargeType as string;
        const offguide_code = chargeTypeToFsdOffguide(chargeType);
        if (offguide_code === null) {
          // Unmapped charge — no federal sentencing guideline matches.
          await notifyInsufficientData(order.email, productName, orderId, intake);
          return;
        }
        const districtCode =
          typeof intake.district === "string" && intake.district.length > 0
            ? intake.district
            : null;
        const chFromIntake =
          typeof intake.criminalHistoryCategory === "string" &&
          intake.criminalHistoryCategory.length > 0
            ? intake.criminalHistoryCategory
            : priorsToChCategory(
                typeof intake.priorConvictions === "string"
                  ? intake.priorConvictions
                  : null,
              );
        // Reuse the top-level supabase client; no need to create a second
        // admin-scoped connection pool for this branch.
        const [fsd, districtDisplay] = await Promise.all([
          queryDistribution(supabase, {
            district: districtCode,
            offguide_code,
            // Pass null (not empty string) when CH is absent — queryDistribution's
            // hasCH check uses isNonEmptyString, and "" would silently skip the
            // exact tier while still claiming match_depth=widened_criminal_history.
            criminal_history_category: chFromIntake ?? null,
          }),
          queryDistrictDisplay(supabase, districtCode),
        ]);
        if (fsd.match_depth === "insufficient_data" || !fsd.district_agg) {
          await notifyInsufficientData(order.email, productName, orderId, intake);
          return;
        }
        const hist = histogram(fsd.monte_carlo, 20);
        html = renderFederalSentencingDistribution({
          chargeType,
          districtDisplay,
          match_depth: fsd.match_depth,
          widening_note: fsd.widening_note,
          sample_size_caveat: fsd.sample_size_caveat,
          district_agg: fsd.district_agg,
          national_agg: fsd.national_agg,
          per_year: fsd.per_year,
          monte_carlo: fsd.monte_carlo,
          histogram: hist,
          criminalHistoryCategory: chFromIntake,
        });
        break;
      }

      case "motion-success-report": {
        if (!validateIntakeFields(intake, ["chargeType"])) {
          await notifyOperatorFailure(orderId, slug, "Invalid intake: missing chargeType");
          return;
        }
        const data = await queryMotionSuccessReport({
          chargeType: intake.chargeType as string,
          circuit: typeof intake.circuit === "string" ? intake.circuit : null,
          state: typeof intake.state === "string" ? intake.state : null,
          judgeName: typeof intake.judgeName === "string" ? intake.judgeName : null,
        });
        if (data.isEmpty) {
          await notifyInsufficientData(order.email, productName, orderId, intake);
          return;
        }
        html = renderMotionSuccessReport(data);
        break;
      }

      case "arrest-survival-kit": {
        if (!validateIntakeFields(intake, ["state"])) {
          await notifyOperatorFailure(orderId, slug, "Invalid intake: missing state");
          return;
        }
        const data = await queryArrestSurvivalKit(intake.state as string);
        html = renderArrestSurvivalKit(data);
        break;
      }

      case "federal-jury-instruction-brief": {
        if (!validateIntakeFields(intake, ["federalCharge", "circuit"])) {
          await notifyOperatorFailure(
            orderId,
            slug,
            "Invalid intake: missing federalCharge or circuit",
          );
          return;
        }
        const federalCharge = intake.federalCharge as string;
        if (!isFederalCharge(federalCharge)) {
          // Federal-only gate — treat as insufficient data for the customer
          // (explicit federal-only messaging is in the notifier email).
          await notifyInsufficientData(order.email, productName, orderId, intake);
          return;
        }
        const data = await queryFederalJuryBrief({
          federalCharge,
          circuit: intake.circuit as string,
          state: typeof intake.state === "string" ? intake.state : null,
        });
        if (data.isEmpty) {
          await notifyInsufficientData(order.email, productName, orderId, intake);
          return;
        }
        html = renderFederalJuryInstructionBrief(data);
        break;
      }

      case "precedent-watchlist": {
        // Required: chargeType. Optional: state (used to label the header).
        if (!validateIntakeFields(intake, ["chargeType"])) {
          await notifyOperatorFailure(orderId, slug, "Invalid intake: missing chargeType");
          return;
        }
        const pwData = await queryPrecedentWatchlist({
          chargeType: intake.chargeType as string,
          state: typeof intake.state === "string" && intake.state.length > 0
            ? intake.state as string
            : null,
        });
        if (pwData.isEmpty) {
          await notifyInsufficientData(order.email, productName, orderId, intake);
          return;
        }
        html = renderPrecedentWatchlist(pwData);

        // Seed the 30-day weekly drip state so the cron picks it up on the
        // next weekly tick. Not fatal on failure — the instant report still
        // ships, and the cron is resilient to missing snapshots.
        try {
          const nowIso = new Date().toISOString();
          const seedState = {
            started_at: nowIso,
            last_sent_at: null,
            emails_sent: 0,
            last_velocity_snapshot: buildVelocitySnapshot(pwData),
            charge_type: intake.chargeType as string,
            state: typeof intake.state === "string" ? (intake.state as string) : null,
          };
          const { error: seedErr } = await supabase
            .from("orders")
            .update({ watchlist_email_state: seedState })
            .eq("id", orderId);
          if (seedErr) {
            console.error("[Tier9][precedent-watchlist] drip-seed failed:", seedErr.message);
          }
        } catch (e) {
          console.error("[Tier9][precedent-watchlist] drip-seed threw:", e);
        }
        break;
      }

      case "charge-authority-pack": {
        if (!validateIntakeFields(intake, ["chargeType"])) {
          await notifyOperatorFailure(orderId, slug, "Invalid intake: missing chargeType");
          return;
        }
        const data = await queryChargeAuthorityPack({
          chargeType: intake.chargeType as string,
          state: typeof intake.state === "string" ? intake.state : null,
          circuit: typeof intake.circuit === "string" ? intake.circuit : null,
        });
        if (data.isEmpty) {
          await notifyInsufficientData(order.email, productName, orderId, intake);
          return;
        }
        html = renderChargeAuthorityPack(data);
        break;
      }

      default:
        console.error("[Tier9] Unknown slug:", slug);
        await notifyOperatorFailure(orderId, slug, `Unknown Tier 9 slug: ${slug}`);
        return;
    }

    // 3. Generate cryptographic report token
    const reportToken = randomBytes(16).toString("hex");
    const reportTokenHash = hashToken(reportToken);

    // 4. Upload to Supabase Storage
    const storagePath = `${orderId}.html`;
    const { error: uploadError } = await supabase.storage
      .from("standalone-reports")
      .upload(storagePath, html, {
        contentType: "text/html",
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    // 5. Update order with report metadata
    const expiresAt = new Date(
      Date.now() + 365 * 24 * 60 * 60 * 1000
    ).toISOString();

    // IDv2-2026-04-27: Read the existing plaintext_tokens_expires_at so we
    // can extend it with GREATEST semantics. The webhook (Task 2) sets this
    // to NOW()+30min when the intake token mints. If we blindly overwrite, a
    // long generation run would shrink the already-set window. Read-then-write
    // is race-acceptable: worst case we lose ~ms of window, not user-visible.
    const { data: expiryRow } = await supabase
      .from("orders")
      .select("plaintext_tokens_expires_at")
      .eq("id", orderId)
      .single();

    const existingExpiryMs = expiryRow?.plaintext_tokens_expires_at
      ? Date.parse(expiryRow.plaintext_tokens_expires_at as string)
      : 0;
    const newExpiryMs = Date.now() + 30 * 60 * 1000;
    const plaintextExpiresAt = new Date(
      Math.max(existingExpiryMs, newExpiryMs)
    ).toISOString();

    const { error: updateError } = await supabase
      .from("orders")
      .update({
        standalone_report_token_hash: reportTokenHash,
        standalone_report_storage_path: storagePath,
        standalone_report_token_expires_at: expiresAt,
        standalone_report_token_plaintext: reportToken,
        plaintext_tokens_expires_at: plaintextExpiresAt,
      })
      .eq("id", orderId);

    if (updateError) {
      throw new Error(`Order update failed: ${updateError.message}`);
    }

    // 6. Send delivery email
    const reportUrl = `${SITE_URL}/report/standalone/${reportToken}`;

    await sendEmailWithOperatorAlert(
      {
        to: order.email,
        subject: `Your ${productName} Is Ready`,
        html: `
          <h1 style="color: #F59E0B; font-size: 24px; margin: 0 0 16px;">Your ${escapeHtml(productName)} Is Ready</h1>
          <p>Your report has been generated from verified court records. Every data point includes a source URL you can verify independently.</p>
          <p style="margin: 24px 0;">
            <a href="${reportUrl}"
               style="background: #F59E0B; color: #0C0A09; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
              View Your Report
            </a>
          </p>
          <p style="color: #A1A1AA; font-size: 13px;">This link is active for 1 year. Bookmark it for future reference.</p>
          <p style="color: #71717A; font-size: 12px; margin-top: 24px;">
            Questions about your report? Reply to this email and a real person will respond.
          </p>
        `,
      },
      `tier9 delivery for ${order.email}`,
      {
        category: "standalone-delivery",
        order_id: orderId,
        metadata: { standalone_product_slug: slug },
      }
    );

    console.log(
      `[Tier9] Report generated and delivered: ${slug} for ${order.email}`
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[Tier9] Generation failed:", errorMsg);
    await notifyOperatorFailure(orderId, slug, errorMsg);
  }
}

/**
 * Notify customer and operator when insufficient data is available.
 * Does not generate a report, offers refund instead.
 */
async function notifyInsufficientData(
  customerEmail: string,
  productName: string,
  orderId: string,
  intake: Record<string, unknown>
): Promise<void> {
  // Customer notification
  await sendEmail({
    to: customerEmail,
    subject: `${productName}, Limited Data Available`,
    html: `
      <h1 style="color: #F59E0B; font-size: 24px; margin: 0 0 16px;">${escapeHtml(productName)}</h1>
      <p>We searched our verified court record database but found insufficient data to generate a meaningful report based on the details you provided.</p>
      <p>We take data accuracy seriously, we will not generate a report with insufficient evidence to back it up.</p>
      <p style="margin: 20px 0;"><strong style="color: #FAFAF9;">Your options:</strong></p>
      <ul style="padding-left: 20px;">
        <li style="margin-bottom: 8px;">Reply to this email with corrected details (different spelling, full name, etc.) and we will search again</li>
        <li style="margin-bottom: 8px;">Request a full refund, reply to this email and we will process it immediately</li>
      </ul>
      <p style="color: #A1A1AA; font-size: 13px; margin-top: 24px;">
        Our database covers judges and officers across all 50 states with varying depth.
        Coverage depends on the volume of public court records available for your jurisdiction.
      </p>
    `,
  });

  // Operator alert
  await sendEmail({
    to: OPERATOR_EMAIL,
    subject: `[ALERT] Insufficient data, ${productName} (${orderId.slice(0, 8)})`,
    html: `
      <p>Tier 9 report generation found no data.</p>
      <p><strong>Product:</strong> ${escapeHtml(productName)}</p>
      <p><strong>Customer:</strong> ${escapeHtml(customerEmail)}</p>
      <p><strong>Order:</strong> ${escapeHtml(orderId)}</p>
      <p><strong>Intake:</strong> <code>${escapeHtml(JSON.stringify(intake))}</code></p>
      <p>Customer has been notified and offered a refund or retry.</p>
    `,
  });
}

/**
 * Notify operator of a generation failure with retry command.
 */
async function notifyOperatorFailure(
  orderId: string,
  slug: string | null,
  errorMsg: string
): Promise<void> {
  const origin = SITE_URL;
  await sendEmail({
    to: OPERATOR_EMAIL,
    subject: `[ERROR] Tier 9 generation failed, ${slug || "unknown"} (${orderId.slice(0, 8)})`,
    html: `
      <p>Tier 9 report generation failed.</p>
      <p><strong>Product:</strong> ${escapeHtml(slug || "unknown")}</p>
      <p><strong>Order:</strong> ${escapeHtml(orderId)}</p>
      <p><strong>Error:</strong> ${escapeHtml(errorMsg)}</p>
      <p><strong>Retry:</strong></p>
      <pre style="background: #1C1917; padding: 12px; border-radius: 4px; color: #D4D4D8; font-size: 12px; overflow-x: auto;">curl -X POST ${origin}/api/generate/tier9 \\
  -H "Authorization: Bearer $OPERATOR_SECRET" \\
  -H "Content-Type: application/json" \\
  -d '{"orderId":"${orderId}"}'</pre>
    `,
  });
}
