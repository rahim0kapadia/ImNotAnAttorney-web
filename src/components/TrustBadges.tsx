"use client";

import { FadeInUp } from "@/components/motion/FadeInUp";

interface TrustBadgesProps {
  variant: "checkout" | "pricing" | "compact";
}

const badges = [
  {
    icon: (
      <svg className="h-5 w-5" aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
    label: "Your case is confidential \u2014 never shared with your attorney",
  },
  {
    icon: (
      <svg className="h-5 w-5" aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    label: "Delivery Guarantee",
  },
  {
    icon: (
      <svg className="h-5 w-5" aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
    label: "Stripe Secure Checkout",
  },
  {
    icon: (
      <svg className="h-5 w-5" aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    label: "Documented Methodology Guarantee",
  },
  {
    icon: (
      <svg className="h-5 w-5" aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    label: "Questions? help@imnotanattorney.com",
    sublabel: "Usually responds same day",
    checkoutOnly: true,
  },
];

export function TrustBadges({ variant }: TrustBadgesProps) {
  const filtered = variant === "checkout" ? badges : badges.filter((b) => !b.checkoutOnly);

  if (variant === "compact") {
    return (
      <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-zinc-400">
        {filtered.map((b) => (
          <span key={b.label} className="flex items-center gap-1">
            <span className="text-zinc-400">{b.icon}</span>
            {b.label}
          </span>
        ))}
      </div>
    );
  }

  if (variant === "checkout") {
    return (
      <FadeInUp>
        <div className="flex flex-wrap items-center justify-center gap-6 rounded-lg border border-zinc-500 bg-zinc-900/50 px-6 py-4">
          {filtered.map((b) => (
            <span key={b.label} className="flex items-center gap-2 text-sm text-zinc-400">
              <span className="text-amber-500">{b.icon}</span>
              <span>
                {b.label}
                {b.sublabel && <span className="block text-xs text-zinc-400">{b.sublabel}</span>}
              </span>
            </span>
          ))}
        </div>
      </FadeInUp>
    );
  }

  // "pricing" variant
  return (
    <FadeInUp>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-6">
        {filtered.map((b) => (
          <span key={b.label} className="flex items-center gap-2 text-sm text-zinc-400">
            <span className="text-amber-400">{b.icon}</span>
            {b.label}
          </span>
        ))}
      </div>
    </FadeInUp>
  );
}
