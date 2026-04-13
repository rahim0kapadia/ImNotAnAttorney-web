/**
 * /r/[code]/reminders — Court reminder sign-up page.
 *
 * Server component: looks up partner, sets ref cookie, renders form.
 * Accepts ?charge= and ?rec= query params from the quiz.
 */

import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CourtReminderForm } from "@/components/CourtReminderForm";
import { REFERRAL_COOKIE_MAX_AGE } from "@/lib/referral";
import { FadeInUp } from "@/components/motion/FadeInUp";

export const metadata: Metadata = {
  title: "Free Court Prep | ImNotAnAttorney",
  description:
    "Court date reminders, what to expect at your hearing, and how to prepare. Free — no account needed.",
  openGraph: {
    title: "Free Court Prep",
    description: "Court date reminders + what to expect at your hearing.",
    type: "website",
  },
};

interface PageProps {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ charge?: string; rec?: string }>;
}

export default async function CourtRemindersPage({ params, searchParams }: PageProps) {
  const { code } = await params;
  const { charge, rec } = await searchParams;

  const supabase = createAdminClient();
  const { data: partner } = await supabase
    .from("partners")
    .select("name, promo_code, status")
    .eq("promo_code", code.toUpperCase())
    .eq("status", "approved")
    .limit(1)
    .maybeSingle();

  if (!partner) {
    redirect("/");
  }

  // Set referral cookie
  const cookieStore = await cookies();
  cookieStore.set("ref", partner.promo_code!, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: REFERRAL_COOKIE_MAX_AGE,
    path: "/",
  });

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="max-w-lg w-full">
          <FadeInUp delay={0}>
            <h1 className="font-display text-3xl md:text-4xl font-bold text-center mb-4 leading-tight">
              Don&apos;t miss your court date.
            </h1>
            <p className="text-lg text-zinc-300 text-center mb-8">
              Free reminders + what to expect at your hearing.
            </p>
          </FadeInUp>

          <FadeInUp delay={0.1}>
            <CourtReminderForm
              chargeType={charge}
              recommendedTier={rec}
              partnerPromoCode={partner.promo_code!}
            />
          </FadeInUp>
        </div>
      </div>
    </div>
  );
}
