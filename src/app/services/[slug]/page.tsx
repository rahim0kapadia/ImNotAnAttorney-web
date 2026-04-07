/**
 * Standalone Research Product Landing Page (/services/[slug])
 *
 * Sales page for paid research products. Dynamic route renders product-specific
 * content from the catalog + PRODUCT_COPY map.
 *
 * Target audience: Crisis buyers at 2AM on mobile. Every word earns attention.
 * Design: Dark theme, scannable sections, clear CTA, mobile-first.
 */
import { notFound } from "next/navigation";
import { getProduct, isValidProduct } from "@/lib/products";
import type { Metadata } from "next";

// Product-specific sales copy — one entry per research product
const PRODUCT_COPY: Record<
  string,
  {
    headline: string;
    stakes: string;
    includes: string[];
    sampleInsight: string;
  }
> = {
  "employment-impact": {
    headline: "Will this charge cost you your job?",
    stakes:
      "The average American earns $56,000/year. A conviction-related job loss costs $80,000+ in the first year alone — lost wages, gap in employment history, reduced future earning potential. The $197 cost of knowing is invisible against those stakes.",
    includes: [
      "Background check impact analysis (FCRA, state, FBI)",
      "Employer type-specific rules (government, regulated, private)",
      "Industry and occupation-specific consequences",
      "Financial impact estimate with income loss scenarios",
      "State-specific employment protections and Ban-the-Box laws",
      "10 questions to ask your defense attorney about employment",
    ],
    sampleInsight:
      "In Florida, employers cannot ask about arrests that did not lead to conviction on initial applications (Ban-the-Box, effective 2024). But background check timing matters — your charge appears differently at different stages.",
  },
};

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product || product.category !== "research") return {};
  const copy = PRODUCT_COPY[slug];
  return {
    title: `${product.name} — ${product.priceDisplay} | ImNotAnAttorney`,
    description: product.description,
    openGraph: {
      title: copy?.headline || product.name,
      description: product.description,
    },
  };
}

export default async function ProductLandingPage({ params }: Props) {
  const { slug } = await params;
  if (!isValidProduct(slug)) notFound();
  const product = getProduct(slug)!;
  if (product.category !== "research") notFound();
  if (!product.isActive) notFound();

  const copy = PRODUCT_COPY[slug];
  if (!copy) notFound();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-2xl px-4 py-16">
        {/* Hero */}
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
          {copy.headline}
        </h1>
        <p className="text-lg text-zinc-300 mb-8">{product.description}</p>

        {/* Stakes */}
        <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 mb-8">
          <p className="text-zinc-300 leading-relaxed">{copy.stakes}</p>
        </div>

        {/* What's included */}
        <h2 className="text-2xl font-semibold mb-4">What You Get</h2>
        <ul className="space-y-3 mb-8" role="list">
          {copy.includes.map((item, i) => (
            <li key={i} className="flex gap-3">
              <span
                className="text-green-400 mt-0.5 shrink-0"
                aria-hidden="true"
              >
                &#10003;
              </span>
              <span className="text-zinc-300">{item}</span>
            </li>
          ))}
        </ul>

        {/* Sample insight */}
        <div className="bg-blue-950/30 border border-blue-800 rounded-lg p-6 mb-8">
          <p className="text-sm text-blue-400 font-medium mb-2">
            Sample insight from a real report:
          </p>
          <blockquote className="text-zinc-300 italic">
            &quot;{copy.sampleInsight}&quot;
          </blockquote>
        </div>

        {/* Delivery info */}
        <div className="flex items-center gap-4 mb-8 text-zinc-400">
          <span>{product.delivery}</span>
          <span aria-hidden="true">|</span>
          <span>{product.priceDisplay}</span>
        </div>

        {/* CTA */}
        <a
          href={`/checkout?standaloneProduct=${slug}`}
          className="block w-full text-center bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-lg font-semibold text-lg transition-colors"
        >
          Get Your {product.name} — {product.priceDisplay}
        </a>

        {/* Disclaimer */}
        <p className="mt-6 text-xs text-zinc-500">
          This report provides legal INFORMATION — not legal ADVICE. Your
          attorney remains the final authority on strategy decisions.
        </p>
      </div>
    </div>
  );
}
