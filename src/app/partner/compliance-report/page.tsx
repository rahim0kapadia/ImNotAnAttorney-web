"use client";
/**
 * /partner/compliance-report, Print-optimized compliance report for surety
 * audits.
 *
 * Auth: client-side via /api/partner/compliance-report (cookie-based).
 * Matches the auth pattern used by /partner/checklist, /partner/card, and
 * /partner/dashboard.
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ComplianceReportClient } from "./ComplianceReportClient";

interface CompliancePageData {
  partner: { name: string; company: string | null; promo_code: string | null };
  clients: Parameters<typeof ComplianceReportClient>[0]["clients"];
  checkIns: Parameters<typeof ComplianceReportClient>[0]["checkIns"];
}

export default function ComplianceReportPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CompliancePageData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/partner/compliance-report");
      if (res.status === 401) { router.push("/partner/login"); return; }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error("[compliance-report] API error:", res.status, body);
        setError(body.error || `Server error (${res.status})`);
        return;
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("[compliance-report] Network error:", err);
      setError("Connection error, please try again.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center" role="status" aria-label="Loading compliance report">
        <div className="animate-pulse text-zinc-400">Loading compliance report...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p className="text-zinc-400">{error || "Failed to load report data."}</p>
      </div>
    );
  }

  return (
    <ComplianceReportClient
      partner={data.partner}
      clients={data.clients}
      checkIns={data.checkIns}
    />
  );
}
