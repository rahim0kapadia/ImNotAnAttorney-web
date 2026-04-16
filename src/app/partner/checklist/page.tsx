"use client";
/**
 * /partner/checklist — Printable bail conditions compliance checklist.
 *
 * 8.5×11" document designed for bondsmen to hand defendants at the jail desk.
 * Pen-fillable fields (48pt tall) for jail-desk handwriting.
 * Co-branded with bondsman company. QR code → /r/{code}/reminders.
 * INAA branding minimal — this is the bondsman's document.
 *
 * Architecture mirrors /partner/card: screen preview + print-only block,
 * inline styles for print reliability, dynamic QR via qrcode npm package.
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

export default function ComplianceChecklist() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [partner, setPartner] = useState<{
    name: string;
    company: string | null;
    city: string | null;
    phone: string | null;
    promo_code: string;
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
        city: data.partner.city ?? null,
        phone: data.partner.phone ?? null,
        promo_code: data.partner.promo_code,
      });
    } catch {
      // fail silently
    }
  }, [router]);

  useEffect(() => { fetchPartner(); }, [fetchPartner]);

  // Generate QR code after partner loads — points to /r/{code}/reminders
  useEffect(() => {
    if (!partner) return;
    (async () => {
      try {
        const QRCodeLib = (await import("qrcode")).default;
        const url = `https://imnotanattorney.com/r/${partner.promo_code}/reminders`;
        const dataUrl = await QRCodeLib.toDataURL(url, {
          width: 400,
          margin: 2,
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
          <h1 className="text-white font-bold text-lg">Compliance Checklist</h1>
          <p className="text-zinc-400 text-sm">Print and hand to every client at bonding.</p>
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
            Print Checklist
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
          <ChecklistContent
            companyLine={companyLine}
            phone={partner.phone}
            promoCode={partner.promo_code}
            qrDataUrl={qrDataUrl}
          />
        </div>
      </div>

      {/* Print-only: full page, no wrapper */}
      <div className="hidden print:block">
        <ChecklistContent
          companyLine={companyLine}
          phone={partner.phone}
          promoCode={partner.promo_code}
          qrDataUrl={qrDataUrl}
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

/* ── Shared inline style constants ──────────────────────────── */

const LABEL: React.CSSProperties = {
  fontSize: "10pt",
  fontWeight: 700,
  color: "#52525b",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: "2px",
};

const BLANK: React.CSSProperties = {
  borderBottom: "1.5px solid #d4d4d8",
  minHeight: "48pt",
  lineHeight: "48pt",
  width: "100%",
};

const CHECKBOX: React.CSSProperties = {
  width: "18px",
  height: "18px",
  border: "1.5px solid #71717a",
  borderRadius: "2px",
  flexShrink: 0,
  marginTop: "2px",
};

/* ── Checklist content (rendered in both screen + print) ───── */

