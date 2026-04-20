"use client";
/**
 * Partner Payment Settings form, Zelle, Venmo, PayPal, Check.
 * Extracted from dashboard page. Manages its own form state.
 */

import { useState } from "react";

interface PaymentSettingsFormProps {
  initialMethod: string;
  initialZelle: string;
  initialVenmo: string;
  initialCheckAddress: string;
  initialPaypal: string;
  onError: (msg: string) => void;
}

export function PaymentSettingsForm({
  initialMethod,
  initialZelle,
  initialVenmo,
  initialCheckAddress,
  initialPaypal,
  onError,
}: PaymentSettingsFormProps) {
  const [payMethod, setPayMethod] = useState(initialMethod);
  const [payZelle, setPayZelle] = useState(initialZelle);
  const [payVenmo, setPayVenmo] = useState(initialVenmo);
  const [payCheckAddress, setPayCheckAddress] = useState(initialCheckAddress);
  const [payPaypal, setPayPaypal] = useState(initialPaypal);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
          payment_paypal: payPaypal || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      onError("Failed to save payment settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="bg-zinc-900 rounded-xl border border-zinc-700 p-6">
      <h2 className="text-xl font-bold mb-4">Where to send your money</h2>
      <form onSubmit={handleSaveSettings} className="space-y-4">
        <div>
          <label htmlFor="pay-method" className="block text-sm text-zinc-400 mb-1">
            How you want to get paid
          </label>
          <select
            id="pay-method"
            value={payMethod}
            onChange={(e) => setPayMethod(e.target.value)}
            className="w-full px-4 py-3 bg-zinc-800 rounded-lg border border-zinc-700 text-white focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            <option value="">Pick one...</option>
            <option value="zelle">Zelle</option>
            <option value="venmo">Venmo</option>
            <option value="paypal">PayPal</option>
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
              className="w-full px-4 py-3 bg-zinc-800 rounded-lg border border-zinc-700 text-white focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
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
              className="w-full px-4 py-3 bg-zinc-800 rounded-lg border border-zinc-700 text-white focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>
        )}

        {payMethod === "paypal" && (
          <div>
            <label htmlFor="pay-paypal" className="block text-sm text-zinc-400 mb-1">
              PayPal Email
            </label>
            <input
              id="pay-paypal"
              type="email"
              value={payPaypal}
              onChange={(e) => setPayPaypal(e.target.value)}
              placeholder="your@email.com"
              className="w-full px-4 py-3 bg-zinc-800 rounded-lg border border-zinc-700 text-white focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
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
              className="w-full px-4 py-3 bg-zinc-800 rounded-lg border border-zinc-700 text-white focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="px-6 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 disabled:opacity-50 cursor-pointer"
          aria-live="polite"
        >
          {saving ? "Saving..." : saved ? "Saved!" : "Save Settings"}
        </button>
      </form>
    </section>
  );
}
