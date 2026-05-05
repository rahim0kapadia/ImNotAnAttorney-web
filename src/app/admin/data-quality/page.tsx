/**
 * /admin/data-quality — Operator extraction coverage + matview freshness dashboard.
 *
 * Server component. Fetches /api/admin/extraction-coverage and renders three
 * sections: Extraction Coverage, Provenance Attribution, Matview Freshness.
 *
 * Auth: ADMIN_PASSWORD via X-Admin-Password header — same guard as all /admin/* routes.
 * No client-side JS required beyond standard Next.js hydration.
 */
import { headers } from "next/headers";
import Link from "next/link";
import type { ExtractionCoveragePayload } from "@/app/api/admin/extraction-coverage/route";

// ── Fetch helper ──────────────────────────────────────────────────────────

async function fetchCoverage(): Promise<ExtractionCoveragePayload | null> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "";

  try {
    const res = await fetch(`${baseUrl}/api/admin/extraction-coverage`, {
      method: "GET",
      headers: {
        "x-admin-password": adminPassword,
      },
      cache: "no-store",
    });

    if (!res.ok) return null;
    return res.json() as Promise<ExtractionCoveragePayload>;
  } catch {
    return null;
  }
}

// ── Sub-components ────────────────────────────────────────────────────────

interface PctBarProps {
  pct: number;
}

function PctBar({ pct }: PctBarProps) {
  const color =
    pct >= 80 ? "bg-emerald-500" :
    pct >= 40 ? "bg-amber-500" :
    "bg-red-500";

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 bg-zinc-800 rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full ${color}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className="text-xs tabular-nums w-14 text-right text-zinc-300">
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      {subtitle && <p className="text-sm text-zinc-400 mt-0.5">{subtitle}</p>}
    </div>
  );
}

function TableWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-700">
      <table className="w-full text-sm text-left">{children}</table>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wider bg-zinc-800/60 border-b border-zinc-700">
      {children}
    </th>
  );
}

