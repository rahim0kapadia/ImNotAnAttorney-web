"use client";

import { useState } from "react";

export function LeadCapture() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "lead-capture" }),
      });
      if (res.ok) {
        setStatus("success");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <div role="status" className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center">
        <div className="mb-2 text-2xl">&#10003;</div>
        <h3 className="text-lg font-semibold text-white">You&apos;re in.</h3>
        <p className="mt-2 text-sm text-zinc-400">
          Here&apos;s your guide. Bookmark it — you&apos;ll need it.
        </p>
        <a
          href="/guides/10-questions-your-attorney-hopes-you-never-ask.pdf"
          download
          className="mt-4 inline-block rounded-lg bg-amber-500 px-6 py-3 text-sm font-semibold text-black transition-colors hover:bg-amber-400"
        >
          Download PDF Guide →
        </a>
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
          aria-label="Email address"
          className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-base text-white placeholder-zinc-400 outline-none focus:border-amber-500"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="rounded-lg bg-amber-500 px-6 py-3 text-sm font-semibold text-black transition-colors hover:bg-amber-400 disabled:opacity-50"
        >
          {status === "loading" ? "..." : "Get the Free Guide"}
        </button>
      </form>
      {status === "error" && (
        <p role="alert" className="mt-2 text-xs text-red-400">Something went wrong. Try again.</p>
      )}
      <p className="mt-3 text-xs text-zinc-400">
        No spam. Unsubscribe anytime. We&apos;re too busy researching your case to
        send junk mail.
      </p>
    </div>
  );
}
