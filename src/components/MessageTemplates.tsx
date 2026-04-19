"use client";
/**
 * Pre-written message templates for partners to send to defendants.
 * Each template has the partner's code and URL pre-filled with a copy button.
 * First template is mode-aware (check-in vs referral-only); rest are shared.
 */

import { useState } from "react";
import { copyToClipboard } from "@/lib/clipboard";

interface MessageTemplatesProps {
  promoCode: string;
  referralUrl: string;
  checkInEnabled: boolean;
}

type Template = { label: string; template: (code: string, url: string) => string };

const CHECK_IN_FIRST: Template = {
  label: "Add to your check-in text",
  template: (_c, url) =>
    `Hey [name], this is [your name]. Check-in: [day/time]. Two minutes now locks in your court-date reminders + a walkthrough of what happens in the courtroom: ${url}. Because you're our client, 10% off any case analysis is built in. Do it tonight.`,
};

const REFERRAL_FIRST: Template = {
  label: "After the bail packet hand-off",
  template: (_c, url) =>
    `Hey [name], this is [your name] from [company]. Your court date reminders and hearing prep are ready at ${url}. Takes 60 seconds. Because you're our client, 10% off any case analysis is built in, no code to remember. Do it tonight.`,
};

const SHARED_TEMPLATES: Template[] = [
  {
    label: "Quick share",
    template: (_c, url) =>
      `Hey [name], it's [your name]. Before your court date sneaks up: court-date reminders + courtroom walkthrough here (free): ${url}. Takes a minute. 10% off if you ever need deeper analysis, already in the link.`,
  },
  {
    label: "For someone else",
    template: (_c, url) =>
      `A friend or family member dealing with a case? I work with a service that helps a lot of my clients. Free court-date reminders + courtroom walkthrough: ${url}. 10% off analysis if they need the deeper version, already in the link.`,
  },
];

export function MessageTemplates({ promoCode, referralUrl, checkInEnabled }: MessageTemplatesProps) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  async function handleCopy(text: string, idx: number) {
    const ok = await copyToClipboard(text);
    if (!ok) return;
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  }

  const templates: Template[] = [
    checkInEnabled ? CHECK_IN_FIRST : REFERRAL_FIRST,
    ...SHARED_TEMPLATES,
  ];

  return (
    <div className="space-y-3">
      {templates.map((t, i) => {
        const text = t.template(promoCode, referralUrl);
        return (
          <div key={i} className="bg-zinc-800 rounded-xl p-4 border border-zinc-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-amber-400">{t.label}</span>
              <button
                onClick={() => handleCopy(text, i)}
                aria-label={copiedIdx === i ? "Copied" : `Copy ${t.label} template`}
                aria-live="polite"
                className="text-sm px-4 py-2.5 min-h-[44px] rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white transition-colors cursor-pointer"
              >
                {copiedIdx === i ? "Copied!" : "Copy"}
              </button>
            </div>
            <p className="text-sm text-zinc-300 leading-relaxed">{text}</p>
          </div>
        );
      })}
      <p className="text-xs text-zinc-400">
        Replace [name] and [your name]. The link carries the 10% discount, no codes.
      </p>
    </div>
  );
}
