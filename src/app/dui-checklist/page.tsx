/**
 * DUI Checklist Landing Page (/dui-checklist)
 *
 * Single-purpose landing page for Reddit/social links. Minimal layout —
 * headline, 3-item checklist (fully ungated), /score CTA,
 * and a direct Playbook buy link.
 *
 * User journey: Reddit/social post -> THIS PAGE -> read checklist freely
 *                                                -> /score (free quiz)
 *                                                -> /playbook/dui-first-offense
 */
import { SITE_URL } from "@/lib/site";
import { TIER_CORE } from "@/lib/tiers";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "What to Do After a DUI Arrest — Free 72-Hour Checklist",
  description:
    "You were just arrested for DUI. Here are the 3 things to do in the next 72 hours, including the DMV deadline that could cost your license. Free checklist.",
  alternates: {
    canonical: `${SITE_URL}/dui-checklist`,
  },
  openGraph: {
    title: "You Were Just Arrested for DUI. Here's What to Do Next.",
    description:
      "3 things to do in the next 72 hours. Your DMV hearing deadline may be 7 days away. Free checklist — no signup required to preview.",
  },
};

export default function DuiChecklistPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      {/* HEADLINE */}
      <h1 className="font-display text-3xl font-bold leading-tight text-white sm:text-4xl">
        You Were Just Arrested for DUI.
        <br />
        <span className="text-amber-400">
          Here&apos;s What to Do in the Next 72 Hours.
        </span>
      </h1>
      <p className="mt-4 text-lg text-zinc-400">
        Your DMV hearing deadline may be as short as{" "}
        <span className="font-semibold text-amber-400">7 days</span> from
        arrest. Miss it and you lose your license automatically — no hearing, no
        appeal.
      </p>

      {/* 3-ITEM PREVIEW — Ungated proof of value */}
      <div className="mt-10 space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
          Inside the checklist
        </h2>
        {[
          {
            number: "1",
            title: "Check your state\u2019s DMV hearing deadline",
            desc: "Some states give you as few as 7 days from arrest. Miss the window and your license is automatically suspended \u2014 even before your court date. Deadlines vary by state \u2014 verify the timeline in your jurisdiction.",
          },
          {
            number: "2",
            title: "Document everything while it's fresh",
            desc: "What happened before the stop. What the officer said. Whether you were read your rights. Your memory fades — write it down now.",
          },
          {
            number: "3",
            title: "Know what to ask before you hire an attorney",
            desc: "6 questions that help you find a DUI specialist who\u2019s the right fit. Questions informed by Lawrence Taylor\u2019s DUI defense methodology. Ask these before you sign anything.",
          },
        ].map((item) => (
          <div
            key={item.number}
            className="flex items-start gap-4 rounded-lg border border-zinc-500 bg-zinc-900/50 p-5"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-sm font-bold text-amber-400">
              {item.number}
            </div>
            <div>
              <p className="font-semibold text-white">{item.title}</p>
              <p className="mt-1 text-sm text-zinc-400">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* SCORE CTA — Free defense quiz */}
      <div className="mt-10 rounded-xl border border-amber-500/30 bg-amber-500/5 p-8 text-center">
        <h2 className="text-lg font-bold text-white">
          Want to see how your DUI defense scores?
        </h2>
        <p className="mt-2 text-sm text-zinc-400">
          10 questions. 60 seconds. See how your case measures up against
          the milestones that matter.
        </p>
        <Link
          href="/score"
          className="mt-4 inline-block rounded-lg bg-amber-500 px-6 py-3 text-sm font-bold text-black transition-all hover:scale-[1.02] focus-visible:scale-[1.02] hover:bg-amber-400 hover:shadow-lg hover:shadow-amber-500/20"
        >
          Take the Defense Milestone Score — Free
        </Link>
      </div>

      {/* DIRECT BUY LINK */}
      <div className="mt-10 rounded-lg border border-zinc-500 bg-zinc-900/50 p-6 text-center">
        <p className="text-sm text-zinc-400">
          Already know you need more than a checklist?
        </p>
        <Link
          href="/playbook/dui-first-offense"
          className="mt-3 inline-block rounded-lg bg-amber-500 px-6 py-3 text-sm font-bold text-black transition-all hover:scale-[1.02] focus-visible:scale-[1.02] hover:bg-amber-400 hover:shadow-lg hover:shadow-amber-500/20"
        >
          Get the DUI Defense Playbook — {TIER_CORE["dui-first-offense"].priceDisplay} Instant Download
        </Link>
        <p className="mt-2 text-xs text-zinc-400">
          26 questions, evidence red flag checklist, case stage roadmap, one-page cheat sheet.
          Your {TIER_CORE["dui-first-offense"].priceDisplay} is credited toward the{" "}
          {TIER_CORE["case-decoder"].name} within 30 days.
        </p>
      </div>
    </div>
  );
}
