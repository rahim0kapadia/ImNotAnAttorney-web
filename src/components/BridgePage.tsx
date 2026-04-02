"use client";
/**
 * Bridge page component — trust transfer from partner to service.
 *
 * Short interstitial following Russell Brunson's bridge page framework.
 * Warm traffic from trusted source = short bridge, one CTA.
 * Per Cialdini's Unity Principle — partner name + company carry through.
 */

import Link from "next/link";
import { TrustBadges } from "@/components/TrustBadges";

interface BridgePageProps {
  partnerName: string;
  company: string | null;
  promoCode: string;
}

export function BridgePage({ partnerName, company, promoCode }: BridgePageProps) {
  const displayName = company
    ? `${partnerName} from ${company}`
    : partnerName;

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="max-w-lg text-center">
          <h1 className="text-3xl md:text-4xl font-bold mb-6 leading-tight">
            <span className="text-amber-400">{displayName}</span> referred you.
            <br />
            Here&apos;s why.
          </h1>

          <p className="text-lg text-zinc-300 mb-4">
            They see a lot of people go through what you&apos;re going through.
            The ones who do best are the ones who show up to their attorney
            prepared with the right questions.
          </p>

          <p className="text-lg text-zinc-300 mb-8">
            This service researches your case and gives you exactly that.
          </p>

          <p className="text-amber-400 font-bold text-lg mb-6">
            Their code <span className="font-mono">{promoCode}</span> saves you 10%.
          </p>

          <Link
            href={`/r/${promoCode}/quiz`}
            className="inline-block px-8 py-4 bg-amber-500 text-black font-bold rounded-xl text-lg hover:bg-amber-400 transition-colors"
          >
            Take Back Control of Your Case
          </Link>

          <p className="text-zinc-400 text-sm mt-8">
            ImNotAnAttorney provides legal information and questions — not legal advice.
          </p>
        </div>
      </div>

      <div className="pb-8 px-4">
        <TrustBadges variant="compact" />
      </div>
    </div>
  );
}
