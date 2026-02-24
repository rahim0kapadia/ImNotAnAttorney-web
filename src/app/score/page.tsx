"use client";

import { useState } from "react";
import Link from "next/link";

const questions = [
  {
    id: "chargeType",
    label: "What are you charged with?",
    options: [
      { value: "drug", label: "Drug offense" },
      { value: "dui", label: "DUI / DWI" },
      { value: "white-collar", label: "White collar / fraud" },
      { value: "other-felony", label: "Other felony" },
      { value: "other-misdemeanor", label: "Other misdemeanor" },
    ],
  },
  {
    id: "timeSinceArrest",
    label: "How long ago were you arrested or charged?",
    options: [
      { value: "less-than-1-month", label: "Less than 1 month" },
      { value: "1-3-months", label: "1-3 months" },
      { value: "3-6-months", label: "3-6 months" },
      { value: "6-12-months", label: "6-12 months" },
      { value: "12-plus-months", label: "12+ months" },
    ],
  },
  {
    id: "hasAttorney",
    label: "Do you have an attorney?",
    options: [
      { value: "private", label: "Yes — private attorney" },
      { value: "public-defender", label: "Yes — public defender" },
      { value: "no", label: "No" },
      { value: "not-sure", label: "Not sure" },
    ],
  },
  {
    id: "motionsFiled",
    label: "Has your attorney filed any motions?",
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
      { value: "dont-know", label: "I don't know" },
    ],
  },
  {
    id: "hasDiscovery",
    label: "Have you received discovery documents?",
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
      { value: "dont-know", label: "I don't know what that is" },
    ],
  },
  {
    id: "communicationFrequency",
    label: "How often does your attorney communicate with you?",
    options: [
      { value: "weekly", label: "Weekly" },
      { value: "monthly", label: "Monthly" },
      { value: "rarely", label: "Rarely" },
      { value: "never", label: "Never" },
    ],
  },
  {
    id: "strategyDiscussed",
    label: "Has your attorney discussed case strategy with you?",
    options: [
      { value: "yes-detail", label: "Yes, in detail" },
      { value: "briefly", label: "Briefly" },
      { value: "no", label: "No" },
    ],
  },
];

type ScoreResult = {
  score: number;
  band: string;
  observations: string[];
};

function ScoreDisplay({ result, emailSent, setEmailSent }: { result: ScoreResult; emailSent: boolean; setEmailSent: (v: boolean) => void }) {
  const bandColors: Record<string, string> = {
    Critical: "text-red-400 border-red-500/50",
    Concerning: "text-orange-400 border-orange-500/50",
    Average: "text-yellow-400 border-yellow-500/50",
    Adequate: "text-green-400 border-green-500/50",
    Excellent: "text-emerald-400 border-emerald-500/50",
  };

  const colorClass = bandColors[result.band] || "text-amber-400 border-amber-500/50";
  const [borderClass] = colorClass.split(" ").filter((c) => c.startsWith("border-"));
  const [textClass] = colorClass.split(" ").filter((c) => c.startsWith("text-"));

  return (
    <div className="mt-8 space-y-6">
      {/* Score circle */}
      <div className="text-center">
        <div
          className={`mx-auto flex h-32 w-32 items-center justify-center rounded-full border-4 ${borderClass}`}
        >
          <div>
            <div className={`text-4xl font-bold ${textClass}`}>
              {result.score}
            </div>
            <div className="text-xs text-zinc-400">out of 100</div>
          </div>
        </div>
        <p className={`mt-4 text-lg font-bold ${textClass}`}>{result.band}</p>
      </div>

      {/* Observations */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-zinc-300">
          What we found:
        </h3>
        {result.observations.map((obs, i) => (
          <div
            key={i}
            className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4"
          >
            <p className="text-sm leading-relaxed text-zinc-300">{obs}</p>
          </div>
        ))}
      </div>

      {/* Optional email capture */}
      {!emailSent && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-900/50 p-6">
          <p className="font-semibold text-white">Get our free Discovery Checklist emailed to you</p>
          <p className="mt-1 text-sm text-zinc-400">Optional — no obligation.</p>
          <form onSubmit={async (e) => {
            e.preventDefault();
            const form = e.target as HTMLFormElement;
            const emailInput = (form.elements.namedItem("scoreEmail") as HTMLInputElement).value;
            await fetch("/api/subscribe", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: emailInput, source: "score-page" }),
            });
            setEmailSent(true);
          }} className="mt-3 flex gap-2">
            <input name="scoreEmail" type="email" required placeholder="you@example.com"
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-400 focus:border-amber-500 focus:outline-none" />
            <button type="submit"
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-black hover:bg-amber-400">
              Send
            </button>
          </form>
        </div>
      )}
      {emailSent && (
        <p className="text-center text-sm text-green-400">Sent! Check your inbox.</p>
      )}

      {/* CTA */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-6">
        <h3 className="font-bold text-white">
          Want the full breakdown + 10-15 questions for your attorney?
        </h3>
        <p className="mt-2 text-sm text-zinc-400">
          Your Attorney Accountability Score is just the surface. The full Case
          Decoder report gives you a plain-English charge breakdown, specific
          questions built from your case details, and red flags for your case
          stage.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/checkout?tier=case-decoder"
            className="rounded-lg bg-amber-500 px-6 py-3 text-center text-sm font-bold text-black transition-colors hover:bg-amber-400"
          >
            Get Your Full Case Decoder — $197 →
          </Link>
          <Link
            href="/resources"
            className="rounded-lg border border-zinc-700 px-6 py-3 text-center text-sm font-semibold text-white transition-colors hover:border-zinc-500"
          >
            Download Free Discovery Checklist
          </Link>
        </div>
      </div>

      {/* Reset */}
      <p className="text-center text-sm text-zinc-400">
        <button
          onClick={() => window.location.reload()}
          className="text-amber-400 underline decoration-amber-400/50 hover:text-amber-300"
        >
          Take the score again
        </button>
      </p>
    </div>
  );
}

