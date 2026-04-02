"use client";

import { useState } from "react";

/**
 * ChargeTypeSelector — Homepage charge-type router
 *
 * Twelve category buttons matching all charge_categories in the DB. When a
 * category is selected, fires onSelect with the category slug so the parent
 * can update CTAs. Keeps the one-liner reveal for urgency context.
 */

const categories = [
  {
    slug: "dui-driving",
    label: "DUI & Driving",
    oneLiner:
      "DMV deadlines, breathalyzer gaps, field sobriety failures, and chain of custody breaks.",
  },
  {
    slug: "drug-offenses",
    label: "Drug Offenses",
    oneLiner:
      "Weight discrepancies, substance misidentification, informant credibility, and search legality.",
  },
  {
    slug: "violent-crimes",
    label: "Violent Crimes",
    oneLiner:
      "Self-defense analysis, witness credibility, force proportionality, and injury documentation.",
  },
  {
    slug: "property-crimes",
    label: "Property Crimes",
    oneLiner:
      "Identity evidence reliability, intent elements, value thresholds, and alibi evidence.",
  },
  {
    slug: "domestic-family",
    label: "Domestic & Family",
    oneLiner:
      "Protective order implications, primary aggressor determination, and false allegation indicators.",
  },
  {
    slug: "weapons",
    label: "Weapons",
    oneLiner:
      "Search legality, Second Amendment analysis, constructive possession, and enhancement exposure.",
  },
  {
    slug: "fraud-financial",
    label: "Fraud & Financial",
    oneLiner:
      "Document privilege, cooperation strategy, loss calculation, and asset forfeiture defense.",
  },
  {
    slug: "sex-offenses",
    label: "Sex Offenses",
    oneLiner:
      "Forensic evidence, witness credibility, investigation protocols, and registration consequences.",
  },
  {
    slug: "public-order",
    label: "Public Order",
    oneLiner:
      "Resisting arrest defenses, contempt procedures, and disorderly conduct standards.",
  },
  {
    slug: "probation-parole",
    label: "Probation Violations",
    oneLiner:
      "Violation classification, graduated sanctions, compliance documentation, and revocation alternatives.",
  },
  {
    slug: "federal-specific",
    label: "Federal",
    oneLiner:
      "Sentencing guidelines, cooperation strategy, mandatory minimums, and federal discovery rules.",
  },
  {
    slug: "other",
    label: "Other",
    oneLiner: "We research any criminal charge. Tell us what you\u2019re facing.",
  },
] as const satisfies ReadonlyArray<{
  slug: string;
  label: string;
  oneLiner: string;
}>;

interface ChargeTypeSelectorProps {
  onSelect?: (slug: string | null) => void;
}

export function ChargeTypeSelector({ onSelect }: ChargeTypeSelectorProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const selectedCategory = categories.find((c) => c.slug === selected);

  function handleSelect(slug: string) {
    const next = selected === slug ? null : slug;
    setSelected(next);
    onSelect?.(next);
  }

  return (
    <div className="mt-6">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
        What are you facing?
      </p>
      <div
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
        role="radiogroup"
        aria-label="Select your charge type"
      >
        {categories.map((category, idx) => {
          const isSelected = selected === category.slug;
          return (
            <button
              key={category.slug}
              role="radio"
              aria-checked={isSelected}
              tabIndex={isSelected || (!selected && idx === 0) ? 0 : -1}
              onClick={() => handleSelect(category.slug)}
              onKeyDown={(e) => {
                let next = -1;
                if (e.key === "ArrowRight" || e.key === "ArrowDown")
                  next = (idx + 1) % categories.length;
                if (e.key === "ArrowLeft" || e.key === "ArrowUp")
                  next = (idx - 1 + categories.length) % categories.length;
                if (next >= 0) {
                  e.preventDefault();
                  handleSelect(categories[next].slug);
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
              {category.label}
            </button>
          );
        })}
      </div>
      {selectedCategory && (
        <p
          className="mx-auto mt-3 max-w-xl text-sm text-zinc-400 transition-opacity"
          key={selectedCategory.slug}
        >
          {selectedCategory.oneLiner}
        </p>
      )}
    </div>
  );
}
