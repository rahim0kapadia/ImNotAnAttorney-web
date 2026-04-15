"use client";

import { useEffect, useState } from "react";
import type { Channel, ClientNotificationPrefs } from "@/lib/notification-prefs";

type CategoryKey = keyof ClientNotificationPrefs;

const CATEGORY_LABELS: Record<CategoryKey, { title: string; hint?: string }> = {
  court_reminders: {
    title: "Court date reminders",
    hint: "Email is always sent — required for safety (phones die, SMS bounces).",
  },
  magic_link: { title: "Secure sign-in links" },
  check_in: { title: "Check-in confirmations" },
  post_court: { title: "Post-court follow-up" },
};

const CHANNEL_LABEL: Record<Channel, string> = {
  email: "Email",
  sms: "Text",
  both: "Both",
};

const ORDER: CategoryKey[] = ["court_reminders", "magic_link", "check_in", "post_court"];

interface Props {
  token: string;
}

export function ClientNotificationSettings({ token }: Props) {
  const [prefs, setPrefs] = useState<ClientNotificationPrefs | null>(null);
  const [saving, setSaving] = useState<CategoryKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/court-reminders/${token}/prefs`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        if (!cancelled) setPrefs(data as ClientNotificationPrefs);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load settings.");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function update(key: CategoryKey, value: Channel) {
    setSaving(key);
    setError(null);
    try {
      const res = await fetch(`/api/court-reminders/${token}/prefs`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error ?? "Save failed.");
        return;
      }
      setPrefs(data as ClientNotificationPrefs);
    } catch {
      setError("Save failed.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <details className="text-xs text-zinc-500 mt-2">
      <summary className="cursor-pointer hover:text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:rounded">
        Notification settings
      </summary>
      <div className="mt-3 space-y-3">
        {prefs ? (
          ORDER.map((key) => {
            const labels = CATEGORY_LABELS[key];
            const current = prefs[key];
            const disabled = saving === key;
            return (
              <div key={key}>
                <p className="text-zinc-300">{labels.title}</p>
                {labels.hint && <p className="text-zinc-600 mt-0.5">{labels.hint}</p>}
                <div className="flex gap-2 mt-1.5">
                  {(["email", "sms", "both"] as Channel[]).map((ch) => {
                    const unsafeForCourtReminders = key === "court_reminders" && ch === "sms";
                    const active = current === ch;
                    return (
                      <button
                        key={ch}
                        type="button"
                        disabled={disabled || unsafeForCourtReminders}
                        onClick={() => update(key, ch)}
                        className={`px-2 py-1 rounded border text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                          active
                            ? "bg-amber-500/10 text-amber-300 border-amber-500/40"
                            : "bg-transparent text-zinc-400 border-zinc-700 hover:border-zinc-500"
                        } ${unsafeForCourtReminders ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
                        aria-pressed={active}
                        aria-label={`${labels.title}: ${CHANNEL_LABEL[ch]}`}
                      >
                        {CHANNEL_LABEL[ch]}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        ) : error ? (
          <p className="text-red-400">{error}</p>
        ) : (
          <p className="text-zinc-600">Loading…</p>
        )}
        {error && prefs && <p className="text-red-400 mt-2">{error}</p>}
      </div>
    </details>
  );
}
