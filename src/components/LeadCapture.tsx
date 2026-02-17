"use client";

import { useState } from "react";

export function LeadCapture() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: integrate with Supabase or email provider
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center">
        <div className="mb-2 text-2xl">&#10003;</div>
        <h3 className="text-lg font-semibold text-white">You&apos;re in.</h3>
        <p className="mt-2 text-sm text-zinc-400">
          Check your email for the free guide.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8">
      <h3 className="text-lg font-bold text-white">
        Free Guide: 10 Questions Your Attorney Hopes You Never Ask
      </h3>
      <p className="mt-2 text-sm text-zinc-400">
        Get the questions that make lazy lawyers sweat. Straight to your inbox.
      </p>
      <form onSubmit={handleSubmit} className="mt-4 flex gap-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-white placeholder-zinc-500 outline-none focus:border-amber-500"
        />
        <button
          type="submit"
          className="rounded-lg bg-amber-500 px-6 py-3 text-sm font-semibold text-black transition-colors hover:bg-amber-400"
        >
          Send It
        </button>
      </form>
      <p className="mt-3 text-xs text-zinc-600">
        No spam. Unsubscribe anytime. We&apos;re too busy researching your case to
        send junk mail.
      </p>
    </div>
  );
}
