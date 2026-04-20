import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { partnerBrandingEnabled } from "@/lib/partner-branding/feature-flag";
import { brandPassesSiteContrast, bestTextColor } from "@/lib/partner-branding/contrast-guard";
import { Footer } from "@/components/Footer";
import { INAA_AMBER } from "@/lib/brand";

interface PartnerBrandLike {
  promo_code?: string | null;
  company?: string | null;
  name?: string | null;
  logo_url?: string | null;
  brand_color_primary?: string | null;
  brand_color_accent?: string | null;
  brand_color_bg?: string | null;
  brand_contrast_passed?: boolean | null;
  website_url?: string | null;
}

interface PartnerBrandedShellProps {
  partner: PartnerBrandLike;
  children: ReactNode;
}

function pickPrimary(partner: PartnerBrandLike): { hex: string; textColor: "black" | "white"; isPartner: boolean } {
  if (!partnerBrandingEnabled()) {
    return { hex: INAA_AMBER, textColor: "black", isPartner: false };
  }
  const primary = partner.brand_color_primary;
  const passed = partner.brand_contrast_passed === true;
  if (primary && passed && brandPassesSiteContrast(primary)) {
    return { hex: primary, textColor: bestTextColor(primary), isPartner: true };
  }
  return { hex: INAA_AMBER, textColor: "black", isPartner: false };
}

function pickAccent(partner: PartnerBrandLike, fallback: string): string {
  if (!partnerBrandingEnabled()) return fallback;
  const accent = partner.brand_color_accent;
  if (accent && /^#[0-9A-Fa-f]{6}$/.test(accent)) return accent;
  return fallback;
}

export function PartnerBrandedShell({ partner, children }: PartnerBrandedShellProps) {
  const primary = pickPrimary(partner);
  const accent = pickAccent(partner, primary.hex);
  const showPartnerLogo = Boolean(partnerBrandingEnabled() && partner.logo_url && primary.isPartner);
  const partnerDisplayName = partner.company || partner.name || "Your referring partner";

  const cssVars: Record<string, string> = {
    "--partner-primary": primary.hex,
    "--partner-primary-text": primary.textColor === "white" ? "#FFFFFF" : "#000000",
    "--partner-accent": accent,
  };

  return (
    <div
      data-partner-code={partner.promo_code ?? undefined}
      data-partner-branded={primary.isPartner ? "true" : "false"}
      className="min-h-screen bg-black text-zinc-100"
      style={cssVars as React.CSSProperties}
    >
      {/* Skip link — first focusable element; replaces the one we'd normally
          get from the global <Header> that this branded shell suppresses. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-amber-500 focus:px-3 focus:py-2 focus:text-sm focus:font-bold focus:text-black"
      >
        Skip to main content
      </a>

      <header className="sticky top-0 z-40 border-b border-zinc-500 bg-black/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            {showPartnerLogo ? (
              <div className="relative h-10 w-28 sm:h-12 sm:w-32">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={partner.logo_url!}
                  alt={partnerDisplayName}
                  width={128}
                  height={48}
                  className="h-full w-full object-contain object-left"
                  loading="eager"
                />
              </div>
            ) : (
              <Link href="/" className="flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400">
                <Image
                  src="/brand/inaa-logo.png"
                  alt="ImNotAnAttorney"
                  width={32}
                  height={32}
                  className="h-8 w-8"
                />
                <span className="font-display text-lg font-bold text-white">ImNotAnAttorney</span>
              </Link>
            )}
          </div>
          <div className="text-right">
            {primary.isPartner ? (
              /* Dual-lockup — INAA wordmark visible at equal prominence so
                 the product seller is identified up front. "Powered by" alone
                 isn't clear-and-conspicuous per FTC endorsement guides. */
              <Link
                href="/"
                className="flex items-center gap-2 text-sm font-semibold text-white hover:text-amber-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
              >
                <Image
                  src="/brand/inaa-logo.png"
                  alt=""
                  width={24}
                  height={24}
                  className="h-6 w-6"
                  aria-hidden="true"
                />
                <span className="font-display">ImNotAnAttorney</span>
              </Link>
            ) : (
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                Legal research
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Above-fold accountability strip. Surfaces FTC material-connection +
          UPL boundary regardless of scroll depth. Only rendered when the
          hero carries partner branding. */}
      {primary.isPartner ? (
        <div className="border-b border-zinc-800 bg-zinc-950/80 text-zinc-300">
          <div className="mx-auto max-w-6xl px-4 py-2 text-center text-xs sm:text-sm">
            <strong className="font-semibold text-white">Research and report by ImNotAnAttorney.</strong>{" "}
            Not legal advice. {partnerDisplayName} earns a referral fee if you purchase.
          </div>
        </div>
      ) : null}

      <main id="main-content" tabIndex={-1}>
        {children}
      </main>

      {primary.isPartner ? (
        <footer className="border-t border-zinc-500 bg-zinc-950">
          <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-zinc-300">
            <p>
              Referred by <span className="font-semibold text-white">{partnerDisplayName}</span>.
              Research and report delivery by{" "}
              <Link
                href="/"
                className="font-semibold text-amber-400 hover:text-amber-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
              >
                ImNotAnAttorney
              </Link>
              . Not legal advice. Not representation.
            </p>
            {partner.website_url ? (
              <p className="mt-3">
                <a
                  href={partner.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] items-center text-zinc-200 underline decoration-zinc-500 hover:text-white hover:decoration-zinc-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
                >
                  Visit {partnerDisplayName}
                </a>
              </p>
            ) : null}
          </div>
        </footer>
      ) : (
        <Footer />
      )}
    </div>
  );
}
