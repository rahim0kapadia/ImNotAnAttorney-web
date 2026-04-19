"use client";
/**
 * /partner/dashboard, Partner self-service dashboard.
 *
 * 9 sections: Toolkit, Ready-to-Send Messages, Creative Assets, Compliance Kit,
 * Earnings, Analytics, Recent Activity, Payment Settings, Profile.
 * Auth via session cookie.
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ToolkitSection } from "@/components/partner/ToolkitSection";
import { MessageTemplates } from "@/components/MessageTemplates";
import { CreativeAssets } from "@/components/partner/CreativeAssets";
import { ComplianceKit } from "@/components/partner/ComplianceKit";
import { EarningsSection } from "@/components/partner/EarningsSection";
import { PartnerAnalytics, type AnalyticsData } from "@/components/partner/PartnerAnalytics";
import { ConversionFunnel, EMPTY_FUNNEL, type FunnelState } from "@/components/partner/ConversionFunnel";
import { PaymentSettingsForm } from "@/components/partner/PaymentSettingsForm";
import { ClientTracker } from "@/components/partner/ClientTracker";
import { FtaCalculator } from "@/components/partner/FtaCalculator";
import { ComplianceReportButton } from "@/components/partner/ComplianceReportButton";
import { AddClientModal } from "@/components/partner/AddClientModal";
import { NotificationSettings } from "@/components/partner/NotificationSettings";
import { WorkflowToggle } from "@/components/partner/WorkflowToggle";
import { FlipBanner } from "@/components/partner/FlipBanner";
import { ForfeitureSavedHero } from "@/components/partner/ForfeitureSavedHero";
import { RemindersOnYourBehalf, type ReminderFeedItem } from "@/components/partner/RemindersOnYourBehalf";
import { PeerBenchmark, type PeerBenchmarkData } from "@/components/partner/PeerBenchmark";
import { formatDate } from "@/lib/format";
import { tierDisplayName } from "@/lib/tiers";
import { formatCents } from "@/lib/format";
import { SITE_URL, CONTACT_EMAIL } from "@/lib/site";
import { computePartnerUrl, isCheckInMode } from "@/lib/partner-mode";
import { type Partner } from "@/lib/partner-data";

interface CourtClient {
  id: string;
  token: string;
  first_name: string;
  charge_type: string;
  county_state: string;
  court_date: string;
  status: string;
  reminders_sent: string[];
  created_at: string;
  converted_at: string | null;
  check_in_days: string[] | null;
  check_in_source: string | null;
}

interface Earnings {
  total_earned: number;
  total_paid: number;
  pending_payout: number;
  total_referrals: number;
}

interface Referral {
  id: string;
  tier: string;
  sale_amount: number;
  commission_amount: number;
  commission_paid: boolean;
  created_at: string;
}

interface Payout {
  id: string;
  amount: number;
  payment_method: string;
  created_at: string;
}


export default function PartnerDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [partner, setPartner] = useState<Partner | null>(null);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData>({ monthly: [], by_tier: [], total_referrals: 0 });
  const [funnel, setFunnel] = useState<FunnelState>(EMPTY_FUNNEL);
  const [reminderSignups, setReminderSignups] = useState(0);
  const [protectedExposureCents, setProtectedExposureCents] = useState(0);
  const [clientsActive, setClientsActive] = useState(0);
  const [remindersSentThisMonth, setRemindersSentThisMonth] = useState(0);
  const [monthLabel, setMonthLabel] = useState("");
  const [reminderFeedItems, setReminderFeedItems] = useState<ReminderFeedItem[]>([]);
  const [peerBenchmark, setPeerBenchmark] = useState<PeerBenchmarkData | null>(null);
  const [courtClients, setCourtClients] = useState<CourtClient[]>([]);
  const [checkInSummary, setCheckInSummary] = useState<Record<string, { count: number; lastCheckIn: string | null }>>({});
  const [showAddClient, setShowAddClient] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch("/api/partner/dashboard");
      if (res.status === 401) {
        router.push("/partner/login");
        return;
      }
      if (!res.ok) throw new Error("Failed to load dashboard");
      const data = await res.json();
      setPartner(data.partner);
      setEarnings(data.earnings);
      setReferrals(data.referrals || []);
      setPayouts(data.payouts || []);
      setAnalytics(data.analytics || { monthly: [], by_tier: [], total_referrals: 0 });
      setFunnel(data.funnel || EMPTY_FUNNEL);
      setReminderSignups(data.reminderSignups ?? 0);
      setProtectedExposureCents(data.protectedExposureCents ?? 0);
      setClientsActive(data.clientsActive ?? 0);
      setRemindersSentThisMonth(data.remindersSentThisMonth ?? 0);
      setMonthLabel(data.monthLabel ?? "");
      setReminderFeedItems(data.reminderFeedItems || []);
      setPeerBenchmark(data.peerBenchmark ?? null);
      setCourtClients(data.courtClients || []);
      setCheckInSummary(data.checkInSummary || {});
    } catch {
      setError("Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  async function handleLogout() {
    await fetch("/api/partner/logout", { method: "POST" });
    router.push("/partner/login");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center" role="status" aria-label="Loading dashboard">
        <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full motion-safe:animate-spin" />
      </div>
    );
  }

  if (error && !partner) {
    return (
      <div role="alert" className="min-h-screen bg-zinc-950 flex items-center justify-center text-red-400">
        {error}
      </div>
    );
  }

  if (!partner || !earnings) return null;

  // Bondsman-modes v2 feature flag. When off, link is always /r/{code}.
  // When on, link routes to mode-specific preview (checkin/* vs court-date/*).
  const toggleEnabled = process.env.NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED === "true";
  // NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED === "true" ternary is the toggle gate;
  // computePartnerUrl itself is env-free. Do NOT remove this guard without
  // updating the corresponding callers simultaneously.
  const referralUrl = partner.promo_code
    ? toggleEnabled
      ? computePartnerUrl(
          { promo_code: partner.promo_code, check_in_enabled: partner.check_in_enabled },
          SITE_URL,
        )
      : `${SITE_URL}/r/${partner.promo_code}`
    : "";
  const checkInEnabled = isCheckInMode(partner);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="border-b border-zinc-700">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-amber-400 font-bold text-lg">
            ImNotAnAttorney
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-zinc-400 text-sm">{partner.name}</span>
            <button
              onClick={handleLogout}
              className="text-sm text-zinc-400 hover:text-white"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        <h1 className="font-display text-2xl font-bold">Your Dashboard</h1>
        {error && (
          <div role="alert" className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-2 rounded-lg text-sm">
            {error}
            <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-200">
              Dismiss
            </button>
          </div>
        )}

        {/* Mode-flip banner, shows for 14 days after a workflow-mode switch */}
        {toggleEnabled && (
          <FlipBanner
            partnerUrl={referralUrl}
            checkInEnabled={checkInEnabled}
            flipAt={partner.flip_at ?? null}
          />
        )}

        {/* Forfeiture Shield hero, bondsman-native outcome surface. Only
            rendered for bondsman partners; other sources don't carry bond
            exposure as their value proposition. */}
        {partner.source === "bondsman" && (
          <>
            <ForfeitureSavedHero
              protectedExposureCents={protectedExposureCents}
              clientsActive={clientsActive}
              remindersSentThisMonth={remindersSentThisMonth}
              monthLabel={monthLabel}
              exposureIsEstimated
            />

            {clientsActive === 0 && (
              <section
                aria-labelledby="activation-checklist-heading"
                className="bg-zinc-900 rounded-xl border border-zinc-700 p-6"
              >
                <h2
                  id="activation-checklist-heading"
                  className="text-lg font-bold text-amber-400 mb-1"
                >
                  Get that number off zero in three moves
                </h2>
                <p className="text-xs text-zinc-400 mb-4">
                  The next bond you write is where your shield starts working.
                </p>
                <ol className="space-y-3 text-sm text-zinc-300 list-decimal list-inside">
                  <li>
                    Text your partner link to the next client you bond out.
                    It&apos;s in the Toolkit section below.
                  </li>
                  <li>
                    Print the compliance checklist and drop it in their bail
                    packet. Takes 90 seconds.
                  </li>
                  <li>
                    Watch the first reminder go out within 48 hours. You&apos;ll
                    see it show up on this dashboard.
                  </li>
                </ol>
              </section>
            )}

            {clientsActive > 0 && <RemindersOnYourBehalf items={reminderFeedItems} />}
          </>
        )}

        {/* Client Tracker, FTA Prevention Dashboard */}
        <ClientTracker
          clients={courtClients}
          onAddClient={() => setShowAddClient(true)}
          checkInSummary={checkInSummary}
          checkInEnabled={checkInEnabled}
        />

        {/* Compliance Report */}
        <div className="flex justify-end">
          <ComplianceReportButton />
        </div>

        {/* FTA Savings Calculator */}
        <FtaCalculator />

        {/* Add Client Modal */}
        <AddClientModal
          open={showAddClient}
          onClose={() => setShowAddClient(false)}
          onSuccess={() => fetchDashboard()}
        />

        {/* 1. Toolkit */}
        <ToolkitSection partner={partner} referralUrl={referralUrl} />

        {/* Workflow mode toggle, gated by bondsman-modes v2 flag.
            Placed adjacent to Toolkit because changing mode changes the toolkit link. */}
        {toggleEnabled && partner.promo_code && (
          <WorkflowToggle
            initialCheckInEnabled={checkInEnabled}
            promoCode={partner.promo_code}
            siteUrl={SITE_URL}
            onSaved={() => fetchDashboard()}
          />
        )}

        {/* Bail Packet Insert / Compliance Checklist, conditional on partner type */}
        {partner.source === "bondsman" ? (
          <Link
            href="/partner/checklist"
            className="block bg-zinc-900 rounded-xl border border-zinc-700 p-4 hover:border-amber-500/50 transition-colors group"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-amber-400 mb-1">Compliance Checklist</h3>
                <p className="text-sm text-zinc-400">Print a bail conditions checklist with court reminders. Hand to every client at bonding.</p>
              </div>
              <span className="text-zinc-500 group-hover:text-amber-400 transition-colors text-xl">&rarr;</span>
            </div>
          </Link>
        ) : (
          <Link
            href="/partner/card"
            className="block bg-zinc-900 rounded-xl border border-zinc-700 p-4 hover:border-amber-500/50 transition-colors group"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-amber-400 mb-1">Bail Packet Insert</h3>
                <p className="text-sm text-zinc-400">Print a full-page insert with your QR code. Drop it in every bail packet.</p>
              </div>
              <span className="text-zinc-500 group-hover:text-amber-400 transition-colors text-xl">&rarr;</span>
            </div>
          </Link>
        )}

        {/* How your link works */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-4">
          <h3 className="font-bold text-amber-400 mb-2">How your link works</h3>
          <p className="text-sm text-zinc-300">
            When clients use your link, they take a quick quiz and get a product recommendation.
            They can also set up free court prep, date reminders + what to expect at their hearing.
            You earn commission whether they buy now or later through a reminder.
          </p>
        </div>

        {/* 2. Ready-to-Send Messages */}
        <section className="bg-zinc-900 rounded-xl border border-zinc-700 p-6">
          <h2 className="text-xl font-bold mb-4">Texts to send your clients</h2>
          <MessageTemplates
            promoCode={partner.promo_code || ""}
            referralUrl={referralUrl}
            checkInEnabled={checkInEnabled}
          />
        </section>

        {/* 3. Creative Assets */}
        <CreativeAssets
          promoCode={partner.promo_code || ""}
          referralUrl={referralUrl}
          checkInEnabled={checkInEnabled}
        />

        {/* 4. Compliance Kit */}
        <ComplianceKit />

        {/* 5. Earnings + Tier Progress */}
        <EarningsSection partner={partner} earnings={earnings} payouts={payouts} />

        {/* 5b. Peer Benchmark, only when >= 10 eligible bondsman peers (API-guarded) */}
        {peerBenchmark && <PeerBenchmark data={peerBenchmark} />}

        {/* 6. Analytics */}
        <PartnerAnalytics analytics={analytics} />

        {/* 6b. Conversion Funnel */}
        <ConversionFunnel funnel={funnel} />

        {/* 7. Recent Activity */}
        <section className="bg-zinc-900 rounded-xl border border-zinc-700 p-6">
          <h2 className="text-xl font-bold mb-4">Clients you&apos;ve referred</h2>
          {referrals.length === 0 ? (
            <p className="text-zinc-400">No clients yet. Text your link to the next one you bond out &mdash; we handle the rest.</p>
          ) : (
            <div className="space-y-2">
              {referrals.slice(0, 20).map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between py-2 border-b border-zinc-700/50"
                >
                  <div>
                    <span className="text-zinc-400 text-sm">{formatDate(r.created_at)}</span>
                    <span className="text-white text-sm ml-3">{tierDisplayName(r.tier)}</span>
                  </div>
                  <span className="text-amber-400 font-medium text-sm">
                    {formatCents(r.commission_amount)} earned
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 8. Payment Settings */}
        <PaymentSettingsForm
          initialMethod={partner.preferred_payment_method || ""}
          initialZelle={partner.payment_zelle || ""}
          initialVenmo={partner.payment_venmo || ""}
          initialCheckAddress={partner.payment_check_address || ""}
          initialPaypal={partner.payment_paypal || ""}
          onError={(msg) => setError(msg)}
        />

        {/* Notification Preferences */}
        <NotificationSettings hasPhone={!!partner.phone} />

        {/* 9. Profile */}
        <section className="bg-zinc-900 rounded-xl border border-zinc-700 p-6">
          <h2 className="text-xl font-bold mb-4">Your info (shows on every flyer)</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-zinc-400">Name</p>
              <p>{partner.name}</p>
            </div>
            <div>
              <p className="text-zinc-400">Email</p>
              <p>{partner.email}</p>
            </div>
            <div>
              <p className="text-zinc-400">Phone</p>
              <p>{partner.phone || ", "}</p>
            </div>
            <div>
              <p className="text-zinc-400">Company</p>
              <p>{partner.company || ", "}</p>
            </div>
          </div>
          <p className="text-zinc-400 text-sm mt-4">
            Need to update your info? Email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-amber-400 hover:text-amber-300">
              {CONTACT_EMAIL}
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
