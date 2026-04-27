/**
 * Footer -- Site-wide footer with navigation, legal links, and CAN-SPAM compliance.
 *
 * Layout (5-column grid on desktop, stacked on mobile):
 *   1. Brand column: Logo, tagline, "not legal advice" disclaimer.
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
// Server component, no client-side interactivity needed

import Image from "next/image";
import Link from "next/link";
import { TIER_CORE } from "@/lib/tiers";
import { BRAND_UPL_DISCLAIMER } from "@/lib/copy/disclaimers";

// minimal: drop "Playbooks" + "Our Services" columns (they surface the
// $2,497-$9,997 tier prices). Rendered on free-tool surfaces where the
// full catalog reads as bait next to a $0 calculator.
export function Footer({ variant = "full" }: { variant?: "full" | "minimal" }) {
  const showCatalog = variant === "full";
  const gridCols = showCatalog ? "md:grid-cols-5" : "md:grid-cols-3";
  return (
    <footer className="border-t border-zinc-500 bg-zinc-950">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="mb-8 rounded-lg border border-amber-500/20 bg-amber-500/5 px-6 py-4 text-center">
          <p className="text-sm text-zinc-300">
            Questions?{" "}
            <a
              href="mailto:help@imnotanattorney.com"
              className="font-semibold text-amber-400 underline decoration-amber-400/50 hover:decoration-amber-400"
            >
              help@imnotanattorney.com
            </a>
            {" "}&mdash; A defendant-side researcher responds, not a bot.
          </p>
        </div>
        <div className={`grid gap-8 ${gridCols}`}>
          {/* Brand */}
          <div className="md:col-span-1">
            <Link href="/" className="flex items-center gap-3 text-lg font-bold tracking-tight">
              <Image
                src="/brand/inaa-logo.png"
                alt="ImNotAnAttorney logo"
                width={48}
                height={48}
                className="rounded-lg"
              />
              <span>
                Im<span className="text-amber-400">Not</span>AnAttorney
              </span>
            </Link>
            <p className="mt-3 text-sm text-zinc-400">
              Know What They Know.
            </p>
            <p className="mt-2 text-xs text-zinc-400">
              {BRAND_UPL_DISCLAIMER}
            </p>
          </div>

          {/* Pages */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-zinc-300">Explore</h3>
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
                href="/sample"
                className="text-sm text-zinc-400 hover:text-white"
              >
                Sample Report
              </Link>
              <Link
                href="/playbooks"
                className="text-sm text-zinc-400 hover:text-white"
              >
                Playbooks
              </Link>
              <Link
                href="/resources"
                className="text-sm text-zinc-400 hover:text-white"
              >
                Free Resources
              </Link>
              <Link
                href="/dui-defense"
                className="text-sm text-zinc-400 hover:text-white"
              >
                DUI Defense by State
              </Link>
              <Link
                href="/drug-possession-defense"
                className="text-sm text-zinc-400 hover:text-white"
              >
                Drug Possession by State
              </Link>
              <Link
                href="/assault-defense"
                className="text-sm text-zinc-400 hover:text-white"
              >
                Assault Defense by State
              </Link>
              <Link
                href="/domestic-violence-defense"
                className="text-sm text-zinc-400 hover:text-white"
              >
                Domestic Violence by State
              </Link>
              <Link
                href="/about"
                className="text-sm text-zinc-400 hover:text-white"
              >
                About
              </Link>
              <Link
                href="/masked"
                className="text-sm text-amber-400 hover:text-amber-300"
              >
                Why we stay masked
              </Link>
              <Link
                href="/partners"
                className="text-sm text-zinc-400 hover:text-white"
              >
                Become a Partner
              </Link>
              <Link
                href="/score"
                className="text-sm text-amber-400 hover:text-amber-300"
              >
                Get Started →
              </Link>
            </div>
          </div>

          {showCatalog && (
            <>
              {/* Playbooks */}
              <div>
                <h3 className="mb-3 text-sm font-semibold text-zinc-300">
                  Playbooks
                </h3>
                <div className="flex flex-col gap-2">
                  <Link href="/playbooks" className="text-sm text-amber-400 hover:text-amber-300">
                    View All Playbooks →
                  </Link>
                  <Link href="/playbook/dui-first-offense" className="text-sm text-zinc-400 hover:text-white">
                    DUI Defense
                  </Link>
                  <Link href="/playbook/drug-possession" className="text-sm text-zinc-400 hover:text-white">
                    Drug Possession
                  </Link>
                  <Link href="/playbook/drug-trafficking" className="text-sm text-zinc-400 hover:text-white">
                    Drug Trafficking
                  </Link>
                  <Link href="/playbook/probation-violation" className="text-sm text-zinc-400 hover:text-white">
                    Probation Violation
                  </Link>
                </div>
              </div>

              {/* Services */}
              <div>
                <h3 className="mb-3 text-sm font-semibold text-zinc-300">
                  Our Services
                </h3>
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
                    href="/intake?interest=situation-room"
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
            </>
          )}

          {/* Legal & Connect */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-zinc-300">
              Legal
            </h3>
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
                href="/editorial-policy"
                className="text-sm text-zinc-400 hover:text-white"
              >
                Editorial Policy
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
              <a
                href="https://x.com/ImNotAnAttorney"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-zinc-400 hover:text-white"
              >
                X (Twitter)<span className="sr-only"> (opens in new tab)</span>
              </a>
            </div>
            <p className="mt-4 text-xs text-zinc-400">
              195 Dr MLK Jr St N
              <br />
              St Petersburg, FL 33701
            </p>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="mt-8 rounded-lg border border-zinc-500 bg-zinc-900/50 p-4">
          <p className="text-xs text-zinc-400">
            <strong className="text-zinc-400">Disclaimer:</strong>{" "}
            ImNotAnAttorney publishes legal information and research, not legal
            advice. We are not a law firm and do not create an attorney-client
            relationship. Decisions about how to use this information stay with
            you.
          </p>
        </div>

        <div className="mt-8 border-t border-zinc-500 pt-8 text-center text-xs text-zinc-400">
          © {new Date().getFullYear()} ImNotAnAttorney. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
