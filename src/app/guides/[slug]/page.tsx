/**
 * @fileoverview Dynamic content-guide route.
 *
 * Serves `/guides/{slug}` for every active product where
 * `category === "content"` in `@/lib/products`. The actual guide copy lives
 * in per-slug components under `../content/{slug}.tsx` and is loaded via
 * dynamic import so each guide is tree-shaken into its own route chunk.
 *
 * Accessibility posture (reviewed by accessibility-agents:accessibility-lead
 * before first write):
 *   - No inner `<main>`. The root layout already emits
 *     `<main id="main-content">`, so we render into an `<article>`. Nesting
 *     a second `<main>` would create duplicate landmarks.
 *   - Primary + secondary CTAs use `<section aria-labelledby="...">` (not
 *     `<aside>`) so they stay in the main document flow instead of a
 *     spurious "complementary" landmark.
 *   - Card border uses `border-zinc-500` (~3.3:1 on `bg-zinc-900/60`) so
 *     the UI component boundary passes WCAG 1.4.11.
 *   - `@tailwindcss/typography` is NOT installed on this project
 *     (Tailwind v4, see `postcss.config.mjs`), so we do NOT use `prose-*`
 *     utilities. The content component styles its own headings, paragraphs,
 *     and lists.
 *
 * Content component contract (enforced by convention — see `GUIDE_CONTENT`
 * below):
 *   - MUST start headings at `<h2>`. Never emit an `<h1>`. Never skip
 *     levels.
 *   - MUST wrap thematic groups in `<section aria-labelledby="{id}">` with
 *     the matching heading carrying that id.
 *   - MUST remain UPL-safe ("consider", "one option is", "questions to
 *     explore" — never "you should", "we recommend", "your best option").
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import type { ComponentType } from "react";
import {
  STANDALONE_PRODUCTS,
  getProduct,
  isValidProduct,
} from "@/lib/products";
import { SITE_URL } from "@/lib/site";

/**
 * Registry of guide slugs to lazily-imported content components.
 *
 * Each component MUST honor the contract documented in the fileoverview:
 * start at h2, use `<section aria-labelledby="...">`, stay UPL-safe.
 */
const GUIDE_CONTENT: Record<
  string,
  () => Promise<{ default: ComponentType }>
> = {
  "first-court-appearance": () => import("../content/first-court-appearance"),
  "family-action-plan": () => import("../content/family-action-plan"),
};

/**
 * Pre-render one static page per active content guide at build time.
 *
 * Reads directly from the product catalog so adding a new content guide is
 * a two-line change: flip `isActive: true` in `products.ts` and add a
 * registry entry to `GUIDE_CONTENT` above.
 */
export function generateStaticParams() {
  return Object.entries(STANDALONE_PRODUCTS)
    .filter(([slug, p]) => p.category === "content" && p.isActive && slug in GUIDE_CONTENT)
    .map(([slug]) => ({ slug }));
}

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product || product.category !== "content" || !product.isActive) {
    return {};
  }
  return {
    title: `${product.name} | ImNotAnAttorney`,
    description: product.description,
    alternates: { canonical: `${SITE_URL}/guides/${slug}` },
    openGraph: {
      title: product.name,
      description: product.description,
      type: "article",
      url: `${SITE_URL}/guides/${slug}`,
    },
  };
}

export default async function GuidePage({ params }: Props) {
  const { slug } = await params;
  if (!isValidProduct(slug)) notFound();
  const product = getProduct(slug)!;
  if (product.category !== "content" || !product.isActive) notFound();

  const loader = GUIDE_CONTENT[slug];
  if (!loader) notFound();
  const { default: Content } = await loader();

  return (
    <article className="mx-auto max-w-2xl px-4 py-16 text-zinc-100">
      <header className="mb-10">
        <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-amber-400">
          Free Guide
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight text-zinc-50 md:text-4xl">
          {product.name}
        </h1>
        <p className="mt-3 text-lg text-zinc-300">{product.description}</p>
      </header>

      {/* Guide body — content component styles its own headings/paragraphs/lists. */}
      <Content />

      {/* Primary CTA — /score quiz is THE email capture point per INAA rules */}
      <section
        aria-labelledby="score-cta-heading"
        className="mt-16 border-t border-zinc-800 pt-10"
      >
        <h2
          id="score-cta-heading"
          className="font-display text-xl font-bold text-zinc-50"
        >
          How does your defense measure up?
        </h2>
        <p className="mt-3 text-zinc-300">
          Take the free Defense Milestone Score — 10 questions, instant
          results, no sign-up required to start.
        </p>
        <Link
          href="/score"
          className="mt-5 inline-block rounded-lg bg-amber-500 px-6 py-3 text-sm font-bold text-black hover:bg-amber-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
        >
          Take the Defense Milestone Score
        </Link>
      </section>

      {/* Secondary CTA — relevant paid product, if any */}
      {product.upsellTier && product.upsellText && (
        <section
          aria-labelledby="playbook-cta-heading"
          className="mt-10 rounded-lg border border-zinc-500 bg-zinc-900/60 p-6"
        >
          <h2
            id="playbook-cta-heading"
            className="text-lg font-semibold text-zinc-50"
          >
            Want charge-specific preparation?
          </h2>
          <p className="mt-2 text-zinc-300">{product.upsellText}</p>
          <Link
            href={`/playbook/${product.upsellTier}`}
            className="mt-4 inline-block text-amber-400 underline hover:text-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
          >
            See the Defense Playbook
          </Link>
        </section>
      )}

      {/* UPL-approved methodology disclaimer */}
      <p className="mt-12 border-t border-zinc-800 pt-6 text-xs text-zinc-400">
        This guide provides legal INFORMATION — not legal ADVICE. The content
        draws on methods developed by elite defense attorneys. Your attorney
        remains the final authority on strategy decisions.
      </p>
    </article>
  );
}
