"use client";
/**
 * Creative Assets, social posts, email swipes, verbal scripts, one-pager download.
 * Follows the same pattern as MessageTemplates.tsx, array of templates with copy buttons.
 */

import { useState } from "react";
import { copyToClipboard } from "@/lib/clipboard";

interface CreativeAssetsProps {
  promoCode: string;
  referralUrl: string;
}

const TEMPLATES = [
  {
    label: "X (Twitter) Post",
    template: (code: string, url: string) =>
      `Most people walk into court blind. The judge, prosecutor, and your own attorney all know each other, you're the only stranger in the room.\n\nThis service digs into your case and gives you the exact questions to close that gap.\n\nCode ${code} for 10% off: ${url}`,
  },
  {
    label: "Facebook Post",
    template: (code: string, url: string) =>
      `If you or someone you know is dealing with criminal charges, this changed the game for a lot of people I work with.\n\nThey research your case, charges, judge history, everything, and give you the specific questions to bring to your attorney. Not legal advice. Better: the information that closes the gap between you and everyone else in that courtroom.\n\nUse code ${code} for 10% off: ${url}`,
  },
  {
    label: "General Social Post",
    template: (code: string, url: string) =>
      `Your attorney works with the judge and prosecutor every week. You meet them once.\n\nImNotAnAttorney researches your case and gives you the questions that level the playing field. Code ${code} saves 10%: ${url}`,
  },
  {
    label: "Intro Email",
    template: (code: string, url: string) =>
      `Subject: Something that might help with your case\n\nHey [name],\n\nI wanted to pass along a resource that's helped a lot of people I work with. It's called ImNotAnAttorney, they research your specific charges, your judge, and your case details, then generate the exact questions you should be asking your attorney.\n\nIt's not legal advice, it's the information that helps you hold your attorney accountable and actually understand what's happening with your case.\n\nHere's the link: ${url}\nUse my code ${code} for 10% off.\n\nWorth checking out while everything is still fresh.\n\n[Your name]`,
  },
  {
    label: "Follow-Up Email",
    template: (code: string, url: string) =>
      `Subject: Following up, that case research tool\n\nHey [name],\n\nJust checking in. I know things are stressful right now, but I wanted to remind you about that service I mentioned, ImNotAnAttorney.\n\nThe people I've sent there say it helped them feel way more prepared for their attorney meetings. They dig into your specific case and generate questions you wouldn't think to ask.\n\nLink: ${url}\nCode ${code} = 10% off\n\nNo pressure, but the earlier you get this info the more useful it is.\n\n[Your name]`,
  },
  {
    label: "Verbal One-Liner (for bondsmen)",
    template: (code: string, url: string) =>
      `After you tell them about check-ins, say:\n\n"Free court prep, reminders before your court date and what to expect at your hearing. imnotanattorney.com, code ${code} saves you 10%."\n\nOne sentence. That's it.`,
  },
];

export function CreativeAssets({ promoCode, referralUrl }: CreativeAssetsProps) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  async function handleCopy(text: string, idx: number) {
    const ok = await copyToClipboard(text);
    if (!ok) return;
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  }

  return (
    <section className="bg-zinc-900 rounded-xl border border-zinc-700 p-6">
      <h2 className="text-xl font-bold mb-4">Creative Assets</h2>
      <p className="text-sm text-zinc-400 mb-4">
        Pre-written content for social media, email, and in-person conversations.
        Your code and link are already filled in, just copy and send.
      </p>

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
                  className="text-xs px-3 py-1 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white transition-colors cursor-pointer"
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
        <p className="text-sm text-zinc-500 italic">
          Coming soon, partner one-pager PDF with print-ready QR code and talking points.
        </p>
      </div>
    </section>
  );
}
