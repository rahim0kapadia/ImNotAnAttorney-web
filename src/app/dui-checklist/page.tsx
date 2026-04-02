/**
 * DUI Checklist Squeeze Page (/dui-checklist)
 *
 * Single-purpose landing page for Reddit/social links. Minimal layout —
 * headline, 3-item preview (ungated), LeadCapture for the 72-hour checklist,
 * and a direct Playbook buy link.
 *
 * User journey: Reddit/social post -> THIS PAGE -> email capture (dui-72-hours)
 *                                                -> /playbook/dui-first-offense
 */
import { LeadCapture } from "@/components/LeadCapture";
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
            className="flex items-start gap-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5"
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

      {/* LEAD CAPTURE */}
      <div className="mt-10">
        <LeadCapture
          source="dui-72-hours"
          title="Get the full 72-Hour Emergency Checklist — free"
          description="The 3 things to do tonight, the DMV deadline that could cost you your license, and the 6 questions to ask at your attorney consultation. Printable PDF. Takes 5 minutes."
          buttonText="Send Me the Checklist"
          successTitle="Your checklist is ready — download it now."
          successDescription="Handle the 3 urgent items tonight. Then prepare for your attorney meeting:"
          downloadHref="/guides/dui-first-72-hours-checklist.pdf"
          downloadLabel="Download 72-Hour Checklist →"
          successUpsellHref="/playbook/dui-first-offense"
          successUpsellLabel={`Get the Full DUI Defense Playbook \u2014 ${TIER_CORE["dui-first-offense"].priceDisplay}`}
          successUpsellDescription="The checklist covers the first 72 hours. The Playbook gives you 26 questions with good/bad answer examples, a case stage roadmap, evidence red flag checklist, and a one-page cheat sheet for your attorney meeting. Instant download."
        />
      </div>

      {/* DIRECT BUY LINK */}
      <div className="mt-10 rounded-lg border border-zinc-800 bg-zinc-900/50 p-6 text-center">
        <p className="text-sm text-zinc-400">
          Already know you need more than a checklist?
        </p>
        <Link
          href="/playbook/dui-first-offense"
          className="mt-3 inline-block rounded-lg bg-amber-500 px-6 py-3 text-sm font-bold text-black transition-all hover:scale-[1.02] hover:bg-amber-400 hover:shadow-lg hover:shadow-amber-500/20"
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
