import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { CourtReminderForm } from "@/components/CourtReminderForm";
import { FadeInUp } from "@/components/motion/FadeInUp";
import { getPartnerByCode } from "@/lib/partner-by-code";
import { truncateName } from "@/lib/truncate-name";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  if (process.env.NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED !== "true") {
    return { title: "Not Found | ImNotAnAttorney", robots: { index: false, follow: false } };
  }

  const { code } = await params;
  const partner = await getPartnerByCode(code);
  const referrer = truncateName(partner?.company || partner?.name || "a trusted partner");
  const title = `Set up your court check-in — ${referrer}`;
  const description = "Court check-in prompts, court date reminders, and what to expect at your hearing.";
  return {
    title: `${title} | ImNotAnAttorney`,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary", title, description },
  };
}

interface PageProps {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ charge?: string; rec?: string }>;
}

export default async function CheckInSignupPage({ params, searchParams }: PageProps) {
  if (process.env.NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED !== "true") {
    notFound();
  }

  const { code } = await params;
  const { charge, rec } = await searchParams;

  const partner = await getPartnerByCode(code);

  if (!partner) notFound();
  if (!partner.promo_code) notFound();
  if (partner.check_in_enabled === false) {
    redirect(`/court-date/${code}`);
  }

  const partnerName = truncateName(partner.company || partner.name);

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="max-w-lg w-full">
          <FadeInUp delay={0}>
            <p className="text-amber-400 text-xs uppercase tracking-[0.2em] text-center mb-3">
              From your bondsman
            </p>
            <h1 className="font-display text-3xl md:text-4xl font-bold text-center mb-4 leading-tight">
              Set up your court check-in.
            </h1>
            <p className="text-lg text-zinc-300 text-center mb-6">
              <span className="text-amber-400 font-semibold break-words">{partnerName}</span> set this up for you.
            </p>
            <ul className="text-zinc-300 text-base mb-4 space-y-2 list-disc pl-6">
              <li>Court-date reminders (SMS + email)</li>
              <li>Check-in prompts between now and your hearing</li>
              <li>A walkthrough of what happens in the courtroom</li>
              <li>The questions your attorney should be answering for you</li>
            </ul>
            <p className="text-zinc-400 text-sm text-center mb-8">
              15,386 judges researched. 33,000+ cases analyzed.
            </p>
          </FadeInUp>

          <FadeInUp delay={0.1}>
            <CourtReminderForm
              chargeType={charge}
              recommendedTier={rec}
              partnerPromoCode={partner.promo_code}
              compactMode
              requirePhone
              requireConsent
              submitLabel="Start My Check-Ins"
              redirectTo={`/r/${partner.promo_code}/quiz`}
            />
            <p className="text-amber-400 font-bold text-center mt-6">
              Because {partnerName} sent you, 10% off case analysis is built in.
            </p>
            <p className="text-zinc-400 text-sm text-center mt-1">
              Already applied at checkout. No code to remember.
            </p>
            <p className="text-zinc-400 text-xs text-center mt-2">
              First reminder lands within 10 minutes. Free until your court date.
            </p>
            <p className="text-zinc-400 text-xs text-center mt-6">
              ImNotAnAttorney provides legal information and questions, not legal advice.
            </p>
          </FadeInUp>
        </div>
      </div>
    </div>
  );
}
