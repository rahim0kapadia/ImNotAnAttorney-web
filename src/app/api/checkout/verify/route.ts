/**
 * @fileoverview Checkout Session Verification Endpoint
 *
 * Called by the /checkout/success page to verify that a Stripe checkout session
 * was actually paid before showing the success UI. This prevents users from
 * manually navigating to the success page URL without completing payment.
 *
 * Pipeline position:
 *   Stripe Checkout --> Redirect to /checkout/success?session_id=X&tier=Y
 *     --> Success page calls GET /api/checkout/verify?session_id=X
 *     --> If verified: show tier-specific next steps, OTO countdown, upload link
 *     --> If not verified: show generic "payment not confirmed" message
 *
 * Security notes:
 * - The session_id comes from the URL query parameter, which is set by Stripe
 *   during the redirect. It is NOT user-controllable in normal flow, but could
 *   be tampered with. The Stripe API call validates the session exists.
 * - On any error (invalid session ID, Stripe API failure, network issue), the
 *   endpoint returns { verified: false } rather than an error. This is
 *   intentional -- the success page gracefully degrades to a "check your email"
 *   message rather than showing an error.
 * - The email is pulled from customer_email (set during session creation) with
 *   a fallback to customer_details.email (filled by Stripe after the customer
 *   enters payment info). One of these is always available for paid sessions.
 */
import { NextRequest, NextResponse } from "next/server";
import { stripeTest, stripeLive } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";
import { PLAYBOOK_SLUGS } from "@/lib/tiers";
import { TIER9_SLUGS } from "@/lib/tier9-reports/constants";
import {
  buildPrePopulatedIntake,
  type PrepopulatedIntakeMetadata,
} from "@/lib/tier9-reports/prepopulated-intake";

/**
 * Archetype taxonomy (per docs/plans/2026-04-27-immediate-download-v2.md §1.2).
 *
 *   A — playbook digital-product (download_token path; instant PDF)
 *   B — standalone Tier 9 with pre-populated intake (instant report after ~30s)
 *   C — standalone Tier 9 without pre-pop (needs intake first)
 *   D — standalone non-Tier-9 research (needs intake first)
 *   E — service tier (case-decoder / IB / X-Ray / War Room / Situation Room
 *       / extra-witness / witness-pack — email-only fulfillment)
 */
export type Archetype = "A" | "B" | "C" | "D" | "E";

/** Service-tier slugs (archetype E) — out-of-scope for in-page CTA. Mirrors
 *  the canonical service-tier list in src/lib/tiers.ts SERVICE_UPGRADE_PATH
 *  plus the two add-ons (extra-witness, witness-pack) which share E behavior. */
const SERVICE_TIER_SLUGS: ReadonlySet<string> = new Set([
  "case-decoder",
  "intelligence-brief",
  "x-ray",
  "war-room",
  "situation-room",
  "extra-witness",
  "witness-pack",
]);

/**
 * Server-side archetype derivation. Single source of truth so the success
 * page can collapse to `data.archetype === "B"` branches instead of
 * re-deriving from URL params.
 *
 * Order matters: Tier 9 SKUs are also `product_type === "standalone"`, so
 * the Tier 9 branch must run before the generic standalone fallback (D).
 */
export function deriveArchetype(args: {
  tier: string | null | undefined;
  productType: string | null | undefined;
  standaloneProductSlug: string | null | undefined;
  hasPrePopulatedIntake: boolean;
}): Archetype | null {
  const { tier, productType, standaloneProductSlug, hasPrePopulatedIntake } = args;

  // A — playbook digital-product (8 SKUs)
  if (productType === "digital-product" && tier && PLAYBOOK_SLUGS.has(tier as never)) {
    return "A";
  }

  // E — service tier (5 service tiers + 2 add-ons)
  if (tier && SERVICE_TIER_SLUGS.has(tier)) {
    return "E";
  }

  // B / C / D — standalone research products
  if (productType === "standalone" && standaloneProductSlug) {
    if (TIER9_SLUGS.has(standaloneProductSlug)) {
      return hasPrePopulatedIntake ? "B" : "C";
    }
    return "D";
  }

  return null;
}

