"use client";
/**
 * /partner/dashboard — Partner self-service dashboard.
 *
 * 6 sections: Toolkit, Ready-to-Send Messages, Earnings, Recent Activity,
 * Payment Settings, Profile. Auth via session cookie.
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { QRCode } from "@/components/QRCode";
import { MessageTemplates } from "@/components/MessageTemplates";
import { formatCents, formatDate } from "@/lib/format";
import { tierDisplayName } from "@/lib/tiers";
import { copyToClipboard } from "@/lib/clipboard";
import { SITE_URL, CONTACT_EMAIL } from "@/lib/site";

interface PartnerData {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  promo_code: string | null;
  commission_rate: number;
  preferred_payment_method: string | null;
  payment_zelle: string | null;
  payment_venmo: string | null;
  payment_check_address: string | null;
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
  const [partner, setPartner] = useState<PartnerData | null>(null);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Payment settings form
  const [payMethod, setPayMethod] = useState("");
  const [payZelle, setPayZelle] = useState("");
  const [payVenmo, setPayVenmo] = useState("");
  const [payCheckAddress, setPayCheckAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Copy state
  const [codeCopied, setCodeCopied] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);

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

      // Initialize payment form
      setPayMethod(data.partner.preferred_payment_method || "");
      setPayZelle(data.partner.payment_zelle || "");
      setPayVenmo(data.partner.payment_venmo || "");
      setPayCheckAddress(data.partner.payment_check_address || "");
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

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/partner/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferred_payment_method: payMethod || null,
          payment_zelle: payZelle || null,
          payment_venmo: payVenmo || null,
          payment_check_address: payCheckAddress || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Failed to save payment settings");
    } finally {
      setSaving(false);
    }
  }

  async function handleCopy(text: string, type: "code" | "url") {
    const ok = await copyToClipboard(text);
    if (!ok) return;
    if (type === "code") {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } else {
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center" role="status" aria-label="Loading dashboard">
        <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error && !partner) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-red-400">
        {error}
      </div>
    );
  }

  if (!partner || !earnings) return null;

  const referralUrl = partner.promo_code ? `${SITE_URL}/r/${partner.promo_code}` : "";

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="border-b border-zinc-500">
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
        {error && (
          <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-2 rounded-lg text-sm">
            {error}
            <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-200">
              Dismiss
            </button>
          </div>
        )}

        {/* ── Section 1: Your Toolkit ── */}
        <section className="bg-zinc-900 rounded-xl border border-zinc-500 p-6">
          <h2 className="text-xl font-bold mb-4">Your Toolkit</h2>
          {referralUrl ? (
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-zinc-400 mb-1">Your Promo Code</p>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-mono font-bold text-amber-400">
                    {partner.promo_code}
                  </span>
                  <button
                    onClick={() => handleCopy(partner.promo_code || "", "code")}
                    className="text-xs px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700"
                  >
                    {codeCopied ? "Copied!" : "Copy"}
                  </button>
                </div>

                <p className="text-sm text-zinc-400 mt-4 mb-1">Your Referral URL</p>
                <div className="flex items-center gap-2">
                  <code className="text-sm text-amber-300 bg-zinc-800 px-3 py-1.5 rounded-lg break-all">
                    {referralUrl}
                  </code>
                  <button
                    onClick={() => handleCopy(referralUrl, "url")}
                    className="text-xs px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 shrink-0"
                  >
                    {urlCopied ? "Copied!" : "Copy"}
                  </button>
                </div>

                <a
                  href={referralUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-4 text-sm text-amber-400 hover:text-amber-300"
                >
                  Preview what your clients see &rarr;
                </a>
              </div>

              <div className="flex justify-center">
                <QRCode url={referralUrl} size={160} />
              </div>
            </div>
          ) : (
            <p className="text-zinc-400">Your promo code is being set up. Check back shortly.</p>
          )}
        </section>

        {/* ── Section 2: Ready-to-Send Messages ── */}
        <section className="bg-zinc-900 rounded-xl border border-zinc-500 p-6">
          <h2 className="text-xl font-bold mb-4">Ready-to-Send Messages</h2>
          <MessageTemplates
            promoCode={partner.promo_code || ""}
            referralUrl={referralUrl}
          />
        </section>

        {/* ── Section 3: Your Earnings ── */}
        <section className="bg-zinc-900 rounded-xl border border-zinc-500 p-6">
          <h2 className="text-xl font-bold mb-4">Your Earnings</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-zinc-400">Total Earned</p>
              <p className="text-2xl font-bold text-green-400">
                {formatCents(earnings.total_earned)}
              </p>
            </div>
            <div>
              <p className="text-sm text-zinc-400">Pending Payout</p>
              <p className="text-2xl font-bold text-amber-400">
                {formatCents(earnings.pending_payout)}
              </p>
            </div>
            <div>
              <p className="text-sm text-zinc-400">Total Paid</p>
              <p className="text-2xl font-bold">{formatCents(earnings.total_paid)}</p>
            </div>
            <div>
              <p className="text-sm text-zinc-400">Total Referrals</p>
              <p className="text-2xl font-bold">{earnings.total_referrals}</p>
            </div>
          </div>

          {/* Payout History */}
          {payouts.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-medium text-zinc-400 mb-2">Payout History</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-zinc-400 border-b border-zinc-500">
                      <th className="text-left py-2 pr-4">Date</th>
                      <th className="text-right py-2 pr-4">Amount</th>
                      <th className="text-left py-2">Method</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payouts.map((p) => (
                      <tr key={p.id} className="border-b border-zinc-500/50">
                        <td className="py-2 pr-4">{formatDate(p.created_at)}</td>
                        <td className="py-2 pr-4 text-right text-green-400">
                          {formatCents(p.amount)}
                        </td>
                        <td className="py-2 capitalize">{p.payment_method}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* ── Section 4: Recent Activity ── */}
        <section className="bg-zinc-900 rounded-xl border border-zinc-500 p-6">
          <h2 className="text-xl font-bold mb-4">Recent Activity</h2>
          {referrals.length === 0 ? (
            <p className="text-zinc-400">No referrals yet. Share your code to get started.</p>
          ) : (
            <div className="space-y-2">
              {referrals.slice(0, 20).map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between py-2 border-b border-zinc-500/50"
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

        {/* ── Section 5: Payment Settings ── */}
        <section className="bg-zinc-900 rounded-xl border border-zinc-500 p-6">
          <h2 className="text-xl font-bold mb-4">Payment Settings</h2>
          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div>
              <label htmlFor="pay-method" className="block text-sm text-zinc-400 mb-1">
                Preferred Payment Method
              </label>
              <select
                id="pay-method"
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
                className="w-full px-4 py-2 bg-zinc-800 rounded-lg border border-zinc-700 text-white"
              >
                <option value="">Select...</option>
                <option value="zelle">Zelle</option>
                <option value="venmo">Venmo</option>
                <option value="check">Check (mailed)</option>
              </select>
            </div>

            {payMethod === "zelle" && (
              <div>
                <label htmlFor="pay-zelle" className="block text-sm text-zinc-400 mb-1">
                  Zelle Email or Phone
                </label>
                <input
                  id="pay-zelle"
                  type="text"
                  value={payZelle}
                  onChange={(e) => setPayZelle(e.target.value)}
                  placeholder="your@email.com or (555) 123-4567"
                  className="w-full px-4 py-2 bg-zinc-800 rounded-lg border border-zinc-700 text-white"
                />
              </div>
            )}

            {payMethod === "venmo" && (
              <div>
                <label htmlFor="pay-venmo" className="block text-sm text-zinc-400 mb-1">
                  Venmo Handle
                </label>
                <input
                  id="pay-venmo"
                  type="text"
                  value={payVenmo}
                  onChange={(e) => setPayVenmo(e.target.value)}
                  placeholder="@your-venmo"
                  className="w-full px-4 py-2 bg-zinc-800 rounded-lg border border-zinc-700 text-white"
                />
              </div>
            )}

            {payMethod === "check" && (
              <div>
                <label htmlFor="pay-check-address" className="block text-sm text-zinc-400 mb-1">
                  Mailing Address
                </label>
                <textarea
                  id="pay-check-address"
                  value={payCheckAddress}
                  onChange={(e) => setPayCheckAddress(e.target.value)}
                  placeholder="Street, City, State, ZIP"
                  rows={3}
                  className="w-full px-4 py-2 bg-zinc-800 rounded-lg border border-zinc-700 text-white"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 disabled:opacity-50"
            >
              {saving ? "Saving..." : saved ? "Saved!" : "Save Settings"}
            </button>
          </form>
        </section>

        {/* ── Section 6: Profile ── */}
        <section className="bg-zinc-900 rounded-xl border border-zinc-500 p-6">
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
