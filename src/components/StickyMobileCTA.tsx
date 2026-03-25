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
  label = `Get Started — ${TIER_CORE["dui-first-offense"].priceDisplay}+`,
}: StickyMobileCTAProps) {
  const [show, setShow] = useState(false);

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

  if (!show) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-amber-500/20 bg-zinc-950/95 p-3 backdrop-blur-sm md:hidden">
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
