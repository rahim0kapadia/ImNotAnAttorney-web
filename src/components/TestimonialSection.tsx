"use client";

import { FadeInUp } from "@/components/motion/FadeInUp";
import { StaggerContainer, StaggerItem } from "@/components/motion/StaggerContainer";

interface Testimonial {
  quote: string;
  name: string;
  charge: string;
  outcome: string;
}

interface TestimonialSectionProps {
  testimonials: Testimonial[];
  variant: "inline" | "grid";
}

export function TestimonialSection({ testimonials, variant }: TestimonialSectionProps) {
  if (variant === "inline") {
    return (
      <div className="flex flex-col gap-6 md:flex-row">
        {testimonials.map((t, i) => (
          <FadeInUp key={i} delay={i * 0.15} className="flex-1">
            <figure className="rounded-xl border-l-4 border-amber-500/50 bg-zinc-900/50 p-6">
              <blockquote>
                <p className="text-base leading-relaxed text-zinc-300 italic">
                  &ldquo;{t.quote}&rdquo;
                </p>
              </blockquote>
              <figcaption className="mt-4">
                <p className="text-base font-semibold text-white">{t.name}</p>
                <p className="text-xs text-zinc-400">{t.charge} &middot; {t.outcome}</p>
              </figcaption>
            </figure>
          </FadeInUp>
        ))}
      </div>
    );
  }

  // "grid" variant
  return (
    <StaggerContainer className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {testimonials.map((t, i) => (
        <StaggerItem key={i}>
          <figure className="rounded-xl border-l-4 border-amber-500/50 bg-zinc-900/50 p-6 h-full">
            <blockquote>
              <p className="text-base leading-relaxed text-zinc-300 italic">
                &ldquo;{t.quote}&rdquo;
              </p>
            </blockquote>
            <figcaption className="mt-4">
              <p className="text-sm font-semibold text-white">{t.name}</p>
              <p className="text-xs text-zinc-400">{t.charge} &middot; {t.outcome}</p>
            </figcaption>
          </figure>
        </StaggerItem>
      ))}
    </StaggerContainer>
  );
}
