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
    label: "Add to your check-in text",
    template: (code: string, url: string) =>
      `Hey [name], this is [your name]. Check-in: [day/time]. Court prep resource a lot of my clients use before their attorney meeting: ${url} — code ${code} saves 10%.`,
  },
  {
    label: "Quick share",
    template: (code: string, url: string) =>
      `Hey [name], a lot of my clients use this to prepare for their case. Helps you know the right questions for your attorney: ${url} — code ${code} saves 10%.`,
  },
  {
    label: "For someone else",
    template: (code: string, url: string) =>
      `Someone dealing with a case? This helps them prepare and ask their attorney the right questions: ${url} — code ${code} for 10% off.`,
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
        Replace [name] and [your name] when you paste. The first template works
        best — add it to the text you already send about check-ins.
      </p>
    </div>
  );
}
