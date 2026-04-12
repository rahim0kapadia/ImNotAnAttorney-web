"use client";
import { useState, useRef, useEffect } from "react";

interface PartnerApplicationFormProps {
  source: string;
  includeHeardAboutUs?: boolean;
}

export function PartnerApplicationForm({ source, includeHeardAboutUs = true }: PartnerApplicationFormProps) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [region, setRegion] = useState("");
  const [message, setMessage] = useState("");
  const [heardAboutUs, setHeardAboutUs] = useState("");
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
        body: JSON.stringify({ name, company, email, phone, region, message, heardAboutUs, source, compliance }),
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
        <p className="text-zinc-400">
          Check your email for your partner code and dashboard link.
          Your promo code activates when you click the link in your email.
        </p>
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
      <div className="grid md:grid-cols-2 gap-4">
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
          <label htmlFor="partner-company" className="block text-sm text-zinc-400 mb-1">Company / Agency</label>
          <input
            id="partner-company"
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
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
          <label htmlFor="partner-phone" className="block text-sm text-zinc-400 mb-1">Phone</label>
          <input
            id="partner-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full px-4 py-3 bg-zinc-800 rounded-lg border border-zinc-700 text-white focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>
        <div className="md:col-span-2">
          <label htmlFor="partner-region" className="block text-sm text-zinc-400 mb-1">Region / Service Area</label>
          <input
            id="partner-region"
            type="text"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            placeholder="e.g., Maricopa County, AZ"
            className="w-full px-4 py-3 bg-zinc-800 rounded-lg border border-zinc-700 text-white focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>
        {includeHeardAboutUs && (
          <div className="md:col-span-2">
            <label htmlFor="partner-heard-about-us" className="block text-sm text-zinc-400 mb-1">How did you hear about us?</label>
            <input
              id="partner-heard-about-us"
              type="text"
              value={heardAboutUs}
              onChange={(e) => setHeardAboutUs(e.target.value)}
              placeholder="Google, social media, friend, etc."
              className="w-full px-4 py-3 bg-zinc-800 rounded-lg border border-zinc-700 text-white focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>
        )}
        <div className="md:col-span-2">
          <label htmlFor="partner-message" className="block text-sm text-zinc-400 mb-1">Anything else we should know?</label>
          <textarea
            id="partner-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            className="w-full px-4 py-3 bg-zinc-800 rounded-lg border border-zinc-700 text-white focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>
        <div className="md:col-span-2">
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
                Partner Terms of Service<span className="sr-only"> (opens in new tab)</span>
              </a>{" "}
              and will not make claims about case outcomes or provide legal advice on behalf of ImNotAnAttorney. *
            </span>
          </label>
        </div>
      </div>
      <button
        type="submit"
        disabled={submitting || !compliance}
        className="w-full py-4 bg-amber-500 text-black font-bold rounded-xl text-lg hover:bg-amber-400 disabled:opacity-50 transition-colors"
      >
        {submitting ? "Submitting..." : "Submit Application"}
      </button>
    </form>
  );
}