function ChecklistContent({
  companyLine,
  phone,
  promoCode,
  qrDataUrl,
}: {
  companyLine: string;
  phone: string | null;
  promoCode: string;
  qrDataUrl: string | null;
}) {
  const reminderUrl = `imnotanattorney.com/r/${promoCode}/reminders`;

  return (
    <div
      style={{
        width: "8.5in",
        minHeight: "11in",
        padding: "0.5in 0.65in 0.4in",
        fontFamily: "'Lato', 'Helvetica Neue', Arial, sans-serif",
        color: "#18181b",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── Header ── */}
      <div style={{ textAlign: "center", marginBottom: "0.2in" }}>
        <p style={{ fontSize: "11px", color: "#71717a", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "4px" }}>
          {companyLine}
        </p>
        <h1 style={{
          fontSize: "22px",
          fontWeight: 800,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          margin: 0,
          fontFamily: "'Playfair Display', Georgia, serif",
        }}>
          Bail Conditions Checklist
        </h1>
        <div style={{ width: "50px", height: "2.5px", background: "#f59e0b", margin: "8px auto 0", borderRadius: "2px" }} />
      </div>

      {/* ── Defendant Info ── */}
      <div style={{ marginBottom: "0.15in" }}>
        <div style={LABEL}>Defendant Name</div>
        <div style={BLANK} />
      </div>

      <div style={{ marginBottom: "0.15in" }}>
        <div style={LABEL}>Case Number</div>
        <div style={BLANK} />
      </div>

      <div style={{ display: "flex", gap: "0.3in", marginBottom: "0.15in" }}>
        <div style={{ flex: 1 }}>
          <div style={LABEL}>Court Date</div>
          <div style={BLANK} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={LABEL}>Time</div>
          <div style={BLANK} />
        </div>
      </div>

      <div style={{ marginBottom: "0.2in" }}>
        <div style={LABEL}>Courthouse / Address</div>
        <div style={BLANK} />
      </div>

      {/* ── Bail Conditions Checkboxes ── */}
      <div style={{ marginBottom: "0.15in" }}>
        <div style={{ ...LABEL, fontSize: "11pt", color: "#18181b", marginBottom: "8px" }}>
          Your Bail Conditions
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <CheckboxItem text="Do not leave jurisdiction without written permission from bondsman" />
          <CheckboxItem text="Report any address or phone changes within 24 hours" />
          <CheckboxItem text="No new arrests while on bail" />
          <CheckboxItem text="Attend ALL scheduled court dates" />
          <CheckboxItem text="Follow all court-ordered conditions" />
          <CheckboxItem text="Keep co-signer informed of any changes" />
        </div>
      </div>

      {/* ── Additional Conditions ── */}
      <div style={{ marginBottom: "0.15in" }}>
        <div style={LABEL}>Additional Conditions</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0px" }}>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <span style={{ fontSize: "12pt", marginRight: "6px", lineHeight: "48pt" }}>1.</span>
            <div style={BLANK} />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <span style={{ fontSize: "12pt", marginRight: "6px", lineHeight: "48pt" }}>2.</span>
            <div style={BLANK} />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <span style={{ fontSize: "12pt", marginRight: "6px", lineHeight: "48pt" }}>3.</span>
            <div style={BLANK} />
          </div>
        </div>
      </div>

      {/* ── Payment Schedule ── */}
      <div style={{ marginBottom: "0.2in" }}>
        <div style={LABEL}>Payment Schedule</div>
        <div style={{ display: "flex", gap: "0.3in" }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <span style={{ fontSize: "12pt", marginRight: "4px", lineHeight: "48pt" }}>$</span>
              <div style={BLANK} />
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ ...LABEL, marginTop: "0px" }}>Due Date</div>
            <div style={BLANK} />
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.3in" }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <span style={{ fontSize: "12pt", marginRight: "4px", lineHeight: "48pt" }}>$</span>
              <div style={BLANK} />
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ ...LABEL, marginTop: "0px" }}>Due Date</div>
            <div style={BLANK} />
          </div>
        </div>
      </div>

      {/* ── Court Reminders Box ── */}
      <div style={{
        background: "#f9fafb",
        border: "1.5px solid #e4e4e7",
        borderRadius: "8px",
        padding: "12px 16px",
        marginBottom: "0.2in",
        display: "flex",
        alignItems: "center",
        gap: "16px",
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "13pt", fontWeight: 800, color: "#18181b", marginBottom: "2px" }}>
            Free Court Reminders
          </div>
          <p style={{ fontSize: "10pt", color: "#52525b", margin: "0 0 8px", lineHeight: 1.4 }}>
            Never miss a court date. Sign up for free text reminders.
          </p>
          <p style={{ fontSize: "10pt", color: "#18181b", fontWeight: 700, margin: 0 }}>
            {reminderUrl}
          </p>
          <div style={{ marginTop: "8px" }}>
            <span style={{ ...LABEL, fontSize: "9pt" }}>Check-in Days</span>
            <div style={{ ...BLANK, minHeight: "36pt", lineHeight: "36pt" }} />
          </div>
        </div>
        {qrDataUrl ? (
          <div style={{ border: "1.5px solid #e4e4e7", borderRadius: "6px", padding: "4px", flexShrink: 0 }}>
            <img
              src={qrDataUrl}
              alt={`QR code linking to ${reminderUrl}`}
              style={{ width: "1.3in", height: "1.3in" }}
            />
          </div>
        ) : (
          <div style={{
            width: "1.4in", height: "1.4in",
            background: "#f4f4f5", borderRadius: "6px",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <span style={{ color: "#a1a1aa", fontSize: "11px" }}>QR Code</span>
          </div>
        )}
      </div>

      {/* ── Important Contacts ── */}
      <div style={{ display: "flex", gap: "0.3in", marginBottom: "0.15in" }}>
        <div style={{ flex: 1 }}>
          <div style={LABEL}>Bondsman</div>
          {phone ? (
            <div style={{ ...BLANK, fontSize: "14pt", fontWeight: 600 }}>{phone}</div>
          ) : (
            <div style={BLANK}>
              <span style={{ fontSize: "8pt", color: "#a1a1aa", lineHeight: "48pt" }}>(update in dashboard)</span>
            </div>
          )}
        </div>
        <div style={{ flex: 1 }}>
          <div style={LABEL}>Attorney / PD Office</div>
          <div style={BLANK} />
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{
        marginTop: "auto",
        textAlign: "center",
        fontSize: "9px",
        color: "#a1a1aa",
        borderTop: "1px solid #e4e4e7",
        paddingTop: "8px",
      }}>
        <p style={{ margin: "0 0 2px" }}>
          <strong style={{ color: "#71717a", letterSpacing: "0.08em" }}>{companyLine}</strong>
          {" "}&middot;{" "}imnotanattorney.com
        </p>
        <p style={{ margin: 0 }}>Legal Information &mdash; Not Legal Advice</p>
      </div>
    </div>
  );
}

/* ── Checkbox row component ──────────────────────────────────── */

function CheckboxItem({ text }: { text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
      <div style={CHECKBOX} />
      <span style={{ fontSize: "12pt", lineHeight: 1.4, color: "#27272a" }}>{text}</span>
    </div>
  );
}
