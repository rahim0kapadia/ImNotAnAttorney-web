/**
 * War Room — Pairing Matrix render component.
 *
 * Plan: docs/plans/2026-04-29-worry-data-orphans-product-gaps.md (T1).
 * Renders inside `/my-case/[token]/page.tsx` for tier=war-room|situation-room.
 *
 * UPL: callouts above the table are informational only — no directives,
 * no recommendations. Mirrors the `atti-persona.md` UPL guardrail table.
 */

import type { PairingMatrixResult, PairingMatrixCell } from "./pairing-matrix";

interface Props {
  matrix: PairingMatrixResult;
  callouts: string[];
}

/** Cell lookup keyed by prosecutor + ASCII unit-separator + motionType (collision-safe). */
const CELL_KEY_SEP = "\x1f";
function cellKey(prosecutor: string, motionType: string): string {
  return `${prosecutor}${CELL_KEY_SEP}${motionType}`;
}

/** Defense-in-depth XSS guard for source URL hrefs (must be https://). */
function isSafeHttpsUrl(url: string): boolean {
  return typeof url === "string" && /^https:\/\//i.test(url);
}

function indexCells(cells: PairingMatrixCell[]): Map<string, PairingMatrixCell> {
  const m = new Map<string, PairingMatrixCell>();
  for (const c of cells) {
    m.set(cellKey(c.prosecutor_name, c.motion_type), c);
  }
  return m;
}

function formatRate(r: number): string {
  return `${Math.round(r * 100)}%`;
}

export function WarRoomPairingMatrix({ matrix, callouts }: Props) {
  // Empty / fallback states (no judge resolved OR no rows passed guards).
  if (matrix.isEmpty) {
    return (
      <div className="rounded-xl border border-zinc-500 bg-zinc-900/50 p-6 mb-6">
        <h2 className="text-lg font-semibold text-white mb-3">
          Judge × Prosecutor Pairing Matrix
        </h2>
        <p className="text-zinc-400 text-sm italic">
          Pairing data is still populating for your judge. This section will
          fill in as more motion outcomes are analyzed.
        </p>
      </div>
    );
  }

  const cellIndex = indexCells(matrix.cells);

  return (
    // Distinct intelligence-section treatment (amber accent border) so the
    // matrix reads as a War-Room-tier artifact, not a progress stat card.
    <div className="rounded-xl border-2 border-amber-500/40 bg-zinc-900/70 p-6 mb-6 shadow-lg shadow-amber-500/5">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-lg font-semibold text-amber-100">
          Judge × Prosecutor Pairing Matrix
        </h2>
        <span className="text-xs text-amber-400/60 uppercase tracking-wider">
          War Room intelligence
        </span>
      </div>

      {/* UPL: callouts are informational only — never directive. They surface
          the rate and the comparison; never a motion-type → action mapping
          (per april-dunford W1 finding: "Suppression motion at 34%" is safe;
          "consider challenging the stop" is not). */}
      {callouts.length > 0 && (
        <ul className="mb-4 space-y-2 text-sm text-amber-200">
          {callouts.map((c) => (
            <li key={c} className="border-l-2 border-amber-500 pl-3">{c}</li>
          ))}
        </ul>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm text-left text-zinc-200">
          <thead>
            <tr className="border-b border-zinc-700">
              <th className="px-2 py-2 font-medium text-zinc-400">Prosecutor</th>
              {matrix.motionTypes.map((m) => (
                <th key={m} className="px-2 py-2 font-medium text-zinc-400">
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.prosecutors.map((p) => (
              <tr key={p} className="border-b border-zinc-800/50">
                <td className="px-2 py-2 font-medium text-white">{p}</td>
                {matrix.motionTypes.map((mt) => {
                  const cell = cellIndex.get(cellKey(p, mt));
                  if (!cell) {
                    return (
                      <td key={mt} className="px-2 py-2 text-zinc-600">—</td>
                    );
                  }
                  return (
                    <td key={mt} className="px-2 py-2">
                      <span className="text-white">{formatRate(cell.grant_rate)}</span>
                      <span className="text-zinc-500 text-xs"> (n={cell.sample_size})</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details className="mt-4 text-xs text-zinc-400">
        <summary className="cursor-pointer">Source citations</summary>
        <ul className="mt-2 space-y-1">
          {matrix.cells.flatMap((c) =>
            c.source_urls.filter(isSafeHttpsUrl).map((url) => (
              <li key={`${c.prosecutor_name}-${c.motion_type}-${url}`}>
                <span className="text-zinc-500">
                  {c.prosecutor_name} · {c.motion_type}:{" "}
                </span>
                <a
                  href={url}
                  className="text-amber-400 underline decoration-amber-400/50"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {url}
                </a>
              </li>
            )),
          )}
        </ul>
      </details>
    </div>
  );
}
