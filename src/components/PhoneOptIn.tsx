// src/components/PhoneOptIn.tsx
"use client";

import { useState } from "react";

// Inline phone helpers to avoid importing @/lib/site which has a Node.js crypto dep.
function normalizePhone(raw: string): string {
  const stripped = raw.replace(/[\s\-\(\)\.]/g, "");
  if (/^\d{10}$/.test(stripped)) return "+1" + stripped;
  return stripped;
}

function isValidPhone(phone: string): boolean {
  return /^\+1\d{10}$/.test(phone);
}

interface PhoneOptInProps {
  token: string;
  hasPhone: boolean;
}

export function PhoneOptIn({ token, hasPhone }: PhoneOptInProps) {
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">(
    hasPhone ? "done" : "idle"
  );
  const [error, setError] = useState("");

  if (status === "done") {
    return (
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 text-center">
        <p className="text-green-400 text-sm font-medium">
          Text reminders are set up.
        </p>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!consent) {
      setError("Please agree to receive text reminders.");
      return;
    }
    setError("");
    setStatus("submitting");

    const normalized = normalizePhone(phone);
    if (!isValidPhone(normalized)) {
      setError("Enter a valid 10-digit US phone number.");
      setStatus("idle");
      return;
    }

    try {
      const res = await fetch(`/api/court-reminders/${token}/phone`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalized }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error || "Something went wrong.");
        setStatus("idle");
        return;
      }

      setStatus("done");
    } catch {
      setError("Connection error. Try again.");
      setStatus("idle");
    }
  }

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
      <h3 className="text-sm font-bold text-amber-400 mb-2">
        Want a text reminder before your court date?
      </h3>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(555) 123-4567"
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none text-sm"
          aria-label="Phone number for text reminders"
        />
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 accent-amber-500"
          />
          <span className="text-xs text-zinc-400 leading-tight">
            I agree to receive court date reminder texts from ImNotAnAttorney.
            Msg frequency varies. Msg &amp; data rates may apply. Reply HELP
            for help, STOP to opt out.
          </span>
        </label>
        {error && (
          <p className="text-red-400 text-xs" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={status === "submitting"}
          className="w-full px-4 py-2 bg-amber-500 text-black font-bold rounded-lg text-sm hover:bg-amber-400 disabled:opacity-50 cursor-pointer"
        >
          {status === "submitting" ? "Saving..." : "Get Text Reminders"}
        </button>
      </form>
    </div>
  );
}
