/**
 * @fileoverview Dynamic Calculator Page (server component).
 *
 * Routes like /tools/good-time resolve to this file. Loads product metadata
 * from the standalone catalog and hands off to the CalculatorClient for
 * interactive form state. notFound() fires for any slug that isn't an
 * active calculator-category product.
 */
import { notFound } from "next/navigation";
import { getProduct, isValidProduct } from "@/lib/products";
import CalculatorClient from "./CalculatorClient";
import type { Metadata } from "next";
import { BRAND_UPL_DISCLAIMER } from "@/lib/copy/disclaimers";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product || product.category !== "calculator") return {};
  return {
    title: `${product.name} | ImNotAnAttorney`,
    description: product.description,
    openGraph: {
      title: product.name,
      description: product.description,
      type: "website",
    },
  };
}

export default async function CalculatorPage({ params }: Props) {
  const { slug } = await params;
  if (!isValidProduct(slug)) notFound();
  const product = getProduct(slug);
  if (!product || product.category !== "calculator" || !product.isActive) {
    notFound();
  }

  const isSentencingCalc = slug === "sentencing-calculator";

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-3xl font-bold tracking-tight mb-2">
          {product.name}
        </h1>
        <p className="text-zinc-300 mb-4">{product.description}</p>
        {isSentencingCalc && (
          <p
            data-hero-sub
            className="text-sm text-amber-400 mb-8 font-medium"
          >
            819,248 federal sentences analyzed · 85,761 state court opinions
            with sentence data · 1,126 judges profiled
          </p>
        )}
        {!isSentencingCalc && <div className="mb-4" />}
        <CalculatorClient slug={slug} product={product} />
        <p className="mt-12 text-xs text-zinc-400 border-t border-zinc-800 pt-6">
          {isSentencingCalc
            ? `These are real federal sentences from 819,248 USSC records (FY2001-2023) and 85,761 state court opinions. Past data, not prediction. ${BRAND_UPL_DISCLAIMER}`
            : "This calculator provides legal INFORMATION based on published rules, not legal ADVICE. Outcomes depend on program participation and classification decisions set by the court."}
        </p>
        <p className="mt-4 text-xs italic text-zinc-500">
          &mdash; Researchers. Defendants, still fighting.
        </p>
      </div>
    </main>
  );
}
