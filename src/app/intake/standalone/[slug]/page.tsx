/**
 * Standalone Product Intake Form (/intake/standalone/[slug])
 *
 * Token-gated page where customers complete their details after purchase.
 * The token was emailed by the Stripe webhook after successful payment.
 *
 * Flow: Purchase -> Webhook email with intake link -> THIS PAGE -> Generation
 *
 * Security: Token required (notFound without it). Token validates server-side
 * in the intake API route, not here — this page just passes it along.
 *
 * SEO: robots noindex — intake forms must not appear in search engines.
 */
import { notFound } from "next/navigation";
import { getProduct, isValidProduct } from "@/lib/products";
import IntakeFormClient from "./IntakeFormClient";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ token?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) return {};
  return {
    title: `Complete Your Details — ${product.name} | ImNotAnAttorney`,
    robots: { index: false },
  };
}

export default async function StandaloneIntakePage({
  params,
  searchParams,
}: Props) {
  const { slug } = await params;
  const { token } = await searchParams;
  if (!isValidProduct(slug)) notFound();
  const product = getProduct(slug)!;
  if (product.category !== "research") notFound();
  if (!token) notFound();

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-2xl font-bold mb-2">Complete Your Details</h1>
        <p className="text-zinc-400 mb-8">
          Your {product.name} will be generated within 60 seconds of submission.
        </p>
        <IntakeFormClient
          slug={slug}
          productName={product.name}
          token={token}
        />
      </div>
    </main>
  );
}
