/**
 * /r/[code]/reminders, Court reminder sign-up page.
 *
 * Server component: looks up partner, sets ref cookie, renders form.
 * Accepts ?charge= and ?rec= query params from the quiz.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { CourtReminderForm } from "@/components/CourtReminderForm";
import { FadeInUp } from "@/components/motion/FadeInUp";

export async function generateMetadata(): Promise<Metadata> {
  // Per-partner reminder opt-in pages are not canonical surfaces; canonical
  // lives at / and /reminders. Noindex unconditionally so expired-link states
  // never get indexed with success-flavored metadata.
  return {
    title: "Free Court Prep | ImNotAnAttorney",
    description:
      "Court date reminders, what to expect at your hearing, and how to prepare. Free, no account needed.",
    robots: { index: false, follow: true },
    openGraph: {
      title: "Free Court Prep",
      description: "Court date reminders + what to expect at your hearing.",
      type: "website",
    },
  };
}

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
    .select("name, company, promo_code, status")
    .eq("promo_code", code.toUpperCase())
    .eq("status", "approved")
    .limit(1)
    .maybeSingle();

  if (!partner) {
    return (
      <main className="min-h-screen bg-zinc-950 text-white flex flex-col">
        <div className="flex-1 flex items-center justify-center px-4 py-16">
          <div className="max-w-lg w-full text-center">
            <FadeInUp delay={0}>
              <h1 className="font-display text-3xl md:text-4xl font-bold mb-4 leading-tight">
                This link expired. Your reminders don&apos;t have to.
              </h1>
              <p className="text-lg text-zinc-300 mb-6">
                Ask your bondsman to resend it, or start here to set up reminders on your own.
              </p>
              <Link
                href="/"
                className="inline-flex items-center justify-center min-h-[44px] px-6 py-3 rounded-lg bg-amber-500 text-black font-semibold hover:bg-amber-400 transition-colors"
              >
                Set up free court reminders
              </Link>
            </FadeInUp>
          </div>
        </div>
      </main>
    );
  }

  const partnerDisplay = partner.company || partner.name;

  // Referral cookie is set by middleware (Next.js 16, cookies().set() not allowed in Server Components)

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="max-w-lg w-full">
          <FadeInUp delay={0}>
            <h1 className="font-display text-3xl md:text-4xl font-bold text-center mb-4 leading-tight">
              Miss court, lose the bond.
              <br />
              {partnerDisplay} set this up. Your turn to opt in.
            </h1>
            <p className="text-lg text-zinc-300 text-center mb-4">
              Missing court costs both of you. Your bond can get forfeited, a warrant can get issued, new charges can stack.
              Reminders at 7 days, 3 days, and day-of keep the court date in
              front of you; showing up keeps the bond intact.
            </p>
            <p className="text-zinc-300 text-center mb-4">
              Plus a walkthrough of what actually happens at your hearing, so you know what you&apos;re walking into.
            </p>
            <p className="text-zinc-400 text-sm text-center mb-8">
              No account. No credit card. Just your number. Opt out any time.
            </p>
          </FadeInUp>

          <FadeInUp delay={0.1}>
            <CourtReminderForm
              chargeType={charge}
              recommendedTier={rec}
              partnerPromoCode={partner.promo_code!}
            />
          </FadeInUp>

          {/* Why take the quiz — upsell back to the intake path for
              defendants who came straight to reminders. Reminders keep
              you on the date; the quiz surfaces case-specific questions
              for your attorney. Different job, different value. */}
          <FadeInUp delay={0.2}>
            <aside className="mt-10 rounded-xl border border-zinc-700 bg-zinc-900/60 p-5">
              <h2 className="text-base font-bold text-amber-400 mb-2">
                Reminders keep you on the date. The 3-minute quiz gives you
                something else.
              </h2>
              <p className="text-sm text-zinc-300 mb-4">
                Showing up is step one. Showing up with the right questions
                is step two. The quiz reads your charge type and hands you
                15&ndash;50 questions sourced from 33,000+ classified opinions
                &ndash; the ones your attorney hopes you never ask.
              </p>
              <Link
                href={`/r/${partner.promo_code}/quiz`}
                className="inline-flex min-h-[44px] items-center rounded-lg border border-amber-500 px-4 py-2 text-sm font-semibold text-amber-400 hover:bg-amber-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
              >
                Take the 3-minute quiz &rarr;
              </Link>
            </aside>
          </FadeInUp>
        </div>
      </div>
    </div>
  );
}