/**
 * Verifies a Stripe checkout session's payment status and returns order details
 * for the success page to render tier-specific content.
 *
 * @param req - Query params: session_id (required, from Stripe redirect URL)
 * @returns JSON with verified (boolean), and if true: tier, email, amount (cents), productName
 */
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
  }

  // B10: Reject obviously malformed session IDs before hitting Stripe API
  if (sessionId.length > 200 || !/^cs_/.test(sessionId)) {
    return NextResponse.json({ verified: false });
  }

  try {
    // Rate limit: 20 requests per minute per IP
    const ip = getClientIp(req);
    const supabase = createAdminClient();
    const { limited } = await checkRateLimit(supabase, `checkout-verify:${ip}`, 20, 60);
    if (limited) {
      return NextResponse.json({ verified: false });
    }

    // Try the matching Stripe client based on session ID prefix to avoid
    // double-latency. cs_live_ sessions can only be retrieved by the live
    // client, cs_test_ by the test client.
    let session;
    const isLiveSession = sessionId.startsWith("cs_live_");
    const primaryClient = isLiveSession && stripeLive ? stripeLive : stripeTest;
    const fallbackClient = isLiveSession ? stripeTest : stripeLive;
    try {
      session = await primaryClient.checkout.sessions.retrieve(sessionId);
    } catch {
      if (fallbackClient) {
        session = await fallbackClient.checkout.sessions.retrieve(sessionId);
      } else {
        throw new Error("Session not found and no fallback Stripe client configured");
      }
    }

    // Reject test-mode sessions in production, test sessions are trivially
    // created with test card numbers and should never verify as paid.
    if (process.env.NODE_ENV === "production" && !session.livemode) {
      return NextResponse.json({ verified: false });
    }

    // Treat "paid" and "no_payment_required" as verified. "no_payment_required"
    // occurs with 100% coupons (e.g., internal QA coupon for E2E testing).
    // "unpaid" means the customer abandoned, reject that.
    if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
      return NextResponse.json({ verified: false });
    }

    // Return the data the success page needs to render tier-specific content:
    // - tier: determines which next-steps block to show (e.g., upload link for X-Ray+)
    // - email: shown in the "check your email" confirmation message
    // - amount: displayed as the payment amount (in cents, formatted client-side)
    // - productName: human-readable tier name for the receipt summary
    // - downloadUrl: for digital products, the secure download link (if webhook has fired)
    const response: Record<string, unknown> = {
      verified: true,
      tier: session.metadata?.tier,
      email: session.customer_email || session.customer_details?.email,
      amount: session.amount_total,
      productName: session.metadata?.product_name,
      sessionCreated: session.created, // Unix timestamp (seconds) for OTO timer TTL
      priorityDelivery: session.metadata?.priority_delivery === "true",
    };

    // For digital products, look up the download token from the order record.
    // The webhook creates the token async, it may not exist yet if the customer
    // hits the success page before the webhook fires. Return null gracefully;
    // the success page shows "check email" as fallback.
    const tierSlug = session.metadata?.tier;
    if (session.metadata?.product_type === "digital-product" ||
        (tierSlug && !["case-decoder","intelligence-brief","x-ray","war-room","situation-room","extra-witness","witness-pack"].includes(tierSlug))) {
      const { data: order } = await supabase
        .from("orders")
        .select("download_token, download_token_expires_at")
        .eq("stripe_session_id", sessionId)
        .eq("product_type", "digital-product")
        .maybeSingle();

      if (order?.download_token) {
        const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com";
        response.downloadUrl = `${origin}/api/download/${order.download_token}`;
        response.emergencyDownloadUrl = `${origin}/api/download/${order.download_token}?doc=emergency`;
      }
    }

    // (W6 + IDv2-2026-04-27) For standalone research products, the plaintext
    // intake / report tokens are surfaced in this response — but ONLY when the
    // token is still within its 30-minute mint TTL. After 30 min the
    // plaintext_tokens_expires_at predicate fails and the response falls back
    // to "check your email" copy on the success page.
    //
    // THREAT MODEL:
    //   - session_id is already a bearer credential reachable by anyone holding
    //     the post-checkout URL (referrer leak, history, screenshot). An
    //     attacker with the session_id can already call this endpoint and
    //     receive the (now-attached) plaintext URLs. Surfacing plaintext does
    //     NOT escalate beyond the session_id replay surface that already
    //     exists.
    //   - DB compromise during the 30-min window leaks ONLY in-flight tokens
    //     (max ~30 min of orders). Long-tail rows scrubbed via hourly cron at
    //     /api/cron/scrub-plaintext-tokens; manual emergency scrub via
    //     scripts/scrub-plaintext-tokens.mjs.
    //   - Hash-only state remains the resting state for >99% of orders.
    //
    // OPERATIONAL CONTRACT:
    //   - Webhook MUST set plaintext_tokens_expires_at = NOW() + 30 min on
    //     every plaintext write. Cron MUST defensively check the predicate
    //     "plaintext_tokens_expires_at IS NOT NULL AND ... < NOW()" before
    //     NULLing.
    //   - Email path is unchanged — emails still carry the plaintext URL the
    //     customer needs after the in-page TTL elapses.
    const standaloneSlug = session.metadata?.standalone_product_slug;
    const productType = session.metadata?.product_type ?? null;

    // Standalone-order row lookup: pull plaintext tokens + TTL alongside the
    // slug so we can construct in-page URLs when within the mint window.
    let standaloneOrder: {
      standalone_intake_token: string | null;
      standalone_report_token_plaintext: string | null;
      plaintext_tokens_expires_at: string | null;
      standalone_product_slug: string | null;
      product_type: string | null;
    } | null = null;

    if (productType === "standalone") {
      const { data } = await supabase
        .from("orders")
        .select(
          "standalone_intake_token, standalone_report_token_plaintext, plaintext_tokens_expires_at, standalone_product_slug, product_type"
        )
        .eq("stripe_session_id", sessionId)
        .eq("product_type", "standalone")
        .maybeSingle();
      standaloneOrder = data ?? null;

      if (standaloneSlug) {
        response.standaloneProduct = standaloneSlug;
      }
    }

    // ── Archetype derivation (server-side, single source of truth) ──
    // For Tier 9 SKUs we consult buildPrePopulatedIntake() against the SAME
    // Stripe-session metadata the webhook used to mint the intake. If that
    // function returns non-null, the webhook took the fast-path → archetype B.
    // Otherwise the customer must fill an intake → archetype C.
    const resolvedSlug =
      standaloneSlug || standaloneOrder?.standalone_product_slug || null;
    let hasPrePop = false;
    if (resolvedSlug && TIER9_SLUGS.has(resolvedSlug)) {
      const intake = buildPrePopulatedIntake(
        resolvedSlug,
        (session.metadata ?? null) as PrepopulatedIntakeMetadata | null,
      );
      hasPrePop = intake !== null;
    }

    const archetype = deriveArchetype({
      tier: tierSlug ?? null,
      productType,
      standaloneProductSlug: resolvedSlug,
      hasPrePopulatedIntake: hasPrePop,
    });
    response.archetype = archetype;

    // ── In-page URL construction (gated on within-TTL plaintext) ──
    // NEVER read URL inputs from request — only from the server-validated
    // DB row + verified Stripe session. The TTL guard is the SAME predicate
    // the cron uses to scrub: plaintext_tokens_expires_at IS NOT NULL AND > NOW().
    if (standaloneOrder && standaloneOrder.plaintext_tokens_expires_at) {
      const expiresAt = Date.parse(standaloneOrder.plaintext_tokens_expires_at);
      const withinTtl = Number.isFinite(expiresAt) && expiresAt > Date.now();

      if (withinTtl) {
        const origin =
          process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com";

        // Archetype B: report is the primary CTA (intake was pre-populated by
        // the webhook, the customer never sees the intake form). We still
        // surface intakeUrl when present so the success page can render an
        // edit-intake affordance if product policy ever requires it.
        if (archetype === "B") {
          if (standaloneOrder.standalone_report_token_plaintext) {
            response.reportUrl = `${origin}/report/standalone/${standaloneOrder.standalone_report_token_plaintext}`;
          }
          if (standaloneOrder.standalone_intake_token) {
            response.intakeUrl = `${origin}/intake/standalone/${standaloneOrder.standalone_intake_token}`;
          }
        }

        // Archetypes C and D: intake URL is the primary CTA (no report exists
        // yet — customer must complete intake first).
        if ((archetype === "C" || archetype === "D") &&
            standaloneOrder.standalone_intake_token) {
          response.intakeUrl = `${origin}/intake/standalone/${standaloneOrder.standalone_intake_token}`;
        }
      }
    }

    return NextResponse.json(response);
  } catch {
    // On any Stripe API error (invalid session ID, network failure, etc.),
    // return unverified rather than an error. The success page will show a
    // graceful fallback message instead of a broken error state.
    return NextResponse.json({ verified: false });
  }
}
