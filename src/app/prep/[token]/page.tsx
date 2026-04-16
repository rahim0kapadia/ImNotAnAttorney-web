/**
 * /prep/[token], Personalized court prep page.
 *
 * Shows court date countdown, what to expect, what to bring,
 * and a product recommendation. Refreshes partner ref cookie
 * on every visit for attribution.
 *
 * Free content = court logistics. Paid = case-specific intelligence.
 */

import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  CHARGE_DISPLAY_NAMES,
  PREP_PAGE_EXPIRY_DAYS,
} from "@/lib/court-reminders";
import { getInsiderTips, getAttorneyQuestions, getWhatHappensNext } from "@/lib/prep-content";
import type { PrepSection } from "@/lib/prep-content";
import { queryPrepData, parseStateCode } from "@/lib/prep-data";
import { TIER_CORE } from "@/lib/tiers";
import { calculatePartnerDiscount } from "@/lib/referral";
import { CheckInButton } from "@/components/partner/CheckInButton";
import { PhoneOptIn } from "@/components/PhoneOptIn";
import { ClientNotificationSettings } from "@/components/ClientNotificationSettings";

interface PageProps {
  params: Promise<{ token: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("court_reminders")
    .select("county_state, charge_type, court_date")
    .eq("token", token)
    .maybeSingle();

  if (!data) {
    return { title: "Court Prep | ImNotAnAttorney" };
  }

  const chargeName = CHARGE_DISPLAY_NAMES[data.charge_type] || "Criminal Charges";
  return {
    title: `Court Prep, ${data.county_state} | ImNotAnAttorney`,
    description: `Your court date is ${data.court_date}. Here's what to expect and how to prepare.`,
    openGraph: {
      title: `Court Prep, ${chargeName}`,
      description: `Your court date is ${data.court_date}. What to expect at your hearing.`,
    },
  };
}

export default async function PrepPage({ params }: PageProps) {
  const { token } = await params;
  const supabase = createAdminClient();

  const { data: reminder } = await supabase
    .from("court_reminders")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (!reminder || reminder.status === "unsubscribed") {
    notFound();
  }

  // Check expiration (30 days past court date)
  const courtDate = new Date(reminder.court_date + "T00:00:00");
  const expiryDate = new Date(courtDate);
  expiryDate.setDate(expiryDate.getDate() + PREP_PAGE_EXPIRY_DAYS);
  const isExpired = new Date() > expiryDate;

  if (isExpired) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold mb-4">This prep page has expired</h1>
          <p className="text-zinc-400 mb-8">Your court date has passed. If your case is ongoing, explore our services.</p>
          <Link href="/services" className="inline-block px-8 py-3 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition-colors">
            Explore Services
          </Link>
        </div>
      </div>
    );
  }

  // Note: ref cookie refresh for /prep/[token] is not handled by middleware
  // (only /r/[code] routes set cookies). Attribution works because the original
  // /r/[code] visit already set the 90-day cookie, and checkout reads it.

  // Calculate countdown
  const now = new Date();
  const diffMs = courtDate.getTime() - now.getTime();
  const daysUntil = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const courtPassed = daysUntil < 0;

  // Partner branding, show company name on prep page
  let partnerCompany: string | null = null;
  if (reminder.partner_promo_code) {
    const { data: partnerData } = await supabase
      .from("partners")
      .select("company, name")
      .eq("promo_code", reminder.partner_promo_code)
      .maybeSingle();
    partnerCompany = partnerData?.company || partnerData?.name || null;
  }

  // Last check-in for CheckInButton
  const { data: lastCheckInRow } = await supabase
    .from("client_check_ins")
    .select("checked_in_at")
    .eq("court_reminder_id", reminder.id)
    .order("checked_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const chargeName = CHARGE_DISPLAY_NAMES[reminder.charge_type] || "Criminal Charges";
  const stateCode = parseStateCode(reminder.county_state);
  const stateName = stateCode || reminder.county_state;

  // Fetch aggregate data for data-driven sections
  const prepData = await queryPrepData(reminder.charge_type, reminder.county_state);

  // Static content
  const insiderTips = getInsiderTips();
  const attorneyQuestions = getAttorneyQuestions(chargeName);
  const whatHappensNext = getWhatHappensNext();

  // Product recommendation
  const tier = reminder.recommended_tier ? TIER_CORE[reminder.recommended_tier as keyof typeof TIER_CORE] : null;
  const discount = tier ? calculatePartnerDiscount(tier.price) : null;

  // Checkout URL with reminder token for conversion tracking
  const checkoutUrl = tier
    ? `/checkout?tier=${reminder.recommended_tier}${reminder.partner_promo_code ? `&ref=${reminder.partner_promo_code}` : ""}&reminder_token=${token}`
    : "/services";

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-16">
        {/* Partner branding */}
        {partnerCompany && (
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl px-6 py-4 mb-8 text-center">
            <p className="text-zinc-400 text-sm">Court prep provided by</p>
            <p className="text-white text-lg font-bold mt-1">{partnerCompany}</p>
            <p className="text-zinc-500 text-xs mt-1">Powered by ImNotAnAttorney</p>
          </div>
        )}

        {/* Check-In Button, only before court date */}
        {!courtPassed && (
          <CheckInButton token={token} lastCheckIn={lastCheckInRow?.checked_in_at ?? null} />
        )}

        {/* SMS Text Reminders, only before court date */}
        {!courtPassed && (
          <div className="mb-8">
            <PhoneOptIn token={token} hasPhone={!!reminder.phone} />
            {reminder.phone && <ClientNotificationSettings token={token} />}
          </div>
        )}

        {/* Section A: Countdown */}
        <section className="text-center mb-12">
          {courtPassed ? (
            <>
              <p className="text-zinc-400 text-lg mb-2">Your court date was</p>
              <p className="text-2xl font-bold">{courtDate.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
              <p className="text-zinc-400 mt-2">If your case is ongoing, talk to your attorney about next steps.</p>
            </>
          ) : (
            <>
              <p className="text-zinc-400 text-lg mb-2">Your court date is in</p>
              <p className="text-5xl font-bold text-amber-400 mb-2">{daysUntil} day{daysUntil !== 1 ? "s" : ""}</p>
              <p className="text-xl text-zinc-300">
                {courtDate.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                {", "}{reminder.county_state}
              </p>
            </>
          )}
        </section>

        {/* Insider Tips (3 sections, always render) */}
        {insiderTips.map((section) => (
          <PrepSectionBlock key={section.title} section={section} />
        ))}

        {/* Data-Driven: Your Charge in [State] */}
        {prepData.statute && (
          <section className="mb-10">
            <h2 className="font-display text-2xl font-bold text-amber-400 mb-4">
              Your Charge in {stateName}
            </h2>
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 space-y-3">
              {prepData.statute.statute_number && (
                <div className="flex justify-between">
                  <span className="text-zinc-400">Statute</span>
                  <span className="text-zinc-200 text-right">{prepData.statute.statute_number}{prepData.statute.statute_title ? `, ${prepData.statute.statute_title}` : ""}</span>
                </div>
              )}
              {prepData.statute.offense_class && (
                <div className="flex justify-between">
                  <span className="text-zinc-400">Offense class</span>
                  <span className="text-zinc-200">{prepData.statute.offense_class}</span>
                </div>
              )}
              {(prepData.statute.penalty_min || prepData.statute.penalty_max) && (
                <div className="flex justify-between">
                  <span className="text-zinc-400">Penalty range</span>
                  <span className="text-zinc-200">{prepData.statute.penalty_min} to {prepData.statute.penalty_max}</span>
                </div>
              )}
              {prepData.statute.fine_max && (
                <div className="flex justify-between">
                  <span className="text-zinc-400">Fine</span>
                  <span className="text-zinc-200">Up to ${prepData.statute.fine_max}</span>
                </div>
              )}
              {prepData.statute.mandatory_minimum && (
                <div className="flex justify-between">
                  <span className="text-zinc-400">Mandatory minimum</span>
                  <span className="text-zinc-200">{prepData.statute.mandatory_minimum}</span>
                </div>
              )}
              {prepData.statute.elements && prepData.statute.elements.length > 0 && (
                <div className="mt-3">
                  <p className="text-zinc-400 mb-2">Elements the prosecution must prove:</p>
                  <ul className="space-y-1">
                    {prepData.statute.elements.map((el, i) => (
                      <li key={i} className="text-zinc-300 flex items-start gap-2">
                        <span className="text-amber-400 mt-0.5">•</span>
                        {el}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Data-Driven: What Typically Happens */}
        {(prepData.outcomes.length > 0 || prepData.sentencing || prepData.benchJury.length > 0) && (
          <section className="mb-10">
            <h2 className="font-display text-2xl font-bold text-amber-400 mb-4">
              What Typically Happens in Cases Like Yours
            </h2>
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 space-y-3">
              {prepData.outcomes.map((o, i) => (
                <div key={i} className="space-y-2">
                  {o.conviction_rate != null && (
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Conviction rate{o.jurisdiction_level === "national" ? " (national)" : ""}</span>
                      <span className="text-zinc-200">{(o.conviction_rate * 100).toFixed(1)}%</span>
                    </div>
                  )}
                  {o.dismissal_rate != null && (
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Dismissal rate</span>
                      <span className="text-zinc-200">{(o.dismissal_rate * 100).toFixed(1)}%</span>
                    </div>
                  )}
                  {o.plea_rate != null && (
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Plea deal rate</span>
                      <span className="text-zinc-200">{(o.plea_rate * 100).toFixed(1)}%</span>
                    </div>
                  )}
                  {o.trial_rate != null && (
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Trial rate</span>
                      <span className="text-zinc-200">{(o.trial_rate * 100).toFixed(1)}%</span>
                    </div>
                  )}
                  {o.median_sentence_months != null && (
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Median sentence</span>
                      <span className="text-zinc-200">{o.median_sentence_months} months</span>
                    </div>
                  )}
                  {o.data_period && (
                    <p className="text-zinc-600 text-xs">Data period: {o.data_period}</p>
                  )}
                </div>
              ))}
              {prepData.sentencing && (
                <div className="space-y-2 border-t border-zinc-800 pt-3">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Median sentence ({stateName})</span>
                    <span className="text-zinc-200">{prepData.sentencing.median_months} months</span>
                  </div>
                  {prepData.sentencing.p25 != null && prepData.sentencing.p75 != null && (
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Typical range (25th–75th)</span>
                      <span className="text-zinc-200">{prepData.sentencing.p25}–{prepData.sentencing.p75} months</span>
                    </div>
                  )}
                  <p className="text-zinc-600 text-xs">Based on {prepData.sentencing.sample_size} cases</p>
                </div>
              )}
              {prepData.benchJury.length > 0 && (
                <div className="space-y-2 border-t border-zinc-800 pt-3">
                  <p className="text-zinc-400 text-sm font-medium">Bench vs. Jury Trials</p>
                  {prepData.benchJury.slice(0, 1).map((bj, i) => (
                    <div key={i} className="space-y-2">
                      {bj.bench_acquittal_rate != null && bj.jury_acquittal_rate != null && (
                        <div className="flex justify-between">
                          <span className="text-zinc-400">Acquittal rate</span>
                          <span className="text-zinc-200">Bench {(bj.bench_acquittal_rate * 100).toFixed(1)}% vs Jury {(bj.jury_acquittal_rate * 100).toFixed(1)}%</span>
                        </div>
                      )}
                      {bj.bench_median_sentence != null && bj.jury_median_sentence != null && (
                        <div className="flex justify-between">
                          <span className="text-zinc-400">Median sentence</span>
                          <span className="text-zinc-200">Bench {bj.bench_median_sentence}mo vs Jury {bj.jury_median_sentence}mo</span>
                        </div>
                      )}
                      {bj.trial_penalty_pct != null && (
                        <div className="flex justify-between">
                          <span className="text-zinc-400">Trial penalty</span>
                          <span className="text-zinc-200">{(bj.trial_penalty_pct * 100).toFixed(0)}% longer after trial vs plea</span>
                        </div>
                      )}
                      {bj.fiscal_year_range && (
                        <p className="text-zinc-600 text-xs">USSC data: {bj.fiscal_year_range}{bj.offense_category ? `, ${bj.offense_category}` : ""}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <p className="text-zinc-500 text-xs mt-3">
              These are aggregate statistics from public court records, not a prediction for your case. Every case is different. But knowing what typically happens helps you have informed conversations with your attorney.
            </p>
          </section>
        )}

        {/* Data-Driven: Common Defense Approaches */}
        {prepData.statute && ((prepData.statute.common_defenses && prepData.statute.common_defenses.length > 0) || (prepData.statute.defense_opportunities && prepData.statute.defense_opportunities.length > 0)) && (
          <section className="mb-10">
            <h2 className="font-display text-2xl font-bold text-amber-400 mb-4">
              Common Defense Approaches
            </h2>
            <ul className="space-y-2">
              {(prepData.statute.common_defenses || []).map((d, i) => (
                <li key={`d-${i}`} className="text-zinc-300 flex items-start gap-2">
                  <span className="text-amber-400 mt-0.5">•</span>
                  {d}
                </li>
              ))}
              {(prepData.statute.defense_opportunities || []).map((d, i) => (
                <li key={`o-${i}`} className="text-zinc-300 flex items-start gap-2">
                  <span className="text-amber-400 mt-0.5">•</span>
                  {d}
                </li>
              ))}
            </ul>
            <p className="text-zinc-500 text-xs mt-3">
              These are defense categories attorneys commonly explore for this charge type. Ask your attorney which apply to your situation.
            </p>
          </section>
        )}

        {/* Questions to Ask Your Attorney, always renders */}
        <PrepSectionBlock section={attorneyQuestions} highlight />

        {/* What Happens Next, always renders */}
        <PrepSectionBlock section={whatHappensNext} />

        {/* Section D: Product Recommendation / Quiz CTA */}
        {!courtPassed && (
          <section className="mt-12 bg-zinc-900 rounded-xl border border-zinc-700 p-6">
            <h2 className="font-display text-xl font-bold text-amber-400 mb-3">
              Want questions specific to YOUR case?
            </h2>
            <p className="text-zinc-300 mb-4">
              Your case has specific angles an attorney should investigate, charge-specific weaknesses, procedural requirements, and evidence standards. Our analysis identifies them and gives you the exact questions.
            </p>

            {tier && discount ? (
              <>
                {partnerCompany && (
                  <p className="text-amber-400/80 text-sm font-medium mb-3">
                    Exclusive rate through {partnerCompany}
                  </p>
                )}

                <div className="flex items-baseline gap-3 mb-4">
                  <span className="text-zinc-500 line-through text-lg">
                    ${(discount.original / 100).toFixed(0)}
                  </span>
                  <span className="text-3xl font-bold text-white">
                    ${(discount.discounted / 100).toFixed(2)}
                  </span>
                  <span className="text-amber-400 text-sm font-medium">
                    Save ${(discount.savings / 100).toFixed(0)}
                  </span>
                </div>

                <p className="text-zinc-400 text-sm mb-6">
                  {tier.name}, {tier.delivery}
                </p>

                <Link
                  href={checkoutUrl}
                  className="block w-full text-center px-6 py-4 bg-amber-500 text-black font-bold rounded-xl text-lg hover:bg-amber-400 hover:scale-[1.02] transition-all"
                >
                  Get Questions Specific to Your Case
                </Link>
              </>
            ) : (
              <>
                {partnerCompany && (
                  <p className="text-amber-400/80 text-sm font-medium mb-3">
                    Exclusive rates available through {partnerCompany}
                  </p>
                )}
                <p className="text-zinc-400 text-sm mb-6">
                  Take a 2-minute quiz. We&apos;ll tell you exactly which questions your attorney should be answering, based on your charge, your county, and your situation.
                </p>
                <Link
                  href={`/score${reminder.partner_promo_code ? `?ref=${reminder.partner_promo_code}` : ""}`}
                  className="block w-full text-center px-6 py-4 bg-amber-500 text-black font-bold rounded-xl text-lg hover:bg-amber-400 hover:scale-[1.02] transition-all"
                >
                  Take the Free Defense Quiz
                </Link>
              </>
            )}
          </section>
        )}

        {/* Section E: Footer */}
        <footer className="mt-12 pt-8 border-t border-zinc-800 text-center">
          <p className="text-zinc-500 text-sm">
            ImNotAnAttorney provides legal information, not legal advice.
          </p>
          <p className="text-zinc-600 text-xs mt-2">
            Reminders will be sent to {reminder.email} at 14, 7, 3, and 1 day(s) before your court date.
          </p>
          <a
            href={`/api/court-reminders/unsubscribe?token=${token}`}
            className="text-zinc-600 text-xs hover:text-zinc-400 mt-1 inline-block"
          >
            Unsubscribe from reminders
          </a>
        </footer>
      </div>
    </div>
  );
}

// ── Reusable section renderer ──────────────────────────────────
function PrepSectionBlock({ section, highlight }: { section: PrepSection; highlight?: boolean }) {
  return (
    <section className="mb-10">
      <h2 className={`font-display text-xl font-bold mb-3 ${highlight ? "text-2xl text-amber-400" : ""}`}>
        {section.title}
      </h2>
      <ul className="space-y-2">
        {section.items.map((item, i) => (
          <li key={i} className="text-zinc-300 flex items-start gap-2">
            <span className="text-amber-400 mt-0.5">•</span>
            {item}
          </li>
        ))}
      </ul>
      {section.framing && (
        <p className="text-zinc-500 text-xs mt-3">{section.framing}</p>
      )}
    </section>
  );
}
