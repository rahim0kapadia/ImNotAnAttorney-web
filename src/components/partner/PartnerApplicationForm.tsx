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
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/partners/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, city: city.trim() || undefined, compliance, source }),
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

  const successRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (submitted) successRef.current?.focus();
  }, [submitted]);

  if (submitted) {
    return (
      <div ref={successRef} tabIndex={-1} className="text-center bg-green-900/30 border border-green-700 rounded-xl p-8">
        <p className="text-green-300 text-xl font-bold mb-2">You&apos;re In!</p>
        <p className="text-zinc-300 mb-4">
          Your promo code is on its way. Open your email right now and click the activation link.
        </p>
        <p className="text-zinc-400 text-sm mb-4">Then send this to your next client:</p>
        <div className="bg-zinc-800 rounded-lg p-4 text-left text-sm text-zinc-300 mb-4">
          &ldquo;Hey — I work with a company that researches criminal cases and helps defendants prepare the right questions for their attorney. If you use my code at checkout, you get 10% off. Check it out: imnotanattorney.com&rdquo;
        </div>
        <p className="text-zinc-500 text-xs">Your promo code activates when you click the link in your email.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div role="alert" className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-2 rounded-lg">
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
