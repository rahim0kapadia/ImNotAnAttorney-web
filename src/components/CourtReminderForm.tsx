"use client";
/**
 * Court reminder sign-up form.
 * 4 fields (charge type pre-filled from quiz if available).
 * Submits to /api/court-reminders, redirects to /prep/[token] on success.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CHARGE_DISPLAY_NAMES } from "@/lib/court-reminders";
import { CheckInDayPicker } from "@/components/partner/CheckInDayPicker";

interface CourtReminderFormProps {
  chargeType?: string;
  recommendedTier?: string;
  partnerPromoCode: string;
}

const CHARGE_OPTIONS = Object.entries(CHARGE_DISPLAY_NAMES).map(([slug, label]) => ({
  slug,
  label,
}));

export function CourtReminderForm({
  chargeType,
  recommendedTier,
  partnerPromoCode,
}: CourtReminderFormProps) {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [courtDate, setCourtDate] = useState("");
  const [countyState, setCountyState] = useState("");
  const [email, setEmail] = useState("");
  const [charge, setCharge] = useState(chargeType || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [checkInDays, setCheckInDays] = useState<string[]>([]);
  const [checkInIdk, setCheckInIdk] = useState(false);

  const showChargeField = !chargeType;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/court-reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName,
          email,
          charge_type: charge,
          county_state: countyState,
          court_date: courtDate,
          recommended_tier: recommendedTier,
          partner_promo_code: partnerPromoCode,
          check_in_days: checkInIdk ? null : (checkInDays.length > 0 ? checkInDays : undefined),
          check_in_idk: checkInIdk ? true : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }

      const { token } = await res.json();
      router.push(`/prep/${token}`);
    } catch {
      setError("Connection error. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto">
      <div>
        <label htmlFor="firstName" className="block text-sm font-medium text-zinc-300 mb-1">
          First name
        </label>
        <input
          id="firstName"
          type="text"
          required
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
          placeholder="Your first name"
        />
      </div>

      {showChargeField && (
        <div>
          <label htmlFor="chargeType" className="block text-sm font-medium text-zinc-300 mb-1">
            What are you charged with?
          </label>
          <select
            id="chargeType"
            required
            value={charge}
            onChange={(e) => setCharge(e.target.value)}
            className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-xl text-white focus:border-amber-500 focus:outline-none"
          >
            <option value="">Select your charge type</option>
            {CHARGE_OPTIONS.map((opt) => (
              <option key={opt.slug} value={opt.slug}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label htmlFor="courtDate" className="block text-sm font-medium text-zinc-300 mb-1">
          Next court date
        </label>
        <input
          id="courtDate"
          type="date"
          required
          value={courtDate}
          onChange={(e) => setCourtDate(e.target.value)}
          min={new Date().toISOString().split("T")[0]}
          className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-xl text-white focus:border-amber-500 focus:outline-none"
        />
      </div>

      {partnerPromoCode && (
        <div className="mt-4">
          <CheckInDayPicker
            value={checkInDays}
            onChange={setCheckInDays}
            disabled={checkInIdk || submitting}
            label="What days does your bondsman want you to check in?"
          />
          <label className="flex items-center gap-2 text-sm text-zinc-400 mt-3 min-h-[44px]">
            <input
              type="checkbox"
              checked={checkInIdk}
              disabled={submitting}
              onChange={(e) => {
                setCheckInIdk(e.target.checked);
                if (e.target.checked) setCheckInDays([]);
              }}
              className="rounded border-zinc-600"
            />
            I don&apos;t know
          </label>
        </div>
      )}

      <div>
        <label htmlFor="countyState" className="block text-sm font-medium text-zinc-300 mb-1">
          County & State
        </label>
        <input
          id="countyState"
          type="text"
          required
          value={countyState}
          onChange={(e) => setCountyState(e.target.value)}
          className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
          placeholder="e.g. Pinellas County, FL"
        />
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-zinc-300 mb-1">
          Email <span className="text-zinc-500">(where we send your reminders)</span>
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
          placeholder="your@email.com"
        />
      </div>

      {error && (
        <p className="text-red-400 text-sm" role="alert">{error}</p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full px-6 py-4 bg-amber-500 text-black font-bold rounded-xl text-lg hover:bg-amber-400 hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
      >
        {submitting ? "Setting up..." : "Set Up My Court Prep"}
      </button>

      <p className="text-zinc-500 text-xs text-center">
        Free. No account needed. Legal information, not legal advice.
      </p>
    </form>
  );
}
