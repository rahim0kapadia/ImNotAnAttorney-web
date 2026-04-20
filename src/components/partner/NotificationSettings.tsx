// src/components/partner/NotificationSettings.tsx
"use client";

import { useState, useEffect } from "react";
import type { Channel, PartnerNotificationPrefs } from "@/lib/notification-prefs";

const LABELS: Record<keyof PartnerNotificationPrefs, string> = {
  magic_link: "Login links",
  client_reminded: "When your client gets a reminder",
  drip: "Playbook tips (first 2 weeks)",
  commission_earned: "When you earn a commission",
  payout: "Payouts and holdback",
  missed_check_in: "When a client misses a check-in",
};

const CHANNELS: Channel[] = ["email", "sms", "both"];

interface NotificationSettingsProps {
  hasPhone: boolean;
}

export function NotificationSettings({ hasPhone }: NotificationSettingsProps) {
  const [prefs, setPrefs] = useState<PartnerNotificationPrefs | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/partner/notification-prefs")
      .then((r) => r.json())
      .then(setPrefs)
      .catch(() => setError("Failed to load preferences"));
  }, []);

  async function handleChange(key: keyof PartnerNotificationPrefs, channel: Channel) {
    if (!prefs) return;
    if ((channel === "sms" || channel === "both") && !hasPhone) {
      setError("Add your phone number first to enable SMS.");
      return;
    }
    setError("");
    setSaving(true);
    setSaved(false);

    const updated = { ...prefs, [key]: channel };
    setPrefs(updated);

    try {
      const res = await fetch("/api/partner/notification-prefs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: channel }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to save");
        setPrefs(prefs); // revert
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      setError("Connection error");
      setPrefs(prefs); // revert
    }
    setSaving(false);
  }

  if (!prefs) return <div className="text-zinc-500 text-sm">Loading preferences...</div>;

  return (
    <section className="bg-zinc-900 rounded-xl border border-zinc-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">When we text or email you</h2>
        {saved && <span className="text-green-400 text-xs">Saved</span>}
      </div>
      <div className="space-y-3">
        {(Object.keys(LABELS) as (keyof PartnerNotificationPrefs)[]).map((key) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <span className="text-sm text-zinc-300">{LABELS[key]}</span>
            <div className="flex gap-1">
              {CHANNELS.map((ch) => (
                <button
                  key={ch}
                  onClick={() => handleChange(key, ch)}
                  disabled={saving}
                  className={`px-3 py-1 text-xs rounded-lg transition-colors cursor-pointer ${
                    prefs[key] === ch
                      ? "bg-amber-500 text-black font-bold"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                  }`}
                  aria-label={`${LABELS[key]}: ${ch}`}
                  aria-pressed={prefs[key] === ch}
                >
                  {ch === "both" ? "Both" : ch === "sms" ? "SMS" : "Email"}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {error && <p className="text-red-400 text-xs mt-2" role="alert">{error}</p>}
      {!hasPhone && (
        <p className="text-zinc-400 text-xs mt-3">
          Add your cell number first if you want texts instead of email.
        </p>
      )}
    </section>
  );
}
