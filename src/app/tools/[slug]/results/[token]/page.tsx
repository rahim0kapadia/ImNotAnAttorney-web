/**
 * @fileoverview Saved Calculator Results — shareable read-only page.
 *
 * Each calculator result that was persisted via /api/tools/save-results
 * has a 12-char base64url token. Visiting /tools/{slug}/results/{token}
 * renders that saved result. Same accessibility posture as the live
 * wizard results view: <dl>/<dt>/<dd> numbers grid, descriptive CTA.
 */
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProduct } from "@/lib/products";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ slug: string; token: string }>;
}

interface CalculatorResult {
  supported: boolean;
  stateName?: string;
  minimumServePercent?: number;
  estimatedServeMonths?: number;
  estimatedCreditMonths?: number;
  estimatedNetServeMonths?: number;
  custodyCreditDays?: number;
  statuteCitation?: string;
  ruleApplied?: string;
  observations?: string[];
  fallbackMessage?: string;
}

export async function generateMetadata({
  params,
}: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) return {};
  return {
    title: `${product.name} — Saved Results | ImNotAnAttorney`,
    description: `Saved results from the ${product.name}.`,
    robots: { index: false, follow: false },
  };
}

export default async function CalculatorResultsPage({ params }: Props) {
  const { slug, token } = await params;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("calculator_results")
    .select("result, created_at")
    .eq("slug", slug)
    .eq("token", token)
    .maybeSingle();

  if (error || !data) notFound();

  const product = getProduct(slug);
  if (!product) notFound();

  const result = data.result as CalculatorResult;
  const createdDate = new Date(data.created_at).toLocaleDateString();

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-3xl font-bold tracking-tight mb-2">
          {product.name} — Your Saved Results
        </h1>
        <p className="text-zinc-300 text-sm mb-8">
          Calculated on {createdDate}
        </p>

        <section
          aria-labelledby="saved-results-heading"
          className="focus:outline-none"
        >
          <h2 id="saved-results-heading" className="sr-only">
            Saved calculator results
          </h2>

          {result.supported === false || !result.minimumServePercent ? (
            <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6">
              <p className="text-zinc-200">
                {result.fallbackMessage ??
                  "No computable result was stored for this record."}
              </p>
            </div>
          ) : (
            <>
              <dl className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <dt className="text-zinc-300 text-sm">
                    Minimum Serve Time
                  </dt>
                  <dd className="text-2xl font-bold text-zinc-50">
                    {result.minimumServePercent}%
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-300 text-sm">Estimated Serve</dt>
                  <dd className="text-2xl font-bold text-zinc-50">
                    {result.estimatedServeMonths} months
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-300 text-sm">
                    Potential Good Time Reduction
                  </dt>
                  <dd className="text-2xl font-bold text-green-400">
                    {result.estimatedCreditMonths ?? 0} months
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-300 text-sm">
                    After Custody Credit
                  </dt>
                  <dd className="text-2xl font-bold text-blue-300">
                    {result.estimatedNetServeMonths} months
                  </dd>
                </div>
              </dl>

              <p className="text-xs text-zinc-400 mb-6">
                Based on {result.ruleApplied} ({result.statuteCitation})
              </p>

              {result.observations && result.observations.length > 0 && (
                <ul className="mb-6 space-y-3">
                  {result.observations.map((obs, i) => (
                    <li
                      key={i}
                      className="text-zinc-200 text-base leading-relaxed"
                    >
                      {obs}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>

        {/* Upsell CTA */}
        {product.upsellTier && product.upsellText && (
          <div className="mt-8 border-t border-zinc-800 pt-8">
            <p className="text-zinc-200 mb-4">{product.upsellText}</p>
            <a
              href={`/checkout?tier=${product.upsellTier}`}
              className="inline-block bg-blue-500 hover:bg-blue-400 text-white px-6 py-3 rounded-lg font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
            >
              See the Case Decoder
            </a>
          </div>
        )}

        <p className="mt-12 text-xs text-zinc-400 border-t border-zinc-800 pt-6">
          This calculator provides legal INFORMATION based on published
          state rules — not legal ADVICE.
        </p>
      </div>
    </main>
  );
}