export default function ScorePage() {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);

  const allAnswered = questions.every((q) => answers[q.id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!allAnswered) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(answers),
      });

      if (!res.ok) {
        setError("Something went wrong. Please try again.");
        return;
      }

      const data = await res.json();
      setResult(data);
    } catch {
      setError("Could not connect. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="px-4 py-16">
      <div className="mx-auto max-w-2xl">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white md:text-4xl">
            Attorney Accountability Score
          </h1>
          <p className="mt-3 text-zinc-400">
            Is your attorney doing their job? Answer 7 questions and find out in
            60 seconds. Free — no email required.
          </p>
        </div>

        {result ? (
          <ScoreDisplay result={result} emailSent={emailSent} setEmailSent={setEmailSent} />
        ) : (
          <form onSubmit={handleSubmit} className="mt-10 space-y-8">
            {questions.map((q, qIndex) => (
              <fieldset key={q.id}>
                <legend className="text-sm font-semibold text-zinc-300">
                  <span className="mr-2 text-amber-400">{qIndex + 1}.</span>
                  {q.label}
                </legend>
                <div className="mt-3 space-y-2">
                  {q.options.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition-colors ${
                        answers[q.id] === opt.value
                          ? "border-amber-500/50 bg-amber-500/5 text-white"
                          : "border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700"
                      }`}
                    >
                      <input
                        type="radio"
                        name={q.id}
                        value={opt.value}
                        checked={answers[q.id] === opt.value}
                        onChange={() =>
                          setAnswers((prev) => ({
                            ...prev,
                            [q.id]: opt.value,
                          }))
                        }
                        className="h-4 w-4 border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}

            {error && (
              <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-3">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={!allAnswered || loading}
              className="w-full rounded-lg bg-amber-500 py-4 text-sm font-bold text-black transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <svg
                    className="h-4 w-4 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Calculating...
                </span>
              ) : (
                "Get My Score"
              )}
            </button>

            <p className="text-center text-xs text-zinc-400">
              Free. No email required. Your answers are not stored.
            </p>
          </form>
        )}

        {/* Disclaimer */}
        <div className="mt-12 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs text-zinc-400">
            This score is an educational tool based on general defense
            milestones — not legal advice. Every case is different. Consult with
            a licensed attorney for advice specific to your situation.
          </p>
        </div>
      </div>
    </div>
  );
}
