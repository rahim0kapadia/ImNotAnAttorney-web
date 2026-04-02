"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { TIER_CORE } from "@/lib/tiers";

interface StickyMobileCTAProps {
  href?: string;
  label?: string;
}

export function StickyMobileCTA({
  href = "/start",
  label = `See What Your Case Reveals — from ${TIER_CORE["dui-first-offense"].priceDisplay}`,
}: StickyMobileCTAProps) {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        // Show CTA when hero is NOT in view (user scrolled past)
        setShow(!entry.isIntersecting);
      },
      { threshold: 0 }
    );

    // Observe the hero section (first section on page)
    const hero = document.querySelector("section");
    if (hero) observer.observe(hero);

    return () => observer.disconnect();
  }, []);

  if (!show || dismissed) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-amber-500/20 bg-zinc-950/95 p-3 backdrop-blur-sm md:hidden">
      <button
        onClick={() => setDismissed(true)}
        className="absolute -top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-xs text-zinc-400 hover:text-white"
        aria-label="Dismiss"
      >
        <span aria-hidden="true">&times;</span>
      </button>
      <Link
        href={href}
        className="block w-full rounded-lg bg-amber-500 py-3 text-center text-sm font-bold text-black transition-colors hover:bg-amber-400"
        style={{ minHeight: "44px" }}
      >
        {label} &rarr;
      </Link>
    </div>
  );
}
