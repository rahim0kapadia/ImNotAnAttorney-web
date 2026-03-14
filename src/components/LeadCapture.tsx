/**
 * LeadCapture -- Email capture form for lead magnets.
 *
 * Supports multiple lead magnets via props. Defaults to the discovery checklist
 * for backwards compatibility.
 *
 * Flow:
 *   1. User sees headline + description about the lead magnet.
 *   2. User enters email and submits the form.
 *   3. Form POSTs to `/api/subscribe` with `{ email, source }`.
 *   4. On success, the form is replaced with a confirmation message + download link.
 *   5. On error, a red inline error message is shown; user can retry.
 *
 * States: idle -> loading -> success | error
 *
 * Data flow: The `/api/subscribe` endpoint inserts into the `subscribers` table in
 * Supabase with the `source` field for attribution tracking.
 *
 * CAN-SPAM: Includes "No spam. Unsubscribe anytime." disclaimer text.
 *
 * Used on: Blog index page, blog post pages, resources page.
 */
"use client";

import { useState } from "react";
import { FadeInUp } from "@/components/motion/FadeInUp";

interface LeadCaptureProps {
  /** Source tag saved to subscribers table for attribution. */
  source?: string;
  /** Headline above the form. */
  title?: string;
  /** Description text below the headline. */
  description?: string;
  /** Submit button label. */
  buttonText?: string;
  /** Title shown after successful submission. */
  successTitle?: string;
  /** Description shown after successful submission. */
  successDescription?: string;
  /** Download link shown after successful submission. */
  downloadHref?: string;
  /** Download button label. */
  downloadLabel?: string;
}

export function LeadCapture({
  source = "lead-capture",
  title = "What\u2019s Actually in Your Discovery?",
  description = "7 evidence problems real cases hide \u2014 and the questions that expose them. Based on a real case we reviewed. Used by defendants who refuse to go into court blind.",
  buttonText = "Send Me the Checklist",
  successTitle = "You\u2019re the kind of defendant who does their homework.",
  successDescription = "Here\u2019s your guide. Bookmark it \u2014 you\u2019ll need it.",
  downloadHref = "/guides/discovery-checklist-7-evidence-problems.md",
  downloadLabel = "Download Discovery Checklist \u2192",
}: LeadCaptureProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source }),
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
          {successTitle}
        </h3>
        <p className="mt-2 text-sm text-zinc-400">
          {successDescription}
        </p>
        <a
          href={downloadHref}
          download
          className="mt-4 inline-block rounded-lg bg-amber-500 px-6 py-3 text-sm font-semibold text-black transition-colors hover:bg-amber-400"
        >
          {downloadLabel}
        </a>
      </div>
    );
  }

  return (
    <FadeInUp>
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8">
      <h3 className="text-lg font-bold text-white">
        {title}
      </h3>
      <p className="mt-2 text-sm text-zinc-400">
        {description}
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
          {status === "loading" ? "..." : buttonText}
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
