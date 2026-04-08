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
      "Sample finding — Registered Nurse, Florida, DUI charge. Employment risk: SIGNIFICANT. Under Florida Board of Nursing rules, licensees must self-report arrests within 30 days. Failure to report is an independent disciplinary violation that can trigger suspension even if the criminal charge is dismissed. Estimated income impact if license suspended: $280,000–$420,000 over 10 years. Your report will build the same specific analysis for your exact state, occupation, and charge.",
  },
  "judge-profile": {
    headline: "Know your judge before your first hearing.",
    stakes:
      "Most defendants walk into court knowing nothing about the person who will decide their fate. Meanwhile, the prosecutors who appear before this judge have spent years learning what works in their courtroom and what backfires. The $497 cost of leveling that information gap is invisible against the years of consequences a single ruling can carry.",
    includes: [
      "Background and judicial appointment history where documented",
      "Judicial philosophy and observed approach to criminal cases",
      "Ruling style — bench rulings vs. written orders, speed, thoroughness",
      "Patterns observed in suppression and pretrial motion rulings",
      "Procedural irritants and behaviors to discuss with your attorney",
      "Persuasion considerations — what type of legal reasoning tends to land",
      "Typical sentencing patterns for your charge type in this court",
      "10 judge-specific questions to bring to your attorney",
    ],
    sampleInsight:
      "Judges with backgrounds as former prosecutors often weigh officer credibility differently than judges with defense backgrounds. This is observable in their published opinions on suppression motions, and it can change which arguments your attorney may want to lead with.",
  },
  "motion-opportunity-scan": {
    headline: "Know which motions apply before you pay for discovery analysis.",
    stakes:
      "Most defendants find out what motions could have been filed only after the deadline passes. By then the issues are waived, the evidence is locked in, and the leverage is gone. A 60-second scan of motion opportunities filtered by your charge, jurisdiction, and case stage costs $497. Missing a motion deadline costs years.",
    includes: [
      "10-20 motion opportunities filtered by your charge and jurisdiction",
      "Case-stage filter showing only motions timely for your current stage",
      "Plain-English explanation of what each motion does",
      "Grant, deny, and partial outcome scenarios for each motion",
      "Why a denied motion can still be useful for the trial record",
      "Procedural considerations including filing deadlines",
      "Motions not yet ripe but coming as your case progresses",
      "10 motion-specific questions to bring to your attorney",
    ],
    sampleInsight:
      "A motion to compel discovery is the most commonly missed motion in early-stage cases — not because it isn't viable, but because defendants don't know it exists. In many jurisdictions the prosecution's discovery obligation kicks in within days of arraignment.",
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
