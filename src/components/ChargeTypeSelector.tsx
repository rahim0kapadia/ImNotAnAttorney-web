"use client";

import { useState } from "react";
import type { TierSlug } from "@/lib/tiers";

/**
 * ChargeTypeSelector — Homepage charge-type router
 *
 * Eight buttons matching all playbook configs. When a charge is selected,
 * fires onSelect with the tier slug so the parent can update CTAs.
 * Keeps the one-liner reveal for urgency context.
 */

const charges = [
  {
    id: "dui-first-offense",
    label: "DUI",
    oneLiner:
      "Your DMV hearing deadline may be 7 days away. We\u2019ve found breathalyzer calibration gaps, field sobriety test failures, and chain of custody breaks in DUI cases.",
  },
  {
    id: "drug-possession",
    label: "Drug Possession",
    oneLiner:
      "We\u2019ve found weight discrepancies, substance misidentification, and chain of custody breaks in drug possession cases. 48-hour decision window.",
  },
  {
    id: "drug-trafficking",
    label: "Drug Trafficking",
    oneLiner:
      "Trafficking cases hinge on weight thresholds, informant credibility, and surveillance protocols. We analyze every link in the chain.",
  },
  {
    id: "probation-violation",
    label: "Probation Violation",
    oneLiner:
      "Violation hearings move fast \u2014 often within 2 weeks. We identify procedural gaps, officer inconsistencies, and conditions that may have been misapplied.",
  },
  {
    id: "white-collar",
    label: "White Collar",
    oneLiner:
      "Financial cases generate thousands of pages of discovery. We trace document inconsistencies, identify overreach, and generate questions about forensic accounting methods.",
  },
  {
    id: "sex-offense",
    label: "Sex Offense",
    oneLiner:
      "These cases carry the highest stakes and the most complexity. We analyze forensic evidence, witness credibility, and investigation protocols.",
  },
  {
    id: "federal-criminal",
    label: "Federal Criminal",
    oneLiner:
      "Federal cases move fast. We analyze discovery, identify Brady violations, and generate questions about informant credibility and surveillance protocols.",
  },
  {
    id: "self-defense",
    label: "Self-Defense",
    oneLiner:
      "Justifiable force cases depend on timeline reconstruction, witness statements, and proportionality analysis. We research the legal standards in your jurisdiction.",
  },
] as const satisfies ReadonlyArray<{ id: TierSlug; label: string; oneLiner: string }>;

interface ChargeTypeSelectorProps {
  onSelect?: (slug: TierSlug | null) => void;
}

export function ChargeTypeSelector({ onSelect }: ChargeTypeSelectorProps) {
  const [selected, setSelected] = useState<TierSlug | null>(null);
  const selectedCharge = charges.find((c) => c.id === selected);

  function handleSelect(id: TierSlug) {
    const next = selected === id ? null : id;
    setSelected(next);
    onSelect?.(next);
  }

  return (
    <div className="mt-6">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        What are you facing?
      </p>
      <div
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
        role="radiogroup"
        aria-label="Select your charge type"
      >
        {charges.map((charge, idx) => {
          const isSelected = selected === charge.id;
          return (
            <button
              key={charge.id}
              role="radio"
              aria-checked={isSelected}
              tabIndex={isSelected || (!selected && idx === 0) ? 0 : -1}
              onClick={() => handleSelect(charge.id)}
              onKeyDown={(e) => {
                let next = -1;
                if (e.key === "ArrowRight" || e.key === "ArrowDown")
                  next = (idx + 1) % charges.length;
                if (e.key === "ArrowLeft" || e.key === "ArrowUp")
                  next = (idx - 1 + charges.length) % charges.length;
                if (next >= 0) {
                  e.preventDefault();
                  handleSelect(charges[next].id);
                  (
                    e.currentTarget.parentElement?.children[next] as HTMLElement
                  )?.focus();
                }
              }}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-all cursor-pointer ${
                isSelected
                  ? "border-amber-500 bg-amber-500/5 text-amber-400"
                  : "border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-600"
              }`}
            >
              {charge.label}
            </button>
          );
        })}
      </div>
      {selectedCharge && (
        <p
          className="mx-auto mt-3 max-w-xl text-sm text-zinc-400 transition-opacity"
          key={selectedCharge.id}
        >
          {selectedCharge.oneLiner}
        </p>
      )}
    </div>
  );
}
