"use client";

import { useState } from "react";
import { SITE_URL } from "@/lib/site";
import { FadeInUp } from "@/components/motion/FadeInUp";
import { StaggerContainer, StaggerItem } from "@/components/motion/StaggerContainer";
import { copyToClipboard } from "@/lib/clipboard";

interface ShareButtonsProps {
  url: string;
  title: string;
  shareText?: string;
  emailBody?: string;
  heading?: string;
  subheading?: string;
  utmParams?: string;
}

/**
 * ShareButtons — Reusable share button strip (SMS, WhatsApp, Email, Twitter/X, Facebook, Copy Link).
 *
 * Used on blog posts and score page. SMS is always first — defendants share via text.
 */
export function ShareButtons({
  url,
  title,
  shareText,
  emailBody,
  heading = "Know someone facing charges? Send them this.",
  subheading = "Most defendants don\u2019t know they can hold their attorney accountable. Share this with someone who needs it.",
  utmParams = "",
}: ShareButtonsProps) {
  const [copied, setCopied] = useState(false);

  const fullUrl = url.startsWith("http") ? url : `${SITE_URL}${url}`;
  const shareUrl = utmParams ? `${fullUrl}?${utmParams}` : fullUrl;
  const smsText = shareText || `Read this — it might help with your case: ${shareUrl}`;
  const waText = shareText || `${title} ${shareUrl}`;
  const emailSubject = `This might help — ${title}`;
  const emailBodyText = emailBody || `I thought this might be useful for your case:\n\n${title}\n${shareUrl}\n\nIt covers questions you should be asking your attorney.`;

  const buttons = [
    {
      id: "sms",
      href: `sms:?body=${encodeURIComponent(smsText)}`,
      label: "\uD83D\uDCF1 Text",
      ariaLabel: "Share via text message",
    },
    {
      id: "whatsapp",
      href: `https://wa.me/?text=${encodeURIComponent(waText)}`,
      label: "WhatsApp",
      ariaLabel: "Share via WhatsApp",
      external: true,
    },
    {
      id: "email",
      href: `mailto:?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBodyText)}`,
      label: "\u2709\uFE0F Email",
      ariaLabel: "Share via email",
    },
    {
      id: "twitter",
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(shareUrl)}`,
      label: "\uD835\uDD4F Twitter",
      ariaLabel: "Share on Twitter / X",
      external: true,
    },
    {
      id: "facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
      label: "Facebook",
      ariaLabel: "Share on Facebook",
      external: true,
    },
  ];

  return (
    <FadeInUp>
      <div className="mt-12 rounded-xl border border-amber-500/20 bg-amber-500/5 p-6">
        <p className="text-sm font-bold text-white">{heading}</p>
        <p className="mt-1 text-xs text-zinc-400">{subheading}</p>
        <StaggerContainer className="mt-4 flex flex-wrap gap-3">
          {buttons.map((btn) => (
            <StaggerItem key={btn.id}>
              <a
                href={btn.href}
                {...(btn.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-white transition-colors hover:bg-zinc-700"
                aria-label={btn.ariaLabel}
              >
                {btn.label}
              </a>
            </StaggerItem>
          ))}
          <StaggerItem>
            <button
              onClick={async () => {
                const ok = await copyToClipboard(shareUrl);
                if (ok) {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 3000);
                }
              }}
              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-white transition-colors hover:bg-zinc-700"
              aria-label="Copy link to clipboard"
            >
              {copied ? "Copied!" : "\uD83D\uDD17 Copy Link"}
            </button>
          </StaggerItem>
        </StaggerContainer>
      </div>
    </FadeInUp>
  );
}
