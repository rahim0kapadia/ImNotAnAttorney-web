/**
 * Pattern Jury Instructions index — /pji
 *
 * Server component. Lists verified instructions grouped by circuit.
 * Filters unverified rows (no-hallucinated-legal-data rule — T35).
 * Shows coverage banner naming covered vs pending circuits (T37).
 * Defendant-lede above H1 for 3AM panic test (T39).
 */
import type { Metadata } from "next";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/site";

export const revalidate = 3600; // 1 hour — data changes quarterly

const CIRCUIT_LABELS: Record<number, string> = {
  1: "1st Circuit",
  6: "6th Circuit",
  7: "7th Circuit",
  8: "8th Circuit",
  9: "9th Circuit",
  10: "10th Circuit",
};

const CIRCUIT_STATES: Record<number, string> = {
  1: "ME, MA, NH, RI, PR",
  6: "KY, MI, OH, TN",
  7: "IL, IN, WI",
  8: "AR, IA, MN, MO, NE, ND, SD",
  9: "AK, AZ, CA, HI, ID, MT, NV, OR, WA, Guam, NMI",
  10: "CO, KS, NM, OK, UT, WY",
};

const PENDING_CIRCUITS =
  "2nd (NY/CT/VT), 3rd (DE/NJ/PA/VI), 4th (MD/NC/SC/VA/WV), 5th (LA/MS/TX), 11th (AL/FL/GA), DC, Federal";

interface Row {
  circuit: number;
  instruction_number: string;
  title: string | null;
}

export const metadata: Metadata = {
  title:
    "Exactly What the Judge Will Tell the Jury Deciding Your Case | ImNotAnAttorney",
  description:
    "Every federal criminal pattern jury instruction, searchable by circuit. These are the words the jury hears before they decide. Verified against official court PDFs.",
  alternates: { canonical: `${SITE_URL}/pji` },
};

export default async function PjiIndex() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("pattern_jury_instructions")
    .select("circuit, instruction_number, title")
    .eq("roundtrip_verified", true)
    .order("circuit")
    .order("instruction_number");
  if (error || !data) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12 text-slate-100">
        <h1 className="text-3xl font-semibold">Pattern Jury Instructions</h1>
        <p className="mt-4 text-slate-400">No data available right now.</p>
      </main>
    );
  }
  const byCircuit = new Map<number, Row[]>();
  for (const r of data as Row[]) {
    const arr = byCircuit.get(r.circuit) ?? [];
    arr.push(r);
    byCircuit.set(r.circuit, arr);
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-12 text-slate-100">
      <header className="mb-10 border-b border-slate-700 pb-6">
        <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-amber-400">
          For defendants
        </p>
        <h1 className="text-3xl font-semibold leading-tight">
          Exactly what the judge will tell the jury deciding your case.
        </h1>
        <p className="mt-4 text-slate-300">
          Free library of the exact instructions federal judges read to juries in criminal trials.
          Each entry lists what the government must prove to convict. Read yours. Bring it to your
          attorney.
        </p>
        <div className="mt-6 rounded-lg border border-slate-700 bg-slate-900/40 p-4 text-sm">
          <p className="mb-2 font-semibold text-slate-200">Coverage</p>
          <p className="text-slate-400">
            <span className="text-emerald-400">Covered:</span> 1st, 6th, 7th, 8th, 9th, 10th Circuits.
          </p>
          <p className="mt-1 text-slate-400">
            <span className="text-amber-400">Pending:</span> {PENDING_CIRCUITS}.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            For pending circuits, see the official PDF at each circuit&apos;s uscourts.gov page. State
            courts use different instructions — federal pattern instructions do NOT apply to state
            prosecutions.
          </p>
        </div>
        <div className="mt-6 rounded-lg border border-amber-400/30 bg-amber-950/20 p-4 text-sm">
          <p className="font-semibold text-amber-300">
            See how prepared your defense actually is →{" "}
            <Link href="/score" className="underline hover:text-amber-200">
              Take the 60-second case-readiness quiz
            </Link>
          </p>
        </div>
      </header>

      {[...byCircuit.keys()]
        .sort((a, b) => a - b)
        .map((cir) => {
          const rows = byCircuit.get(cir) ?? [];
          const states = CIRCUIT_STATES[cir];
          return (
            <section key={cir} className="mb-10">
              <h2 className="mb-1 text-xl font-semibold text-amber-300">
                {CIRCUIT_LABELS[cir] ?? `Circuit ${cir}`} — {rows.length} instructions
              </h2>
              {states ? (
                <p className="mb-4 text-xs text-slate-500">Covers cases filed in: {states}</p>
              ) : null}
              <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                {rows.map((r) => (
                  <li key={`${r.circuit}-${r.instruction_number}`}>
                    <Link
                      href={`/pji/${r.circuit}/${r.instruction_number}`}
                      className="block rounded px-2 py-1 text-sm text-slate-300 hover:bg-slate-800 hover:text-amber-300"
                    >
                      <span className="font-mono text-xs text-slate-500">{r.instruction_number}</span>{" "}
                      {r.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
    </main>
  );
}
