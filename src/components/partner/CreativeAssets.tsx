"use client";
/**
 * Creative Assets, social posts, email swipes, verbal scripts, one-pager download.
 * Follows the same pattern as MessageTemplates.tsx, array of templates with copy buttons.
 * First template is a mode-aware verbal one-liner (check-in vs bail desk); rest are shared.
 */

import { useState } from "react";
import { copyToClipboard } from "@/lib/clipboard";

interface CreativeAssetsProps {
  promoCode: string;
  referralUrl: string;
  checkInEnabled: boolean;
}

type Template = { label: string; template: (code: string, url: string) => string };

const SHARED_TEMPLATES: Template[] = [
  {
    label: "X (Twitter) Post",
    template: (_c, url) =>
      `Most people walk into court blind. The judge, prosecutor, and your attorney all know each other. You're the only stranger in the room.\n\nThis service asks 10 questions about your case and gives back 25 specific questions your attorney should be able to answer.\n\n10% off baked into this link: ${url}\n\n— [your name]`,
  },
  {
    label: "Facebook Post",
    template: (_c, url) =>
      `If you or someone you know is dealing with criminal charges, this changed the game for a lot of people I work with.\n\nThey research your case, charges, judge history, everything, and give you the specific questions to bring to your attorney. Not legal advice. Better: the information that closes the gap between you and everyone else in that courtroom.\n\n(Discount built into the link. No code.)\n${url}\n\n— [your name]`,
  },
  {
    label: "General Social Post",
    template: (_c, url) =>
      `Your attorney works with the judge and prosecutor every week. You meet them once.\n\nImNotAnAttorney researches your case and gives you the questions that level the playing field.\n\nLink + 10% off: ${url}\n\n— [your name]`,
  },
  {
    label: "Intro Email",
    template: (_c, url) =>
      `Subject: Something that might help with your case\n\nHey [name],\n\nI wanted to pass along a resource that's helped a lot of people I work with. It's called ImNotAnAttorney. They research your specific charges, your judge, and your case details, then generate the exact questions you should be asking your attorney.\n\nIt's not legal advice. It's the information that helps you hold your attorney accountable and actually understand what's happening with your case.\n\nHere's the link: ${url}\n(Because you're our client, 10% off, that's $100 off case analysis, is already in the link. No code to remember.)\n\nWorth checking out while everything is still fresh.\n\n[Your name]`,
  },
  {
    label: "Follow-Up Email",
    template: (_c, url) =>
      `Subject: Still worth checking out, that case research\n\nHey [name],\n\nThree weeks in, the people I've sent to ImNotAnAttorney say the same thing: they walked into their next attorney meeting knowing what to ask, instead of nodding along.\n\nThat's the whole point. They dig into your case, your charges, and your judge, and give you the exact questions.\n\nLink: ${url}\n(The $100 off is already in the link. No code.)\n\nDo it while the details are still fresh.\n\n[Your name]`,
  },
];

const VERBAL_CHECK_IN: Template = {
  label: "Verbal One-Liner (for check-ins)",
  template: (_c, url) =>
    `After you tell them about check-ins, say:\n\n"Your court date reminders and what to expect at your hearing are on this link. ${url.replace(/^https?:\/\//, "")}. Because you're our client, 10% off is already built in."\n\nOne sentence. That's it.`,
};

const VERBAL_REFERRAL: Template = {
  label: "Verbal One-Liner (at the bail desk)",
  template: (_c, url) =>
    `When you hand them the bail paperwork, say:\n\n"Your court date reminders and hearing prep are on this card. Scan the QR or go to the link. Because you're our client, 10% off is built in if you want deeper case analysis."\n\nOne sentence. That's it.`,
};

export function CreativeAssets({ promoCode, referralUrl, checkInEnabled }: CreativeAssetsProps) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  async function handleCopy(text: string, idx: number) {
    const ok = await copyToClipboard(text);
    if (!ok) return;
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  }

  const templates: Template[] = [
    checkInEnabled ? VERBAL_CHECK_IN : VERBAL_REFERRAL,
    ...SHARED_TEMPLATES,
  ];

  return (
    <section className="bg-zinc-900 rounded-xl border border-zinc-700 p-6">
      <h2 className="text-xl font-bold mb-4">Flyers &amp; cards to print</h2>
      <p className="text-sm text-zinc-400 mb-4">
        Pre-written content for social media, email, and in-person conversations.
        Your code and link are already filled in, just copy and send.
      </p>

      <div className="space-y-3">
        {templates.map((t, i) => {
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
                  className="text-sm px-4 py-2.5 min-h-[44px] rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white transition-colors cursor-pointer"
                  aria-label={copiedIdx === i ? "Copied" : `Copy ${t.label} template`}
                  aria-live="polite"
                >
                  {copiedIdx === i ? "Copied!" : "Copy"}
                </button>
              </div>
              <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-line">
                {text}
              </p>
            </div>
          );
        })}
      </div>

      {/* One-pager download, PDF not yet available */}
      <div className="mt-4 pt-4 border-t border-zinc-700">
        <p className="text-sm text-zinc-400 italic">
          Coming soon, partner one-pager PDF with print-ready QR code and talking points.
        </p>
      </div>
    </section>
  );
}
