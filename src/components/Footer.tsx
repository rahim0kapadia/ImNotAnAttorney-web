/**
 * Footer -- Site-wide footer with navigation, legal links, and CAN-SPAM compliance.
 *
 * Layout (5-column grid on desktop, stacked on mobile):
 *   1. Brand column: Logo, tagline, "not legal advice" disclaimer, X/Twitter social link.
 *   2. Explore: Blog, Services, Resources, About, Get Started.
 *   3. Blog Topics: Category filter links (DUI, Drug Cases, White Collar, General Defense).
 *   4. Our Services: Direct checkout links with prices for all 5 tiers.
 *   5. Legal: Terms, Privacy, Contact, Sitemap + CAN-SPAM required physical address.
 *
 * CAN-SPAM compliance: The physical mailing address (195 Dr MLK Jr St N, St Petersburg,
 * FL 33701) is required by federal law for commercial email. Do NOT remove it.
 *
 * The full-width disclaimer banner at the bottom reinforces the "not legal advice"
 * positioning, which is critical for UPL (unauthorized practice of law) risk mitigation.
 *
 * Copyright year is dynamically generated via `new Date().getFullYear()`.
 */
"use client";

import Link from "next/link";
import { TIER_CORE } from "@/lib/tiers";
import { FadeInUp } from "@/components/motion/FadeInUp";

export function Footer() {
  return (
    <footer className="border-t border-zinc-800 bg-zinc-950">
      <FadeInUp>
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-8 md:grid-cols-5">
          {/* Brand */}
          <div className="md:col-span-1">
            <Link href="/" className="text-lg font-bold tracking-tight">
              Im<span className="text-amber-400">Not</span>AnAttorney
            </Link>
            <p className="mt-3 text-sm text-zinc-400">
              We Research. You Ask.
            </p>
            <p className="mt-2 text-xs text-zinc-400">
              Legal information, not legal advice.
            </p>
            <a href="https://x.com/ImNotAnAttorney" target="_blank" rel="noopener noreferrer"
               className="mt-3 inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white">
              <svg className="h-4 w-4" aria-hidden="true" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
              @ImNotAnAttorney
            </a>
          </div>

          {/* Pages */}
          <div>
            <h2 className="mb-3 text-sm font-semibold text-zinc-300">Explore</h2>
            <div className="flex flex-col gap-2">
              <Link
                href="/blog"
                className="text-sm text-zinc-400 hover:text-white"
              >
                Blog
              </Link>
              <Link
                href="/services"
                className="text-sm text-zinc-400 hover:text-white"
              >
                Services
              </Link>
              <Link
                href="/resources"
                className="text-sm text-zinc-400 hover:text-white"
              >
                Free Resources
              </Link>
              <Link
                href="/about"
                className="text-sm text-zinc-400 hover:text-white"
              >
                About
              </Link>
              <Link
                href="/intake"
                className="text-sm text-amber-400 hover:text-amber-300"
              >
                Get Started →
              </Link>
            </div>
          </div>

          {/* Categories */}
          <div>
            <h2 className="mb-3 text-sm font-semibold text-zinc-300">
              Blog Topics
            </h2>
            <div className="flex flex-col gap-2">
              <Link
                href="/blog?category=dui"
                className="text-sm text-zinc-400 hover:text-white"
              >
                DUI Defense
              </Link>
              <Link
                href="/blog?category=drug-cases"
                className="text-sm text-zinc-400 hover:text-white"
              >
                Drug Cases
              </Link>
              <Link
                href="/blog?category=white-collar"
                className="text-sm text-zinc-400 hover:text-white"
              >
                White Collar
              </Link>
              <Link
                href="/blog?category=general-defense"
                className="text-sm text-zinc-400 hover:text-white"
              >
                General Defense
              </Link>
            </div>
          </div>

          {/* Services */}
          <div>
            <h2 className="mb-3 text-sm font-semibold text-zinc-300">
              Our Services
            </h2>
            <div className="flex flex-col gap-2">
              <Link
                href="/checkout?tier=case-decoder"
                className="text-sm text-zinc-400 hover:text-white"
              >
                {TIER_CORE["case-decoder"].name} ({TIER_CORE["case-decoder"].priceDisplay})
              </Link>
              <Link
                href="/checkout?tier=intelligence-brief"
                className="text-sm text-zinc-400 hover:text-white"
              >
                {TIER_CORE["intelligence-brief"].name} ({TIER_CORE["intelligence-brief"].priceDisplay})
              </Link>
              <Link
                href="/checkout?tier=x-ray"
                className="text-sm text-zinc-400 hover:text-white"
              >
                {TIER_CORE["x-ray"].name} ({TIER_CORE["x-ray"].priceDisplay})
              </Link>
              <Link
                href="/checkout?tier=war-room"
                className="text-sm text-zinc-400 hover:text-white"
              >
                {TIER_CORE["war-room"].name} ({TIER_CORE["war-room"].priceDisplay})
              </Link>
              <Link
                href="/checkout?tier=situation-room"
                className="text-sm text-zinc-400 hover:text-white"
              >
                {TIER_CORE["situation-room"].name} ({TIER_CORE["situation-room"].priceDisplay})
              </Link>
              <Link
                href="/services"
                className="text-sm text-amber-400 hover:text-amber-300"
              >
                View All Services →
              </Link>
            </div>
          </div>

          {/* Legal & Connect */}
          <div>
            <h2 className="mb-3 text-sm font-semibold text-zinc-300">
              Legal
            </h2>
            <div className="flex flex-col gap-2">
              <Link
                href="/terms"
                className="text-sm text-zinc-400 hover:text-white"
              >
                Terms of Service
              </Link>
              <Link
                href="/privacy"
                className="text-sm text-zinc-400 hover:text-white"
              >
                Privacy Policy
              </Link>
              <Link
                href="/contact"
                className="text-sm text-zinc-400 hover:text-white"
              >
                Contact
              </Link>
              <Link
                href="/sitemap.xml"
                className="text-sm text-zinc-400 hover:text-white"
                prefetch={false}
              >
                Sitemap
              </Link>
            </div>
            <p className="mt-4 text-xs text-zinc-400">
              195 Dr MLK Jr St N
              <br />
              St Petersburg, FL 33701
            </p>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="mt-8 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs text-zinc-400">
            <strong className="text-zinc-400">Disclaimer:</strong>{" "}
            ImNotAnAttorney provides legal information and research services,
            not legal advice. We are not a law firm and do not create an
            attorney-client relationship. Your attorney remains the final authority on
            strategy decisions specific to your situation.
          </p>
        </div>

        <div className="mt-8 border-t border-zinc-800 pt-8 text-center text-xs text-zinc-400">
          © {new Date().getFullYear()} ImNotAnAttorney. All rights reserved.
        </div>
      </div>
      </FadeInUp>
    </footer>
  );
}