function Td({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <td className={`px-4 py-2.5 text-zinc-200 border-b border-zinc-800 ${mono ? "font-mono text-xs" : ""}`}>
      {children}
    </td>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

export default async function DataQualityPage() {
  const data = await fetchCoverage();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <nav className="flex items-center gap-4 text-sm text-zinc-400 mb-5">
          <Link href="/admin/inbox" className="hover:text-white transition-colors">Inbox</Link>
          <Link href="/admin/demand" className="hover:text-white transition-colors">Demand Intel</Link>
          <Link href="/admin/partners" className="hover:text-white transition-colors">Partners</Link>
          <span className="text-amber-400 font-medium">Data Quality</span>
        </nav>
        <h1 className="text-2xl font-bold text-white">Data Quality Dashboard</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Extraction coverage, provenance attribution, and matview freshness.
        </p>
      </div>

      {data == null ? (
        <div className="rounded-lg border border-red-700 bg-red-900/20 px-5 py-4 text-red-300 text-sm">
          Failed to load coverage data. Check ADMIN_PASSWORD env var and ensure the API route is deployed.
        </div>
      ) : (
        <div className="space-y-10">

          {/* ── Section 1: Extraction Coverage ───────────────────────────── */}
          <section>
            <SectionHeader
              title="Extraction Coverage"
              subtitle={`classified_opinions — ${data.classified_opinions.total.toLocaleString()} total rows`}
            />
            <TableWrapper>
              <thead>
                <tr>
                  <Th>Column</Th>
                  <Th>Populated</Th>
                  <Th>Coverage</Th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["officer_names", "Officer Names"],
                    ["witness_names", "Witness Names"],
                    ["expert_witness_names", "Expert Witness Names"],
                    ["prosecutor_names", "Prosecutor Names"],
                    ["defense_attorney_names", "Defense Attorney Names"],
                    ["sentence_months_extracted", "Sentence Months"],
                    ["fine_dollars_extracted", "Fine ($)"],
                    ["restitution_dollars_extracted", "Restitution ($)"],
                  ] as const
                ).map(([key, label]) => {
                  const col = data.classified_opinions[key];
                  return (
                    <tr key={key} className="hover:bg-zinc-900/40 transition-colors">
                      <Td>{label}</Td>
                      <Td mono>{col.populated.toLocaleString()}</Td>
                      <Td>
                        <PctBar pct={col.pct} />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrapper>
            {(data.classified_opinions.extracted_at_oldest || data.classified_opinions.extracted_at_newest) && (
              <p className="text-xs text-zinc-500 mt-2">
                Extraction range:{" "}
                {data.classified_opinions.extracted_at_oldest
                  ? new Date(data.classified_opinions.extracted_at_oldest).toLocaleDateString()
                  : "—"}
                {" "}→{" "}
                {data.classified_opinions.extracted_at_newest
                  ? new Date(data.classified_opinions.extracted_at_newest).toLocaleDateString()
                  : "—"}
              </p>
            )}
          </section>

          {/* ── Section 2: Provenance Attribution ────────────────────────── */}
          <section>
            <SectionHeader
              title="Provenance Attribution"
              subtitle={`entities_officers — ${data.entities_officers.total.toLocaleString()} total rows`}
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
              <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3">
                <div className="text-xs text-zinc-400 mb-1">Total Officers</div>
                <div className="text-2xl font-semibold tabular-nums text-white">
                  {data.entities_officers.total.toLocaleString()}
                </div>
              </div>
              <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3">
                <div className="text-xs text-zinc-400 mb-1">With Provenance</div>
                <div className="text-2xl font-semibold tabular-nums text-white">
                  {data.entities_officers.with_provenance.toLocaleString()}
                </div>
              </div>
              <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3">
                <div className="text-xs text-zinc-400 mb-1">Attribution Rate</div>
                <div className={`text-2xl font-semibold tabular-nums ${data.entities_officers.pct >= 99 ? "text-emerald-400" : data.entities_officers.pct >= 80 ? "text-amber-400" : "text-red-400"}`}>
                  {data.entities_officers.pct.toFixed(3)}%
                </div>
              </div>
            </div>

            {Object.keys(data.entities_officers.by_source).length > 0 && (
              <TableWrapper>
                <thead>
                  <tr>
                    <Th>Source</Th>
                    <Th>Count</Th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.entities_officers.by_source)
                    .sort((a, b) => b[1] - a[1])
                    .map(([source, count]) => (
                      <tr key={source} className="hover:bg-zinc-900/40 transition-colors">
                        <Td mono>{source}</Td>
                        <Td mono>{count.toLocaleString()}</Td>
                      </tr>
                    ))}
                </tbody>
              </TableWrapper>
            )}
          </section>

          {/* ── Section 3: Matview Freshness ──────────────────────────────── */}
          <section>
            <SectionHeader
              title="Matview Freshness"
              subtitle="Cross-corpus materialized views — refreshed via cron-job.org weekly"
            />
            <TableWrapper>
              <thead>
                <tr>
                  <Th>View</Th>
                  <Th>Rows</Th>
                  <Th>Last Refresh</Th>
                </tr>
              </thead>
              <tbody>
                {data.matviews.map((mv) => (
                  <tr key={mv.name} className="hover:bg-zinc-900/40 transition-colors">
                    <Td mono>{mv.name}</Td>
                    <Td mono>{mv.rows.toLocaleString()}</Td>
                    <Td mono>
                      {mv.last_refresh
                        ? new Date(mv.last_refresh).toLocaleString()
                        : <span className="text-zinc-500">—</span>}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrapper>

            {/* Cron status */}
            <div className="mt-4 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-zinc-400 mb-0.5">Cron: /api/cron/refresh-cross-corpus-matviews</div>
                  <div className="text-sm text-zinc-200">
                    Last run:{" "}
                    {data.cron.last_run
                      ? new Date(data.cron.last_run).toLocaleString()
                      : <span className="text-zinc-500">never</span>}
                  </div>
                </div>
                <div>
                  {data.cron.last_status === "ok" && (
                    <span className="inline-flex items-center rounded-full bg-emerald-900/50 border border-emerald-600 text-emerald-300 text-xs px-2.5 py-0.5 font-medium">
                      ok
                    </span>
                  )}
                  {data.cron.last_status === "error" && (
                    <span className="inline-flex items-center rounded-full bg-red-900/50 border border-red-600 text-red-300 text-xs px-2.5 py-0.5 font-medium">
                      error
                    </span>
                  )}
                  {data.cron.last_status === null && (
                    <span className="inline-flex items-center rounded-full bg-zinc-800 border border-zinc-600 text-zinc-400 text-xs px-2.5 py-0.5 font-medium">
                      not registered
                    </span>
                  )}
                </div>
              </div>
            </div>
          </section>

        </div>
      )}
    </div>
  );
}
