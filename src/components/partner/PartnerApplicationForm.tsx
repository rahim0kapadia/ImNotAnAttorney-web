"use client";
import { useState, useRef, useEffect } from "react";

interface PartnerApplicationFormProps {
  source: string;
}

export function PartnerApplicationForm({ source }: PartnerApplicationFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [compliance, setCompliance] = useState(false);
  const [checkInMode, setCheckInMode] = useState<"enabled" | "disabled" | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const successRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (submitted) successRef.current?.focus();
  }, [submitted]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    if (source === "bondsman" && checkInMode !== "enabled" && checkInMode !== "disabled") {
      setError("Please pick how you work with clients");
      setSubmitting(false);
      return;
    }
    try {
      const res = await fetch("/api/partners/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          city: city.trim() || undefined,
          compliance,
          source,
          checkInMode: source === "bondsman" ? checkInMode : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit");
      }
      setSubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div ref={successRef} tabIndex={-1} className="text-center bg-green-900/30 border border-green-700 rounded-xl p-8">
        <p className="text-green-300 text-xl font-bold mb-2">You&apos;re in!</p>
        <p className="text-zinc-300 mb-4">Three things happen next:</p>
        <ol className="text-left text-zinc-300 text-sm space-y-3 mb-6 pl-6 list-decimal">
          <li>
            <strong>Check your email in the next 5 minutes.</strong> Click the activation link. That&apos;s your partner URL going live.
          </li>
          <li>
            <strong>Your activation email has your first-week game plan</strong>, how to hand off the link, what to say at the bail desk, and three message templates ready to copy-paste.
          </li>
          <li>
            <strong>First client through your link?</strong> You&apos;ll see them in your dashboard within 10 minutes.
          </li>
        </ol>
        <p className="text-zinc-400 text-xs">
          Questions? Reply to the activation email. You&apos;re replying to a human.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div id="checkin-mode-error" role="alert" className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-2 rounded-lg">
          {error}
        </div>
      )}
      <div>
        <label htmlFor="partner-name" className="block text-sm text-zinc-400 mb-1">Your Name *</label>
        <input
          id="partner-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          aria-invalid={!!error}
          className="w-full px-4 py-3 bg-zinc-800 rounded-lg border border-zinc-700 text-white focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
      </div>
      <div>
        <label htmlFor="partner-email" className="block text-sm text-zinc-400 mb-1">Email *</label>
        <input
          id="partner-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          aria-invalid={!!error}
          className="w-full px-4 py-3 bg-zinc-800 rounded-lg border border-zinc-700 text-white focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
      </div>
      <div>
        <label htmlFor="partner-city" className="block text-sm text-zinc-400 mb-1">City</label>
        <input
          id="partner-city"
          type="text"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="e.g. Tampa"
          className="w-full px-4 py-3 bg-zinc-800 rounded-lg border border-zinc-700 text-white focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
      </div>
      {source === "bondsman" && (
        <fieldset
          className="border border-zinc-700 rounded-xl p-4"
          aria-describedby={error ? "checkin-mode-error" : undefined}
          aria-invalid={!!error && !checkInMode}
        >
          <legend className="px-2 text-sm text-zinc-300 font-medium">
            How do you work with clients after bonding? *
          </legend>
          <label
            className={`flex items-start gap-3 cursor-pointer mb-3 mt-2 py-2 min-h-[44px] rounded-lg border p-3 transition-colors ${
              checkInMode === "enabled" ? "border-amber-500 bg-amber-500/5" : "border-zinc-700 hover:border-zinc-600"
            }`}
          >
            <input
              type="radio"
              name="checkInMode"
              value="enabled"
              checked={checkInMode === "enabled"}
              onChange={() => setCheckInMode("enabled")}
              required
              className="mt-1 h-5 w-5 border-zinc-700 bg-zinc-800 text-amber-500 focus:ring-amber-500"
            />
            <span>
              <strong className="text-white block">I run check-ins.</strong>
              <span className="text-sm text-zinc-400">
                You do daily or scheduled check-ins with clients between bond and court.
                Your clients get check-in prompts, court date reminders, and hearing prep.
                You see who&apos;s on track and who isn&apos;t.
              </span>
            </span>
          </label>
          <label
            className={`flex items-start gap-3 cursor-pointer mb-3 mt-2 py-2 min-h-[44px] rounded-lg border p-3 transition-colors ${
              checkInMode === "disabled" ? "border-amber-500 bg-amber-500/5" : "border-zinc-700 hover:border-zinc-600"
            }`}
          >
            <input
              type="radio"
              name="checkInMode"
              value="disabled"
              checked={checkInMode === "disabled"}
              onChange={() => setCheckInMode("disabled")}
              required
              className="mt-1 h-5 w-5 border-zinc-700 bg-zinc-800 text-amber-500 focus:ring-amber-500"
            />
            <span>
              <strong className="text-white block">Referral-only.</strong>
              <span className="text-sm text-zinc-400">
                You don&apos;t run a check-in workflow. Your clients get court date reminders
                and hearing prep without the daily check-in layer. Cleaner compliance
                posture, simpler operation.
              </span>
            </span>
          </label>
          <p className="text-xs text-zinc-400 mt-3">
            Pick what matches how you already operate. You can switch later in your dashboard.
          </p>
        </fieldset>
      )}
      <div>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={compliance}
            onChange={(e) => setCompliance(e.target.checked)}
            required
            className="mt-1 h-5 w-5 rounded border-zinc-700 bg-zinc-800 text-amber-500 focus:ring-amber-500"
          />
          <span className="text-sm text-zinc-400">
            I agree to the{" "}
            <a href="/partners/terms" target="_blank" rel="noopener noreferrer" className="text-amber-400 underline hover:text-amber-300">
              Partner Terms<span className="sr-only"> (opens in new tab)</span>
            </a>{" "}
            and understand that ImNotAnAttorney provides information, not legal advice. *
          </span>
        </label>
      </div>
      <button
        type="submit"
        disabled={submitting || !compliance}
        className="w-full py-4 bg-amber-500 text-black font-bold rounded-xl text-lg hover:bg-amber-400 hover:scale-[1.02] hover:shadow-lg hover:shadow-amber-500/20 disabled:opacity-50 transition-all cursor-pointer"
      >
        {submitting ? "Submitting..." : "Get My Partner Code"}
      </button>
    </form>
  );
}
