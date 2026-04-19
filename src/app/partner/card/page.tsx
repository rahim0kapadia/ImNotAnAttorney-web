"use client";
/**
 * /partner/card, Printable bail packet insert.
 *
 * Full 8.5x11" page designed to sit in a bail packet alongside legal documents.
 * Co-branded with bondsman company. Print-optimized (white background for paper).
 * Screen shows preview + print button. Print hides all chrome.
 *
 * Design: Crisis-readable (3AM, shaking hands, just bailed out).
 * Key message under 27 words (Covello). One action: scan QR code.
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { computePartnerUrl } from "@/lib/partner-mode";

export default function BailPacketCard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [partner, setPartner] = useState<{
    name: string;
    company: string | null;
    promo_code: string;
    city: string | null;
    check_in_enabled: boolean;
  } | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [previewScale, setPreviewScale] = useState(1);

  // Scale the 8.5in preview card to fit narrow viewports
  useEffect(() => {
    function updateScale() {
      const cardPx = 8.5 * 96; // 816px
      const available = window.innerWidth - 32; // px-4 padding
      setPreviewScale(Math.min(1, available / cardPx));
    }
    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, []);

  const fetchPartner = useCallback(async () => {
    try {
      const res = await fetch("/api/partner/dashboard");
      if (res.status === 401) { router.push("/partner/login"); return; }
      if (!res.ok) return;
      const data = await res.json();
      setPartner({
        name: data.partner.name,
        company: data.partner.company,
        promo_code: data.partner.promo_code,
        city: data.partner.city ?? null,
        check_in_enabled: Boolean(data.partner.check_in_enabled),
      });
    } catch {
      // fail silently
    }
  }, [router]);

  useEffect(() => { fetchPartner(); }, [fetchPartner]);

  // Generate QR code after partner loads
  useEffect(() => {
    if (!partner) return;
    (async () => {
      try {
        const QRCodeLib = (await import("qrcode")).default;
        const toggleEnabled = process.env.NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED === "true";
        const baseUrl = "https://imnotanattorney.com";
        const url = toggleEnabled
          ? computePartnerUrl(
              { promo_code: partner.promo_code, check_in_enabled: partner.check_in_enabled },
              baseUrl,
            )
          // Toggle-OFF fallback: preserves legacy printed-collateral URLs intentionally.
          // Card → /r/{code}; Checklist → /r/{code}/reminders (reminder-subpath is legacy).
          // Do not unify without reprinting all live bail-packet cards / clipboards.
          : `${baseUrl}/r/${partner.promo_code}`;
        const dataUrl = await QRCodeLib.toDataURL(url, {
          width: 600,
          margin: 3,
          color: { dark: "#000000", light: "#FFFFFF" },
          errorCorrectionLevel: "H",
        });
        setQrDataUrl(dataUrl);
      } catch {
        // QR generation failed
      } finally {
        setLoading(false);
      }
    })();
  }, [partner]);

  if (loading || !partner) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const toggleEnabled = process.env.NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED === "true";
  const baseUrl = "https://imnotanattorney.com";
  const fullUrl = toggleEnabled
    ? computePartnerUrl(
        { promo_code: partner.promo_code, check_in_enabled: partner.check_in_enabled },
        baseUrl,
      )
    // Toggle-OFF fallback: preserves legacy printed-collateral URLs intentionally.
    // Card → /r/{code}; Checklist → /r/{code}/reminders (reminder-subpath is legacy).
    // Do not unify without reprinting all live bail-packet cards / clipboards.
    : `${baseUrl}/r/${partner.promo_code}`;
  const referralUrl = fullUrl.replace(/^https?:\/\//, "");
  const companyLine = partner.company
    ? partner.city
      ? `${partner.company}, ${partner.city}`
      : partner.company
    : partner.name;

  return (
    <>
      {/* Screen-only toolbar */}
      <div className="print:hidden bg-zinc-950 border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-white font-bold text-lg">Bail Packet Insert</h1>
          <p className="text-zinc-400 text-sm">Print this page and include it in every bail packet.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => router.push("/partner/dashboard")}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            Back to Dashboard
          </button>
          <button
            onClick={() => window.print()}
            className="px-6 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition-colors cursor-pointer"
          >
            Print Insert
          </button>
        </div>
      </div>

      {/* Screen preview wrapper */}
      <div className="print:hidden bg-zinc-950 min-h-screen flex items-start justify-center py-8 px-4">
        <div
          className="bg-white rounded-lg shadow-2xl shadow-amber-500/10"
          style={{
            width: "8.5in",
            minHeight: "11in",
            transform: previewScale < 1 ? `scale(${previewScale})` : undefined,
            transformOrigin: "top center",
          }}
        >
          <CardContent
            companyLine={companyLine}
            promoCode={partner.promo_code}
            referralUrl={referralUrl}
            qrDataUrl={qrDataUrl}
            checkInEnabled={partner.check_in_enabled}
          />
        </div>
      </div>

      {/* Print-only: full page, no wrapper */}
      <div className="hidden print:block">
        <CardContent
          companyLine={companyLine}
          promoCode={partner.promo_code}
          referralUrl={referralUrl}
          qrDataUrl={qrDataUrl}
          checkInEnabled={partner.check_in_enabled}
        />
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          @page {
            size: letter;
            margin: 0;
          }
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </>
  );
}

