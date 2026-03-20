"use client";
import { useState } from "react";

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
        body: JSON.stringify({ name, company, email, phone, region, message, heardAboutUs, source }),
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
      <div className="text-center bg-green-900/30 border border-green-700 rounded-xl p-8">
        <p className="text-green-300 text-xl font-bold mb-2">Application Submitted</p>
        <p className="text-zinc-400">
          We&apos;ll review your application and email you within 24 hours
          with your unique promo code and partner materials.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-2 rounded-lg">
          {error}
        </div>
      )}
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Your Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-4 py-3 bg-zinc-800 rounded-lg border border-zinc-700 text-white focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Company / Agency</label>
          <input
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            className="w-full px-4 py-3 bg-zinc-800 rounded-lg border border-zinc-700 text-white focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Email *</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-3 bg-zinc-800 rounded-lg border border-zinc-700 text-white focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Phone</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full px-4 py-3 bg-zinc-800 rounded-lg border border-zinc-700 text-white focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm text-zinc-400 mb-1">Region / Service Area</label>
          <input
            type="text"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            placeholder="e.g., Maricopa County, AZ"
            className="w-full px-4 py-3 bg-zinc-800 rounded-lg border border-zinc-700 text-white focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>
        {includeHeardAboutUs && (
          <div className="md:col-span-2">
            <label className="block text-sm text-zinc-400 mb-1">How did you hear about us?</label>
            <input
              type="text"
              value={heardAboutUs}
              onChange={(e) => setHeardAboutUs(e.target.value)}
              placeholder="Google, social media, friend, etc."
              className="w-full px-4 py-3 bg-zinc-800 rounded-lg border border-zinc-700 text-white focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>
        )}
        <div className="md:col-span-2">
          <label className="block text-sm text-zinc-400 mb-1">Anything else we should know?</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            className="w-full px-4 py-3 bg-zinc-800 rounded-lg border border-zinc-700 text-white focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="w-full py-4 bg-amber-500 text-black font-bold rounded-xl text-lg hover:bg-amber-400 disabled:opacity-50 transition-colors"
      >
        {submitting ? "Submitting..." : "Submit Application"}
      </button>
    </form>
  );
}
