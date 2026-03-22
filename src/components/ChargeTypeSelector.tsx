"use client";

import { useState } from "react";

/**
 * ChargeTypeSelector — Hero personalization by charge type
 *
 * Four buttons (DUI / Drug Charge / Federal Case / Other) that reveal
 * charge-specific urgency copy when clicked. Placed in the hero section
 * below the subheadline to personalize the first impression.
 *
 * Expert source: Brunson — "A DUI defendant and a federal wire fraud
 * defendant are in completely different emotional states."
 */

const charges = [
  {
    id: "dui",
    label: "DUI",
    oneLiner:
      "Your DMV hearing deadline may be 7 days away. We\u2019ve found breathalyzer calibration gaps, field sobriety test failures, and chain of custody breaks in DUI cases.",
  },
  {
    id: "drug",
    label: "Drug Charge",
    oneLiner:
      "We\u2019ve found weight discrepancies, substance misidentification, and chain of custody breaks in drug cases. 48-hour decision window.",
  },
  {
    id: "federal",
    label: "Federal Case",
    oneLiner:
      "Federal cases move fast. We analyze discovery, identify Brady violations, and generate questions about informant credibility and surveillance protocols.",
  },
  {
    id: "other",
    label: "Other",
    oneLiner:
      "From probation violations to white collar charges \u2014 we research every case type and find what your attorney may have missed.",
  },
] as const;

export function ChargeTypeSelector() {
  const [selected, setSelected] = useState<string | null>(null);
  const selectedCharge = charges.find((c) => c.id === selected);

  return (
    <div className="mt-6">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        What are you facing?
      </p>
      <div
        className="flex flex-wrap justify-center gap-3"
        role="radiogroup"
        aria-label="Select your charge type"
      >
        {charges.map((charge) => {
          const isSelected = selected === charge.id;
          return (
            <button
              key={charge.id}
              role="radio"
              aria-checked={isSelected}
              tabIndex={isSelected || (!selected && charge.id === charges[0].id) ? 0 : -1}
              onClick={() =>
                setSelected(isSelected ? null : charge.id)
              }
              onKeyDown={(e) => {
                const ids = charges.map((c) => c.id);
                const idx = ids.indexOf(charge.id);
                let next = -1;
                if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % ids.length;
                if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (idx - 1 + ids.length) % ids.length;
                if (next >= 0) {
                  e.preventDefault();
                  setSelected(ids[next]);
                  (e.currentTarget.parentElement?.children[next] as HTMLElement)?.focus();
                }
              }}
              className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-all cursor-pointer ${
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