function CardContent({
  companyLine,
  promoCode,
  referralUrl,
  qrDataUrl,
  checkInEnabled,
}: {
  companyLine: string;
  promoCode: string;
  referralUrl: string;
  qrDataUrl: string | null;
  checkInEnabled: boolean;
}) {
  return (
    <div
      className="relative flex flex-col items-center justify-between text-black"
      style={{
        width: "8.5in",
        minHeight: "11in",
        padding: "0.75in 1in",
        fontFamily: "'Lato', 'Helvetica Neue', Arial, sans-serif",
      }}
    >
      {/* Top: Co-branded header */}
      <div className="w-full text-center" style={{ marginBottom: "0.4in" }}>
        <p
          className="uppercase tracking-widest"
          style={{ fontSize: "11px", letterSpacing: "0.15em", marginBottom: "8px", color: "#71717a" }}
        >
          Provided by
        </p>
        <p
          className="font-bold"
          style={{ fontSize: "22px", lineHeight: "1.3", color: "#27272a" }}
        >
          {companyLine}
        </p>
        <div
          style={{ width: "60px", height: "3px", marginTop: "16px", borderRadius: "2px", background: "#f59e0b", marginLeft: "auto", marginRight: "auto" }}
        />
      </div>

      {/* Middle: Value proposition, mode-branched */}
      <div className="w-full text-center" style={{ maxWidth: "5.5in" }}>
        {checkInEnabled ? (
          <>
            <h1 style={{ fontSize: "32px", lineHeight: "1.25", marginBottom: "16px", fontFamily: "'Playfair Display', Georgia, serif", color: "#18181b", fontWeight: 700 }}>
              Your court check-in starts here.
            </h1>
            <p style={{ fontSize: "17px", lineHeight: "1.6", marginBottom: "32px", color: "#52525b" }}>
              Daily check-in prompts, court-date reminders, and a walkthrough of what to
              expect at your hearing. Scan the QR or visit the link below.
            </p>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: "32px", lineHeight: "1.25", marginBottom: "16px", fontFamily: "'Playfair Display', Georgia, serif", color: "#18181b", fontWeight: 700 }}>
              Court date reminders. Hearing prep.
            </h1>
            <p style={{ fontSize: "17px", lineHeight: "1.6", marginBottom: "32px", color: "#52525b" }}>
              Court-date reminders and what to expect at your hearing. Scan the QR or
              visit the link below.
            </p>
          </>
        )}
      </div>

      {/* QR Code block */}
      <div className="flex flex-col items-center" style={{ marginBottom: "24px" }}>
        {qrDataUrl ? (
          <div
            style={{ marginBottom: "16px", border: "2px solid #e4e4e7", borderRadius: "12px", padding: "8px" }}
          >
            <img
              src={qrDataUrl}
              alt={`QR code linking to ${referralUrl}`}
              style={{ width: "2.2in", height: "2.2in" }}
            />
          </div>
        ) : (
          <div
            style={{ width: "2.4in", height: "2.4in", marginBottom: "16px", background: "#f4f4f5", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <span style={{ color: "#a1a1aa", fontSize: "14px" }}>QR Code</span>
          </div>
        )}

        <p
          className="font-bold"
          style={{ fontSize: "15px", marginBottom: "4px", color: "#18181b" }}
        >
          Scan this code or visit:
        </p>
        <p
          className="font-bold"
          style={{ fontSize: "18px", color: "#f59e0b", letterSpacing: "0.02em" }}
        >
          {referralUrl}
        </p>
      </div>

      {/* Promo code callout, rewritten: "Because {company} sent you, 10% off is built in." */}
      <div
        className="w-full text-center"
        style={{
          background: "#1a1a1a",
          padding: "20px 32px",
          maxWidth: "5in",
          marginBottom: "32px",
          borderRadius: "12px",
        }}
      >
        <p style={{ fontSize: "16px", marginBottom: "4px", color: "#ffffff" }}>
          Because <strong>{companyLine}</strong> sent you,
        </p>
        <p style={{ fontSize: "22px", color: "#fbbf24", fontWeight: 700, marginBottom: "4px" }}>
          10% off is built in.
        </p>
        <p style={{ fontSize: "13px", color: "#d4d4d8" }}>
          No code to type at checkout.
        </p>
      </div>
      <p style={{ fontSize: "8px", color: "#a1a1aa", textAlign: "center", marginTop: "4px" }}>
        Ref: {promoCode}
      </p>

      {/* Bottom: What you get + legal disclaimer */}
      <div className="w-full" style={{ maxWidth: "5.5in" }}>
        <div
          className="flex justify-center"
          style={{ fontSize: "13px", marginBottom: "24px", gap: "32px", color: "#52525b" }}
        >
          <div className="flex items-center" style={{ gap: "8px" }}>
            <span style={{ color: "#f59e0b", fontSize: "16px" }}>&#10003;</span>
            <span>Your charges researched</span>
          </div>
          <div className="flex items-center" style={{ gap: "8px" }}>
            <span style={{ color: "#f59e0b", fontSize: "16px" }}>&#10003;</span>
            <span>Your judge&apos;s patterns</span>
          </div>
          <div className="flex items-center" style={{ gap: "8px" }}>
            <span style={{ color: "#f59e0b", fontSize: "16px" }}>&#10003;</span>
            <span>Questions for your attorney</span>
          </div>
        </div>

        <div
          className="text-center"
          style={{ fontSize: "10px", lineHeight: "1.5", borderTop: "1px solid #e4e4e7", paddingTop: "12px", color: "#a1a1aa" }}
        >
          <p style={{ marginBottom: "2px" }}>
            <strong style={{ color: "#18181b", letterSpacing: "0.08em" }}>IMNOTANATTORNEY</strong>
            &nbsp;&middot;&nbsp; Legal Information &mdash; Not Legal Advice
          </p>
          <p>This service provides case research and questions to help you communicate with your attorney.</p>
        </div>
      </div>
    </div>
  );
}
