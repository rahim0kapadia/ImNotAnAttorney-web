/**
 * QA Intake Form — operator-only Tier 9 test harness.
 *
 * Lets operators exercise the AvailabilityChecker → archetype-B auto-generate
 * path for any Tier 9 SKU without needing the customer-facing landing page.
 * Pre-fills sensible test defaults; submit → /api/qa-checkout → Stripe checkout
 * with QA coupon → webhook pre-pop fires → success page polls → "View Your
 * Report" button.
 *
 * URL: /qa-intake/<slug>?key=<OPERATOR_SECRET>
 *
 * Security:
 * - Server-side gates on OPERATOR_SECRET via timing-safe HMAC compare (mirrors
 *   /api/qa-checkout pattern). Wrong key → renders 404.
 * - Page is noindex via metadata.
 * - Submission also re-validates OPERATOR_SECRET via /api/qa-checkout's own gate.
 *
 * Coverage: 9 of 10 Tier 9 SKUs auto-generate when their pre-pop fields land in
 * Stripe metadata. federal-sentencing-distribution stays archetype-C (needs
 * district + priorConvictions + criminalHistoryCategory which AvailabilityChecker
 * doesn't collect — see plan §2.5 in
 * docs/plans/2026-04-27-post-purchase-ux-fix-plan.md).
 */
import { notFound } from "next/navigation";
import { createHmac, timingSafeEqual } from "crypto";
import type { Metadata } from "next";
import { STANDALONE_PRODUCTS } from "@/lib/products";

export const metadata: Metadata = { robots: "noindex, nofollow" };

const OPERATOR_SECRET = process.env.OPERATOR_SECRET;

function timingSafeCompare(a: string, b: string): boolean {
  const hmacA = createHmac("sha256", "inna-guard-compare").update(a).digest();
  const hmacB = createHmac("sha256", "inna-guard-compare").update(b).digest();
  return timingSafeEqual(hmacA, hmacB);
}

// Per-SKU sensible test defaults so one-click testing works.
// Operators can override any field on the form before submit.
const TEST_DEFAULTS: Record<string, Record<string, string>> = {
  "judge-report-card": { judgeName: "John Smith", state: "FL", chargeType: "dui" },
  "officer-background-check": { officerName: "Jane Doe", state: "FL", agency: "St Petersburg Police Department" },
  "similar-cases-analyzer": { chargeType: "dui", state: "FL" },
  "district-court-intelligence": { state: "FL", courthouse: "Pinellas County Criminal Justice Center" },
  "arrest-survival-kit": { state: "FL" },
  "precedent-watchlist": { chargeType: "dui", state: "FL" },
  "charge-authority-pack": { chargeType: "dui", state: "FL", circuit: "11" },
  "motion-success-report": { chargeType: "dui", state: "FL", circuit: "11", judgeName: "John Smith" },
  "federal-jury-instruction-brief": { federalCharge: "wire-fraud", circuit: "11", state: "FL" },
  "federal-sentencing-distribution": { chargeType: "wire-fraud", state: "FL" },
};

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ key?: string }>;
}

export default async function QaIntakePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { key } = await searchParams;

  if (!OPERATOR_SECRET || !key || !timingSafeCompare(OPERATOR_SECRET, key)) {
    notFound();
  }

  const product = STANDALONE_PRODUCTS[slug as keyof typeof STANDALONE_PRODUCTS];
  if (!product) notFound();

  const defaults = TEST_DEFAULTS[slug] ?? {};
  const fields = product.intakeFields ?? [];

  return (
    <div className="min-h-screen px-4 py-12 bg-black text-white">
      <div className="mx-auto max-w-xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-amber-500">
          QA Intake — Operator Only
        </p>
        <h1 className="mt-2 text-2xl font-bold">{product.name}</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {product.priceDisplay} · {product.delivery} · slug: <code>{slug}</code>
        </p>

        <p className="mt-6 text-sm text-zinc-300">
          Fill any field. Submit to hit <code>/api/qa-checkout</code> with the
          intake metadata. Webhook pre-pop fires → archetype B → success page
          polls → &quot;View Your Report&quot; button within ~30s.
        </p>

        <form
          action="/api/qa-checkout"
          method="GET"
          className="mt-8 space-y-4"
        >
          <input type="hidden" name="key" value={key} />
          <input type="hidden" name="product" value={slug} />

          {fields.length === 0 ? (
            <p className="text-sm text-zinc-500 italic">
              This SKU has no intake fields declared.
            </p>
          ) : (
            fields.map((field) => (
              <div key={field}>
                <label
                  htmlFor={`field-${field}`}
                  className="block text-xs font-semibold text-zinc-300"
                >
                  {field}
                </label>
                <input
                  type="text"
                  id={`field-${field}`}
                  name={field}
                  defaultValue={defaults[field] ?? ""}
                  className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                  autoComplete="off"
                />
              </div>
            ))
          )}

          <button
            type="submit"
            className="mt-6 w-full rounded-lg bg-amber-500 px-6 py-3 text-sm font-bold text-black transition-colors hover:bg-amber-400"
          >
            Generate via QA Coupon →
          </button>
        </form>

        <p className="mt-6 text-xs text-zinc-500">
          Default values pre-fill from <code>TEST_DEFAULTS</code>. Edit any value
          inline before submit. Form posts via GET to <code>/api/qa-checkout</code>;
          fields not in the route&apos;s passthrough list are silently dropped.
        </p>

        <p className="mt-4 text-xs text-zinc-600">
          Coverage caveat: federal-sentencing-distribution stays archetype-C
          regardless (needs district + priorConvictions + criminalHistoryCategory
          which the metadata path doesn&apos;t thread).
        </p>
      </div>
    </div>
  );
}
