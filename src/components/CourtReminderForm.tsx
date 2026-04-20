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
  compactMode?: boolean;
  requirePhone?: boolean;
  submitLabel?: string;
  /**
   * Absolute same-origin path to navigate to after successful submit. Must
   * be a precomputed string (not a function) so this prop stays serializable
   * across the Server -> Client Component boundary. Falls back to
   * `/prep/{token}` when omitted.
   */
  redirectTo?: string;
  requireConsent?: boolean;
}

const CHARGE_OPTIONS = Object.entries(CHARGE_DISPLAY_NAMES).map(([slug, label]) => ({
  slug,
  label,
}));

export function CourtReminderForm({
  chargeType,
  recommendedTier,
  partnerPromoCode,
  compactMode,
  requirePhone,
  submitLabel,
  redirectTo,
  requireConsent,
}: CourtReminderFormProps) {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [courtDate, setCourtDate] = useState("");
  const [countyState, setCountyState] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
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
          phone: requirePhone ? phone : undefined,
          charge_type: compactMode ? (chargeType || "other") : charge,
          county_state: compactMode ? undefined : countyState,
          court_date: courtDate,
          recommended_tier: recommendedTier,
          partner_promo_code: partnerPromoCode,
          check_in_days: compactMode ? undefined : (checkInIdk ? null : (checkInDays.length > 0 ? checkInDays : undefined)),
          check_in_idk: compactMode ? undefined : (checkInIdk ? true : undefined),
          consent: requireConsent ? consent : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }

      const { token } = await res.json();
      // Guard against a caller-supplied redirectTo that returns an external
      // URL or a relative path — route.push accepts them but we want to
      // restrict post-submit navigation to same-origin absolute paths.
      // Reject protocol-relative `//host` destinations, which browsers
      // interpret as navigating to another origin on the current scheme.
      const proposed = redirectTo ?? `/prep/${token}`;
      const dest = typeof proposed === "string"
        && proposed.startsWith("/")
        && !proposed.startsWith("//")
        ? proposed
        : `/prep/${token}`;
      router.push(dest);
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

      {!compactMode && showChargeField && (
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

      {!compactMode && partnerPromoCode && (
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

      {!compactMode && (
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
      )}

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

      {requirePhone && (
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-zinc-300 mb-1">
            Mobile phone
          </label>
          <input
            id="phone"
            type="tel"
            required
            inputMode="numeric"
            pattern="[0-9\-\(\)\.\s+]+"
            maxLength={20}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full px-4 py-3 min-h-[44px] bg-zinc-900 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
            placeholder="(555) 123-4567"
            autoComplete="tel"
          />
          <p className="text-xs text-zinc-400 mt-1">Where we text your check-in prompts.</p>
        </div>
      )}

      {requireConsent && (
        <label
          htmlFor="consent"
          className="flex items-start gap-3 cursor-pointer min-h-[44px] py-2"
        >
          <input
            id="consent"
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            required
            aria-describedby="consent-desc"
            className="mt-1 h-5 w-5 rounded border-zinc-700 bg-zinc-800 text-amber-500 focus:ring-amber-500"
          />
          <span className="text-sm text-zinc-400">
            <span>I agree to receive SMS and email reminders from ImNotAnAttorney.</span>
            <span id="consent-desc" className="block text-xs text-zinc-400 mt-1">
              Sender: ImNotAnAttorney. Msg frequency varies. Msg &amp; data rates may apply.
              Reply STOP to opt out, HELP for help. Consent not required as a condition of purchase.{" "}
              <a href="/privacy" className="text-amber-400 underline">Privacy policy</a>.
            </span>
          </span>
        </label>
      )}

      {error && (
        <p className="text-red-400 text-sm" role="alert">{error}</p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full px-6 py-4 min-h-[44px] bg-amber-500 text-black font-bold rounded-xl text-lg hover:bg-amber-400 hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
      >
        {submitting ? "Setting up..." : (submitLabel || "Set Up My Court Prep")}
      </button>

      <p className="text-zinc-400 text-xs text-center">
        Free. No account needed. Legal information, not legal advice.
      </p>
    </form>
  );
}
