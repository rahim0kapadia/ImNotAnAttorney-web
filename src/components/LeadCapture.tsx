/**
 * LeadCapture -- Email capture form offering a free discovery checklist as a lead magnet.
 *
 * Flow:
 *   1. User sees headline + description about the "7 evidence problems" checklist.
 *   2. User enters email and submits the form.
 *   3. Form POSTs to `/api/subscribe` with `{ email, source: "lead-capture" }`.
 *   4. On success, the form is replaced with a confirmation message + download link
 *      to `/guides/discovery-checklist-7-evidence-problems.md`.
 *   5. On error, a red inline error message is shown; user can retry.
 *
 * States: idle -> loading -> success | error
 *
 * Data flow: The `/api/subscribe` endpoint inserts into the `subscribers` table in
 * Supabase with the `source` field set to "lead-capture" for attribution tracking.
 *
 * CAN-SPAM: Includes "No spam. Unsubscribe anytime." disclaimer text.
 *
 * Used on: Blog index page, blog post pages, resources page.
 */
"use client";

import { useState } from "react";
import { FadeInUp } from "@/components/motion/FadeInUp";

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
        <h3 className="text-lg font-semibold text-white">
          You&apos;re the kind of defendant who does their homework.
        </h3>
        <p className="mt-2 text-sm text-zinc-400">
          Here&apos;s your guide. Bookmark it — you&apos;ll need it.
        </p>
        <a
          href="/guides/discovery-checklist-7-evidence-problems.md"
          download
          className="mt-4 inline-block rounded-lg bg-amber-500 px-6 py-3 text-sm font-semibold text-black transition-colors hover:bg-amber-400"
        >
          Download Discovery Checklist →
        </a>
      </div>
    );
  }

  return (
    <FadeInUp>
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8">
      <h3 className="text-lg font-bold text-white">
        What&apos;s Actually in Your Discovery?
      </h3>
      <p className="mt-2 text-sm text-zinc-400">
        7 evidence problems real cases hide — and the questions that expose
        them. Based on a real case we reviewed. Used by defendants who refuse to
        go into court blind.
      </p>
      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3 sm:flex-row">
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
          className="rounded-lg bg-amber-500 px-6 py-3 text-sm font-semibold text-black transition-all hover:scale-[1.01] hover:bg-amber-400 active:scale-[0.99] disabled:opacity-50 sm:w-auto"
        >
          {status === "loading" ? "..." : "Send Me the Checklist"}
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
    </FadeInUp>
  );
}
