"use client";

import { useState, useRef } from "react";

/**
 * IntakeChargeSelector — Second-step charge picker within a category.
 *
 * Receives a pre-fetched, pre-sorted list of charges (with optional
 * jurisdiction-specific statute numbers) from the parent.  Renders
 * full-width stacked cards in a radiogroup with arrow-key navigation.
 *
 * When the user selects "My charge isn't listed", a free-text input
 * appears and all charge selections are cleared.
 */

interface ChargeWithStatute {
  slug: string;
  label: string;
  description: string | null;
  statute_number?: string | null;
  offense_class?: string | null;
}

interface IntakeChargeSelectorProps {
  charges: ChargeWithStatute[];
  jurisdiction: string | null; // e.g. "FL", "CA", null
  selectedSlug: string | null;
  onSelect: (commonChargeSlug: string | null) => void;
  onFreeText: (text: string) => void;
}

const FREE_TEXT_SLUG = "__free_text__";

export function IntakeChargeSelector({
  charges,
  jurisdiction,
  selectedSlug,
  onSelect,
  onFreeText,
}: IntakeChargeSelectorProps) {
  const [freeTextActive, setFreeTextActive] = useState(false);
  const [freeTextValue, setFreeTextValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // All option slugs including the sentinel for arrow-key navigation
  const allSlugs = [...charges.map((c) => c.slug), FREE_TEXT_SLUG];

  // Which slug is currently "roving-tabindex active" for the radiogroup
  const activeSlug = freeTextActive
    ? FREE_TEXT_SLUG
    : selectedSlug ?? allSlugs[0];

  function selectCharge(slug: string) {
    if (slug === FREE_TEXT_SLUG) {
      setFreeTextActive(true);
      onSelect(null);
      // Focus the text input on the next paint
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      const toggled = selectedSlug === slug ? null : slug;
      setFreeTextActive(false);
      setFreeTextValue("");
      onSelect(toggled);
    }
  }

  function handleFreeTextChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setFreeTextValue(value);
    onFreeText(value);
  }

  function handleKeyDown(e: React.KeyboardEvent, currentSlug: string) {
    const idx = allSlugs.indexOf(currentSlug);
    let nextIdx = -1;

    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      nextIdx = (idx + 1) % allSlugs.length;
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      nextIdx = (idx - 1 + allSlugs.length) % allSlugs.length;
    }

    if (nextIdx >= 0) {
      e.preventDefault();
      const nextSlug = allSlugs[nextIdx];
      selectCharge(nextSlug);
      // Move DOM focus to the next radio item
      const group = e.currentTarget.closest('[role="radiogroup"]');
      if (group) {
        const items = group.querySelectorAll<HTMLElement>('[role="radio"]');
        items[nextIdx]?.focus();
      }
    }
  }

  function formatStatuteInfo(charge: ChargeWithStatute): string | null {
    if (!jurisdiction || !charge.statute_number) return null;
    const parts: string[] = [`${jurisdiction} ${charge.statute_number}`];
    if (charge.offense_class) parts.push(charge.offense_class);
    return parts.join(" — ");
  }

  return (
    <div
      role="radiogroup"
      aria-label="Select your specific charge"
      className="flex flex-col gap-2"
    >
      {charges.map((charge) => {
        const isSelected = !freeTextActive && selectedSlug === charge.slug;
        const statuteInfo = formatStatuteInfo(charge);

        return (
          <button
            key={charge.slug}
            role="radio"
            aria-checked={isSelected}
            tabIndex={activeSlug === charge.slug ? 0 : -1}
            onClick={() => selectCharge(charge.slug)}
            onKeyDown={(e) => handleKeyDown(e, charge.slug)}
            className={`w-full cursor-pointer rounded-lg border px-4 py-3 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 ${
              isSelected
                ? "border-amber-500 bg-amber-500/5"
                : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-600"
            }`}
          >
            <span className="flex items-center justify-between gap-4">
              <span className="font-semibold text-zinc-200">
                {charge.label}
              </span>
              {statuteInfo !== null && (
                <span className="shrink-0 text-xs text-zinc-400">
                  {statuteInfo}
                </span>
              )}
            </span>
            {charge.description !== null && (
              <span className="mt-0.5 block text-xs leading-snug text-zinc-400">
                {charge.description}
              </span>
            )}
          </button>
        );
      })}

      {/* "My charge isn't listed" option */}
      <div
        role="radio"
        aria-checked={freeTextActive}
        tabIndex={activeSlug === FREE_TEXT_SLUG ? 0 : -1}
        onClick={() => selectCharge(FREE_TEXT_SLUG)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            selectCharge(FREE_TEXT_SLUG);
          } else {
            handleKeyDown(e, FREE_TEXT_SLUG);
          }
        }}
        className={`w-full cursor-pointer rounded-lg border px-4 py-3 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 ${
          freeTextActive
            ? "border-amber-500 bg-amber-500/5"
            : "border-dashed border-zinc-700 bg-zinc-900/50 hover:border-zinc-500"
        }`}
      >
        <span className="block font-semibold text-zinc-400">
          My charge isn&apos;t listed
        </span>

        {freeTextActive && (
          <div
            className="mt-2"
            role="presentation"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <input
              ref={inputRef}
              type="text"
              value={freeTextValue}
              onChange={handleFreeTextChange}
              placeholder="Describe your charge"
              aria-label="Describe your charge"
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>
        )}
      </div>
    </div>
  );
}
