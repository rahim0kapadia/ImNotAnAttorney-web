"use client";
/**
 * Pre-written message templates for partners to send to defendants.
 * Each template has the partner's code and URL pre-filled with a copy button.
 */

import { useState } from "react";
import { copyToClipboard } from "@/lib/clipboard";

interface MessageTemplatesProps {
  promoCode: string;
  referralUrl: string;
}

const TEMPLATES = [
  {
    label: "Check-in pitch",
    template: (code: string, url: string) =>
      `Hey [name], checking in. Quick tip — a lot of my clients use this service to get the right questions to ask their attorney. Helped a few people catch things their lawyer missed. Use my code ${code} for 10% off: ${url}`,
  },
  {
    label: "Right after bonding out",
    template: (code: string, url: string) =>
      `Hey [name], you're going to have a lot of questions about your case. This service researches your charges and gives you the exact questions to ask your attorney. Use my code ${code} for 10% off: ${url}`,
  },
  {
    label: "Follow-up nudge",
    template: (code: string, url: string) =>
      `Hey [name], still dealing with your case? The people I've sent here say it helped them feel way more prepared for their attorney meetings. ${url} — my code ${code} saves you 10%.`,
  },
  {
    label: "General share",
    template: (code: string, url: string) =>
      `If you or someone you know is dealing with criminal charges, this service researches your case and gives you the questions that close the information gap. Code ${code} for 10% off: ${url}`,
  },
];

export function MessageTemplates({ promoCode, referralUrl }: MessageTemplatesProps) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  async function handleCopy(text: string, idx: number) {
    const ok = await copyToClipboard(text);
    if (!ok) return;
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  }

  return (
    <div className="space-y-3">
      {TEMPLATES.map((t, i) => {
        const text = t.template(promoCode, referralUrl);
        return (
          <div
            key={i}
            className="bg-zinc-800 rounded-xl p-4 border border-zinc-700"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-amber-400">
                {t.label}
              </span>
              <button
                onClick={() => handleCopy(text, i)}
                className="text-xs px-3 py-1 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white transition-colors"
              >
                {copiedIdx === i ? "Copied!" : "Copy"}
              </button>
            </div>
            <p className="text-sm text-zinc-300 leading-relaxed">{text}</p>
          </div>
        );
      })}
      <p className="text-xs text-zinc-400">
        Replace [name] with the defendant&apos;s name when you paste.
      </p>
    </div>
  );
}
