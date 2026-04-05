"use client";

import { useRef } from "react";
import {
  Car,
  Pill,
  ShieldAlert,
  Home,
  Users,
  Crosshair,
  CreditCard,
  Shield,
  Megaphone,
  Lock,
  Landmark,
  HelpCircle,
} from "lucide-react";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  car: Car,
  pill: Pill,
  "shield-alert": ShieldAlert,
  home: Home,
  users: Users,
  crosshair: Crosshair,
  "credit-card": CreditCard,
  shield: Shield,
  megaphone: Megaphone,
  lock: Lock,
  landmark: Landmark,
  "help-circle": HelpCircle,
};

export interface ChargeCategoryOption {
  slug: string;
  label: string;
  description: string | null;
  icon_name: string | null;
}

interface IntakeChargeCategoriesProps {
  categories: ChargeCategoryOption[];
  selectedSlug: string | null;
  onSelect: (categorySlug: string | null) => void;
}

export function IntakeChargeCategories({
  categories,
  selectedSlug,
  onSelect,
}: IntakeChargeCategoriesProps) {
  const gridRef = useRef<HTMLDivElement>(null);

  function handleSelect(slug: string) {
    const next = selectedSlug === slug ? null : slug;
    onSelect(next);
  }

  function handleKeyDown(
    e: React.KeyboardEvent<HTMLButtonElement>,
    idx: number
  ) {
    let nextIdx = -1;

    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      nextIdx = (idx + 1) % categories.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      nextIdx = (idx - 1 + categories.length) % categories.length;
    } else {
      return;
    }

    e.preventDefault();
    const nextSlug = categories[nextIdx].slug;
    onSelect(nextSlug);

    const buttons =
      gridRef.current?.querySelectorAll<HTMLButtonElement>("[role='radio']");
    buttons?.[nextIdx]?.focus();
  }

  return (
    <div
      ref={gridRef}
      role="radiogroup"
      aria-label="Select your charge category"
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
    >
      {categories.map((category, idx) => {
        const isSelected = selectedSlug === category.slug;
        const IconComponent = category.icon_name
          ? ICON_MAP[category.icon_name]
          : null;
        const Icon = IconComponent ?? HelpCircle;

        return (
          <button
            key={category.slug}
            role="radio"
            aria-checked={isSelected}
            tabIndex={isSelected || (!selectedSlug && idx === 0) ? 0 : -1}
            onClick={() => handleSelect(category.slug)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={[
              "flex flex-col items-start gap-1.5 rounded-lg border px-4 py-3 text-left",
              "transition-colors duration-150 cursor-pointer",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500",
              "focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
              isSelected
                ? "border-amber-500 bg-amber-500/5 text-amber-400"
                : "border-zinc-500 bg-zinc-900/50 text-zinc-400 hover:border-zinc-500",
            ].join(" ")}
          >
            <Icon className="h-6 w-6 shrink-0" />
            <span className="font-semibold text-sm leading-snug">
              {category.label}
            </span>
            {category.description && (
              <span className="line-clamp-2 text-xs text-zinc-400 leading-snug">
                {category.description}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
