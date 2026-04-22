"use client";

/**
 * HeroQuickApply — inline 2-field quick-apply for the bondsman hero.
 *
 * Laja/H7: the full PartnerApplicationForm lives below ~7 sections of sales
 * copy. A single anchor-jump CTA bypasses all of them. This component lets
 * a bondsman START the application above the fold, then soft-scrolls them
 * into the full form with name + email already filled in.
 *
 * No backend change: values are stashed in sessionStorage under
 * `partnerApp.prefill`. PartnerApplicationForm reads + clears on mount.
 * Deliberate tradeoff — with zero traffic at ship time the dropout-capture
 * value of a "partial application" row is ~0. If future analytics show
 * meaningful hero-start vs full-submit gap, wire a partial POST then.
 *
 * Plan ref: docs/plans/2026-04-20-bondsman-inline-hero-form.md
 */

import { useState, type FormEvent } from "react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STORAGE_KEY = "partnerApp.prefill";

export function HeroQuickApply() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName) {
      setError("Enter your first name.");
      return;
    }
    if (trimmedEmail.length > 254 || !EMAIL_RE.test(trimmedEmail)) {
      setError("Enter a valid email.");
      return;
    }

    try {
      window.sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ name: trimmedName, email: trimmedEmail }),
      );
    } catch {
      // Storage can be blocked (private mode, disabled cookies). Proceed —
      // user will re-type the two fields in the full form.
    }

    const anchor = document.getElementById("apply");
    if (anchor) {
      anchor.scrollIntoView({ behavior: "smooth", block: "start" });
      // Shift focus to the first input of the full form for screen readers.
      // Defer until after scroll animation settles.
      window.setTimeout(() => {
        const firstInput = document.getElementById("partner-city");
        firstInput?.focus();
      }, 600);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto mt-2 max-w-xl text-left"
      aria-label="Quick apply, start your partner application"
    >
      {error && (
        <div
          role="alert"
          className="mb-3 rounded-lg border border-red-700 bg-red-900/50 px-4 py-2 text-sm text-red-300"
        >
          {error}
        </div>
      )}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <label htmlFor="hero-qa-name" className="sr-only">
            First name
          </label>
          <input
            id="hero-qa-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="First name"
            autoComplete="given-name"
            required
            aria-invalid={!!error && !name.trim()}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>
        <div className="flex-1">
          <label htmlFor="hero-qa-email" className="sr-only">
            Email
          </label>
          <input
            id="hero-qa-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            autoComplete="email"
            required
            aria-invalid={!!error && !EMAIL_RE.test(email.trim())}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>
        <button
          type="submit"
          className="cursor-pointer rounded-lg bg-amber-500 px-6 py-3 font-bold text-black transition-all hover:scale-[1.02] hover:bg-amber-400 hover:shadow-lg hover:shadow-amber-500/20"
        >
          Continue
        </button>
      </div>
      <p className="mt-3 text-xs text-zinc-500">
        Takes 30 seconds. We never cold-call or share your email.
      </p>
    </form>
  );
}
