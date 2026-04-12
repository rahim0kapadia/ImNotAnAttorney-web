"use client";
/**
 * /partner/dashboard — Partner self-service dashboard.
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
import { PaymentSettingsForm } from "@/components/partner/PaymentSettingsForm";
import { formatDate } from "@/lib/format";
import { tierDisplayName } from "@/lib/tiers";
import { formatCents } from "@/lib/format";
import { SITE_URL, CONTACT_EMAIL } from "@/lib/site";
import { type Partner } from "@/lib/partner-data";

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

  const referralUrl = partner.promo_code ? `${SITE_URL}/r/${partner.promo_code}` : "";

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
        <h1 className="font-display text-2xl font-bold">Partner Dashboard</h1>
        {error && (
          <div role="alert" className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-2 rounded-lg text-sm">
            {error}
            <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-200">
              Dismiss
            </button>
          </div>
        )}

        {/* 1. Toolkit */}
        <ToolkitSection partner={partner} referralUrl={referralUrl} />

        {/* 2. Ready-to-Send Messages */}
        <section className="bg-zinc-900 rounded-xl border border-zinc-700 p-6">
          <h2 className="text-xl font-bold mb-4">Ready-to-Send Messages</h2>
          <MessageTemplates
            promoCode={partner.promo_code || ""}
            referralUrl={referralUrl}
          />
        </section>

        {/* 3. Creative Assets */}
        <CreativeAssets
          promoCode={partner.promo_code || ""}
          referralUrl={referralUrl}
        />

        {/* 4. Compliance Kit */}
        <ComplianceKit />

        {/* 5. Earnings + Tier Progress */}
        <EarningsSection partner={partner} earnings={earnings} payouts={payouts} />

        {/* 6. Analytics */}
        <PartnerAnalytics analytics={analytics} />

        {/* 7. Recent Activity */}
        <section className="bg-zinc-900 rounded-xl border border-zinc-700 p-6">
          <h2 className="text-xl font-bold mb-4">Recent Activity</h2>
          {referrals.length === 0 ? (
            <p className="text-zinc-400">No referrals yet. Share your code to get started.</p>
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

        {/* 9. Profile */}
        <section className="bg-zinc-900 rounded-xl border border-zinc-700 p-6">
          <h2 className="text-xl font-bold mb-4">Profile</h2>
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
              <p>{partner.phone || "—"}</p>
            </div>
            <div>
              <p className="text-zinc-400">Company</p>
              <p>{partner.company || "—"}</p>
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
