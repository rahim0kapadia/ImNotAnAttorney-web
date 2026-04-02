"use client";
/**
 * /my-cases/login — Customer magic link login page.
 *
 * Customer enters email, receives a magic link via email.
 * Only customers with paid orders can access the portal.
 */

import { useState } from "react";
import Link from "next/link";

export default function CustomerLoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || loading) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/customer/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to send login link");
      }

      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" className="text-amber-400 font-bold text-lg">
            ImNotAnAttorney
          </Link>
          <h1 className="text-2xl font-bold text-white mt-4">My Cases</h1>
          <p className="text-zinc-400 mt-2 text-sm">
            Enter your email to access your cases and reports.
          </p>
        </div>

        {sent ? (
          <div className="bg-green-900/30 border border-green-700 rounded-xl p-6 text-center">
            <p className="text-green-300 font-bold text-lg mb-2">Check your email</p>
            <p className="text-zinc-400 text-sm">
              We sent a login link to <strong className="text-white">{email}</strong>.
              It expires in 15 minutes.
            </p>
            <button
              onClick={() => { setSent(false); setEmail(""); }}
              className="mt-4 text-amber-400 text-sm hover:text-amber-300"
            >
              Try a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
            {error && (
              <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-2 rounded-lg mb-4 text-sm">
                {error}
              </div>
            )}

            <label className="block text-sm text-zinc-400 mb-1">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
              className="w-full px-4 py-3 bg-zinc-800 rounded-lg border border-zinc-700 text-white mb-4"
            />

            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full py-3 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 disabled:opacity-50 transition-colors"
            >
              {loading ? "Sending..." : "Send Login Link"}
            </button>
          </form>
        )}

        <div className="text-center mt-6">
          <Link href="/" className="text-zinc-400 text-sm hover:text-zinc-400">
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
