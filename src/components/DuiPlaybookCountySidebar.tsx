/**
 * DUI Playbook county sidebar (TICKET-11).
 *
 * Server component. Reads optional `state` and `county` search params,
 * resolves them to a FIPS pair via ACS, fetches FARS county DUI rows
 * from the matview, and renders a compact sidebar block. Returns null
 * silently when:
 *   - search params absent
 *   - state/county don't resolve
 *   - matview has no rows for the resolved county
 *
 * UPL: same constraints as the helper — historical / informational
 * only, never predictive. Source line surfaces NHTSA FARS publicly.
 */
import {
  getCountyDuiContextByName,
  renderDuiPlaybookCountySidebar,
} from "@/lib/fars/county-dui";

export type DuiPlaybookCountySidebarProps = {
  state?: string | null;
  county?: string | null;
};

export default async function DuiPlaybookCountySidebar({
  state,
  county,
}: DuiPlaybookCountySidebarProps) {
  if (!state || !county) return null;
  const ctx = await getCountyDuiContextByName(state, county);
  const lines = renderDuiPlaybookCountySidebar(ctx);
  if (!lines || lines.length === 0) return null;

  // First line is the county/state header; rest are stat rows.
  const [header, ...rows] = lines;
  return (
    <aside
      className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-100/90"
      data-source="fars"
      aria-label="County DUI history"
    >
      <p className="text-xs uppercase tracking-wider text-amber-300/70">
        County DUI history (NHTSA FARS)
      </p>
      <p className="mt-1 font-semibold text-amber-100">{header}</p>
      <ul className="mt-2 space-y-1 text-amber-100/80">
        {rows.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-amber-100/50">
        Denominator: ACS driving-age adult population. Historical /
        informational only.
      </p>
    </aside>
  );
}
