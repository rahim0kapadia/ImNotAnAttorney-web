import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { partnerBrandingEnabled } from "@/lib/partner-branding/feature-flag";
import { brandPassesSiteContrast, bestTextColor } from "@/lib/partner-branding/contrast-guard";
import { Footer } from "@/components/Footer";

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

const INAA_AMBER = "#F59E0B";
const INAA_AMBER_TEXT = "#000000";

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
  const showPartnerLogo = partnerBrandingEnabled() && partner.logo_url && primary.isPartner;
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
      <header className="sticky top-0 z-40 border-b border-zinc-500 bg-black/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            {showPartnerLogo ? (
              <div className="relative h-10 w-28 sm:h-12 sm:w-32">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={partner.logo_url!}
                  alt={`${partnerDisplayName} logo`}
                  className="h-full w-full object-contain object-left"
                />
              </div>
            ) : (
              <Link href="/" className="flex items-center gap-2">
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
          <div className="text-right text-xs text-zinc-400">
            {primary.isPartner ? (
              <span>
                Powered by{" "}
                <Link href="/" className="font-semibold text-amber-400 hover:text-amber-300">
                  ImNotAnAttorney
                </Link>
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <main>{children}</main>

      {primary.isPartner ? (
        <footer className="border-t border-zinc-500 bg-zinc-950">
          <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-zinc-400">
            <p>
              Referred by <span className="font-semibold text-white">{partnerDisplayName}</span>.
              Research and report delivery by{" "}
              <Link href="/" className="font-semibold text-amber-400 hover:text-amber-300">
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
                  className="text-amber-400 underline decoration-amber-400/50 hover:text-amber-300"
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
