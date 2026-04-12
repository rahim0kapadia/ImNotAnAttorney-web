"use client";
/**
 * Partner Compliance Kit — approved/prohibited language + FTC disclosure templates.
 * Helps partners stay within legal guidelines when promoting the service.
 */

import { useState } from "react";
import { copyToClipboard } from "@/lib/clipboard";

const APPROVED_LANGUAGE = [
  "This service researches your case and generates questions for your attorney",
  "They provide legal information, not legal advice",
  "It helps you hold your attorney accountable",
  "They dig into your case facts and give you the right questions to ask",
];

const PROHIBITED_LANGUAGE = [
  "No promising outcomes (\"you'll win\", \"charges will be dropped\")",
  "No anti-attorney language (\"lawyers are scammers\", \"fire your attorney\")",
  "No case outcome predictions (\"this will get dismissed\")",
  "No legal advice (\"you should plead not guilty\")",
  "No implying attorney-client relationship (\"our attorneys\", \"your legal team\")",
];

const FTC_DISCLOSURES = [
  {
    label: "Social Media",
    template:
      "#ad I earn a commission when you use my code. All opinions are my own.",
  },
  {
    label: "Email",
    template:
      "Disclosure: I earn a referral commission if you purchase through my link. I recommend this service because I've seen it help people in your situation.",
  },
  {
    label: "In Person (verbal for bondsmen)",
    template:
      "Full transparency — I get a referral fee if you use my code. I recommend them because my clients tell me it helped them feel more prepared.",
  },
];

export function ComplianceKit() {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  async function handleCopy(text: string, idx: number) {
    const ok = await copyToClipboard(text);
    if (!ok) return;
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  }

  return (
    <section className="bg-zinc-900 rounded-xl border border-zinc-500 p-6">
      <h2 className="text-xl font-bold mb-4">Compliance Kit</h2>
      <p className="text-sm text-zinc-400 mb-6">
        Stay compliant with these guidelines. Using approved language protects
        you and builds trust with defendants.
      </p>

      {/* Approved Language */}
      <div className="mb-6">
        <h3 className="text-sm font-medium text-green-400 mb-3">
          Approved Language
        </h3>
        <ul className="space-y-2">
          {APPROVED_LANGUAGE.map((text, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
              <span className="text-green-400 mt-0.5 shrink-0">&#10003;</span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Prohibited Language */}
      <div className="mb-6">
        <h3 className="text-sm font-medium text-red-400 mb-3">
          Prohibited Language
        </h3>
        <ul className="space-y-2">
          {PROHIBITED_LANGUAGE.map((text, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
              <span className="text-red-400 mt-0.5 shrink-0">&#10007;</span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* FTC Disclosure Templates */}
      <div>
        <h3 className="text-sm font-medium text-amber-400 mb-3">
          FTC Disclosure Templates
        </h3>
        <div className="space-y-3">
          {FTC_DISCLOSURES.map((d, i) => (
            <div
              key={i}
              className="bg-zinc-800 rounded-xl p-4 border border-zinc-700"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-amber-400">
                  {d.label}
                </span>
                <button
                  onClick={() => handleCopy(d.template, i)}
                  className="text-xs px-3 py-1 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white transition-colors"
                >
                  {copiedIdx === i ? "Copied!" : "Copy"}
                </button>
              </div>
              <p className="text-sm text-zinc-300 leading-relaxed">
                {d.template}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
